import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { readGitLabAuditCredential } from './gitlab-audit-credentials.mjs';

if (process.platform !== 'linux') throw new Error('Run in the isolated Linux Docker environment.');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'artifacts/gitlab-upload-restart-diagnostic-20261114');
function verifySamples(report) {
  expect(report.samples).toHaveLength(25);
  expect(report.samples.filter(row => row.round === 0)).toHaveLength(1);
  for (const round of [1, 2]) expect(report.samples.filter(row => row.round === round)).toHaveLength(12);
  expect(report.samples.every(row => row.width > 0 && row.responses === 1)).toBe(true);
  expect(report.imageResponses).toHaveLength(25);
  expect(new Set(report.imageResponses.map(row => row.requestId)).size).toBe(25);
  for (const response of report.imageResponses) {
    expect(response.status).toBe(200);
    expect(response.requestId).toBeTruthy();
    const samples = report.gatewaySamples.filter(row => row.correlation_id === response.requestId);
    expect(samples).toHaveLength(1);
    expect(samples[0].outcome).toBe('verified');
    expect(samples[0].issuer_matches).toBe(true);
    expect(samples[0].diagnostic_decode_error).toBeUndefined();
    expect(Number.isFinite(samples[0].age_seconds)).toBe(true);
  }
  expect(report.gatewaySamples.filter(row => row.outcome && row.outcome !== 'verified')).toEqual([]);
  expect(report.browserErrors).toEqual([]);
}
if (process.argv.includes('--verify-report')) {
  const recorded = JSON.parse(await readFile(resolve(output, 'report.json')));
  expect(recorded.status).toBe('passed');
  verifySamples(recorded);
  console.log('Recorded evidence verifies: 25 decoded images, 25 HTTP 200 responses, 25 matching authenticated gateway requests.');
  process.exit(0);
}
const pin = JSON.parse(await readFile(resolve(root, 'integrations/gitlab/runtime/upstream.json')));
const original = JSON.parse(await readFile(resolve(root, 'artifacts/gitlab-native-footnote-source-image-403-20261114/report.json')));
const container = 'fountain-gitlab-integration-baseline-1', base = 'http://127.0.0.1:5080';
await mkdir(output, { recursive: true });
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
if (docker('inspect', '--format', '{{.Config.Image}}', container).trim() !== pin.image
  || docker('inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', container).trim() !== 'fountain-gitlab-integration')
  throw new Error('Refusing an unrecognized deployment.');
const mounts = JSON.parse(docker('inspect', '--format', '{{json .Mounts}}', container));
if (!mounts.some(mount => mount.Destination.endsWith('/fountain_upload_gateway_audit.rb') && mount.RW === false))
  throw new Error('The diagnostic initializer must be mounted read-only.');
const report = { date: new Date().toISOString(), scope: 'Real GitLab reader-image requests across restart; diagnostic instrumentation preserves authentication',
  status: 'running', checks: [], samples: [], imageResponses: [], gatewaySamples: [], browserErrors: [],
  secrets: 'No credentials, JWT text, CSRF/session headers or browser storage-state files are recorded' };
const browser = await chromium.launch(), context = await browser.newContext({ recordVideo: { dir: resolve(output, 'recordings') } });
const page = await context.newPage();
const pending = [];
let password = '';
const collect = () => {
  const ruby = `require 'json'
require 'time'
rows = []
path = '/var/log/gitlab/gitlab-rails/application_json.log'
if File.file?(path)
  File.foreach(path) do |line|
    next unless line.include?('FountainUploadGatewayAudit')
    begin
      row = JSON.parse(line)
      next unless ['FountainUploadGatewayAudit', 'FountainUploadGatewayAuditReady'].include?(row['event'])
      next if Time.iso8601(row['time']).to_f < ${Date.parse(report.date) / 1000 - 5}
      keys = %w[time event outcome observed_at issued_at age_seconds issuer_matches diagnostic_decode_error correlation_id]
      rows << row.select { |key, _| keys.include?(key) }
    rescue JSON::ParserError, ArgumentError, TypeError
    end
  end
end
STDOUT.write(JSON.generate(rows))`;
  return JSON.parse(execFileSync('docker', ['exec', '-i', container, '/opt/gitlab/embedded/bin/ruby', '-'], {
    encoding: 'utf8', input: ruby, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'],
  }));
};
try {
  const ready = async () => expect(async () => {
    expect(JSON.parse(docker('inspect', '--format', '{{json .State}}', container)).Health?.Status).toBe('healthy');
    expect((await page.request.get(base + '/users/sign_in', { timeout: 5000 })).status()).toBe(200);
  }).toPass({ timeout: 180000, intervals: [1000, 2000, 5000] });
  await ready();
  expect(docker('exec', container, 'cat', '/opt/gitlab/embedded/service/gitlab-rails/REVISION').trim()).toBe(pin.packagedRevision);
  expect(collect().some(row => row.event === 'FountainUploadGatewayAuditReady')).toBe(true);
  password = readGitLabAuditCredential(args => docker('exec', '-i', container, ...args))?.password || '';
  if (!password) throw new Error('Protected task credential is unavailable.');
  await page.goto(base + '/users/sign_in');
  await page.getByLabel('Username or primary email').fill('root');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => !url.pathname.includes('sign_in'));
  const csrf = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  if (!csrf) throw new Error('Missing authenticated CSRF field.');
  const api = async path => {
    const response = await page.request.get(base + '/api/v4' + path, { headers: { 'X-CSRF-Token': csrf } });
    if (!response.ok()) throw new Error('Authenticated audit GET failed: ' + response.status());
    return response.json();
  };
  const version = await api('/version'), project = await api('/projects/root%2Ffountain-product-integration');
  expect(version.version).toBe(pin.version); expect(version.revision).toBe(pin.packagedRevision);
  expect(project.id).toBe(original.project.id); expect(project.visibility).toBe('private');
  const issue = await api(`/projects/${project.id}/issues/${original.issue.iid}`);
  expect(new URL(issue.web_url).origin).toBe(base);
  report.issue = { iid: issue.iid, url: issue.web_url };
  report.checks.push('Pinned private task deployment, diagnostic activation and authenticated source verified');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  page.on('pageerror', error => report.browserErrors.push(error.message));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin !== base || !url.pathname.endsWith('/fountain-baseline-figure.png')) return;
    const row = { path: url.pathname, status: response.status() };
    report.imageResponses.push(row);
    pending.push(response.headerValue('x-request-id').then(value => { row.requestId = value; }).catch(() => {}));
  });
  const probe = async (round, sample) => {
    const before = report.imageResponses.length;
    await page.goto(issue.web_url);
    await expect(page.getByRole('heading', { name: issue.title, exact: true })).toBeVisible();
    const image = page.getByRole('img', { name: 'Uploaded baseline figure', exact: true });
    await image.scrollIntoViewIfNeeded();
    // Poll only the same element's decode state: do not retry its network request.
    await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
    expect(report.imageResponses.slice(before).some(row => row.status >= 400)).toBe(false);
    report.samples.push({ round, sample, responses: report.imageResponses.length - before,
      width: await image.evaluate(element => element.naturalWidth) });
    if (sample === 0 || sample === 11) await page.screenshot({ path: resolve(output, `round-${round}-sample-${sample}.png`) });
  };
  await probe(0, 0);
  for (let round = 1; round <= 2; round++) {
    docker('restart', '--timeout', '60', container);
    await ready();
    expect((await api(`/projects/${project.id}/issues/${issue.iid}`)).description).toBe(issue.description);
    for (let sample = 0; sample < 12; sample++) await probe(round, sample);
    report.checks.push(`Twelve actual uncached browser image loads decode after restart ${round}, with source unchanged`);
  }
  report.gatewaySamples = collect();
  await Promise.allSettled(pending);
  verifySamples(report);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = password ? String(error).replaceAll(password, '[redacted]') : String(error);
  try { await page.screenshot({ path: resolve(output, 'failure.png') }); } catch {}
  try { report.gatewaySamples = collect(); } catch { report.gatewayDiagnosticsUnavailable = true; }
  process.exitCode = 1;
} finally {
  await Promise.allSettled(pending);
  await context.close(); await browser.close();
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checks: report.checks, samples: report.samples.length,
    failures: report.gatewaySamples.filter(row => row.outcome && row.outcome !== 'verified'), error: report.error }));
}
