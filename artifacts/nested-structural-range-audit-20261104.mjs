import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const { createEditor, MarkdownImporter, Schema, Selection, StarterKit, insertText } = await import(
  new URL(process.argv[2] ?? '../dist/index.js', import.meta.url).href);

for (const name of ['window', 'document', 'DOMParser', 'MutationObserver']) assert.equal(name in globalThis, false);
const source = '> Left\n>\n> ![Figure](/figure.png)\n>\n> Right\n\nAfter.\n';
const schema = new Schema(StarterKit.schema);
const doc = MarkdownImporter.parse(source, schema);
const editor = createEditor({ schema: StarterKit.schema, content: doc.toJSON() });
const before = editor.state.doc.toJSON();
editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0, 0], 2, [0, 2, 0], 3)));
const applied = insertText(editor, 'X');
const quote = editor.state.doc.child(0);
const images = quote.content.filter(node => node.type.name === 'image_super' || node.type.name === 'image').length;
writeFileSync(process.argv[3] ?? 'artifacts/nested-structural-range-audit-20261104.json', JSON.stringify({
  noFakeDOM: true, source, before, applied, after: editor.state.doc.toJSON(),
  quoteChildCount: quote.childCount, remainingSelectedImages: images,
  requiredBehavior: 'Replace the selected range with one quote paragraph LeXht, remove the fully selected image, and preserve After.'
}, null, 2) + '\n');
editor.destroy();
assert.equal(applied, true);
assert.equal(images, 0, 'A fully selected nested image must be removed by text replacement.');
assert.equal(quote.childCount, 1);
assert.equal(quote.child(0).textContent, 'LeXht');
