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
const directory = resolve(installed.source, '../code-storybook');
const output = new URL('artifacts/gitlab-native-code-storybook-20261112/', root);
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
const report = { scope: 'Four isolated actual-component states plus narrow keyboard workflow using fixed renderer fixtures; not real-service acceptance',
  upstreamRevision: installed.revision, status: 'running', checks: [], pages: [], sources: {} };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: fileURLToPath(new URL('recordings/', output)) } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:6006' });
try {
  for (const [id, width] of [['editing', 1280], ['read-only', 1280], ['invalid-language', 1280], ['conflict', 1280], ['editing', 360]]) {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:6006/iframe.html?id=content-editor-fountain-code-menu--${id}&viewMode=story`);
    const input = page.getByRole('combobox', { name: 'Code language' });
    await expect(input).toBeVisible();
    if (id === 'read-only') {
      await expect(input).toBeDisabled(); await expect(page.getByRole('button', { name: 'Delete code block' })).toBeDisabled();
      await page.getByRole('button', { name: 'Copy code' }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('const answer = 42;\nconsole.log(answer);');
      report.checks.push('Read-only code can be copied through the real browser clipboard while mutation controls remain disabled');
    } else if (id === 'invalid-language') await expect(page.getByRole('alert')).toContainText('language label');
    else if (id === 'conflict') await expect(page.getByRole('alert')).toContainText('code block changed');
    else {
      await expect(input).toBeEnabled();
      await input.fill('my-company-dsl'); await input.press('Enter'); await expect(input).toHaveValue('my-company-dsl');
      await page.getByRole('button', { name: 'Copy code' }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('const answer = 42;\nconsole.log(answer);');
      await input.fill('rust'); await input.press('Escape'); await expect(input).toHaveValue('my-company-dsl');
      expect(await page.getByRole('textbox', { name: 'Code example document' }).evaluate(element => element.contains(document.activeElement))).toBe(true);
      report.checks.push(`${width}px: keyboard Enter applies a custom language, browser clipboard copies all source, Escape cancels and returns editor focus`);
    }
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const result = await page.evaluate(() => window.axe.run(document.body));
    await page.screenshot({ path: fileURLToPath(new URL(`${id}-${width}.png`, output)), fullPage: true, caret: 'initial' });
    report.pages.push({ id, width, violations: result.violations, errors });
    expect(errors).toEqual([]); expect(result.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    report.checks.push(`${id}/${width}px: no accessibility violations, page errors or horizontal page overflow`);
    await page.close();
  }
  for (const name of ['fountain_code_menu.vue', 'fountain_code_menu.stories.js']) {
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
