import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

if (process.platform !== 'linux') throw new Error('Run with the pinned Linux browser environment.');
const root = new URL('../', import.meta.url);
const installed = JSON.parse(await readFile(new URL('artifacts/gitlab-native-browser-install/install.json', root)));
const require = createRequire(resolve(installed.source, 'storybook/package.json'));
const axePath = require.resolve('axe-core/axe.min.js');
const directory = resolve(installed.source, '../link-storybook');
const output = new URL('artifacts/gitlab-native-link-storybook-20261112/', root);
await mkdir(output, { recursive: true });
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const target = resolve(directory, `.${pathname === '/' ? '/index.html' : pathname}`);
    const path = relative(directory, target);
    if (path.startsWith('..')) { response.writeHead(403).end(); return; }
    const bytes = await readFile(target);
    response.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream' }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise((yes, no) => { server.once('error', no); server.listen(6006, '127.0.0.1', yes); });
const report = { scope: 'Seven isolated native link component states plus narrow-screen preview with fixed renderer fixtures; not real-service product acceptance',
  upstreamRevision: installed.revision, checks: [], pages: [], status: 'running',
  rules: 'Full body/portal axe scan; only the existing GitLab GlLink link-in-text-block exception is inherited' };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 },
  recordVideo: { dir: fileURLToPath(new URL('recordings/', output)) } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:6006' });
try {
  for (const [id, state, width = 1280] of [['existing-link', 'preview'], ['empty-document', 'empty'], ['read-only', 'readonly'],
    ['edit-form', 'form'], ['pending', 'pending'], ['failed-resolution', 'failed'], ['conflict', 'conflict'], ['existing-link', 'narrow-preview', 360]]) {
    const page = await context.newPage(), errors = [];
    await page.setViewportSize({ width, height: 900 });
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:6006/iframe.html?id=content-editor-fountain-link-menu--${id}&viewMode=story`);
    await expect(page.getByRole('heading', { name: 'Native link controls', exact: true })).toBeVisible();
    if (['preview', 'narrow-preview'].includes(state)) {
      await expect(page.getByRole('button', { name: 'Copy link URL', exact: true })).toBeVisible();
      await expect(page.getByRole('tooltip')).toHaveCSS('opacity', '1');
    }
    if (state === 'empty') await expect(page.getByRole('button', { name: 'Insert or edit link', exact: true })).toBeEnabled();
    if (state === 'readonly') await expect(page.getByRole('button', { name: 'Insert or edit link', exact: true })).toBeDisabled();
    if (['form', 'pending', 'failed', 'conflict'].includes(state)) {
      await expect(page.getByRole('dialog', { name: 'Edit link', exact: true })).toBeVisible();
      await expect(page.getByRole('dialog', { name: 'Edit link', exact: true })).toHaveCSS('opacity', '1');
    }
    if (state === 'pending') await expect(page.getByRole('textbox', { name: 'Link URL', exact: true })).toBeDisabled();
    if (state === 'failed') await expect(page.getByRole('alert')).toContainText('Your draft and document are retained');
    if (state === 'conflict') await expect(page.getByRole('alert')).toContainText('The selected content changed');
    const previews = page.getByRole('tooltip');
    for (let index = 0; index < await previews.count(); index++) await expect(previews.nth(index)).toHaveCSS('opacity', '1');
    if (['preview', 'narrow-preview', 'readonly'].includes(state)) {
      for (const name of ['Copy link URL', 'Edit link', 'Remove link']) {
        expect(await page.getByRole('button', { name, exact: true }).evaluate(element => {
          const text = element.querySelector('span');
          return !text || text.scrollWidth <= text.clientWidth + 1;
        })).toBe(true);
      }
    }
    await page.addScriptTag({ path: axePath });
    const result = await page.evaluate(() => window.axe.run(document.body, {
      rules: { 'link-in-text-block': { enabled: false } },
    }));
    await page.screenshot({ path: fileURLToPath(new URL(`${state === 'narrow-preview' ? 'narrow-preview' : id}.png`, output)), fullPage: true });
    const containers = await page.evaluate(() => [...document.querySelectorAll('.gl-popover')].map(element => {
      const parents = [];
      for (let parent = element.parentElement; parent; parent = parent.parentElement)
        parents.push({ tag: parent.tagName, role: parent.getAttribute('role'), label: parent.getAttribute('aria-label'),
          editable: parent.getAttribute('contenteditable') });
      return parents;
    }));
    report.pages.push({ id, state, width, violations: result.violations, passes: result.passes.length, errors, containers });
    expect(result.violations).toEqual([]);
    expect(errors).toEqual([]);
    if (state === 'preview') {
      const modal = page.getByRole('dialog', { name: 'Edit link', exact: true });
      await page.getByRole('button', { name: 'Edit link', exact: true }).click();
      await expect(modal).toBeVisible();
      await modal.getByRole('textbox', { name: 'Link URL', exact: true }).fill('/next');
      await modal.getByRole('button', { name: 'Apply link', exact: true }).click();
      await expect(modal).toBeHidden();
      const surface = page.getByRole('textbox', { name: 'Link example document', exact: true });
      await surface.focus();
      await page.keyboard.press('Control+z');
      await expect(surface.getByRole('link')).toHaveAttribute('href', '/original');
      await page.keyboard.press('Control+Shift+z');
      await expect(surface.getByRole('link')).toHaveAttribute('href', '/resolved');
      await surface.getByRole('link').click();
      await page.evaluate(() => navigator.clipboard.writeText('Fountain link audit sentinel'));
      await page.getByRole('button', { name: 'Copy link URL', exact: true }).click();
      report.historyClipboardWritten = await page.evaluate(async () => await navigator.clipboard.readText() === 'http://127.0.0.1:6006/resolved');
      await expect(page.getByRole('status')).toContainText('Link URL copied.');
      await page.getByRole('button', { name: 'Edit link', exact: true }).click();
      await expect(modal.getByRole('textbox', { name: 'Link URL', exact: true })).toHaveValue('/next');
      await page.screenshot({ path: fileURLToPath(new URL('reopened-preview.png', output)), fullPage: true });
      await modal.getByRole('button', { name: 'Cancel link edit', exact: true }).click();
      await expect(modal).toBeHidden();
      await expect(surface).toBeFocused();
      await page.getByRole('button', { name: 'Remove link', exact: true }).click();
      await expect(surface.getByRole('link')).toHaveCount(0);
      await page.keyboard.press('Control+z');
      await expect(surface.getByRole('link')).toHaveAttribute('href', '/resolved');
      report.checks.push('Actual popover first edit, undo/redo, browser clipboard copy, repeated edit and cancel');
    }
    report.checks.push(`${state}: visible native component state and full-body/portal accessibility`);
    await page.close();
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = String(error); process.exitCode = 1;
  const page = context.pages().at(-1);
  if (page) {
    report.failureState = await page.evaluate(() => {
      const owner = document.querySelector('[data-testid="native-link-menu"]');
      const menu = owner?.__vue__ ?? owner?.__vueParentComponent?.proxy;
      return { name: menu?.$options?.name, disposed: menu?.disposed, connected: menu?.root?.isConnected,
        focused: menu?.focused, anchorConnected: menu?.anchor?.isConnected,
        active: document.activeElement?.tagName, editorFocused: menu?.root === document.activeElement,
        open: menu?.dialogOpen, copyState: menu?.copyState, displayURL: menu?.displayURL, context: menu?.context?.displayHref,
        controls: [...document.querySelectorAll('button[data-link-action]')].map(button => {
          const component = button.__vue__ ?? button.__vueParentComponent?.proxy;
          return { action: button.dataset.linkAction, name: component?.$options?.name,
            destroyed: component?._isDestroyed, disabled: component?.disabled };
        }) };
    });
    await page.screenshot({ path: fileURLToPath(new URL('failure.png', output)), fullPage: true });
  }
}
finally {
  await context.close(); await browser.close(); await new Promise(yes => server.close(yes));
  report.sources = {};
  for (const name of ['fountain_link_menu.vue', 'fountain_link_menu.stories.js']) {
    const path = `app/assets/javascripts/content_editor/components/${name}`;
    report.sources[path] = createHash('sha256').update(await readFile(resolve(installed.source, path))).digest('hex');
  }
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checks: report.checks, error: report.error }, null, 2));
}
