// A diagnostic, not a release gate. Browser-computed directions are evidence,
// not model state or a proposed substitute for retained automatic semantics.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from '@playwright/test';
import { createEditor, CoreSchemaSpec, Schema, Selection, HTMLExporter,
  indentListItem, outdentListItem, createHistoryPlugin, undo } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';

const output = new URL('./nested-auto-boundary-20261008/', import.meta.url);
await mkdir(output, { recursive: true });
const nestedSource = dir => `<ul dir="ltr"><li><p>Outer parent</p><ol dir="${dir}" start="0"><li><p>שלום anchor</p></li><li><p>English selected</p></li><li><p>English tail</p></li></ol></li><li><p>Outer after</p></li></ul>`;
const indentSource = fixed => `<ol dir="auto" start="0"><li><p>שלום anchor</p></li><li${fixed ? ' dir="ltr"' : ''}><p>Parent paragraph</p></li><li><p>English selected</p></li><li><p>English tail</p></li></ol>`;
const fixtures = [
  { name: 'nested-lift-auto', source: nestedSource('auto'), path: [0, 0, 1, 1, 0, 0], command: outdentListItem },
  { name: 'nested-lift-fixed-control', source: nestedSource('rtl'), path: [0, 0, 1, 1, 0, 0], command: outdentListItem },
  { name: 'indent-under-fixed-item', source: indentSource(true), path: [0, 2, 0, 0], command: indentListItem },
  { name: 'indent-same-context-control', source: indentSource(false), path: [0, 2, 0, 0], command: indentListItem },
];
const documents = fixtures.map(fixture => {
  const schema = new Schema(CoreSchemaSpec);
  const imported = ServerHTMLImporter.parseWithReport(fixture.source, schema);
  if (imported.issues.length) throw new Error(`${fixture.name}: unexpected import loss`);
  const editor = createEditor({ schema: CoreSchemaSpec, content: imported.document.toJSON(), plugins: [createHistoryPlugin()] });
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor(fixture.path, 3)));
    const original = editor.getJSON();
    if (!fixture.command(editor)) throw new Error(`${fixture.name}: command refused`);
    const transformed = editor.getJSON();
    const html = HTMLExporter.export(editor.state.doc, { document: false });
    if (!undo(editor) || JSON.stringify(editor.getJSON()) !== JSON.stringify(original)) throw new Error(`${fixture.name}: exact undo failed`);
    return { name: fixture.name, source: fixture.source, html, original, transformed, exactUndo: true };
  } finally { editor.destroy(); }
});
const observations = [];
for (const [engine, browserType] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await browserType.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 850, height: 650 } });
    for (const fixture of documents) {
      const observed = { engine, name: fixture.name, exactUndo: true };
      for (const [stage, html] of [['source', fixture.source], ['transformed', fixture.html]]) {
        await page.setContent(`<style>body{font:18px/1.5 sans-serif;padding:20px}h1{font-size:22px}main{border:1px solid #aaa;padding:16px}p{margin:16px 0}</style><h1>${engine}: ${fixture.name} — ${stage}</h1><main>${html}</main>`);
        observed[stage] = await page.locator('main p').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, direction: getComputedStyle(node).direction })));
        await page.screenshot({ path: fileURLToPath(new URL(`${engine}-${fixture.name}-${stage}.png`, output)) });
        await page.setContent(`<main>${html.replace('שלום anchor', 'English anchor')}</main>`);
        observed[`${stage}AfterAnchorEdit`] = await page.locator('main p').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, direction: getComputedStyle(node).direction })));
      }
      if (JSON.stringify(observed.source.map(item => item.text)) !== JSON.stringify(observed.transformed.map(item => item.text))) throw new Error(`${fixture.name}: text/order changed`);
      observed.directionRetained = JSON.stringify(observed.source) === JSON.stringify(observed.transformed);
      observed.dynamicAnchorRetained = JSON.stringify(observed.sourceAfterAnchorEdit) === JSON.stringify(observed.transformedAfterAnchorEdit);
      observations.push(observed);
      console.log(`${engine} ${fixture.name}: direction=${observed.directionRetained ? 'retained' : 'KNOWN GAP'}; dynamic anchor=${observed.dynamicAnchorRetained ? 'retained' : 'KNOWN GAP'}; undo=exact`);
    }
  } finally { await browser.close(); }
}
await writeFile(new URL('observations.json', output), JSON.stringify({ date: '2026-10-08', kind: 'pure-Node command plus native rendered diagnostic, not an interactive journey or passing parity gate', documents, observations }, null, 2));
