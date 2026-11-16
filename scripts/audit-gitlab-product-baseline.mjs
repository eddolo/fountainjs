import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { auditNativeLinks } from './audit-gitlab-native-links.mjs';
import { auditNativeCode } from './audit-gitlab-native-code.mjs';
import { auditNativeContextMenus, assertSavedNativeContextMenus } from './audit-gitlab-native-context-menus.mjs';
import { auditNativeFrontmatter, assertSavedNativeFrontmatter } from './audit-gitlab-native-frontmatter.mjs';
import { auditNativeAlerts, assertSavedNativeAlerts } from './audit-gitlab-native-alerts.mjs';
import { auditNativeMedia, assertSavedNativeMedia } from './audit-gitlab-native-media.mjs';
import { auditNativeReferences, assertSavedNativeReferences } from './audit-gitlab-native-references.mjs';
import { auditNativeDiagrams, assertSavedNativeDiagrams } from './audit-gitlab-native-diagrams.mjs';
import { prepareInvalidSavedDiagrams, assertInvalidSavedDiagrams, repairInvalidSavedDiagrams } from './audit-gitlab-diagram-reader.mjs';
import { readGitLabAuditCredential } from './gitlab-audit-credentials.mjs';
import { auditNativeQuickActions, assertSavedNativeQuickActions } from './audit-gitlab-native-quick-actions.mjs';
import { assertSavedAutocomplete } from './audit-gitlab-native-autocomplete.mjs';
import { auditNativeFootnotes, assertSavedNativeFootnotes } from './audit-gitlab-native-footnotes.mjs';
import { auditNativeFootnoteRenaming } from './audit-gitlab-native-footnote-renaming.mjs';
import { auditNativeFootnoteClipboard, assertSavedNativeFootnoteClipboard } from './audit-gitlab-native-footnote-clipboard.mjs';
import { auditNativeTableClipboard, assertSavedNativeTableClipboard } from './audit-gitlab-native-table-clipboard.mjs';
import { auditNativeControlsLayout } from './audit-gitlab-native-controls-layout.mjs';

const root = new URL('../', import.meta.url);
const pin = JSON.parse(await readFile(new URL('integrations/gitlab/runtime/upstream.json', root)));
const nativeCapacity = process.argv.includes('--native-attachment-capacity');
const nativeLinks = process.argv.includes('--native-links');
const nativeContextUI = process.argv.includes('--native-context-ui');
const nativeContextMenus = process.argv.includes('--native-context-menus') || nativeContextUI;
const nativeCode = process.argv.includes('--native-code') || nativeContextMenus;
const nativeFrontmatter = process.argv.includes('--native-frontmatter');
const nativeAutocomplete = process.argv.includes('--native-autocomplete');
const nativeTableClipboard = process.argv.includes('--native-table-clipboard');
const nativeFootnoteCut = process.argv.includes('--native-footnote-cut');
const nativeFootnoteClipboard = process.argv.includes('--native-footnote-clipboard') || nativeFootnoteCut;
const nativeFootnoteBoundary = process.argv.includes('--native-footnote-boundary') || nativeFootnoteClipboard;
const assertSavedFootnotes = nativeFootnoteClipboard ? assertSavedNativeFootnoteClipboard : assertSavedNativeFootnotes;
const nativeFootnoteRenaming = process.argv.includes('--native-footnote-renaming') || nativeFootnoteBoundary;
const nativeFootnoteEditing = process.argv.includes('--native-footnote-editing') || nativeFootnoteRenaming;
const nativeDecodedFootnoteSource = process.argv.includes('--native-footnote-decoded-source') || nativeFootnoteEditing;
const nativeFootnoteSource = process.argv.includes('--native-footnote-source') || nativeDecodedFootnoteSource || nativeTableClipboard;
const nativeQuickActionControls = process.argv.includes('--native-quick-action-controls') || nativeAutocomplete;
const nativeQuickActions = process.argv.includes('--native-quick-actions') || nativeQuickActionControls;
const nativeDiagramAuthoring = process.argv.includes('--native-diagram-authoring');
const nativeDiagramReader = process.argv.includes('--native-diagram-reader');
const nativeDiagrams = process.argv.includes('--native-diagrams') || nativeDiagramAuthoring || nativeDiagramReader;
const assertDiagramReader = nativeDiagramReader ? assertInvalidSavedDiagrams : assertSavedNativeDiagrams;
const nativeAlerts = process.argv.includes('--native-alerts');
const nativeReferenceContexts = process.argv.includes('--reference-contexts');
const nativeReferences = process.argv.includes('--native-references') || nativeReferenceContexts;
const nativeMediaFiles = process.argv.includes('--native-media-files');
const nativeMedia = process.argv.includes('--native-media') || nativeMediaFiles;
const debugLinks = nativeLinks && process.argv.includes('--debug-links');
const nativeAttachments = process.argv.includes('--native-attachments') || nativeCapacity || nativeMedia;
const nativeComponent = process.argv.includes('--native-component') || nativeAttachments || nativeLinks || nativeCode || nativeFrontmatter || nativeAlerts || nativeReferences || nativeDiagrams || nativeQuickActions || nativeFootnoteSource;
const nativeInsertion = process.argv.includes('--native-insertion') || nativeComponent;
const nativeBrowser = process.argv.includes('--native-browser') || nativeInsertion;
const preparedHost = process.argv.includes('--prepared-host') || nativeBrowser;
const output = new URL(
  nativeTableClipboard ? 'artifacts/gitlab-native-table-clipboard-20261115/' :
  nativeFootnoteCut ? 'artifacts/gitlab-native-footnote-cut-20261116/' :
  nativeFootnoteClipboard ? 'artifacts/gitlab-native-footnote-clipboard-20261115/' :
  nativeFootnoteBoundary ? 'artifacts/gitlab-native-footnote-boundary-20261115/' :
  nativeFootnoteRenaming ? 'artifacts/gitlab-native-footnote-renaming-20261115/' :
  nativeFootnoteEditing ? 'artifacts/gitlab-native-footnote-editing-20261115/' :
  nativeDecodedFootnoteSource ? 'artifacts/gitlab-native-footnote-decoded-source-20261114/' :
  nativeFootnoteSource ? 'artifacts/gitlab-native-footnote-source-20261114/' :
  nativeAutocomplete ? 'artifacts/gitlab-native-autocomplete-20261114/' : nativeQuickActionControls ? 'artifacts/gitlab-native-quick-action-controls-20261114/' : nativeQuickActions ? 'artifacts/gitlab-native-quick-actions-20261114/' : nativeContextUI ? 'artifacts/gitlab-native-context-ui-20261113/' : nativeContextMenus ? 'artifacts/gitlab-native-context-menus-20261113/' : nativeFrontmatter ? 'artifacts/gitlab-native-frontmatter-20261113/' : nativeDiagramReader ? 'artifacts/gitlab-native-diagram-reader-20261113/' : nativeDiagramAuthoring ? 'artifacts/gitlab-native-diagram-authoring-20261113/' : nativeDiagrams ? 'artifacts/gitlab-native-diagrams-20261112/' : nativeReferenceContexts ? 'artifacts/gitlab-native-reference-contexts-20261112/' : nativeReferences ? 'artifacts/gitlab-native-references-20261112/' : nativeMediaFiles ? 'artifacts/gitlab-native-media-files-20261112/' : nativeMedia ? 'artifacts/gitlab-native-media-20261112/' : nativeAlerts ? 'artifacts/gitlab-native-alerts-20261112/' : nativeCode ? 'artifacts/gitlab-native-code-20261112/' : nativeLinks
    ? debugLinks ? 'artifacts/gitlab-native-link-debug-20261112/' : 'artifacts/gitlab-native-links-20261112/'
    : nativeCapacity
    ? 'artifacts/gitlab-native-attachment-capacity-20261112/'
    : nativeAttachments
    ? 'artifacts/gitlab-native-attachments-20261112/'
    : nativeComponent
    ? 'artifacts/gitlab-native-component-20261112/'
    : nativeInsertion
    ? 'artifacts/gitlab-native-insertion-20261112/'
    : nativeBrowser
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
if (
  inspection.Config.Image !== pin.image ||
  inspection.Config.Labels['com.docker.compose.project'] !== 'fountain-gitlab-integration'
) {
  throw new Error('Refusing to modify an unrecognized GitLab deployment.');
}
const frontendMount = inspection.Mounts.find(
  (mount) =>
    mount.Destination === '/opt/gitlab/embedded/service/gitlab-rails/public/assets/webpack',
);
const footnoteServerTarget = '/opt/gitlab/embedded/service/gitlab-rails/lib/banzai/filter/footnote_filter.rb';
const footnoteServerMount = inspection.Mounts.find(mount => mount.Destination === footnoteServerTarget);
let footnoteServerOverlay;
if (footnoteServerMount) {
  if (!preparedHost || footnoteServerMount.RW) throw new Error('A stock baseline cannot use the native footnote server overlay.');
  const receipt = JSON.parse(await readFile(new URL('artifacts/gitlab-native-footnote-server/build.json', root)));
  const actualHash = docker('exec', container, 'sha256sum', footnoteServerTarget).split(/\s/u)[0];
  if (receipt.revision !== pin.commit || actualHash !== receipt.sha256) throw new Error('The live server repair does not match its receipt.');
  footnoteServerOverlay = { source: footnoteServerMount.Source, readOnly: true,
    sha256: receipt.sha256, originalSha256: receipt.originalSha256, scope: receipt.scope };
}
if (preparedHost ? !frontendMount || frontendMount.RW : Boolean(frontendMount)) {
  throw new Error(
    'The frontend deployment does not match the requested original/prepared-host audit.',
  );
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
let password;
// This is reached only after the dedicated image/project/revision checks above.
// GitLab deletes initial_root_password after a day. Keep the audit account usable
// without recreating its database or putting a credential in the source checkout.
function loadAuditPassword() {
  let stage = 'read';
  try {
    const retained = readGitLabAuditCredential(args => compose('exec', '-T', 'baseline', ...args));
    if (retained) return retained;
    const created = 'Fjs!9aA' + randomBytes(48).toString('base64url');
    const input = (args, value) => execFileSync(process.platform === 'win32' ? 'wsl' : 'docker',
      [...(process.platform === 'win32' ? ['-d', 'Ubuntu', '--', 'docker'] : []), ...args],
      { encoding: 'utf8', input: value, timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] });
    // The generated alphabet contains no Ruby quote/escape characters. Send it
    // through stdin, never command arguments, and use GitLab's normal password model.
    stage = 'account initialization';
    const result = input(['exec', '-i', container, 'gitlab-rails', 'runner', '-'],
      `user = User.find_by!(username: 'root')\nuser.password = '${created}'\nuser.password_confirmation = user.password\nuser.save!\nSTDOUT.write('FOUNTAIN_AUDIT_PASSWORD_SET')\n`);
    if (!result.includes('FOUNTAIN_AUDIT_PASSWORD_SET')) throw new Error();
    // gitlab-rails runs as git; Docker's root process owns this separate mode-600
    // configuration file. Never let the Rails process write protected config.
    stage = 'credential storage';
    input(['exec', '-i', container, 'sh', '-c',
      'umask 077; set -C; cat > /etc/gitlab/fountain-audit-password'], created);
    return { password: created, source: 'provisioned-protected-task-config' };
  } catch (error) {
    // A child-process exception can carry captured credential output. Never rethrow it.
    const category = String(error.stderr || '').match(/EACCES|Permission denied|ActiveRecord::RecordInvalid|SyntaxError|Unknown option|Errno::[A-Za-z]+/)?.[0] || 'operation failed';
    throw new Error(`Unable to initialize the pinned isolated GitLab audit account (${stage}: ${category}); no credential output was recorded.`);
  }
}

const report = {
  date: new Date().toISOString(),
  scope: nativeBrowser
    ? 'Native Fountain browser editor in the actual GitLab application; partial toolbar/providers, not full product acceptance'
    : preparedHost
    ? 'Actual GitLab original editor with rebuilt prepared host changes; Fountain browser editor not installed'
    : 'Original GitLab product baseline; Fountain is not installed in this application',
  pin,
  checks: [],
  secrets: 'Credential stays in protected task-container configuration and process memory; no credential values, traces or browser storage-state files are recorded',
  preparedHost,
  nativeBrowser,
  footnoteServerOverlay,
  nativeInsertion,
  nativeComponent,
  nativeAttachments,
  nativeCapacity,
  nativeLinks,
  nativeCodeProfile: nativeCode,
  nativeContextMenusProfile: nativeContextMenus,
  nativeContextUIProfile: nativeContextUI,
  nativeFrontmatterProfile: nativeFrontmatter,
  nativeQuickActionsProfile: nativeQuickActions,
  nativeAlertsProfile: nativeAlerts,
  nativeMediaProfile: nativeMedia,
  nativeMediaFilesProfile: nativeMediaFiles,
  nativeReferencesProfile: nativeReferences,
};
if (nativeBrowser)
  report.nativeRuntime = JSON.parse(
    await readFile(new URL('artifacts/gitlab-native-runtime/build.json', root)),
  );
const browser = await chromium.launch(debugLinks ? { args: ['--remote-debugging-port=9331'] } : {});
let context;
const pendingImageDiagnostics = [];
let restoreUploadLimit;
let restoreDiagramSettings;
try {
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: fileURLToPath(new URL('recordings/', output)) },
  });
  if (nativeDiagramReader) await context.addInitScript(() => {
    window.fountainReaderImageEvents = [];
    new MutationObserver(records => {
      records.forEach(record => {
        const image = record.target;
        if (!(image instanceof HTMLImageElement) || !image.getAttribute('src')?.endsWith('/fountain-baseline-figure.png')) return;
        const rect = image.getBoundingClientRect();
        window.fountainReaderImageEvents.push({ pending: image.hasAttribute('data-fountain-reader-image-pending'),
          width: rect.width, height: rect.height });
      });
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-fountain-reader-image-pending'] });
  });
  if (nativeInsertion)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  report.browserErrors = browserErrors;
  const preparedScriptReads = [];
  const preparedScripts = [];
  const imageResponses = [];
  report.imageFailureDiagnostics = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === baseURL && url.pathname.endsWith('/fountain-baseline-figure.png')) {
      imageResponses.push({ path: url.pathname, status: response.status() });
      if (response.status() >= 400) pendingImageDiagnostics.push((async () => {
        const body = await response.text();
        report.imageFailureDiagnostics.push({ path: url.pathname, status: response.status(),
          contentType: await response.headerValue('content-type'), server: await response.headerValue('server'),
          requestId: await response.headerValue('x-request-id'),
          bodySHA256: createHash('sha256').update(body).digest('hex'),
          // Persist only allowlisted diagnostic words, never raw error HTML,
          // request headers or embedded session/CSRF fields.
          keywords: [...new Set(body.match(/\b(?:forbidden|access denied|permission denied|workhorse|JWT|signature|expired|not found|unauthorized|csrf)\b/giu) ?? [])],
        });
      })().catch(() => { report.imageFailureDiagnostics.push({ path: url.pathname, status: response.status(), bodyUnavailable: true }); }));
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
  const auditCredential = loadAuditPassword();
  password = auditCredential.password;
  report.auditCredentialSource = auditCredential.source;
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
  if (nativeDiagrams) {
    await expect(async () => expect((await page.request.get('http://127.0.0.1:5081/')).ok()).toBe(true)).toPass();
    const settings = await api('GET', '/application/settings');
    const prior = { plantuml_enabled: settings.plantuml_enabled, plantuml_url: settings.plantuml_url };
    restoreDiagramSettings = async () => {
      const restored = await api('PUT', '/application/settings', { data: prior });
      expect(restored.plantuml_enabled).toBe(prior.plantuml_enabled); expect(restored.plantuml_url).toBe(prior.plantuml_url);
      report.diagramSettings.restored = true;
    };
    const updated = await api('PUT', '/application/settings', { data: { plantuml_enabled: true, plantuml_url: 'http://127.0.0.1:5081/' } });
    expect(updated.plantuml_enabled).toBe(true); expect(updated.plantuml_url).toBe('http://127.0.0.1:5081/');
    report.diagramSettings = { auditURL: updated.plantuml_url, restored: false };
  }
  if (nativeAttachments) {
    // This driver has already refused every image/project outside its own isolated runtime.
    // Bound the oversize fixture rather than allocating the default 100 MiB limit.
    const settings = await api('GET', '/application/settings');
    const originalMiB = settings.max_attachment_size;
    if (!Number.isSafeInteger(originalMiB) || originalMiB < 1)
      throw new Error('Unexpected isolated GitLab attachment limit.');
    restoreUploadLimit = async () => {
      const restored = await api('PUT', '/application/settings', { data: { max_attachment_size: originalMiB } });
      expect(restored.max_attachment_size).toBe(originalMiB);
      report.uploadLimit.restored = true;
    };
    report.uploadLimit = { originalMiB, auditMiB: 10, restored: false };
    const updated = await api('PUT', '/application/settings', { data: { max_attachment_size: 10 } });
    expect(updated.max_attachment_size).toBe(10);
  }

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
  report.originalServerDescription = issue.description;
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
  if (nativeDiagramReader) {
    await expect(image).not.toHaveAttribute('data-fountain-reader-image-pending', '');
    report.readerImageInitialization = await image.evaluate(element => ({ events: window.fountainReaderImageEvents,
      decodedWidth: element.naturalWidth, decodedHeight: element.naturalHeight,
      temporaryClassesRetained: element.classList.contains('!gl-min-w-7') || element.classList.contains('!gl-min-h-7') }));
    expect(report.readerImageInitialization.events.some(event => event.pending && event.width > 1 && event.height > 1)).toBe(true);
    expect(report.readerImageInitialization.temporaryClassesRetained).toBe(false);
  }
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
    if (nativeInsertion) {
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.evaluate(() =>
        navigator.clipboard.writeText('Pasted **GitLab Markdown** with @root.'),
      );
      await toolbar.getByRole('button', { name: 'Paste Markdown', exact: true }).click();
      await expect(editor.locator('strong').filter({ hasText: 'GitLab Markdown' })).toBeVisible();
      await expect(editor.getByText('Pasted', { exact: false })).toBeVisible();
      await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(editor.getByText('GitLab Markdown', { exact: true })).toHaveCount(0);
      await toolbar.getByRole('button', { name: 'Redo', exact: true }).click();
      await expect(editor.getByText('GitLab Markdown', { exact: true })).toBeVisible();
      const beforeFailure = await editor.innerText();
      const rejected = nativeDecodedFootnoteSource ? 'Visible paste.\n\n[^a\\[b]: Keep this exact unused source.'
        : nativeFootnoteSource ? 'Visible paste.\n\n[^a&#32;b]: Keep this exact unused source.'
        : 'Unsupported footnote [^a&#32;b].\n\n[^a&#32;b]: Keep this exact source.';
      const rejectedPreview = nativeFootnoteSource ? page.waitForResponse(response => {
        try { return response.request().method() === 'POST' && response.url().includes('no_header_anchors=') && response.request().postDataJSON()?.text === rejected; }
        catch { return false; }
      }) : null;
      await page.evaluate((source) => navigator.clipboard.writeText(source), rejected);
      await toolbar.getByRole('button', { name: 'Paste Markdown', exact: true }).click();
      await page.getByText('Retained paste source', { exact: true }).click();
      const retained = page.getByRole('textbox', { name: 'Failed paste source', exact: true });
      await expect(retained).toHaveValue(rejected);
      expect(await editor.innerText()).toBe(beforeFailure);
      if (rejectedPreview) {
        const rendered = await (await rejectedPreview).json();
        expect(rendered.body).toContain('Visible paste.');
        expect(rendered.body).not.toContain('Keep this exact unused source.');
        expect(rendered.body).not.toContain('class="footnotes"');
        report.nativeFootnoteSource = { pasteRenderingOmitsDefinition: true, failedPasteRetained: true,
          ...(nativeDecodedFootnoteSource ? { decodedLabelProfile: true, rejectedPasteSource: rejected } : {}) };
      }
      await retained.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: fileURLToPath(new URL('retained-paste-source.png', output)),
        fullPage: true,
      });
      await editor.getByText('GitLab Markdown', { exact: true }).click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.evaluate(() => navigator.clipboard.writeText('**Recovered paste**'));
      await toolbar.getByRole('button', { name: 'Paste Markdown', exact: true }).click();
      await expect(editor.getByText('Recovered paste', { exact: true })).toBeVisible();
      await expect(page.getByText('Retained paste source', { exact: true })).toHaveCount(0);
      report.checks.push(
        'Real browser clipboard Markdown renders through the actual GitLab service, inserts with reference/marks, and supports one-step undo/redo',
      );
      report.checks.push(
        nativeFootnoteSource ? 'Actual HTML omits the unused footnote definition; native paste refuses that incomplete projection, retains exact source and recovers through a supported paste'
          : 'An actual unsupported GitLab-rendered footnote leaves the document untouched, exposes exact retained source and recovers through a later supported paste',
      );
    }
    if (nativeFootnoteEditing) await auditNativeFootnotes({ page, editor, toolbar, output, report });
    if (nativeFootnoteRenaming) await auditNativeFootnoteRenaming({ page, editor, toolbar, output, report });
    if (nativeFootnoteClipboard) await auditNativeFootnoteClipboard({ page, editor, toolbar, output, report, move: nativeFootnoteCut });
    if (nativeTableClipboard) {
      await auditNativeControlsLayout({ page, editor, toolbar, output, report });
      await auditNativeTableClipboard({ page, editor, toolbar, output, report });
    }
    if (nativeLinks) await auditNativeLinks({ page, context, editor, toolbar, output, report });
    if (nativeCode) await auditNativeCode({ page, editor, toolbar, output, report });
    if (nativeContextMenus) await auditNativeContextMenus({ page, editor, toolbar, output, report });
    if (nativeQuickActions) await auditNativeQuickActions({ page, editor, toolbar, output, report, api, project, issue, controls: nativeQuickActionControls, autocomplete: nativeAutocomplete });
    if (nativeFrontmatter) await auditNativeFrontmatter({ page, editor, toolbar, output, report });
    if (nativeAlerts) await auditNativeAlerts({ page, editor, toolbar, output, report });
    if (nativeMedia) await auditNativeMedia({ page, context, editor, toolbar, output, report });
    if (nativeReferences) await auditNativeReferences({ page, context, editor, toolbar, output, report });
    if (nativeDiagrams) await auditNativeDiagrams({ page, context, editor, toolbar, output, report, pairedAuthoring: nativeDiagramAuthoring });
    if (nativeDiagramReader) await prepareInvalidSavedDiagrams({ page, editor, toolbar, output, report });
    if (nativeAttachments) {
      if (process.argv.includes('--probe-upload-focus')) await editor.evaluate(element => {
        const root = element.closest('[data-fountain-integration="native"]');
        const vm = root.__vue__ ?? root.__vueParentComponent?.proxy;
        const probe = { reveals: 0, changes: [], active: document.activeElement?.tagName, found: Boolean(vm?.contentEditor) };
        window.fountainUploadFocusProbe = probe;
        if (!vm?.contentEditor) return;
        const surface = vm.$refs.surface;
        const reveal = surface.revealSelection.bind(surface);
        surface.revealSelection = () => { probe.reveals++; reveal(); };
        vm.contentEditor.editor.subscribe((state, transaction) => {
          if (probe.changes.length < 40) probe.changes.push({ selectionSet: transaction.selectionSet,
            document: transaction.docChanged, origin: Boolean(transaction.getMeta('gitlab$insertionOrigin')),
            path: state.selection.path, from: state.selection.from, kind: state.selection.kind,
            active: document.activeElement?.tagName, activeType: document.activeElement?.getAttribute('type') });
        });
      });
      const figure = await readFile(new URL('tests/fixtures/cross-container-figure.png', root));
      const receipt = response => response.request().method() === 'POST'
        && new URL(response.url()).pathname.endsWith('/uploads');
      const choose = async payload => {
        const selected = page.waitForEvent('filechooser');
        await toolbar.getByRole('button', { name: 'Attach a file or image', exact: true }).click();
        await (await selected).setFiles(payload);
      };
      const uploadFromPicker = async payload => {
        const response = page.waitForResponse(receipt);
        await choose(payload);
        const completed = await response;
        expect(completed.ok()).toBe(true);
        const body = await completed.json();
        const markdown = (body.link ?? body).markdown;
        expect(typeof markdown).toBe('string');
        return markdown;
      };
      await editor.getByText('Recovered paste', { exact: true }).click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      const imageMarkdown = await uploadFromPicker({ name: 'native-uploaded-plot.png', mimeType: 'image/png', buffer: figure });
      const image = editor.locator('img[src*="native-uploaded-plot.png"]');
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
      await expect(toolbar.getByTestId('file-upload-field')).toHaveValue('');
      await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(image).toHaveCount(0);
      await toolbar.getByRole('button', { name: 'Redo', exact: true }).click();
      await expect(image).toBeVisible();
      await editor.getByText('Recovered paste', { exact: true }).click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      const textMarkdown = await uploadFromPicker({ name: 'native-attachment.txt', mimeType: 'text/plain',
        buffer: Buffer.from('Native GitLab attachment round trip.\n') });
      await expect(editor.locator('a[href*="native-attachment.txt"]')).toBeVisible();
      report.nativeUploads = [{ source: 'picker-image', markdown: imageMarkdown }, { source: 'picker-file', markdown: textMarkdown }];
      report.checks.push('Actual native toolbar file chooser uploads an image and text file through authenticated GitLab HTTP; canonical native insertion and one-step image undo/redo pass');
      await editor.getByText('Recovered paste', { exact: true }).click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      const imagesBeforeClipboard = await editor.locator('img').count();
      await page.evaluate(async bytes => {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(bytes)], { type: 'image/png' }) })]);
      }, [...figure]);
      const pastedUpload = page.waitForResponse(receipt);
      await page.keyboard.press('Control+v');
      const pastedResponse = await pastedUpload;
      expect(pastedResponse.ok()).toBe(true);
      const pastedBody = await pastedResponse.json();
      report.nativeUploads.push({ source: 'native-clipboard-image', markdown: (pastedBody.link ?? pastedBody).markdown });
      await expect(editor.locator('img')).toHaveCount(imagesBeforeClipboard + 1);
      await expect.poll(() => editor.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
      report.checks.push('Actual browser image clipboard and native paste upload through GitLab instead of embedding binary data in document JSON');
      if (nativeCapacity) {
        const before = await editor.innerText();
        let requests = 0;
        const count = request => {
          if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/uploads')) requests++;
        };
        page.on('request', count);
        try {
          await choose(Array.from({ length: 101 }, (_, index) => ({
            name: `refused-batch-${index}.txt`, mimeType: 'text/plain', buffer: Buffer.from('Refused selection'),
          })));
          await expect(page.getByTestId('content-editor-error')).toContainText('None of this selection was uploaded.');
          expect(await editor.innerText()).toBe(before);
          await expect(page.getByRole('list', { name: 'Attachment uploads', exact: true })).toHaveCount(0);
          expect(requests).toBe(0);
          await page.screenshot({ path: fileURLToPath(new URL('whole-batch-refused.png', output)), fullPage: true });
        } finally { page.off('request', count); }
        const recoveryMarkdown = await uploadFromPicker({ name: 'after-capacity.txt', mimeType: 'text/plain',
          buffer: Buffer.from('A smaller selection works after whole-batch refusal.\n') });
        await expect(editor.locator('a[href*="after-capacity.txt"]')).toBeVisible();
        await expect(page.getByTestId('content-editor-error')).toHaveCount(0);
        report.nativeUploads.push({ source: 'after-batch-refusal', markdown: recoveryMarkdown });
        report.batchRefusal = { files: 101, uploadRequests: requests, documentUnchanged: true, smallerSelectionUploaded: true };
        report.checks.push('Actual native picker refuses an entire 101-file selection visibly before HTTP or document changes, then uploads/inserts a smaller selection successfully');
      }
      const maxMiB = await page.evaluate(() => Number(window.gon.max_file_size) || 10);
      if (maxMiB > 32) throw new Error('Configure the isolated audit instance with a file limit at most 32 MiB before its bounded oversize journey.');
      await choose({ name: 'oversize.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(Math.floor(maxMiB * 1024 * 1024) + 1) });
      const failures = page.getByRole('list', { name: 'Attachment uploads', exact: true });
      await expect(failures).toContainText('This file exceeds the upload limit');
      if (nativeCapacity) await expect(page.getByTestId('content-editor-error')).toHaveCount(0);
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Unable to save the current document.' })).toBeVisible();
      await expect(editor).toBeVisible();
      expect((await api('GET', `/projects/${project.id}/issues/${issue.iid}`)).description).toBe(issue.description);
      await failures.scrollIntoViewIfNeeded();
      await page.screenshot({ path: fileURLToPath(new URL('oversize-source-retained.png', output)), fullPage: true });
      await failures.getByRole('button', { name: 'Remove upload', exact: true }).click();
      await expect(failures).toHaveCount(0);
      await page.getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(page.getByTestId('work-item-edit-form-button')).toBeVisible();
      await expect(page.getByText(marker, { exact: true })).toBeVisible();
      const recoveredSave = await api('GET', `/projects/${project.id}/issues/${issue.iid}`);
      for (const uploaded of report.nativeUploads) expect(recoveredSave.description).toContain(uploaded.markdown);
      expect(recoveredSave.description).not.toContain('data-fountain-text-style');
      await page.getByTestId('work-item-edit-form-button').click();
      await expect(editor).toBeVisible();
      report.directUploadSaveRecovery = true;
      report.checks.push('A real over-limit file blocks Save without changing the server original; explicit removal immediately saves the intact draft and uploads without generated empty formatting carriers');
    }
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
  if (nativeLinks) {
    expect(saved.description).toContain('[Fountain link **bold** tail](/help/offline-retry)');
    const readerLink = page.locator('main a').filter({ hasText: report.nativeLink.label });
    await expect(readerLink).toHaveCount(1);
    await expect(readerLink).toHaveAttribute('href', report.nativeLink.displayHref);
    await expect(readerLink.locator('strong')).toHaveText('bold');
    report.checks.push('UI Save persists one enclosing Markdown link with its original formatting and the actual GitLab reader renders one matching anchor');
  }
  if (nativeCode) {
    expect(saved.description).toContain('```python\n' + report.nativeCode.finalText.replace(/\n$/u, '') + '\n```');
    expect(saved.description).toContain('- Replaced nested code\n- Neighbor item');
    const rendered = page.locator('main pre').filter({ hasText: 'const total = 42;' });
    await expect(rendered).toHaveCount(1);
    await expect(rendered).toContainText('// reviewed');
    report.checks.push('Native UI Save persists the changed code language and exact source; the actual GitLab reader renders the edited code');
  }
  if (nativeAlerts) {
    await assertSavedNativeAlerts({ page, description: saved.description, report, output, phase: 'saved' });
    report.checks.push('Actual UI Save persists native alert kinds, custom titles, nested math/code and body text, and the GitLab reader renders them from saved server source');
  }
  if (nativeContextMenus) await assertSavedNativeContextMenus({ page, description: saved.description, report, output, phase: 'saved' });
  if (nativeQuickActions) await assertSavedNativeQuickActions({ page, saved, report, output, phase: 'saved' });
  if (nativeAutocomplete) await assertSavedAutocomplete({ page, saved, report, phase: 'saved' });
  if (nativeFootnoteEditing) await assertSavedFootnotes({ page, description: saved.description, report, phase: 'saved' });
  if (nativeTableClipboard) await assertSavedNativeTableClipboard({ page, description: saved.description, report, phase: 'saved' });
  if (nativeFrontmatter) {
    await assertSavedNativeFrontmatter({ page, description: saved.description, report, output, phase: 'saved' });
    report.checks.push('Actual UI Save retains frontmatter source and delimiters; the GitLab reader and reopened native source agree');
  }
  if (nativeMedia) {
    await assertSavedNativeMedia({ page, description: saved.description, report, output, phase: 'saved' });
    report.checks.push('Actual UI Save retains native media URLs, descriptions, titles and dimensions; the GitLab reader decodes the saved image/audio/video files');
  }
  if (nativeReferences) {
    await assertSavedNativeReferences({ page, description: saved.description, report, output, phase: 'saved' });
    report.checks.push('Actual UI Save retains reference display source and qualification; the real GitLab reader renders the issue, merge-request and colored-label references');
  }
  if (nativeDiagrams) {
    await assertDiagramReader({ page, description: saved.description, report, output, phase: 'saved' });
    report.checks.push(nativeDiagramReader ? 'Actual UI Save retains invalid diagram source and shows explicit reader failure output' : 'Actual UI Save retains both edited diagram sources; the GitLab reader renders the published Mermaid node and decodes the actual PlantUML provider image');
  }
  if (nativeInsertion) {
    expect(saved.description).toContain('Pasted **GitLab Markdown** with <span>@root</span>.');
    const pastedReference = page.getByTestId('work-item-description').locator('p')
      .filter({ hasText: 'Pasted GitLab Markdown with' }).locator('a[data-reference-type="user"]');
    await expect(pastedReference).toHaveCount(1);
    await expect(pastedReference).toHaveAttribute('data-original', '@root');
    await expect(pastedReference).toHaveAttribute('href', '/root');
  }
  if (nativeAttachments) {
    for (const uploaded of report.nativeUploads) expect(saved.description).toContain(uploaded.markdown);
    const link = page.locator('main a[href*="native-attachment.txt"]').first();
    await expect(link).toBeVisible();
    const download = await page.request.get(new URL(await link.getAttribute('href'), baseURL).href);
    expect(download.ok()).toBe(true);
    expect(await download.text()).toBe('Native GitLab attachment round trip.\n');
    report.checks.push('Saved native upload Markdown survives reader rendering; the actual text attachment returns its original bytes through GitLab');
  }
  if (nativeBrowser) expect(saved.description).not.toContain('[](#source-retention-investigation)');
  for (const value of [
    'formatted content',
    '@root',
    'Reproduce the incident',
    'Review the update',
    ...(nativeTableClipboard ? ['| Stage | Status |', '| Next **two** | Grace |'] : ['Pending']),
    'a^2 + b^2 = c^2',
    upload.url,
  ]) {
    expect(saved.description).toContain(value);
  }
  report.source = { original: description, saved: saved.description };
  report.checks.push(
    nativeTableClipboard
      ? 'Native rich typing and UI save retain untouched seeded content and the intentional rich-grid table edits in the server record'
      : 'Native rich typing and UI save persisted the added paragraph and retained the seeded content in the server record',
  );
  if (nativeBrowser) {
    const activity = page.getByTestId('detail-layout-activity');
    const composer = activity.locator(
      '[data-fountain-integration="native"] [contenteditable="true"]',
    );
    await expect(composer).toBeVisible();
    if (nativeComponent) {
      await expect(composer).toHaveAttribute('data-fountain-empty', '');
      const placeholder = await composer.getAttribute('data-placeholder');
      expect(placeholder).toBeTruthy();
      await expect.poll(() => composer.evaluate((element) => getComputedStyle(element, '::before').content))
        .toBe(JSON.stringify(placeholder));
      await composer.scrollIntoViewIfNeeded();
      await page.screenshot({ path: fileURLToPath(new URL('empty-comment-placeholder.png', output)), fullPage: true });
    }
    await composer.click();
    if (nativeComponent)
      expect(await composer.evaluate((element) => getComputedStyle(element, '::before').content))
        .toBe('none');
    const note = 'Native Fountain discussion: created through the actual GitLab comment form.';
    await composer.pressSequentially(note);
    if (nativeComponent) await expect(composer).not.toHaveAttribute('data-fountain-empty');
    await activity.getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(composer).toHaveText('');
    await expect(activity.getByText(note, { exact: true })).toBeVisible();
    const notes = await api('GET', `/projects/${project.id}/issues/${issue.iid}/notes`);
    expect(notes.some((value) => value.body === note)).toBe(true);
    report.comment = { body: note, persisted: true };
    if (nativeComponent) {
      await expect(composer).toHaveAttribute('data-fountain-empty', '');
      report.checks.push('An actual empty comment paints its placeholder, hides it on focus/typing and restores empty state after real comment persistence');
    }
    report.checks.push(
      'An initially empty native Fountain composer creates a real GitLab discussion comment and clears after successful persistence',
    );
  }
  if (nativeComponent) {
    const rejectedSource = nativeDecodedFootnoteSource ? 'Visible saved body.\n\n[^a&#32;b]: Keep the saved unused footnote unchanged.'
      : nativeFootnoteSource ? 'Visible saved body.\n\n[^a&#32;b]: Keep the saved unused footnote unchanged.'
      : 'Unsupported footnote [^a&#32;b].\n\n[^a&#32;b]: Keep the saved original unchanged.';
    const rejectedIssue = await api('POST', `/projects/${project.id}/issues`, {
      data: { title: 'Native failed-load recovery audit', description: rejectedSource },
    });
    await page.goto(rejectedIssue.web_url);
    const rejectedRendering = page.waitForResponse(response => {
      if (response.request().method() !== 'POST' || !response.ok()) return false;
      try { return response.request().postDataJSON()?.text === rejectedSource; }
      catch { return false; }
    });
    await page.getByTestId('work-item-edit-form-button').click();
    const rejectedResponse = await rejectedRendering;
    await rejectedResponse.finished();
    if (nativeFootnoteSource) {
      const rendered = await rejectedResponse.json();
      expect(rendered.body).toContain('Visible saved body.');
      expect(rendered.body).not.toContain('Keep the saved unused footnote unchanged.');
      expect(rendered.body).not.toContain('class="footnotes"');
      report.nativeFootnoteSource.savedRenderingOmitsDefinition = true;
      report.nativeFootnoteSource.originalSource = rejectedSource;
    }
    const native = page.getByTestId('work-item-description-wrapper').locator('[data-fountain-integration="native"]');
    const failedEditor = native.locator('[contenteditable]');
    await expect(native.getByTestId('content-editor-error')).toBeVisible();
    await expect(failedEditor).toHaveAttribute('contenteditable', 'false');
    await expect(failedEditor).toHaveAttribute('aria-readonly', 'true');
    await native.getByText('Retained document source', { exact: true }).click();
    await expect(native.getByRole('textbox', { name: 'Retained document Markdown', exact: true })).toHaveValue(rejectedSource);
    const retryResponse = page.waitForResponse(response => response.request().method() === 'POST'
      && response.url().includes('no_header_anchors='));
    await native.getByRole('button', { name: 'Retry source', exact: true }).click();
    await (await retryResponse).finished();
    await expect(native.getByTestId('content-editor-error')).toBeVisible();
    await expect(failedEditor).toHaveAttribute('contenteditable', 'false');
    expect((await api('GET', `/projects/${project.id}/issues/${rejectedIssue.iid}`)).description).toBe(rejectedSource);
    await failedEditor.scrollIntoViewIfNeeded();
    await page.screenshot({ path: fileURLToPath(new URL('failed-load-readonly.png', output)), fullPage: true });
    await native.getByRole('button', { name: 'Keep current document', exact: true }).click();
    await expect(failedEditor).toHaveAttribute('contenteditable', 'true');
    await failedEditor.click();
    await failedEditor.pressSequentially('A deliberately recovered local draft.');
    await expect(failedEditor).toHaveText('A deliberately recovered local draft.');
    await expect(native.getByRole('textbox', { name: 'Retained document Markdown', exact: true })).toHaveValue(rejectedSource);
    expect((await api('GET', `/projects/${project.id}/issues/${rejectedIssue.iid}`)).description).toBe(rejectedSource);
    await page.screenshot({ path: fileURLToPath(new URL('failed-load-explicit-recovery.png', output)), fullPage: true });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.goto(issue.web_url);
    report.recoveryIssue = { iid: rejectedIssue.iid, originalSourceUnchanged: true, recoveryDraftCancelled: true };
    report.checks.push('Actual unsupported saved Markdown refuses editing through Retry; explicit recovery enables a local draft, cancelled without changing the server original');
  }
  await page.reload();
  await expect(page.getByText(marker, { exact: true })).toBeVisible();
  if (nativeAlerts) await assertSavedNativeAlerts({ page, description: saved.description, report, output, phase: 'reopened' });
  if (nativeContextMenus) await assertSavedNativeContextMenus({ page, description: saved.description, report, output, phase: 'reopened' });
  if (nativeQuickActions) await assertSavedNativeQuickActions({ page, saved: await api('GET', `/projects/${project.id}/issues/${issue.iid}`), report, output, phase: 'reopened' });
  if (nativeAutocomplete) await assertSavedAutocomplete({ page, saved: await api('GET', `/projects/${project.id}/issues/${issue.iid}`), report, phase: 'reopened' });
  if (nativeFootnoteEditing) await assertSavedFootnotes({ page, description: saved.description, report, phase: 'reopened' });
  if (nativeTableClipboard) await assertSavedNativeTableClipboard({ page, description: saved.description, report, phase: 'reopened' });
  if (nativeFrontmatter) await assertSavedNativeFrontmatter({ page, description: saved.description, report, output, phase: 'reopened' });
  if (nativeMedia) await assertSavedNativeMedia({ page, description: saved.description, report, output, phase: 'reopened' });
  if (nativeReferences) await assertSavedNativeReferences({ page, description: saved.description, report, output, phase: 'reopened' });
  if (nativeDiagrams) await assertDiagramReader({ page, description: saved.description, report, output, phase: 'reopened' });
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
    if (nativeAttachments) {
      const deniedUpload = await anonymous.request.post(`${baseURL}/api/v4/projects/${project.id}/uploads`, {
        multipart: { file: { name: 'denied.txt', mimeType: 'text/plain', buffer: Buffer.from('Denied upload') } },
      });
      expect([401, 403, 404]).toContain(deniedUpload.status());
      report.anonymousUploadStatus = deniedUpload.status();
      report.checks.push('Unauthenticated upload into the private real project is refused by GitLab');
    }
  } finally {
    await anonymous.close();
  }
  report.checks.push('Private issue is unavailable to an unauthenticated browser context');

  if (process.argv.includes('--verify-restart')) {
    compose('restart', '--timeout', '60', 'baseline');
    await ready();
    const reopened = await api('GET', `/projects/${project.id}/issues/${issue.iid}`);
    expect(reopened.description).toBe(saved.description);
    if (nativeFootnoteSource) {
      const protectedOriginal = await api('GET', `/projects/${project.id}/issues/${report.recoveryIssue.iid}`);
      expect(protectedOriginal.description).toBe(report.nativeFootnoteSource.originalSource);
      report.nativeFootnoteSource.restartOriginalPreserved = true;
      report.checks.push('The saved unused footnote definition remains byte-for-byte unchanged after actual application restart');
    }
    await page.goto(issue.web_url);
    await expect(page.getByText(marker, { exact: true })).toBeVisible();
    if (nativeAlerts) await assertSavedNativeAlerts({ page, description: reopened.description, report, output, phase: 'restart' });
    if (nativeContextMenus) await assertSavedNativeContextMenus({ page, description: reopened.description, report, output, phase: 'restart' });
    if (nativeQuickActions) await assertSavedNativeQuickActions({ page, saved: reopened, report, output, phase: 'restart' });
    if (nativeAutocomplete) await assertSavedAutocomplete({ page, saved: reopened, report, phase: 'restart' });
    if (nativeFootnoteEditing) await assertSavedFootnotes({ page, description: reopened.description, report, phase: 'restart' });
    if (nativeTableClipboard) await assertSavedNativeTableClipboard({ page, description: reopened.description, report, phase: 'restart' });
    if (nativeFrontmatter) await assertSavedNativeFrontmatter({ page, description: reopened.description, report, output, phase: 'restart' });
    if (nativeMedia) await assertSavedNativeMedia({ page, description: reopened.description, report, output, phase: 'restart' });
    if (nativeReferences) await assertSavedNativeReferences({ page, description: reopened.description, report, output, phase: 'restart' });
    if (nativeDiagrams) await assertDiagramReader({ page, description: reopened.description, report, output, phase: 'restart' });
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
  if (nativeDiagramReader) {
    await repairInvalidSavedDiagrams({ page, report, output });
    const repaired = await api('GET', `/projects/${project.id}/issues/${issue.iid}`);
    const repairedReport = { nativeDiagrams: report.nativeInvalidDiagrams.valid };
    await assertSavedNativeDiagrams({ page, description: repaired.description, report: repairedReport, output, phase: 'repaired' });
    await page.reload();
    await assertSavedNativeDiagrams({ page, description: repaired.description, report: repairedReport, output, phase: 'repaired-reopened' });
    report.nativeInvalidDiagrams.repair = { source: repaired.description, phases: repairedReport.nativeDiagramReaderPhases };
    report.checks.push('Both invalid saved sources reopen verbatim in native dialogs after restart; actual source repair, UI saving and reader reload restore working Mermaid and PlantUML diagrams');
  }
  expect(browserErrors).toEqual([]);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = password ? String(error).replaceAll(password, '[redacted]') : String(error);
  if (nativeMedia) report.nativeMediaFailure = await context.pages()[0]?.evaluate(() => ({
    host: (() => {
      const owner = document.querySelector('[data-fountain-integration="native"]');
      const component = owner?.__vue__ ?? owner?.__vueParentComponent?.proxy;
      return { message: component?.failure?.message, stack: component?.failure?.stack,
        issues: component?.failure?.issues, source: component?.contentEditor?.recovery?.markdown,
        loadFailed: component?.loadFailed, fatal: component?.fatal };
    })(),
    fields: Array.from(document.querySelectorAll('[role="dialog"] input'), input => ({ label: input.id, value: input.value })),
    errors: Array.from(document.querySelectorAll('[data-fountain-error]'), element => element.getAttribute('data-fountain-error')),
    images: Array.from(document.querySelectorAll('[data-fountain-root] img'), image => ({
      src: image.getAttribute('src'), currentSrc: image.currentSrc, complete: image.complete,
      naturalWidth: image.naturalWidth, loading: image.loading, style: image.getAttribute('style'),
      rect: image.getBoundingClientRect().toJSON(),
    })),
    nativeSelection: { collapsed: getSelection()?.isCollapsed,
      path: getSelection()?.focusNode?.parentElement?.closest('[data-fountain-path]')?.getAttribute('data-fountain-path') },
    playback: Array.from(document.querySelectorAll('[data-fountain-root] audio, [data-fountain-root] video'), media => ({
      kind: media.tagName, src: media.getAttribute('src'), readyState: media.readyState, currentTime: media.currentTime,
      paused: media.paused, ended: media.ended,
      error: media.error?.code, style: media.getAttribute('style'), rect: media.getBoundingClientRect().toJSON(),
    })),
  }));
  if (nativeAlerts) report.nativeAlertFailure = await context.pages()[0]?.evaluate(() => {
    const owner = document.querySelector('[data-fountain-integration="native"]');
    const component = owner?.__vue__ ?? owner?.__vueParentComponent?.proxy;
    const image = document.querySelector('img[alt="Uploaded baseline figure"]');
    return { hostError: owner?.getAttribute('data-fountain-error'), message: component?.failure?.message,
      issues: component?.failure?.issues, image: image && { src: image.getAttribute('src'),
        currentSrc: image.currentSrc, complete: image.complete, width: image.naturalWidth,
        loading: image.loading, attributes: Array.from(image.attributes, item => [item.name, item.value]),
        box: image.getBoundingClientRect().toJSON() } };
  });
  if (nativeCode) report.nativeCodeFailure = await context.pages()[0]?.evaluate(() => {
    const owner = document.querySelector('[data-fountain-integration="native"]');
    const component = owner?.__vue__ ?? owner?.__vueParentComponent?.proxy;
    return { hostError: owner?.getAttribute('data-fountain-error'),
      message: component?.failure?.message, issues: component?.failure?.issues };
  });
  if (nativeLinks) {
    report.nativeLinkEvents = await context.pages()[0]?.evaluate(() => window.fountainLinkEvents ?? []);
    report.nativeLinkFailureState = await context.pages()[0]?.evaluate(() => {
      const owner = document.querySelector('[data-testid="native-link-menu"]');
      const menu = owner?.__vue__ ?? owner?.__vueParentComponent?.proxy;
      const modal = menu?.$children?.find(child => child.$options.name === 'GlModal');
      const internal = modal?.$children?.find(child => child.$options.name === 'BModal');
      return { name: menu?.$options?.name, open: menu?.dialogOpen, disabled: menu?.disabled,
        available: menu?.available, connected: menu?.root?.isConnected,
        sessionClosed: menu?.sessionState?.closed, conflict: menu?.sessionState?.conflict,
        serviceStatus: menu?.contentEditor?.status,
        hostError: owner?.closest('[data-fountain-integration]')?.getAttribute('data-fountain-error'),
        modal: modal ? { visible: modal.visible, closing: internal?.isClosing,
          opening: internal?.isOpening, shown: internal?.isVisible, hidden: internal?.isHidden } : null };
    });
  }
  if (nativeAttachments && process.argv.includes('--probe-upload-focus')) {
    report.uploadFocusProbe = await context.pages()[0].evaluate(() => ({ probe: window.fountainUploadFocusProbe,
      selection: { focusType: getSelection()?.focusNode?.nodeType, focusText: getSelection()?.focusNode?.textContent?.slice(0, 50), offset: getSelection()?.focusOffset },
      images: [...document.querySelectorAll('img[src*="native-uploaded-plot.png"]')].map(image => ({
        complete: image.complete, width: image.naturalWidth, rect: image.getBoundingClientRect().toJSON(),
        parentRect: image.parentElement.getBoundingClientRect().toJSON(), parentTag: image.parentElement.tagName,
        active: document.activeElement?.tagName,
      })),
    }));
  }
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
          rect: image.getBoundingClientRect().toJSON(),
          visibility: document.visibilityState,
          display: getComputedStyle(image).display,
          contentVisibility: getComputedStyle(image).contentVisibility,
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
    report.imagesAfterFailureScreenshot = await active
      .getByRole('img', { name: 'Uploaded baseline figure', exact: true })
      .evaluateAll(images => images.map(image => ({ complete: image.complete,
        width: image.naturalWidth, currentSrc: image.currentSrc })));
  }
  if (debugLinks) {
    const { createServer } = await import('node:http');
    let finish;
    const done = new Promise(resolve => { finish = resolve; });
    const server = createServer((request, response) => {
      if (request.method !== 'POST' || request.url !== '/finish') { response.writeHead(404).end(); return; }
      response.end('Closing the diagnostic session.'); finish();
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(9332, '127.0.0.1', resolve); });
    console.log('Link diagnostic ready on loopback CDP 9331; POST loopback 9332/finish to close. This failed run is not acceptance evidence.');
    report.debugSession = true;
    await done;
    await new Promise(resolve => server.close(resolve));
  }
  process.exitCode = 1;
} finally {
  if (restoreDiagramSettings) {
    try { await restoreDiagramSettings(); }
    catch { report.status = 'failed'; report.diagramSettingsRestoreFailed = true; process.exitCode = 1; }
  }
  if (restoreUploadLimit) {
    try { await restoreUploadLimit(); }
    catch { report.status = 'failed'; report.settingsRestoreFailed = true; process.exitCode = 1; }
  }
  await Promise.allSettled(pendingImageDiagnostics);
  await context?.close();
  await browser.close();
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({ status: report.status, checks: report.checks, error: report.error }, null, 2),
  );
}
