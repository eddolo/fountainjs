import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import * as current from '../dist/index.js';
import * as word from '../dist/docx.js';
import * as previous from './paragraph-spacing-tarball-consumer-20261104/node_modules/fountainjs-editor/dist/index.js';
import * as previousWord from './paragraph-spacing-tarball-consumer-20261104/node_modules/fountainjs-editor/dist/docx.js';
import { PagesExtension } from '../dist/pages.js';
import { PagesExtension as previousPages } from './paragraph-spacing-tarball-consumer-20261104/node_modules/fountainjs-editor/dist/pages.js';
import { compileTeXForDOCX } from './docx-contextual-spacing-math-adapter-20261103.mjs';

const source = readFileSync('tests/fixtures/native-docx/cooling-report.docx');
const sha256 = value => createHash('sha256').update(value).digest('hex');
assert.equal(sha256(source), '52c8f9038c22f7ab1294690901362ea1f4dc8a2b6691091be5e4096ab6806495');
const schemaFor = (api, pages) => new api.Schema(api.composeExtensions([
  ...api.StarterKit.extensions, pages, api.createMathExtension(),
]).schema);
const before = previousWord.importDOCX(source, schemaFor(previous, previousPages));
const after = word.importDOCX(source, schemaFor(current, PagesExtension));
const expected = structuredClone(before.document.toJSON());
const additions = [];
for (const [path, group] of [[[0], 'word:style:Title'], [[5, 0, 0], 'word:style:ListNumber'],
  [[5, 1, 0], 'word:style:ListNumber'], [[5, 2, 0], 'word:style:ListNumber']]) {
  let node = expected;
  for (const index of path) node = node.content[index];
  assert.equal(node.attrs.layout.spacingGroup, undefined);
  node.attrs.layout.spacingGroup = group;
  node.attrs.layout.contextualSpacing = true;
  additions.push({ path, spacingGroup: group, contextualSpacing: true });
}
// Assert the entire expected model with its explicit additions; do not remove
// attributes, nodes, assets or source tokens to obtain equality.
assert.deepEqual(after.document.toJSON(), expected);
assert.deepEqual(after.report.issues.filter(issue => issue.code === 'paragraph-contextual-spacing-not-imported'), []);
const counts = {};
after.document.descendants(node => { counts[node.type.name] = (counts[node.type.name] ?? 0) + 1; });
for (const [name, count] of Object.entries({ image_super: 2, inline_image: 1, math_block: 2,
  page_header: 1, page_footer: 1, page_field: 1, footnote_definition: 1, table: 1, list_item: 3 })) assert.equal(counts[name], count, name);
const oldMathSource = execFileSync('git', ['show', 'ec2f4a2:examples/react-app/src/mathjax-docx.ts']);
const normalizeLines = value => value.toString('utf8').replace(/\r\n/g, '\n');
assert.equal(normalizeLines(readFileSync('examples/react-app/src/mathjax-docx.ts')), normalizeLines(oldMathSource));
const options = { resolveMath: node => compileTeXForDOCX(String(node.attrs.latex), node.type.name === 'math_block') };
const SystemDate = globalThis.Date;
const clock = '2026-11-04T01:00:00.000Z';
let oldExport, newExport;
try {
  globalThis.Date = class extends SystemDate {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return SystemDate.parse(clock); }
  };
  oldExport = previousWord.exportDOCX(before.document, options);
  newExport = word.exportDOCX(after.document, options);
} finally { globalThis.Date = SystemDate; }
assert.deepEqual(newExport.bytes, oldExport.bytes);
const oldParts = unzipSync(oldExport.bytes), newParts = unzipSync(newExport.bytes);
assert.deepEqual(Object.keys(newParts).sort(), Object.keys(oldParts).sort());
for (const path of Object.keys(oldParts)) assert.deepEqual(newParts[path], oldParts[path], path);
const gaps = [current.paragraphSpacingAt(after.document, [5, 1, 0]).spacingBefore,
  current.paragraphSpacingAt(after.document, [5, 2, 0]).spacingBefore];
assert.deepEqual(gaps, [0, 0]);
const exportLoss = newExport.report.issues.filter(issue => issue.code === 'paragraph-contextual-spacing-not-exported');
assert.deepEqual(exportLoss.map(issue => issue.path), additions.map(item => item.path));
assert.equal(typeof globalThis.document, 'undefined');
const report = {
  baselineCommit: 'ec2f4a2b6a52907e2af56fead11a7574cfc46617',
  baselineTarballSHA256: sha256(readFileSync('artifacts/paragraph-spacing-tarball-consumer-20261104/fountainjs-editor-0.4.0-beta.2.tgz')),
  sourceSHA256: sha256(source), completeExpectedModelEqual: true, explicitModelAdditions: additions,
  originalListSpacingAfterPt: 7, derivedListGapsPt: gaps,
  profile: 'StarterKit + Pages + Math, unchanged real lab MathJax adapter', representedNodeCounts: counts,
  unchangedMathHostSourceSHA256: sha256(oldMathSource), unchangedMathAdapterSHA256: sha256(readFileSync('artifacts/docx-contextual-spacing-math-adapter-20261103.mjs')),
  clockInput: clock, nativeExport: { completeArchiveEqualToBaseline: true, allPartsEqual: true, parts: Object.keys(newParts).length,
    sha256: sha256(newExport.bytes), remainingRuleLoss: exportLoss, nativeSpacingFixed: false },
};
writeFileSync('artifacts/docx-spacing-identity-full-comparison-20261104.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Complete model has exactly four explicit spacing-rule additions; derived list gaps 0/0 pt; all ${report.nativeExport.parts} native export parts and ZIP remain identical, with four explicit export losses.`);
