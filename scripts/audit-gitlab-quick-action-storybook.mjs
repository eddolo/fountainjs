import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

if (process.platform !== 'linux') throw new Error('Run in the pinned Linux browser environment.');
const root = new URL('../', import.meta.url);
const installed = JSON.parse(await readFile(new URL('artifacts/gitlab-native-browser-install/install.json', root)));
const require = createRequire(resolve(installed.source, 'storybook/package.json'));
const directory = resolve(installed.source, '../quick-action-storybook');
const output = new URL('artifacts/gitlab-quick-action-storybook-20261114/', root);
await mkdir(output, { recursive: true });
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const target = resolve(directory, `.${path === '/' ? '/index.html' : path}`);
    if (relative(directory, target).startsWith('..')) { response.writeHead(403).end(); return; }
    response.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream' }).end(await readFile(target));
  } catch { response.writeHead(404).end(); }
});
await new Promise((yes, no) => { server.once('error', no); server.listen(6006, '127.0.0.1', yes); });
const report = { scope: 'Isolated native quick-action presentation with declared renderer/provider fixtures; separate real GitLab persistence audit',
  upstreamRevision: installed.revision, nativeRuntimeSHA256: installed.nativeRuntime.sha256,
  status: 'running', pages: [], sources: {} };
const browser = await chromium.launch();
const context = await browser.newContext({ recordVideo: { dir: fileURLToPath(new URL('recordings/', output)) } });
try {
  for (const width of [1280, 360]) for (const state of ['suggestions', 'literal', 'unavailable']) {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:6006/iframe.html?id=content-editor-fountain-quick-action-menu--${state}&viewMode=story`);
    const panel = page.getByRole('region', { name: 'Quick action controls', exact: true });
    const editor = page.getByRole('textbox', { name: 'Quick action example', exact: true });
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('native-context-surface')).toHaveAttribute('data-menu-mode', width < 640 ? 'docked' : 'floating');
    if (state === 'suggestions') {
      const list = page.getByRole('listbox', { name: 'Available quick actions', exact: true });
      await expect(list.getByRole('option', { name: /\/label.*Add labels/u })).toBeVisible();
      await page.keyboard.press('Alt+F10'); await expect(list).toBeFocused();
      await page.keyboard.press('ArrowDown');
      const id = await list.getAttribute('aria-activedescendant');
      expect(id).toBeTruthy(); expect(await page.locator(`[id="${id}"]`).getAttribute('aria-selected')).toBe('true');
    } else if (state === 'literal') {
      await expect(panel).toContainText('This line stays text.');
      await expect(panel.getByRole('button', { name: 'Treat as quick action', exact: true })).toBeVisible();
      await expect(editor).not.toHaveAttribute('aria-controls');
    } else {
      await expect(panel.getByRole('alert')).toContainText('Available commands could not be loaded.');
      await expect(panel.getByRole('button', { name: 'Retry commands', exact: true })).toBeVisible();
    }
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const result = await page.evaluate(() => window.axe.run(document.body));
    await page.screenshot({ path: fileURLToPath(new URL(`${state}-${width}.png`, output)), fullPage: true });
    const menuBounds = await panel.boundingBox(), hostBounds = await page.locator('main').boundingBox();
    report.pages.push({ state, width, violations: result.violations, errors, menuBounds, hostBounds });
    expect(errors).toEqual([]); expect(result.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(menuBounds.y, 'Controls must remain inside the visible host, including error states').toBeGreaterThanOrEqual(Math.max(0, hostBounds.y));
    expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(Math.min(900, hostBounds.y + hostBounds.height) + 1);
    if (state === 'suggestions') {
      await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0); await expect(editor).toBeFocused();
      await expect(editor).not.toHaveAttribute('aria-activedescendant');
    }
    await page.close();
  }
  for (const name of ['fountain_context_surface.vue', 'fountain_quick_action_menu.vue', 'fountain_quick_action_menu.stories.js']) {
    const path = `app/assets/javascripts/content_editor/components/${name}`;
    report.sources[path] = createHash('sha256').update(await readFile(resolve(installed.source, path))).digest('hex');
    expect(report.sources[path]).toBe(installed.files[path]);
  }
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = String(error); process.exitCode = 1; }
finally {
  await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, pages: report.pages.map(({ state, width, violations }) => ({ state, width, violations: violations.map(value => value.id) })), error: report.error }, null, 2));
