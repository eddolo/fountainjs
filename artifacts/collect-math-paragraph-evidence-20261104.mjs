import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { Schema, EditorState, createEditor, StarterKit, composeExtensions, createMathExtension } from '../dist/index.js';
import { PagesExtension } from '../dist/pages.js';
import { importDOCX } from '../dist/docx.js';
const sha = data => createHash('sha256').update(data).digest('hex');
const root = resolve('artifacts/math-paragraph-layout-real-20261104');
const source = await readFile('tests/fixtures/native-docx/cooling-report.docx');
assert.equal(sha(source), '52c8f9038c22f7ab1294690901362ea1f4dc8a2b6691091be5e4096ab6806495');
const kit = composeExtensions([...StarterKit.extensions, PagesExtension, createMathExtension()]);
const imported = importDOCX(source, new Schema(kit.schema)).document;
const editor = createEditor({ schema: kit.schema, state: EditorState.create({ schema: imported.type.schema, doc: imported, plugins: kit.plugins }) });
const expected = editor.state.doc.toJSON();
editor.destroy();
const records = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const saved = JSON.parse(await readFile(resolve(root, engine, 'edited.json'), 'utf8'));
  assert.deepEqual(saved, expected, `${engine}: caption/list editing inverse must retain the COMPLETE source model`);
  const observation = JSON.parse(await readFile(resolve(root, engine, 'observations.json'), 'utf8'));
  assert.equal(observation.captionTypedAndUndone, true);
  assert.equal(observation.mathEditedAndUndone, true);
  assert.deepEqual(observation.mathParagraphLayouts, observation.reopenedMathLayouts);
  const exported = await readFile(resolve(root, engine, 'actual-export.docx'));
  const parts = unzipSync(exported);
  assert.ok(strFromU8(parts['word/document.xml']).includes('<wp:extent cx="5394960" cy="1726387"/>'));
  const previous = JSON.parse(await readFile(`artifacts/image-paragraph-layout-capture-real-20261104/${engine}/edited.json`, 'utf8'));
  const differences = [];
  function diff(a, b, path = '') {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') { differences.push({ path, before: a, after: b }); return; }
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[key], b[key], `${path}/${key}`);
  }
  diff(previous, saved);
  records.push({ engine, completeUndoInverse: true, observation, sourceModelChanges: differences,
    modelSHA256: sha(JSON.stringify(saved)), exportedSHA256: sha(exported),
    nativeParts: Object.fromEntries(Object.entries(parts).map(([name, data]) => [name, sha(data)])) });
}
for (const [name, hash] of Object.entries(records[0].nativeParts)) {
  if (name !== 'docProps/core.xml') assert.ok(records.every(record => record.nativeParts[name] === hash), name);
}
await writeFile(resolve(root, 'evidence.json'), JSON.stringify({ sourceSHA256: sha(source), records }, null, 2) + '\n');
console.log(JSON.stringify(records.map(({ engine, completeUndoInverse, sourceModelChanges }) => ({ engine, completeUndoInverse, sourceModelChanges })), null, 2));
