// Diagnostic, not a release gate: report known auto-scope mismatches explicitly.
// Pure-Node import/transforms; real engines resolve/render direction, never jsdom.
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from '@playwright/test';
import { createEditor, composeExtensions, StarterKit, HTMLContainerExtension,
  Schema, Selection, HTMLExporter, toggleList, outdentListItem, undo, createHistoryPlugin } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';

const output = new URL('./auto-scope-boundary-20261008/', import.meta.url);
await mkdir(output, { recursive: true });
const ordinary = composeExtensions(StarterKit.extensions);
const sectionKit = composeExtensions([...StarterKit.extensions, HTMLContainerExtension]);
const listSource = '<ul dir="auto"><li><p>שלום — Source anchor</p></li><li><p>English selected paragraph</p></li><li><p>English trailing paragraph</p></li></ul>';
const cases = [
  { name: 'middle-conversion', kit: ordinary, source: listSource, path: [0, 1, 0, 0], command: editor => toggleList(editor, 'ordered'), expectation: 'Known split-scope gap: format-only middle conversion separates one automatic list into independent automatic lists.' },
  { name: 'middle-lift', kit: ordinary, source: listSource, path: [0, 1, 0, 0], command: outdentListItem, expectation: 'Known removed/split-scope gap: selected English text leaves the automatic list; the tail gets its own automatic context.' },
  { name: 'whole-conversion', kit: ordinary, source: listSource, range: [[0, 0, 0, 0], [0, 2, 0, 0]], command: editor => toggleList(editor, 'ordered'), expectation: 'Supported control: converting every item keeps one automatic container.' },
  { name: 'retained-section', kit: sectionKit, source: '<section dir="auto"><h2>שלום — Source anchor</h2><ul><li><p>English first paragraph</p></li><li><p>English selected paragraph</p></li><li><p>English trailing paragraph</p></li></ul></section>', path: [0, 1, 1, 0, 0], command: editor => toggleList(editor, 'ordered'), expectation: 'Supported control: splitting an unowned-direction list inside one retained automatic section keeps the shared section context.' },
];
const documents = [];
for (const fixture of cases) {
  const parsed = ServerHTMLImporter.parseWithReport(fixture.source, new Schema(fixture.kit.schema));
  if (parsed.issues.length) throw new Error(`${fixture.name}: unexpected import loss`);
  const editor = createEditor({ schema: fixture.kit.schema, content: parsed.document.toJSON(), plugins: [createHistoryPlugin()] });
  const selection = fixture.range ? Selection.range(fixture.range[0], 0, fixture.range[1], 5) : Selection.cursor(fixture.path, 2);
  editor.dispatch(editor.createTransaction().setSelection(selection));
  const original = editor.getJSON();
  const accepted = fixture.command(editor);
  if (!accepted) throw new Error(`${fixture.name}: transform refused`);
  const transformed = editor.getJSON();
  const html = HTMLExporter.export(editor.state.doc, { document: false });
  if (!undo(editor) || JSON.stringify(editor.getJSON()) !== JSON.stringify(original)) throw new Error(`${fixture.name}: exact undo failed`);
  documents.push({ name: fixture.name, expectation: fixture.expectation, source: fixture.source, html, original, transformed, exactUndo: true });
  editor.destroy();
}
const observations = [];
const hashes = [];
for (const [engine, browserType] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await browserType.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
    for (const fixture of documents) {
      const result = { engine, name: fixture.name, expectation: fixture.expectation, exactUndo: fixture.exactUndo };
      for (const [stage, html] of [['source', fixture.source], ['transformed', fixture.html]]) {
        await page.setContent(`<style>body{font:18px/1.5 sans-serif;padding:30px}h1{font-size:24px}main{border:1px solid #bbb;padding:20px}p{margin:20px 0}</style><h1>${engine}: ${fixture.name} — ${stage}</h1><main>${html}</main>`);
        result[stage] = await page.locator('main p').evaluateAll(elements => elements.map(element => ({ text: element.textContent, direction: getComputedStyle(element).direction, align: getComputedStyle(element).textAlign, ownDir: element.getAttribute('dir') })));
        const name = `${engine}-${fixture.name}-${stage}.png`;
        const pixels = await page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true });
        hashes.push({ path: `artifacts/auto-scope-boundary-20261008/${name}`, sha256: createHash('sha256').update(pixels).digest('hex') });
      }
      result.directionRetained = result.source.every((before, index) => before.text === result.transformed[index]?.text && before.direction === result.transformed[index]?.direction);
      // A subsequent source-anchor snapshot exposes why freezing computed direction
      // or assigning independent auto children cannot model the shared context.
      for (const [stage, html] of [['source', fixture.source], ['transformed', fixture.html]]) {
        await page.setContent(`<main>${html.replace('שלום — Source anchor', 'English — Source anchor')}</main>`);
        result[`${stage}AfterAnchorEdit`] = await page.locator('main p').evaluateAll(elements => elements.map(element => ({ text: element.textContent, direction: getComputedStyle(element).direction })));
      }
      observations.push(result);
    }
  } finally { await browser.close(); }
}
const report = { date: '2026-10-08', kind: 'native-rendered diagnostic; not a passing retention gate', headlessCore: typeof globalThis.document === 'undefined', specification: 'https://html.spec.whatwg.org/multipage/dom.html#the-dir-attribute', documents, observations, captureHashes: hashes, screenshotsReviewed: false };
await writeFile(new URL('observations.json', output), JSON.stringify(report, null, 2));
for (const result of observations) console.log(`${result.engine} ${result.name}: direction retention ${result.directionRetained ? 'SUPPORTED CONTROL' : 'KNOWN GAP'}; exact undo ${result.exactUndo}`);
