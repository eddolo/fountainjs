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
const directory = resolve(installed.source, '../context-storybook');
const output = new URL('artifacts/gitlab-native-context-storybook-20261113/', root);
await mkdir(output, { recursive: true });
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.webm': 'video/webm' };
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const fixture = path.match(/^\/-\/project\/1\/uploads\/media-fixture\/figure\.(png|wav|webm)$/u)?.[1];
    if (fixture) {
      const name = fixture === 'png' ? 'fountain-figure.png' : `fountain-recording.${fixture}`;
      response.writeHead(200, { 'Content-Type': types[`.${fixture}`] }).end(await readFile(new URL(`artifacts/gitlab-media-test-assets/${name}`, root))); return;
    }
    const target = resolve(directory, `.${path === '/' ? '/index.html' : path}`);
    if (relative(directory, target).startsWith('..')) { response.writeHead(403).end(); return; }
    response.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream' }).end(await readFile(target));
  } catch { response.writeHead(404).end(); }
});
await new Promise((yes, no) => { server.once('error', no); server.listen(6006, '127.0.0.1', yes); });
const report = { scope: 'Actual native component stories with fixed renderer fixtures and real local media; separate from real GitLab persistence acceptance',
  upstreamRevision: installed.revision, nativeRuntimeSHA256: installed.nativeRuntime.sha256,
  status: 'running', pages: [], sources: {} };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: fileURLToPath(new URL('recordings/', output)) } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:6006' });
try {
  for (const [kind, id, width] of [
    ['code', 'contextual-editing', 1280], ['code', 'contextual-read-only', 1280], ['code', 'contextual-editing', 360],
    ['media', 'contextual-image', 1280], ['media', 'contextual-read-only', 1280], ['media', 'contextual-audio', 1280],
    ['media', 'contextual-video', 1280], ['media', 'contextual-image', 360],
  ]) {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:6006/iframe.html?id=content-editor-fountain-${kind}-menu--${id}&viewMode=story`);
    const controls = kind === 'code' ? page.getByRole('region', { name: 'Code block controls', exact: true }) : page.getByRole('group', { name: 'Media controls', exact: true });
    const label = kind === 'code' ? 'Code block actions' : 'Media actions';
    await expect(controls).toBeVisible();
    if (width === 360) await expect(page.getByTestId('native-context-surface')).toHaveAttribute('data-menu-mode', 'docked');
    else await expect(page.getByRole('dialog', { name: label, exact: true })).toBeVisible();
    await controls.getByRole('button', { name: kind === 'code' ? 'Copy code' : 'Copy media URL', exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(kind === 'code' ? 'const answer = 42;\nconsole.log(answer);' : `/uploads/media-fixture/figure.${id === 'contextual-audio' ? 'wav' : id === 'contextual-video' ? 'webm' : 'png'}`);
    if (id === 'contextual-read-only') {
      await expect(controls.getByRole('button', { name: kind === 'code' ? 'Apply language' : 'Delete media', exact: true })).toBeDisabled();
    } else if (kind === 'code') {
      const input = controls.getByRole('combobox', { name: 'Code language', exact: true });
      await input.fill('rust'); await input.press('Enter'); await expect(input).toHaveValue('rust');
      await input.fill('go'); await input.press('Escape'); await expect(input).toHaveValue('rust');
      const editor = page.getByRole('textbox', { name: 'Code example document', exact: true });
      expect(await editor.evaluate(element => element.contains(document.activeElement))).toBe(true);
      if (width > 360) { await page.keyboard.press('Alt+F10'); await expect(input).toBeFocused(); }
    } else {
      if (id === 'contextual-audio' || id === 'contextual-video') {
        const media = page.locator(`[data-fountain-root] ${id === 'contextual-audio' ? 'audio' : 'video'}`);
        await expect.poll(() => media.evaluate(node => node.readyState)).toBeGreaterThanOrEqual(2);
      }
      await controls.getByRole('button', { name: 'Edit media properties', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Media properties', exact: true });
      await expect(dialog).toHaveCSS('opacity', '1');
      await expect(page.locator('[role="dialog"][aria-label="Media actions"]')).toBeHidden();
      const preview = dialog.locator('audio, video');
      if (await preview.count()) {
        await expect.poll(() => preview.evaluate(node => node.readyState)).toBeGreaterThanOrEqual(2);
        const video = await preview.evaluate(node => node.tagName === 'VIDEO');
        const box = await preview.boundingBox();
        const position = { x: 24, y: video ? box.height - 48 : 27 };
        await preview.click({ position });
        await expect.poll(() => preview.evaluate(node => node.currentTime)).toBeGreaterThan(0.1);
        if (video) await expect.poll(() => preview.evaluate(node => node.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(0);
        await preview.click({ position });
        await expect.poll(() => preview.evaluate(node => node.paused)).toBe(true);
      }
      await dialog.getByRole('textbox', { name: 'Media description', exact: true }).fill('Contextual component review');
    }
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const result = await page.evaluate(() => window.axe.run(document.body));
    await page.screenshot({ path: fileURLToPath(new URL(`${kind}-${id}-${width}.png`, output)), fullPage: true, animations: 'disabled', caret: 'initial' });
    report.pages.push({ kind, id, width, violations: result.violations, errors });
    expect(errors).toEqual([]); expect(result.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.close();
  }
  for (const name of ['fountain_context_surface.vue', 'fountain_code_menu.vue', 'fountain_media_menu.vue', 'fountain_code_menu.stories.js', 'fountain_media_menu.stories.js']) {
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
console.log(JSON.stringify({ status: report.status, pages: report.pages.map(({ kind, id, width, violations }) => ({ kind, id, width, violations: violations.map(value => value.id) })), error: report.error }, null, 2));
