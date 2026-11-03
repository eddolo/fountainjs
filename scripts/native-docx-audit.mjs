import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Schema, StarterKit, composeExtensions, createMathExtension } from '../dist/index.js';
import { PagesExtension } from '../dist/pages.js';
import { importDOCX } from '../dist/docx.js';

// Development-only evidence collector. No DOM, fake browser, renderer or font
// substitution participates in the Fountain import/reopen checks below.
const schema = new Schema(composeExtensions([...StarterKit.extensions, PagesExtension, createMathExtension()]).schema);
const fixture = resolve('tests/fixtures/native-docx/cooling-report.docx');
const provenance = JSON.parse(await readFile('tests/fixtures/native-docx/provenance.json', 'utf8'));
const output = resolve(process.argv[3] ?? 'artifacts/docx-native-audit');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const saveJSON = (name, value) => writeFile(resolve(output, name), JSON.stringify(value, null, 2) + '\n');

function inspectDocument(document) {
  assert.equal(document.child(0).attrs.layout?.fontFamily, 'Calibri', 'Declared en-US theme font changed.');
  assert.equal(document.child(0).child(0).marks.find(mark => mark.type.name === 'font_family')?.attrs.family, 'Calibri');
  const counts = {}, images = [];
  document.descendants(node => {
    counts[node.type.name] = (counts[node.type.name] ?? 0) + 1;
    if (['image', 'image_super', 'inline_image'].includes(node.type.name)) {
      assert.match(String(node.attrs.src), /^data:image\/(?:png|jpeg|gif|webp);base64,/u);
      images.push(digest(Buffer.from(String(node.attrs.src).split(',')[1], 'base64')));
    }
  });
  assert.equal((counts.inline_math ?? 0) + (counts.math_block ?? 0), provenance.expected.nativeEquations);
  assert.equal(counts.table, provenance.expected.tables);
  assert.equal(counts.footnote_definition, provenance.expected.footnotes);
  assert.equal(counts.page_break, provenance.expected.explicitPageBreaks);
  assert.equal(images.length, provenance.expected.bodyImages + provenance.expected.headerImages);
  assert.deepEqual([...new Set(images)].sort(), [...provenance.assetSHA256].sort());
  const text = document.textContent.replace(/\s+/gu, ' ');
  for (const marker of provenance.requiredText) assert.ok(text.includes(marker), `Missing document content: ${marker}`);
  return { counts, imageSHA256: images, pageSettings: document.attrs.pageSettings };
}

const source = new Uint8Array(await readFile(fixture));
assert.equal(digest(source), provenance.sha256, 'The independent source fixture changed.');
const imported = importDOCX(source, schema);
const initial = inspectDocument(imported.document);
if (process.argv[2] === 'prepare') {
  // Refuse to overwrite a previous audit or mix it with stale render output.
  await mkdir(output, { recursive: false });
  await copyFile(fixture, resolve(output, 'source.docx'));
  await saveJSON('source-model.json', imported.document.toJSON());
  await saveJSON('source-report.json', { provenance, initial, importReport: imported.report });
  console.log(`Prepared independent source with ${initial.imageSHA256.length} byte-preserved images and two editable equations.`);
} else if (process.argv[2] === 'inspect') {
  const observation = JSON.parse(await readFile(resolve(output, 'browser-observations.json'), 'utf8'));
  assert.equal(observation.actualDownload, true); assert.equal(observation.typingUndoRedo, true);
  const exported = new Uint8Array(await readFile(resolve(output, 'exported.docx')));
  const reopened = importDOCX(exported, schema);
  const result = inspectDocument(reopened.document);
  assert.ok(reopened.document.textContent.includes('END OF REPORT Checked in Fountain.'));
  await saveJSON('reopened-model.json', reopened.document.toJSON());
  await saveJSON('interchange-report.json', {
    sourceSHA256: digest(source), exportedSHA256: digest(exported), initial, reopened: result,
    reopenReport: reopened.report, browser: observation,
    nativeRendering: 'separate step; structural checks alone are not native or pixel-fidelity certification',
  });
  console.log('Actual browser download retains the edited prose, images, equations, table, footnote and manual page break.');
} else throw Error('Use native-docx-audit.mjs prepare|inspect [new-output-directory].');
