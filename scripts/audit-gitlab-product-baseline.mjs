import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = new URL('../', import.meta.url);
const pin = JSON.parse(await readFile(new URL('integrations/gitlab/runtime/upstream.json', root)));
const output = new URL('artifacts/gitlab-product-baseline-20261112/', root);
await mkdir(output, { recursive: true });
const baseURL = 'http://127.0.0.1:5080';
const composeFile = fileURLToPath(new URL('integrations/gitlab/runtime/compose.yaml', root));
const linuxComposeFile =
  process.platform === 'win32'
    ? composeFile
        .replaceAll('\\', '/')
        .replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`)
    : composeFile;
const docker = (...args) =>
  execFileSync(
    process.platform === 'win32' ? 'wsl' : 'docker',
    process.platform === 'win32' ? ['-d', 'Ubuntu', '--', 'docker', ...args] : args,
    { encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] },
  );
const compose = (...args) => docker('compose', '-f', linuxComposeFile, ...args);
const container = compose('ps', '--all', '--quiet', 'baseline').trim();
if (!container) throw new Error('Start the isolated GitLab baseline first.');
const inspection = JSON.parse(docker('inspect', container))[0];
if (
  inspection.Config.Image !== pin.image ||
  inspection.Config.Labels['com.docker.compose.project'] !== 'fountain-gitlab-integration'
) {
  throw new Error('Refusing to modify an unrecognized GitLab deployment.');
}
const revision = compose(
  'exec',
  '-T',
  'baseline',
  'cat',
  '/opt/gitlab/embedded/service/gitlab-rails/REVISION',
).trim();
if (revision !== pin.packagedRevision)
  throw new Error('The running application revision differs from the pin.');
const password = compose('exec', '-T', 'baseline', 'cat', '/etc/gitlab/initial_root_password')
  .match(/^Password:\s*(.+)$/m)?.[1]
  .trim();
if (!password)
  throw new Error('The local initial password is unavailable; no credentials were recorded.');

const report = {
  date: new Date().toISOString(),
  scope: 'Original GitLab product baseline; Fountain is not installed in this application',
  pin,
  checks: [],
  secrets: 'Password/session used in memory only; no traces or storage-state files',
};
const browser = await chromium.launch();
let context;
try {
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: fileURLToPath(new URL('recordings/', output)) },
  });
  const page = await context.newPage();
  const ready = async () => {
    await expect(async () => {
      const state = JSON.parse(docker('inspect', '--format', '{{json .State}}', container));
      expect(state.Health?.Status).toBe('healthy');
      const response = await page.request.get(`${baseURL}/users/sign_in`, { timeout: 5000 });
      expect(response.status()).toBe(200);
    }).toPass({ timeout: 180_000, intervals: [1000, 2000, 5000] });
  };
  await ready();
  await page.goto(`${baseURL}/users/sign_in`);
  await page.getByLabel('Username or primary email').fill('root');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes('sign_in'));
  const csrf = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  if (!csrf) throw new Error('Authenticated page did not provide its CSRF token.');
  const headers = { 'X-CSRF-Token': csrf };
  const api = async (method, path, options = {}) => {
    const response = await page.request.fetch(`${baseURL}/api/v4${path}`, {
      method,
      headers,
      ...options,
    });
    if (!response.ok()) throw new Error(`${method} ${path} returned ${response.status()}.`);
    return response.json();
  };
  const version = await api('GET', '/version');
  expect(version.version).toBe(pin.version);
  expect(version.revision).toBe(pin.packagedRevision);
  report.checks.push('Normal web sign-in and authenticated API version match the image/source pin');

  let response = await page.request.get(
    `${baseURL}/api/v4/projects/root%2Ffountain-product-integration`,
  );
  const project =
    response.status() === 404
      ? await api('POST', '/projects', {
          data: {
            name: 'Fountain product integration',
            path: 'fountain-product-integration',
            visibility: 'private',
            initialize_with_readme: true,
          },
        })
      : await response.json();
  expect(project.visibility).toBe('private');
  const upload = await api('POST', `/projects/${project.id}/uploads`, {
    multipart: {
      file: {
        name: 'fountain-baseline-figure.png',
        mimeType: 'image/png',
        buffer: await readFile(new URL('tests/fixtures/cross-container-figure.png', root)),
      },
    },
  });
  expect(upload.url).toMatch(/^\//);
  const description =
    '# Source retention investigation\n\nKeep **formatted content** and @root references when editing.\n\n- [ ] Reproduce the incident\n- [ ] Review the update\n\n| Stage | Status |\n| --- | --- |\n| Save | Pending |\n\nInline math $`a^2 + b^2 = c^2`$ remains source-backed.\n\n' +
    `![Uploaded baseline figure](${upload.url})\n\nEnd of the original description.\n`;
  const issue = await api('POST', `/projects/${project.id}/issues`, {
    data: { title: 'Original editor baseline: rich save and reopen', description },
  });
  report.project = { id: project.id, path: project.path_with_namespace };
  report.issue = { iid: issue.iid, url: issue.web_url };
  report.checks.push(
    'Real private project, PNG upload and issue created through authenticated GitLab HTTP APIs',
  );
  await page.goto(issue.web_url);
  await expect(page.getByRole('heading', { name: issue.title, exact: true })).toBeVisible();
  const image = page.getByRole('img', { name: 'Uploaded baseline figure', exact: true });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', /\/fountain-baseline-figure\.png(?:\?|$)/);
  await expect
    .poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0))
    .toBe(true);
  await expect(page.locator('main .katex').first()).toBeVisible();
  await page.screenshot({
    path: fileURLToPath(new URL('original-rendered.png', output)),
    fullPage: true,
  });

  await page.getByTestId('work-item-edit-form-button').click();
  const editor = page
    .getByTestId('work-item-description-wrapper')
    .locator('[contenteditable="true"]');
  await expect(editor).toBeVisible();
  await expect(editor).toHaveClass(/ProseMirror/);
  await expect(editor).toContainText('End of the original description.');
  await editor.getByText('End of the original description.', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  const marker = 'Edited through the original GitLab rich editor; persisted after restart.';
  await editor.pressSequentially(marker);
  await expect(editor.getByText(marker, { exact: true })).toBeVisible();
  await page.screenshot({
    path: fileURLToPath(new URL('original-rich-edit.png', output)),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByTestId('work-item-edit-form-button')).toBeVisible();
  await expect(page.getByText(marker, { exact: true })).toBeVisible();
  const saved = await api('GET', `/projects/${project.id}/issues/${issue.iid}`);
  expect(saved.description).toContain(marker);
  for (const value of [
    'formatted content',
    '@root',
    'Reproduce the incident',
    'Review the update',
    'Pending',
    'a^2 + b^2 = c^2',
    upload.url,
  ]) {
    expect(saved.description).toContain(value);
  }
  report.source = { original: description, saved: saved.description };
  report.checks.push(
    'Native rich typing and UI save persisted the added paragraph and retained the seeded content in the server record',
  );
  await page.reload();
  await expect(page.getByText(marker, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Uploaded baseline figure', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Uploaded baseline figure', exact: true }),
  ).toHaveAttribute('src', /\/fountain-baseline-figure\.png(?:\?|$)/);
  await expect(page.locator('main .katex').first()).toBeVisible();
  await page.screenshot({
    path: fileURLToPath(new URL('original-reopened.png', output)),
    fullPage: true,
  });
  const anonymous = await browser.newContext();
  try {
    const denied = await anonymous.request.get(
      `${baseURL}/api/v4/projects/${project.id}/issues/${issue.iid}`,
    );
    expect(denied.status()).toBe(404);
  } finally {
    await anonymous.close();
  }
  report.checks.push('Private issue is unavailable to an unauthenticated browser context');

  if (process.argv.includes('--verify-restart')) {
    compose('restart', '--timeout', '60', 'baseline');
    await ready();
    const reopened = await api('GET', `/projects/${project.id}/issues/${issue.iid}`);
    expect(reopened.description).toBe(saved.description);
    await page.goto(issue.web_url);
    await expect(page.getByText(marker, { exact: true })).toBeVisible();
    const reopenedImage = page.getByRole('img', { name: 'Uploaded baseline figure', exact: true });
    await expect(reopenedImage).toHaveAttribute('src', /\/fountain-baseline-figure\.png(?:\?|$)/);
    await expect
      .poll(() => reopenedImage.evaluate((element) => element.complete && element.naturalWidth > 0))
      .toBe(true);
    await expect(page.locator('main .katex').first()).toBeVisible();
    await page.screenshot({
      path: fileURLToPath(new URL('original-after-restart.png', output)),
      fullPage: true,
    });
    report.checks.push(
      'Exact saved server source, authenticated session and uploaded image survive an actual application-container restart',
    );
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error).replaceAll(password, '[redacted]');
  process.exitCode = 1;
} finally {
  await context?.close();
  await browser.close();
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({ status: report.status, checks: report.checks, error: report.error }, null, 2),
  );
}
