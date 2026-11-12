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
const directory = resolve(installed.source, '../media-storybook');
const filesProfile = process.argv.includes('--media-files');
const output = new URL(`artifacts/gitlab-native-${filesProfile ? 'media-files' : 'media'}-storybook-20261112/`, root);
await mkdir(output, { recursive: true });
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.webm': 'video/webm' };
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const match = path.match(/^\/-\/project\/1\/uploads\/media-fixture\/(figure|replacement)\.(png|wav|webm)$/u);
    const fixture = match?.[2];
    if (fixture) {
      const name = fixture === 'png' ? `fountain-figure${match[1] === 'replacement' ? '-replacement' : ''}.png` : `fountain-recording.${fixture}`;
      response.writeHead(200, { 'Content-Type': types[`.${fixture}`] }).end(await readFile(new URL(`artifacts/gitlab-media-test-assets/${name}`, root))); return;
    }
    const target = resolve(directory, `.${path === '/' ? '/index.html' : path}`);
    if (relative(directory, target).startsWith('..')) { response.writeHead(403).end(); return; }
    response.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream' }).end(await readFile(target));
  } catch { response.writeHead(404).end(); }
});
await new Promise((yes, no) => { server.once('error', no); server.listen(6006, '127.0.0.1', yes); });
const report = { scope: 'Isolated component states with fixed renderer/upload fixtures and real local media files; separate from actual GitLab upload/persistence acceptance',
  upstreamRevision: installed.revision, nativeRuntimeSHA256: installed.nativeRuntime.sha256,
  status: 'running', checks: [], pages: [], sources: {} };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: fileURLToPath(new URL('recordings/', output)) } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:6006' });
try {
  const states = [['image', 1280], ['properties', 1280], ['audio', 1280], ['video', 1280], ['read-only', 1280], ['invalid-size', 1280], ['failed-url', 1280], ['conflict', 1280], ['properties', 360],
    ...(filesProfile ? [['replacement', 1280], ['audio-properties', 1280], ['replacement', 360]] : [])];
  for (const [id, width] of states) {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:6006/iframe.html?id=content-editor-fountain-media-menu--${id}&viewMode=story`);
    const edit = page.getByRole('button', { name: 'Edit media properties', exact: true }); await expect(edit).toBeVisible();
    if (id === 'read-only') {
      await expect(edit).toBeDisabled(); await expect(page.getByRole('button', { name: 'Delete media' })).toBeDisabled();
      await page.getByRole('button', { name: 'Copy media URL' }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('/uploads/media-fixture/figure.png');
      report.checks.push('Read-only properties/deletion stay disabled while actual clipboard URL copy remains available');
    } else if (id === 'replacement') {
      const image = page.locator('[data-fountain-root] img');
      const beforeHref = await image.evaluate(node => node.closest('a')?.getAttribute('href'));
      const picked = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Replace media file', exact: true }).click();
      const picker = await picked;
      await page.getByText('Keep writing here.', { exact: true }).click();
      await picker.setFiles(fileURLToPath(new URL('artifacts/gitlab-media-test-assets/fountain-figure-replacement.png', root)));
      await expect(image).toHaveAttribute('src', '/-/project/1/uploads/media-fixture/replacement.png');
      await expect(image).toHaveAttribute('alt', 'Selected image'); await expect(image).toHaveAttribute('title', 'Authored title');
      await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBe(320);
      expect((await image.boundingBox()).width).toBe(240);
      expect(await image.evaluate(node => node.closest('a')?.getAttribute('href'))).toBe(beforeHref);
      await expect(page.getByText('Keep writing here.', { exact: true })).toBeVisible();
      report.checks.push(`${width}px: real picker selection survives a move to unrelated text and replaces the captured image with link, title, description and width retained`);
    } else if (id === 'audio-properties') {
      const dialog = page.getByRole('dialog', { name: 'Media properties', exact: true });
      await expect(dialog).toBeVisible(); await expect(dialog).toHaveCSS('opacity', '1');
      await expect(page.locator('.modal:visible')).toHaveCSS('opacity', '1');
      await page.locator('.modal:visible').evaluate(async node => {
        await Promise.all(node.getAnimations({ subtree: true }).filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
      });
      await expect(dialog.getByRole('status')).toContainText('reader uses its standard player size');
      await page.screenshot({ path: fileURLToPath(new URL(`audio-properties-open-${width}.png`, output)), fullPage: true });
      report.audioModalPresentation = await dialog.evaluate(node => {
        const result = [];
        for (let current = node; current; current = current.parentElement) {
          const style = getComputedStyle(current);
          result.push({ tag: current.tagName, class: current.className, opacity: style.opacity, color: style.color, filter: style.filter });
        }
        return result;
      });
      await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
      const openResult = await page.evaluate(() => window.axe.run(document.body));
      expect(openResult.violations).toEqual([]);
      report.checks.push('Open audio properties and its reader-size notice have no accessibility violations');
      await dialog.getByRole('textbox', { name: 'Media width', exact: true }).fill('240');
      await dialog.getByRole('textbox', { name: 'Media width', exact: true }).press('Enter');
      await expect(page.locator('.modal:visible')).toHaveCount(0);
      expect((await page.locator('[data-fountain-root] audio').boundingBox()).width).toBe(240);
      report.checks.push('Audio size controls disclose the GitLab-reader boundary while retaining the requested editor width');
    } else if (['audio', 'video'].includes(id)) {
      const media = page.locator(`[data-fountain-root] ${id}`);
      await expect(media).toBeVisible();
      expect((await media.boundingBox()).width).toBeGreaterThan(0);
      expect((await media.boundingBox()).height).toBeGreaterThan(0);
      await expect.poll(() => media.evaluate(node => node.readyState)).toBeGreaterThanOrEqual(1);
      await page.getByRole('button', { name: id === 'audio' ? 'Select audio' : 'Select video', exact: true }).focus();
      await page.keyboard.press('Enter'); await expect(edit).toBeEnabled();
      report.checks.push(`${id}: real media metadata loads and the keyboard selection button exposes its properties`);
    } else if (['properties', 'invalid-size', 'failed-url', 'conflict'].includes(id)) {
      const dialog = page.getByRole('dialog', { name: 'Media properties', exact: true });
      await expect(dialog).toBeVisible(); await expect(dialog).toHaveCSS('opacity', '1');
      await expect(page.locator('.modal:visible')).toHaveCSS('opacity', '1');
      if (id === 'properties') {
        await expect(dialog.getByRole('textbox', { name: 'Media URL', exact: true })).toHaveValue('/uploads/media-fixture/figure.png');
        await expect(dialog.getByRole('img', { name: 'Selected image' })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: fileURLToPath(new URL(`properties-open-${width}.png`, output)), fullPage: true });
        await dialog.getByRole('textbox', { name: 'Media width', exact: true }).fill('240');
        await dialog.getByRole('textbox', { name: 'Media width', exact: true }).press('Enter');
        await expect(dialog).toHaveCount(0);
        expect((await page.locator('[data-fountain-root] img').boundingBox()).width).toBe(240);
        report.checks.push(`${width}px: keyboard form submission updates the native image width and closes the properties dialog`);
      } else {
        await expect(dialog.getByRole('alert')).toBeVisible();
        if (id === 'invalid-size') await expect(dialog.getByRole('textbox', { name: 'Media width' })).toHaveValue('two em');
        if (id === 'failed-url') await expect(dialog.getByRole('textbox', { name: 'Media URL' })).toHaveValue('/replacement.png');
        if (id === 'conflict') await expect(dialog.getByRole('textbox', { name: 'Media description' })).toHaveValue('Retained draft');
      }
    }
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const result = await page.evaluate(() => window.axe.run(document.body));
    await page.screenshot({ path: fileURLToPath(new URL(`${id}-${width}.png`, output)), fullPage: true, caret: 'initial' });
    const recording = page.video();
    report.pages.push({ id, width, violations: result.violations, errors });
    expect(errors).toEqual([]); expect(result.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    report.checks.push(`${id}/${width}px: no accessibility violations, page errors or horizontal overflow`);
    await page.close(); report.pages.at(-1).recording = relative(fileURLToPath(root), await recording.path()).replaceAll('\\', '/');
  }
  for (const name of ['fountain_media_menu.vue', 'fountain_media_menu.stories.js']) {
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
