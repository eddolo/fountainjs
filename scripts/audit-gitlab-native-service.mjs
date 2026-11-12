import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import {
  GitLabContentEditor,
  Selection,
  insertText,
  splitBlock,
} from '../artifacts/gitlab-native-runtime/fountain-runtime.mjs';

if (process.platform !== 'linux')
  throw new Error(
    'Run this real-service audit inside native Linux alongside the isolated Docker engine.',
  );
const root = new URL('../', import.meta.url);
const output = new URL('artifacts/gitlab-native-service-20261112/', root);
await mkdir(output, { recursive: true });
const pin = JSON.parse(await readFile(new URL('integrations/gitlab/runtime/upstream.json', root)));
const composeFile = fileURLToPath(new URL('integrations/gitlab/runtime/compose.yaml', root));
const docker = (...args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    timeout: 120000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const compose = (...args) => docker('compose', '-f', composeFile, ...args);
const container = compose('ps', '--all', '--quiet', 'baseline').trim();
const config = JSON.parse(docker('inspect', container))[0].Config;
if (
  config.Image !== pin.image ||
  config.Labels['com.docker.compose.project'] !== 'fountain-gitlab-integration'
)
  throw new Error('Unrecognized local deployment.');
const password = compose('exec', '-T', 'baseline', 'cat', '/etc/gitlab/initial_root_password')
  .match(/^Password:\s*(.+)$/m)?.[1]
  .trim();
if (!password) throw new Error('The generated local password is unavailable.');
const base = 'http://127.0.0.1:5080';
const report = {
  scope:
    'Native headless Fountain service with real GitLab render/save APIs and original reader; not the deployed Fountain browser editor',
  checks: [],
  pin,
};
report.nativeRuntime = JSON.parse(
  await readFile(new URL('artifacts/gitlab-native-runtime/build.json', root)),
);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo: { dir: fileURLToPath(new URL('recordings/', output)) },
});
let service;
try {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(45000);
  await expect(async () => {
    expect(
      JSON.parse(docker('inspect', '--format', '{{json .State}}', container)).Health?.Status,
    ).toBe('healthy');
    expect((await page.request.get(`${base}/users/sign_in`, { timeout: 5000 })).status()).toBe(200);
  }).toPass({ timeout: 180000, intervals: [1000, 2000, 5000] });
  await page.goto(`${base}/users/sign_in`);
  await page.getByLabel('Username or primary email').fill('root');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes('sign_in'));
  const headers = {
    'X-CSRF-Token': await page.locator('meta[name="csrf-token"]').getAttribute('content'),
  };
  const request = async (path, options = {}) => {
    const response = await page.request.fetch(new URL(path, base).href, { headers, ...options });
    if (!response.ok()) throw new Error(`GitLab request returned ${response.status()}.`);
    return response.json();
  };
  const existing = await page.request.get(`${base}/api/v4/projects/root%2Ffountain-product-integration`);
  const project = existing.status() === 404
    ? await request('/api/v4/projects', { method: 'POST', data: {
      name: 'Fountain product integration', path: 'fountain-product-integration', visibility: 'private', initialize_with_readme: true,
    } }) : await existing.json();
  expect(project.visibility).toBe('private');
  const upload = await request(`/api/v4/projects/${project.id}/uploads`, { method: 'POST', multipart: { file: {
    name: 'fountain-baseline-figure.png', mimeType: 'image/png', buffer: await readFile(new URL('tests/fixtures/cross-container-figure.png', root)),
  } } });
  expect(upload.url).toMatch(/^\//);
  const source = '# Source retention investigation\n\nKeep **formatted content** and @root references when editing.\n\n- [ ] Reproduce the incident\n- [ ] Review the update\n\n| Stage | Status |\n| --- | --- |\n| Save | Pending |\n\nInline math $`a^2 + b^2 = c^2`$ remains source-backed.\n\n'
    + `![Uploaded baseline figure](${upload.url})\n\nEnd of the original description.\n`;
  report.project = { id: project.id, path: project.path_with_namespace };
  const paths = await request('/api/graphql', {
    method: 'POST',
    data: {
      query:
        'query($path:ID!){namespace(fullPath:$path){markdownPaths{markdownPreviewPath uploadsPath}}}',
      variables: { path: project.path_with_namespace },
    },
  });
  if (paths.errors?.length) throw new Error('GitLab did not provide its Markdown service paths.');
  const preview = new URL(paths.data.namespace.markdownPaths.markdownPreviewPath, base);
  if (preview.origin !== base) throw new Error('Preview endpoint is outside the local baseline.');
  preview.searchParams.set('render_quick_actions', 'true');
  preview.searchParams.set('no_header_anchors', 'true');
  let renderCalls = 0;
  service = new GitLabContentEditor({
    renderMarkdown: async (markdown) => {
      renderCalls++;
      const data = await request(preview.href, { method: 'POST', data: { text: markdown } });
      return { body: data.body || data.html || '', references: data.references };
    },
    describeLabels: (_action, count) => `${count} labels`,
  });
  await service.setSerializedContent(source);
  expect(service.getSerializedContent()).toBe(source);
  report.checks.push(
    'Actual GitLab GraphQL-discovered renderer imports its real table/checklist/reference/math/image HTML; untouched source is byte-exact',
  );
  const editor = service.editor;
  const last = editor.state.doc.content.length - 1;
  editor.dispatch(
    editor
      .createTransaction()
      .setSelection(Selection.cursor([last, 0], editor.state.doc.child(last).textContent.length)),
  );
  expect(splitBlock(editor)).toBe(true);
  const marker = 'Native Fountain service edit: saved through GitLab.';
  expect(insertText(editor, marker)).toBe(true);
  const markdown = service.getSerializedContent();
  expect(markdown).toContain(marker);
  const issue = await request(`/api/v4/projects/${project.id}/issues`, {
    method: 'POST',
    data: {
      title: 'Fountain native document service: real GitLab round trip',
      description: source,
    },
  });
  await request(`/api/v4/projects/${project.id}/issues/${issue.iid}`, {
    method: 'PUT',
    data: { description: markdown },
  });
  const saved = await request(`/api/v4/projects/${project.id}/issues/${issue.iid}`);
  expect(saved.description).toBe(markdown);
  report.checks.push(
    'Native Fountain transactions serialize and save through real authenticated GitLab HTTP; server returns exact submitted source',
  );
  await service.setSerializedContent(saved.description);
  expect(service.getSerializedContent()).toBe(saved.description);
  await page.goto(issue.web_url);
  await expect(page.getByText(marker, { exact: true })).toBeVisible();
  await expect(page.locator('main table')).toBeVisible();
  await expect(page.locator('main .katex').first()).toBeVisible();
  const image = page.getByRole('img', { name: 'Uploaded baseline figure', exact: true });
  await expect(image).toHaveAttribute('src', /\/fountain-baseline-figure\.png(?:\?|$)/);
  await expect
    .poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0))
    .toBe(true);
  await page.screenshot({
    path: fileURLToPath(new URL('saved-native-document.png', output)),
    fullPage: true,
  });
  report.checks.push(
    'Saved native document reimports through the actual renderer and visibly retains table, equation, image and new paragraph in GitLab',
  );
  report.issue = { iid: issue.iid, url: issue.web_url };
  report.renderCalls = renderCalls;
  report.source = { original: source, saved: saved.description };
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error).replaceAll(password, '[redacted]');
  if (Array.isArray(error?.issues)) report.issues = error.issues;
  process.exitCode = 1;
} finally {
  service?.dispose();
  await context.close();
  await browser.close();
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      { status: report.status, checks: report.checks, error: report.error, issues: report.issues },
      null,
      2,
    ),
  );
}
