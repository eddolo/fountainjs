import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

if (process.platform !== 'linux') throw new Error('Run beside the isolated Linux GitLab deployment.');
const root = new URL('../', import.meta.url), base = 'http://127.0.0.1:5080';
const media = process.argv.includes('--media');
const pin = JSON.parse(await readFile(new URL('integrations/gitlab/runtime/upstream.json', root)));
const composeFile = fileURLToPath(new URL('integrations/gitlab/runtime/compose.yaml', root));
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
const container = docker('compose', '-f', composeFile, 'ps', '--all', '--quiet', 'baseline').trim();
const config = JSON.parse(docker('inspect', container))[0].Config;
if (config.Image !== pin.image || config.Labels['com.docker.compose.project'] !== 'fountain-gitlab-integration') throw new Error('Wrong deployment');
const password = docker('compose', '-f', composeFile, 'exec', '-T', 'baseline', 'cat', '/etc/gitlab/initial_root_password')
  .match(/^Password:\s*(.+)$/mu)?.[1]?.trim();
if (!password) throw new Error('Generated task password unavailable');
const browser = await chromium.launch(), context = await browser.newContext();
try {
  const page = await context.newPage();
  await expect(async () => {
    expect(JSON.parse(docker('inspect', '--format', '{{json .State}}', container)).Health?.Status).toBe('healthy');
    expect((await page.request.get(base + '/users/sign_in', { timeout: 5000 })).status()).toBe(200);
  }).toPass({ timeout: 180000, intervals: [1000, 2000, 5000] });
  await page.goto(base + '/users/sign_in');
  await page.getByLabel('Username or primary email').fill('root');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => !url.pathname.includes('sign_in'));
  const headers = { 'X-CSRF-Token': await page.locator('meta[name="csrf-token"]').getAttribute('content') };
  const request = async (path, data) => {
    const response = await page.request.fetch(new URL(path, base).href, { headers, ...(data ? { method: 'POST', data } : {}) });
    if (!response.ok()) throw new Error(`Task request failed: ${response.status()}`);
    return response.json();
  };
  const version = await request('/api/v4/version');
  expect(version.version).toBe(pin.version); expect(version.revision).toBe(pin.packagedRevision);
  const project = await request('/api/v4/projects/root%2Ffountain-product-integration');
  expect(project.visibility).toBe('private');
  const paths = await request('/api/graphql', { query: 'query($path:ID!){namespace(fullPath:$path){markdownPaths{markdownPreviewPath}}}', variables: { path: project.path_with_namespace } });
  if (paths.errors?.length) throw new Error('No actual renderer path');
  const preview = new URL(paths.data.namespace.markdownPaths.markdownPreviewPath, base);
  if (preview.origin !== base) throw new Error('Nonlocal preview');
  preview.searchParams.set('no_header_anchors', 'true');
  const inputs = media ? [
    ['image', '![Original figure](/uploads/media-fixture/figure.png "Figure title")'],
    ['image-sized', '![Sized figure](/uploads/media-fixture/figure.png){width="320" height="180"}'],
    ['image-percent', '![Responsive figure](/uploads/media-fixture/figure.png){width="50%"}'],
    ['image-inline', 'Before ![Inline figure](/uploads/media-fixture/figure.png) after.'],
    ['image-link', '[![Linked figure](/uploads/media-fixture/figure.png)](/help/user/project)'],
    ['image-link-sized', '[![Linked figure](/uploads/media-fixture/figure.png "Linked figure title"){width="240"}](/help/user/project)'],
    ['audio', '![Audio description](/uploads/media-fixture/recording.wav)'],
    ['audio-titled', '![Audio description](/uploads/media-fixture/recording.wav "Retained audio title")'],
    ['audio-sized', '![Audio description](/uploads/media-fixture/recording.wav "Retained audio title"){width="240" height="54"}'],
    ['audio-link', '[Audio download](/uploads/media-fixture/recording.wav)'],
    ['video', '![Video description](/uploads/media-fixture/recording.webm)'],
    ['video-titled', '![Video description](/uploads/media-fixture/recording.webm "Retained video title"){width="280"}'],
    ['multiple-titled', '![Video description](/uploads/media-fixture/recording.webm "Retained video title"){width="280"}\n\n![Audio description](/uploads/media-fixture/recording.wav "Retained audio title")'],
    ['video-sized', '![Sized video](/uploads/media-fixture/recording.webm){width="320" height="180"}'],
    ['video-inline', 'Before ![Inline video](/uploads/media-fixture/recording.webm) after.'],
    ['nested', '> ![Quoted video](/uploads/media-fixture/recording.webm)\n\n- ![Listed audio](/uploads/media-fixture/recording.wav)'],
    ['youtube', '![Training video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)'],
    ['vimeo', '![Training video](https://vimeo.com/123456789)'],
    ['drawio', '![Architecture](/uploads/media-fixture/architecture.drawio.svg)'],
    ['raw-video', '<video src="/uploads/media-fixture/recording.webm" controls width="320" height="180"></video>'],
  ] : [
    ...['note', 'tip', 'important', 'warning', 'caution'].map(type => [`default-${type}`, `> [!${type}]\n>\n> Body **with marks**.`]),
    ['custom', '> [!warning] Deployment blocked\n>\n> Keep the rollback ready.'],
    ['custom-default-word', '> [!note] Note\n>\n> Explicit title.'],
    ['other-default-word', '> [!note] Tip\n>\n> Custom title.'],
    ['empty', '> [!tip]'],
    ['nested', '> [!note] Outer\n>\n> First.\n>\n> > [!warning] Inner\n> >\n> > Nested.'],
    ['list', '- > [!important] In a list\n  >\n  > Body.\n- Neighbor.'],
    ['code-math', '> [!note] Source\n>\n> Inline $x^2$.\n>\n> ```js\n> const x = 1;\n> ```'],
    ['formatted-title', '> [!note] **Important** & <tag>\n>\n> Body.'],
    ['unknown', '> [!unknown] Other\n>\n> Ordinary quote.'],
  ];
  const fixtures = [];
  for (const [name, source] of inputs) {
    const result = await request(preview.href, { text: source });
    if (typeof result.body !== 'string') throw new Error('Missing renderer body');
    fixtures.push({ name, source, body: result.body });
  }
  await writeFile(new URL(`integrations/gitlab/fixtures/${media ? 'media' : 'alert'}-live-html.json`, root), JSON.stringify({
    scope: media ? 'Authenticated renderer structure fixtures; asset URLs are illustrative, not uploaded/playback acceptance' : 'Authenticated pinned GitLab renderer fixtures; not browser product acceptance',
    upstream: { revision: pin.commit, version: version.version, packagedRevision: version.revision }, fixtures,
  }, null, 2) + '\n');
  console.log(JSON.stringify({ captured: fixtures.length, version: version.version, kind: media ? 'media' : 'alerts' }));
} catch (error) { console.error(String(error).replaceAll(password, '[redacted]')); process.exitCode = 1; }
finally { await context.close(); await browser.close(); }
