import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

if (process.platform !== 'linux') throw new Error('Run in the pinned Linux browser environment.');
const root = new URL('../', import.meta.url);
const install = JSON.parse(await readFile(new URL('artifacts/gitlab-native-browser-install/install.json', root)));
const require = createRequire(resolve(install.source, 'storybook/package.json'));
const directory = resolve(install.source, '../reference-storybook');
const output = new URL('artifacts/gitlab-native-reference-storybook-20261112/', root);
await mkdir(output, { recursive: true });
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const target = resolve(directory, `.${path === '/' ? '/index.html' : path}`);
    if (relative(directory, target).startsWith('..')) { response.writeHead(403).end(); return; }
    response.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream' }).end(await readFile(target));
  } catch { response.writeHead(404).end(); }
});
await new Promise((yes, no) => { server.once('error', no); server.listen(6006, '127.0.0.1', yes); });
const report = { scope: 'Isolated native reference component states with fixed renderer fixtures; separate from actual GitLab product acceptance',
  status: 'running', upstreamRevision: install.revision, nativeRuntimeSHA256: install.nativeRuntime.sha256,
  checks: [], pages: [], sources: {} };
const browser = await chromium.launch();
const context = await browser.newContext({ recordVideo: { dir: fileURLToPath(new URL('recordings/', output)) } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:6006' });
try {
  const states = ['issue', 'title', 'summary', 'merge-request', 'user', 'label', 'read-only', 'failed-resolution', 'conflict', 'pending'];
  for (const [id, width] of [...states.map(id => [id, 1280]), ['issue', 360], ['failed-resolution', 360]]) {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:6006/iframe.html?id=content-editor-fountain-reference-menu--${id}&viewMode=story`);
    const section = page.getByRole('region', { name: 'Reference controls', exact: true });
    const field = section.getByRole('combobox', { name: 'Reference display', exact: true });
    // GitLab's spinner adds its "Loading" announcement to the button name.
    const apply = section.getByRole('button', { name: /Apply reference display/u });
    await expect(section).toBeVisible();
    if (['failed-resolution', 'conflict'].includes(id)) await expect(section.getByRole('alert')).toBeVisible();
    if (id === 'pending') await expect(section.getByRole('status', { name: 'Reference resolution' })).toBeVisible();
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const initial = await page.evaluate(() => window.axe.run(document.body));
    await page.screenshot({ path: fileURLToPath(new URL(`${id}-initial-${width}.png`, output)), fullPage: true, caret: 'initial' });
    expect(initial.violations).toEqual([]);
    if (id === 'issue' || id === 'merge-request') {
      await expect(field).toHaveValue('id'); await field.focus(); await field.selectOption('summary');
      await page.keyboard.press('Tab'); await expect(apply).toBeFocused(); await page.keyboard.press('Enter');
      const reference = page.locator('[data-fountain-root] a[data-fountain-gitlab-reference]');
      await expect(reference).toHaveAttribute('data-original', id === 'issue' ? '#75+s' : '!1+s');
      await expect(reference).toContainText('Unassigned');
      report.checks.push(`${id}/${width}px: keyboard submission applies the selected display while retaining its source suffix`);
    } else if (id === 'title' || id === 'summary') await expect(field).toHaveValue(id);
    else if (id === 'user' || id === 'label') await expect(field).toHaveCount(0);
    else if (id === 'read-only') {
      await expect(field).toBeDisabled(); await expect(apply).toBeDisabled();
      await expect(section.getByRole('button', { name: 'Remove reference' })).toBeDisabled();
    } else if (id === 'failed-resolution') {
      await expect(field).toHaveValue('title'); await expect(section.getByRole('alert')).toContainText('display choice are retained');
      await field.focus(); await page.keyboard.press('Escape');
      await expect(section.getByRole('alert')).toHaveCount(0); await expect(field).toHaveValue('id');
      report.checks.push(`${width}px: failed resolution retains its draft; Escape restores the current reference choice`);
    } else if (id === 'conflict') {
      await expect(field).toHaveValue('title'); await expect(apply).toBeDisabled();
      await section.getByRole('button', { name: 'Cancel reference edit', exact: true }).click();
      await expect(field).toHaveValue('id'); await expect(page.getByText('Changed by another editor', { exact: true }).first()).toBeVisible();
    } else if (id === 'pending') {
      await expect(apply).toBeDisabled(); await page.getByRole('button', { name: 'Type elsewhere', exact: true }).click();
      await expect(section.getByRole('status', { name: 'Reference resolution' })).toBeVisible();
      await section.getByRole('button', { name: 'Cancel reference edit', exact: true }).click();
      await expect(section).toHaveCount(0); await expect(page.getByText('Still typing. Keep writing here.', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Select reference', exact: true }).click(); await expect(field).toHaveValue('id');
      report.checks.push('Pending display ownership survives movement to unrelated text; Cancel releases it without changing the reference');
    }
    await section.getByRole('button', { name: 'Copy reference URL', exact: true }).click();
    const href = await section.getByRole('link', { name: 'Open reference', exact: true }).getAttribute('href');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL(href, 'http://127.0.0.1:6006').href);
    const final = await page.evaluate(() => window.axe.run(document.body));
    await page.screenshot({ path: fileURLToPath(new URL(`${id}-${width}.png`, output)), fullPage: true, caret: 'initial' });
    expect(final.violations).toEqual([]); expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    report.checks.push(`${id}/${width}px: absolute clipboard URL, zero accessibility violations/page errors and no horizontal overflow`);
    const recording = page.video();
    report.pages.push({ id, width, initialViolations: initial.violations, violations: final.violations, errors });
    await page.close(); report.pages.at(-1).recording = relative(fileURLToPath(root), await recording.path()).replaceAll('\\', '/');
  }
  for (const name of ['fountain_reference_menu.vue', 'fountain_reference_menu.stories.js']) {
    const path = `app/assets/javascripts/content_editor/components/${name}`;
    report.sources[path] = createHash('sha256').update(await readFile(resolve(install.source, path))).digest('hex');
  }
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = String(error); process.exitCode = 1; }
finally {
  await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, checks: report.checks.length, pages: report.pages.length, error: report.error }, null, 2));
