import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { readGitLabAuditCredential } from './gitlab-audit-credentials.mjs';

// Only the task's previously recorded broken issue is eligible. This is evidence
// for the documented scoped cache refresh, not an automatic site-wide migration.
if (process.platform !== 'linux') throw new Error('Run beside the isolated Linux deployment.');
const root = new URL('../', import.meta.url), base = 'http://127.0.0.1:5080';
const prior = JSON.parse(await readFile(new URL('artifacts/gitlab-native-footnote-renaming-reader-finding-20261115/report.json', root)));
const pin = JSON.parse(await readFile(new URL('integrations/gitlab/runtime/upstream.json', root)));
const repair = JSON.parse(await readFile(new URL('artifacts/gitlab-native-footnote-server/build.json', root)));
assert.equal(prior.project.path, 'root/fountain-product-integration');
assert.equal(prior.project.id, 1); assert.equal(prior.issue.iid, 152);
assert.equal(prior.status, 'failed'); assert.equal(repair.revision, pin.commit);
const output = new URL('artifacts/gitlab-footnote-cache-20261115/', root);
await mkdir(output, { recursive: true });
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
const container = 'fountain-gitlab-integration-baseline-1';
const deployment = JSON.parse(docker('inspect', container))[0];
assert.equal(deployment.Config.Image, pin.image);
assert.equal(deployment.Config.Labels['com.docker.compose.project'], 'fountain-gitlab-integration');
const target = '/opt/gitlab/embedded/service/gitlab-rails/lib/banzai/filter/footnote_filter.rb';
const mount = deployment.Mounts.find(item => item.Destination === target);
assert.ok(mount); assert.equal(mount.RW, false);
assert.equal(mount.Source, fileURLToPath(new URL('artifacts/gitlab-native-footnote-server/footnote_filter.rb', root)));
assert.equal(deployment.State.Running, false, 'Do not interrupt another running audit.');
let browser, context;
const report = { date: new Date().toISOString(), status: 'running',
  scope: 'One previously recorded task issue; documented derived-cache invalidation, not a site-wide rollout',
  project: prior.project, issue: prior.issue, overlay: repair.sha256,
  upstreamGuide: 'doc/administration/invalidate_markdown_cache.md at ' + pin.commit };
const digest = text => createHash('sha256').update(text).digest('hex');
try {
  docker('start', container);
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  await expect(async () => {
    expect(JSON.parse(docker('inspect', '--format', '{{json .State}}', container)).Health?.Status).toBe('healthy');
    expect((await page.request.get(base + '/users/sign_in', { timeout: 5000 })).status()).toBe(200);
  }).toPass({ timeout: 180000, intervals: [1000, 2000, 5000] });
  assert.equal(docker('exec', container, 'cat', '/opt/gitlab/embedded/service/gitlab-rails/REVISION').trim(), pin.packagedRevision);
  assert.equal(docker('exec', container, 'sha256sum', target).split(/\s/u)[0], repair.sha256);
  const password = readGitLabAuditCredential(args => docker('exec', '-i', container, ...args))?.password;
  assert.ok(password);
  await page.goto(base + '/users/sign_in');
  try {
    await page.getByLabel('Username or primary email').fill('root');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(url => !url.pathname.includes('sign_in'));
  } catch { throw new Error('Task browser sign-in failed; credential details were not recorded.'); }
  const requestIssue = async () => {
    const response = await page.request.get(base + '/api/v4/projects/1/issues/152');
    assert.equal(response.status(), 200); return response.json();
  };
  const initial = await requestIssue();
  assert.match(initial.description, /\[\^evidence\]/u);
  const sourceHash = digest(initial.description);
  const inspect = () => page.getByTestId('work-item-description').evaluate(root => {
    const attr = (node, key) => node.getAttribute(key);
    const ids = new Map();
    for (const node of root.querySelectorAll('[id]')) ids.set(node.id, [...(ids.get(node.id) ?? []), node]);
    const references = [...root.querySelectorAll('sup a[data-footnote-ref]')];
    const backlinks = [...root.querySelectorAll('a[data-footnote-backref]')];
    const brokenReferences = references.filter(node => ids.get(attr(node, 'href')?.slice(1))?.length !== 1).length;
    const brokenBacklinks = backlinks.filter(node => ids.get(attr(node, 'href')?.slice(1))?.length !== 1).length;
    return { references: references.length, backlinks: backlinks.length, brokenReferences, brokenBacklinks };
  });
  await page.goto(prior.issue.url);
  await expect(page.getByTestId('work-item-description').locator('sup a[data-footnote-ref]')).toHaveCount(3);
  report.before = await inspect();
  assert.ok(report.before.brokenReferences > 0, 'The original cached-render witness must still be broken.');
  await page.getByTestId('work-item-description').screenshot({ path: fileURLToPath(new URL('cached-before.png', output)) });
  // The documented project procedure nulls derived HTML. Scope it further to
  // this single known issue; never change source, timestamps or global versions.
  const ruby = `require 'digest'; require 'json'
project = Project.find_by_full_path('root/fountain-product-integration')
raise 'Unexpected project' unless project && project.id == 1 && project.private?
issue = project.issues.find_by!(iid: 152)
raise 'Source changed' unless Digest::SHA256.hexdigest(issue.description) == ENV.fetch('FOUNTAIN_EXPECTED_SOURCE_SHA')
before = {source: Digest::SHA256.hexdigest(issue.description), title: issue.title, updated_at: issue.updated_at.iso8601(6), html: Digest::SHA256.hexdigest(issue.description_html.to_s)}
issue.update_columns(description_html: nil)
issue.reload
raise 'Source or record metadata changed' unless Digest::SHA256.hexdigest(issue.description) == before[:source] && issue.title == before[:title] && issue.updated_at.iso8601(6) == before[:updated_at]
raise 'Cache not invalidated' unless issue.description_html.nil?
puts 'FOUNTAIN_CACHE_RECEIPT:' + JSON.generate({sourceSha256: before[:source], oldCacheSha256: before[:html], cacheInvalidated: true, sourceAndMetadataUnchanged: true})
`;
  let raw;
  try {
    raw = execFileSync('docker', ['exec', '-i', '-e', 'FOUNTAIN_EXPECTED_SOURCE_SHA=' + sourceHash,
      container, 'gitlab-rails', 'runner', '-'], { input: ruby, encoding: 'utf8', timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 });
  } catch { throw new Error('Scoped task cache refresh failed; captured Rails output was not recorded.'); }
  const receipt = raw.match(/^FOUNTAIN_CACHE_RECEIPT:(.+)$/mu)?.[1];
  assert.ok(receipt); report.refresh = JSON.parse(receipt);
  await page.reload();
  await expect(page.getByTestId('work-item-description').locator('sup a[data-footnote-ref]')).toHaveCount(3);
  report.after = await inspect();
  assert.deepEqual(report.after, { references: 3, backlinks: 3, brokenReferences: 0, brokenBacklinks: 0 });
  const description = page.getByTestId('work-item-description');
  const repeated = description.locator('sup a[data-footnote-ref]').nth(2);
  const definitionTarget = await repeated.getAttribute('href');
  await repeated.click();
  await expect(page).toHaveURL(url => url.hash === definitionTarget);
  const backlink = description.locator('a[data-footnote-backref-idx="1-2"]');
  const referenceTarget = await backlink.getAttribute('href');
  await backlink.click();
  await expect(page).toHaveURL(url => url.hash === referenceTarget);
  await description.screenshot({ path: fileURLToPath(new URL('cached-after.png', output)) });
  const final = await requestIssue();
  assert.equal(final.description, initial.description);
  assert.equal(final.title, initial.title); assert.equal(final.updated_at, initial.updated_at);
  report.clickedRepeatedReferenceAndBacklink = true;
  report.sourceAndMetadataUnchangedAfterRead = true;
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.message;
  throw error;
} finally {
  try {
    if (context) await context.close();
    if (browser) await browser.close();
  } finally {
    try { await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n'); }
    finally { docker('stop', '--time', '60', container); }
  }
}
console.log(JSON.stringify({ status: report.status, before: report.before, after: report.after,
  sourceAndMetadataUnchanged: report.sourceAndMetadataUnchangedAfterRead }));
