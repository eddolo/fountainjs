import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = new URL('../', import.meta.url);
const pin = JSON.parse(await readFile(new URL('integrations/gitlab/runtime/upstream.json', root)));
const nativeBrowser = process.argv.includes('--native-browser');
const preparedHost = process.argv.includes('--prepared-host') || nativeBrowser;
const output = new URL(
  nativeBrowser
    ? 'artifacts/gitlab-native-browser-20261112/'
    : preparedHost
    ? 'artifacts/gitlab-prepared-host-20261112/'
    : 'artifacts/gitlab-product-baseline-20261112/',
  root,
);
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
const frontendMount = inspection.Mounts.find(
  (mount) =>
    mount.Destination === '/opt/gitlab/embedded/service/gitlab-rails/public/assets/webpack',
);
if (preparedHost ? !frontendMount || frontendMount.RW : Boolean(frontendMount)) {
  throw new Error(
    'The frontend deployment does not match the requested original/prepared-host audit.',
  );
}
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
  scope: nativeBrowser
    ? 'Native Fountain browser editor in the actual GitLab application; partial toolbar/providers, not full product acceptance'
    : preparedHost
    ? 'Actual GitLab original editor with rebuilt prepared host changes; Fountain browser editor not installed'
    : 'Original GitLab product baseline; Fountain is not installed in this application',
  pin,
  checks: [],
  secrets: 'Password/session used in memory only; no traces or storage-state files',
  preparedHost,
  nativeBrowser,
};
if (nativeBrowser)
  report.nativeRuntime = JSON.parse(
    await readFile(new URL('artifacts/gitlab-native-runtime/build.json', root)),
  );
const browser = await chromium.launch();
let context;
try {
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: fileURLToPath(new URL('recordings/', output)) },
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  report.browserErrors = browserErrors;
  const preparedScriptReads = [];
  const preparedScripts = [];
  const imageResponses = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === baseURL && url.pathname.endsWith('/fountain-baseline-figure.png')) {
      imageResponses.push({ path: url.pathname, status: response.status() });
    }
  });
  report.imageResponses = imageResponses;
  if (preparedHost)
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (
        url.origin !== baseURL ||
        !url.pathname.startsWith('/assets/webpack/') ||
        !url.pathname.endsWith('.js')
      )
        return;
      preparedScriptReads.push(
        response
          .body()
          .then((bytes) => {
            const source = bytes.toString('utf8');
            if (
              nativeBrowser
                ? source.includes('GITLAB_EDITOR_NOT_READY') &&
                  source.includes('FountainContentEditor')
                : source.includes('MARKDOWN_SUBMISSION_NOT_READY') &&
                  source.includes('EXPECTED_CURRENT_MARKDOWN')
            ) {
              preparedScripts.push({
                path: url.pathname,
                sha256: createHash('sha256').update(bytes).digest('hex'),
              });
            }
          })
          .catch(() => {}),
      );
    });
  const ready = async () => {
    await expect(async () => {
      const state = JSON.parse(docker('inspect', '--format', '{{json .State}}', container));
      expect(state.Health?.Status).toBe('healthy');
      const response = await page.request.get(`${baseURL}/users/sign_in`, {
        timeout: 5000,
      });
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
    data: {
      title: 'Original editor baseline: rich save and reopen',
      description,
    },
  });
  report.project = { id: project.id, path: project.path_with_namespace };
  report.issue = { iid: issue.iid, url: issue.web_url };
  report.checks.push(
    'Real private project, PNG upload and issue created through authenticated GitLab HTTP APIs',
  );
  await page.goto(issue.web_url);
  await expect(page.getByRole('heading', { name: issue.title, exact: true })).toBeVisible();
  const image = page.getByRole('img', {
    name: 'Uploaded baseline figure',
    exact: true,
  });
  await expect(image).toBeVisible();
  await image.scrollIntoViewIfNeeded();
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
  await expect(editor).toHaveClass(nativeBrowser ? /fountain-editor/ : /ProseMirror/);
  if (nativeBrowser)
    await expect(
      page
        .getByTestId('work-item-description-wrapper')
        .locator('[data-fountain-integration="native"]'),
    ).toBeVisible();
  await expect(editor).toContainText('End of the original description.');
  await editor.getByText('End of the original description.', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  const marker = nativeBrowser
    ? 'Edited through native Fountain in GitLab; persisted after restart.'
    : 'Edited through the original GitLab rich editor; persisted after restart.';
  await editor.pressSequentially(marker);
  if (nativeBrowser) {
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    const toolbar = page
      .getByTestId('work-item-description-wrapper')
      .getByTestId('formatting-toolbar');
    await toolbar.getByRole('button', { name: 'Bold', exact: true }).click();
    await expect(editor.locator('strong').filter({ hasText: marker })).toBeVisible();
    await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(editor.locator('strong').filter({ hasText: marker })).toHaveCount(0);
    await toolbar.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect(editor.locator('strong').filter({ hasText: marker })).toBeVisible();
    report.checks.push(
      'Native Fountain toolbar formats actual browser selection; undo and redo update both document and view',
    );
  }
  if (preparedHost) {
    await Promise.all(preparedScriptReads);
    expect(preparedScripts.length).toBeGreaterThan(0);
    report.preparedScripts = preparedScripts;
    report.frontendMount = {
      source: frontendMount.Source,
      readOnly: !frontendMount.RW,
    };
    const description = page.getByTestId('work-item-description-wrapper');
    await description
      .getByRole('button', {
        name: 'Switch to plain text editing',
        exact: true,
      })
      .click();
    const source = description.locator('textarea');
    await expect(source).toBeVisible();
    expect(await source.inputValue()).toContain(marker);
    await description
      .getByRole('button', { name: 'Switch to rich text editing', exact: true })
      .click();
    await expect(editor).toBeVisible();
    await expect(editor.getByText(marker, { exact: true })).toBeVisible();
    if (nativeBrowser) {
      const checks = editor.locator('input[data-fountain-task-toggle]');
      await expect(checks).toHaveCount(2);
      await expect(checks.nth(0)).toBeVisible();
      await expect(checks.nth(1)).toBeVisible();
      report.nativeTaskControls = await checks.evaluateAll((inputs) =>
        inputs.map((input) => {
          const style = getComputedStyle(input);
          return {
            appearance: style.appearance,
            opacity: style.opacity,
            display: style.display,
            width: style.width,
            height: style.height,
          };
        }),
      );
      await checks.nth(0).check();
      await expect(checks.nth(0)).toBeChecked();
      await checks.nth(0).uncheck();
      await expect(checks.nth(0)).not.toBeChecked();
      const nativeImage = editor.getByRole('img', {
        name: 'Uploaded baseline figure',
        exact: true,
      });
      await nativeImage.scrollIntoViewIfNeeded();
      await expect
        .poll(() => nativeImage.evaluate((image) => image.complete && image.naturalWidth > 0))
        .toBe(true);
    }
    report.checks.push(
      'Rebuilt real host hands current rich content to source mode and reopens it without a stale cached value',
    );
  }
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
  if (nativeBrowser) expect(saved.description).not.toContain('[](#source-retention-investigation)');
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
  if (nativeBrowser) {
    const activity = page.getByTestId('detail-layout-activity');
    const composer = activity.locator(
      '[data-fountain-integration="native"] [contenteditable="true"]',
    );
    await expect(composer).toBeVisible();
    await composer.click();
    const note = 'Native Fountain discussion: created through the actual GitLab comment form.';
    await composer.pressSequentially(note);
    await activity.getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(composer).toHaveText('');
    await expect(activity.getByText(note, { exact: true })).toBeVisible();
    const notes = await api('GET', `/projects/${project.id}/issues/${issue.iid}/notes`);
    expect(notes.some((value) => value.body === note)).toBe(true);
    report.comment = { body: note, persisted: true };
    report.checks.push(
      'An initially empty native Fountain composer creates a real GitLab discussion comment and clears after successful persistence',
    );
  }
  await page.reload();
  await expect(page.getByText(marker, { exact: true })).toBeVisible();
  await page
    .getByRole('img', { name: 'Uploaded baseline figure', exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole('img', { name: 'Uploaded baseline figure', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Uploaded baseline figure', exact: true }),
  ).toHaveAttribute('src', /\/fountain-baseline-figure\.png(?:\?|$)/);
  await expect(page.locator('main .katex').first()).toBeVisible();
  if (nativeBrowser)
    await expect
      .poll(() =>
        page
          .getByRole('img', { name: 'Uploaded baseline figure', exact: true })
          .evaluate((image) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
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
    const reopenedImage = page.getByRole('img', {
      name: 'Uploaded baseline figure',
      exact: true,
    });
    await reopenedImage.scrollIntoViewIfNeeded();
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
  expect(browserErrors).toEqual([]);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error).replaceAll(password, '[redacted]');
  if (preparedHost && report.checks.length > 1) {
    const active = context.pages()[0];
    report.failedImages = await active
      .getByRole('img', { name: 'Uploaded baseline figure', exact: true })
      .evaluateAll((images) =>
        images.map((image) => ({
          src: image.src,
          currentSrc: image.currentSrc,
          complete: image.complete,
          width: image.naturalWidth,
          loading: image.loading,
        })),
      );
    report.failedImageRequests = [];
    for (const image of report.failedImages) {
      if (new URL(image.src).origin !== baseURL) continue;
      const response = await active.request.get(image.src);
      report.failedImageRequests.push({
        status: response.status(),
        contentType: response.headers()['content-type'],
        bytes: (await response.body()).length,
      });
    }
    await context
      .pages()[0]
      ?.screenshot({
        path: fileURLToPath(new URL('failure.png', output)),
        fullPage: true,
      })
      .catch(() => {});
  }
  process.exitCode = 1;
} finally {
  await context?.close();
  await browser.close();
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({ status: report.status, checks: report.checks, error: report.error }, null, 2),
  );
}
