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
    const probe = { exports: [] as Array<{ format: string; durationMs: number }>, inputs: [] as number[], imports: [] as unknown[], batches: [] as unknown[], failures: [] as string[] };
    (globalThis as any).homepageExportProbe = probe;
    (probe as any).command = module.insertDocument.toString().slice(0, 1200);
    for (const [owner, name] of [[module.Schema.prototype, 'validate'], [module.Transaction.prototype, 'replace'], [module.Transaction.prototype, 'setSelection']] as const) {
      const original = owner[name];
      owner[name] = function (...args: unknown[]) {
        try { return original.apply(this, args); }
        catch (error) { probe.failures.push(`${name}: ${String(error)}`); throw error; }
      };
    }
    const parse = module.HTMLImporter.parse;
    module.HTMLImporter.parse = function (...args: unknown[]) {
      try { const doc = parse.apply(this, args); (globalThis as any).pasteFixtureDoc = doc; probe.imports.push({ blocks: doc.childCount }); return doc; }
      catch (error) { probe.imports.push({ error: String(error) }); throw error; }
    };
    const batch = module.Editor.prototype.runCommandBatch;
    module.Editor.prototype.runCommandBatch = function (...args: unknown[]) {
      const selection = this.state.selection;
      const state = this.state, create = state.createTransaction;
      state.createTransaction = function (...createArgs: unknown[]) {
        const transaction = create.apply(this, createArgs);
        for (const name of ['replace', 'setSelection']) {
          const original = transaction[name];
          transaction[name] = function (...txArgs: unknown[]) {
            try { return original.apply(this, txArgs); }
            catch (error) { probe.failures.push(`${name}: ${String(error)}`); throw error; }
          };
        }
        return transaction;
      };
      const result = batch.apply(this, args);
      state.createTransaction = create;
      probe.batches.push({ selection, sameAllClass: selection instanceof module.AllSelection, sameRoot: (globalThis as any).pasteFixtureDoc?.type === this.state.schema.topNodeType, editable: this.editable, result, blocks: this.state.doc.childCount });
      return result;
    };
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
  await editor.locator(':scope > p').first().click(); await page.keyboard.press('ControlOrMeta+a');
  expect(await page.evaluate(() => getSelection()?.toString())).toContain('Try FountainJS');
  const paste = await editor.evaluate(element => {
    const html = '<h1>Engineering report</h1><p>Reviewer note.</p>' + Array.from({ length: 500 }, (_, index) => `<p>Observation ${index}: <strong>verified data</strong> remains in the report.</p>`).join('');
    // Public paste payload loads the fixture; selection and typing below use native keys.
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: (type: string) => type === 'text/html' ? html : '' } });
    element.dispatchEvent(event);
    return { prevented: event.defaultPrevented, selection: getSelection()?.toString(), text: element.textContent?.slice(0, 120) };
  });
  expect(errors, JSON.stringify(paste)).toEqual([]);
  expect(paste.prevented, JSON.stringify(paste)).toBe(true);
  await writeFile(info.outputPath('fixture-delivery.json'), JSON.stringify({ paste, probe: await page.evaluate(() => (globalThis as any).homepageExportProbe), headings: await page.locator('.section-heading p').allTextContents() }, null, 2));
  await expect(page.locator('.section-heading p').filter({ hasText: '502 blocks' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Home');
  const note = editor.locator(':scope > p').first();
  await expect(note).toHaveText('Reviewer note.');
  await expect(panel.locator('pre')).toContainText('Observation 499');
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
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('.');
  await page.keyboard.press('Shift+ArrowRight');
  const selection = await page.evaluate(() => (globalThis as any).homepageExportProbe.exports);
  expect(await panel.locator('pre').textContent()).toBe(before);
  await page.evaluate(() => { (globalThis as any).homepageExportProbe.exports = []; });
  await page.keyboard.type('X');
  await expect(note).toHaveText('Reviewer note.X');
  await expect(panel.locator('pre')).toContainText('Reviewer note.X');
  await expect.poll(() => page.evaluate(() => (globalThis as any).homepageExportProbe.inputs.length)).toBeGreaterThan(0);
  const typing = await page.evaluate(() => (globalThis as any).homepageExportProbe);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(note).toHaveText('Reviewer note.');
  await expect.poll(() => panel.locator('pre').textContent()).toBe(before);
  await panel.getByRole('button', { name: format === 'json' ? 'html' : 'json', exact: true }).click();
  await panel.getByRole('button', { name: format, exact: true }).click();
  await expect.poll(() => panel.locator('pre').textContent()).toBe(before);
  await writeFile(info.outputPath('homepage-export-measurement.json'), JSON.stringify({
    engine: info.project.name, format, documentBlocks: 502, selection,
    typing, errors, scope: 'Real selection/typing/undo in the source-served homepage. Timings include instrumentation and host rendering; not production or cross-editor performance certification.',
  }, null, 2));
  await panel.screenshot({ path: info.outputPath('live-output-after-undo.png') });
  expect(typing.exports.some((call: { format: string }) => call.format === format), 'Positive control: real edits must hit the instrumented exporter.').toBe(true);
  expect(selection, 'Caret/selection updates must not serialize an unchanged document.').toEqual([]);
  expect(errors).toEqual([]);
});
