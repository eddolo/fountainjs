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
const directory = resolve(installed.source, '../alert-storybook');
const output = new URL('artifacts/gitlab-native-alert-storybook-20261112/', root);
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
const report = { scope: 'Four isolated actual-component states and narrow keyboard editing using renderer fixtures; separate from actual GitLab product persistence acceptance',
  upstreamRevision: installed.revision, nativeRuntimeSHA256: installed.nativeRuntime.sha256,
  status: 'running', checks: [], pages: [], sources: {} };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: fileURLToPath(new URL('recordings/', output)) } });
try {
  for (const [id, width] of [['default-title', 1280], ['custom-title', 1280], ['read-only', 1280], ['caution', 1280], ['default-title', 360]]) {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:6006/iframe.html?id=content-editor-fountain-alert-menu--${id}&viewMode=story`);
    const select = page.getByRole('combobox', { name: 'Alert type' });
    const alert = page.locator('[data-fountain-gitlab-alert]');
    const title = alert.locator('[data-fountain-gitlab-alert-title]');
    await expect(select).toBeVisible();
    if (id === 'read-only') {
      await expect(select).toBeDisabled(); await expect(page.getByRole('button', { name: 'Delete alert' })).toBeDisabled();
      await expect(page.getByRole('textbox', { name: 'Alert example document' })).toHaveAttribute('aria-readonly', 'true');
    } else {
      await expect(select).toBeEnabled();
      if (id === 'caution') await expect(select).toHaveValue('caution');
      else {
        await select.focus(); await select.selectOption('warning');
        await expect(alert).toHaveAttribute('data-fountain-gitlab-alert', 'warning');
        if (id === 'custom-title') await expect(title).toHaveText('Deployment status');
        else {
          await expect(title).toHaveAttribute('data-fountain-default-title', 'Warning');
          expect(await title.evaluate(node => getComputedStyle(node, '::before').content)).toBe('"Warning"');
          await title.click(); await page.keyboard.press('Control+b'); await page.keyboard.type('Release decision');
          await expect(title).toHaveText('Release decision');
          await expect(title.locator('strong')).toHaveCount(0);
          await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.keyboard.type('Owner: Ada.');
          await expect(alert).toContainText('Owner: Ada.');
          await expect(alert).toContainText('Keep the rollback ready.');
        }
        report.checks.push(`${id}/${width}px: native selection changes severity, retains custom title or permits direct title typing and Enter into the body`);
      }
    }
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const result = await page.evaluate(() => window.axe.run(document.body));
    await page.screenshot({ path: fileURLToPath(new URL(`${id}-${width}.png`, output)), fullPage: true, caret: 'initial' });
    report.pages.push({ id, width, violations: result.violations, errors });
    expect(errors).toEqual([]); expect(result.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    report.checks.push(`${id}/${width}px: no accessibility violations, page errors or horizontal overflow`);
    await page.close();
  }
  for (const name of ['fountain_alert_menu.vue', 'fountain_alert_menu.stories.js', 'fountain_editor_surface.vue']) {
    const path = `app/assets/javascripts/content_editor/components/${name}`;
    report.sources[path] = createHash('sha256').update(await readFile(resolve(installed.source, path))).digest('hex');
  }
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = String(error); process.exitCode = 1; }
finally {
  await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, checks: report.checks, pages: report.pages.map(page => ({ id: page.id, width: page.width, violations: page.violations.map(value => value.id) })), error: report.error }, null, 2));
