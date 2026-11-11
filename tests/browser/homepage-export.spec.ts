import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test.use({ video: 'on', trace: 'on' });
test.setTimeout(60_000);

for (const format of ['markdown', 'html', 'json'] as const) test(`avoids full homepage exports during selection while keeping ${format} live`, async ({ page }, info) => {
  const modules: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (/(?:\/deps\/fountainjs-editor|\/dist\/index)\.js(?:\?|$)/.test(response.url()) && !response.url().includes('/node_modules/.pnpm/')) modules.push(response.url());
  });
  await page.goto('./');
  const editor = page.getByRole('textbox', { name: 'Rich text editor', exact: true });
  await expect(editor).toBeVisible();
  expect(modules.length, 'Instrument the actual module loaded by this host.').toBeGreaterThan(0);
  await page.evaluate(async url => {
    const module = await import(/* @vite-ignore */ url);
    const probe = { exports: [] as Array<{ format: string; durationMs: number }>, inputs: [] as number[] };
    (globalThis as any).homepageExportProbe = probe;
    for (const [kind, exporter] of Object.entries({ markdown: module.MarkdownExporter, html: module.HTMLExporter, json: module.JSONExporter }) as Array<[string, any]>) {
      const original = exporter.export;
      exporter.export = function (...args: unknown[]) {
        const start = performance.now();
        try { return original.apply(this, args); }
        finally { probe.exports.push({ format: kind, durationMs: performance.now() - start }); }
      };
    }
    document.addEventListener('beforeinput', event => {
      if (!(event.target instanceof Element) || event.target.getAttribute('aria-label') !== 'Rich text editor') return;
      const start = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => probe.inputs.push(performance.now() - start)));
    }, true);
  }, modules.at(-1)!);
  const panel = page.locator('.studio__export');
  await panel.getByRole('button', { name: format, exact: true }).click();
  const note = editor.locator(':scope > h1').first();
  const originalNote = (await note.textContent())!;
  await expect(panel.locator('pre')).toContainText(originalNote);
  await note.click(); await page.keyboard.press('End');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const before = await panel.locator('pre').textContent();
  await page.evaluate(() => { (globalThis as any).homepageExportProbe.exports = []; (globalThis as any).homepageExportProbe.inputs = []; });
  const offset = await page.evaluate(() => getSelection()?.anchorOffset);
  for (let index = 0; index < 10; index++) {
    await page.keyboard.press('ArrowLeft');
    if (index === 0) expect(await page.evaluate(() => getSelection()?.anchorOffset)).toBe(offset! - 1);
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.press('Shift+ArrowLeft');
  expect(await page.evaluate(() => getSelection()?.toString())).toBe(originalNote.slice(offset! - 1, offset));
  await page.keyboard.press('Shift+ArrowRight');
  const selection = await page.evaluate(() => (globalThis as any).homepageExportProbe.exports);
  expect(await panel.locator('pre').textContent()).toBe(before);
  await page.evaluate(() => { (globalThis as any).homepageExportProbe.exports = []; });
  await page.keyboard.type('X');
  const editedNote = originalNote.slice(0, offset) + 'X' + originalNote.slice(offset);
  await expect(note).toHaveText(editedNote);
  await expect(panel.locator('pre')).toContainText(editedNote);
  await expect.poll(() => page.evaluate(() => (globalThis as any).homepageExportProbe.inputs.length)).toBeGreaterThan(0);
  const typing = await page.evaluate(() => (globalThis as any).homepageExportProbe);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(note).toHaveText(originalNote);
  await expect.poll(() => panel.locator('pre').textContent()).toBe(before);
  await panel.getByRole('button', { name: format === 'json' ? 'html' : 'json', exact: true }).click();
  await panel.getByRole('button', { name: format, exact: true }).click();
  await expect.poll(() => panel.locator('pre').textContent()).toBe(before);
  await writeFile(info.outputPath('homepage-export-measurement.json'), JSON.stringify({
    engine: info.project.name, format, fixture: 'Unmodified public homepage sample', selection,
    typing, errors, scope: 'Real selection/typing/undo in the source-served homepage. Timings include instrumentation and host rendering; not production or cross-editor performance certification.',
  }, null, 2));
  await panel.screenshot({ path: info.outputPath('live-output-after-undo.png') });
  expect(typing.exports.some((call: { format: string }) => call.format === format), 'Positive control: real edits must hit the instrumented exporter.').toBe(true);
  expect(selection, 'Caret/selection updates must not serialize an unchanged document.').toEqual([]);
  expect(errors).toEqual([]);
});
