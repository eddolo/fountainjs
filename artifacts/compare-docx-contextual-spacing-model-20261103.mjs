import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { unzipSync } from 'fflate';
import * as current from '../dist/index.js';
import * as word from '../dist/docx.js';
import * as previous from './list-layout-tarball-consumer-20261103/node_modules/fountainjs-editor/dist/index.js';
import * as previousWord from './list-layout-tarball-consumer-20261103/node_modules/fountainjs-editor/dist/docx.js';
import { PagesExtension } from '../dist/pages.js';
import { PagesExtension as previousPages } from './list-layout-tarball-consumer-20261103/node_modules/fountainjs-editor/dist/pages.js';

const source = readFileSync('tests/fixtures/native-docx/cooling-report.docx');
assert.equal(typeof globalThis.document, 'undefined');
const schemaFor = (api, pages) => new api.Schema(api.composeExtensions([
  ...api.StarterKit.extensions, pages, api.createMathExtension(),
]).schema);
const before = previousWord.importDOCX(source, schemaFor(previous, previousPages));
const after = word.importDOCX(source, schemaFor(current, PagesExtension));
assert.deepEqual(after.document.toJSON(), before.document.toJSON());
const counts = {};
after.document.descendants(node => { counts[node.type.name] = (counts[node.type.name] ?? 0) + 1; });
for (const [name, count] of Object.entries({ image_super: 2, inline_image: 1, math_block: 2,
  page_header: 1, page_footer: 1, page_field: 1, footnote_definition: 1, table: 1, list_item: 3 })) {
  assert.equal(counts[name], count, name);
}
// Use the real lab's unchanged optional host math adapter in both exports.
// External MathJax stays in this development-only process, outside the package.
const built = await build({ configFile: false, publicDir: false, logLevel: 'error',
  build: { write: false, target: 'node24', minify: false,
    lib: { entry: resolve('examples/react-app/src/mathjax-docx.ts'), formats: ['es'] },
    rollupOptions: { external: name => name.startsWith('@mathjax/'), output: { codeSplitting: false } },
  },
});
const chunks = (Array.isArray(built) ? built : [built]).flatMap(item => item.output).filter(item => item.type === 'chunk');
assert.equal(chunks.length, 1);
const adapter = resolve('artifacts/docx-contextual-spacing-math-adapter-20261103.mjs');
writeFileSync(adapter, chunks[0].code);
const { compileTeXForDOCX } = await import(pathToFileURL(adapter).href);
const exportOptions = { resolveMath: node => compileTeXForDOCX(String(node.attrs.latex), node.type.name === 'math_block') };
// Supply the same clock input to both implementations, rather than stripping
// timestamps from generated XML or relaxing any byte-comparison expectation.
const clock = '2026-11-03T23:00:00.000Z';
const SystemDate = globalThis.Date;
let oldBytes, newBytes;
try {
  globalThis.Date = class extends SystemDate {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return SystemDate.parse(clock); }
  };
  oldBytes = previousWord.exportDOCX(before.document, exportOptions).bytes;
  newBytes = word.exportDOCX(after.document, exportOptions).bytes;
} finally { globalThis.Date = SystemDate; }
assert.deepEqual(newBytes, oldBytes);
const oldParts = unzipSync(oldBytes);
const newParts = unzipSync(newBytes);
assert.deepEqual(Object.keys(newParts).sort(), Object.keys(oldParts).sort());
for (const name of Object.keys(oldParts)) assert.deepEqual(newParts[name], oldParts[name], name);
const sha256 = data => createHash('sha256').update(data).digest('hex');
const normalizeLines = value => Buffer.from(value.toString('utf8').replace(/\r\n/g, '\n'));
const hostMathSource = readFileSync('examples/react-app/src/mathjax-docx.ts');
const previousHostMath = execFileSync('git', ['show', 'd8e6f3d:examples/react-app/src/mathjax-docx.ts']);
assert.deepEqual(normalizeLines(hostMathSource), normalizeLines(previousHostMath));
assert.equal(typeof globalThis.document, 'undefined');
const findings = after.report.issues.filter(issue => issue.code === 'paragraph-contextual-spacing-not-imported');
assert.deepEqual(findings.map(issue => issue.path), [[0], [5], [6], [7]]);
const report = { baselineCommit: 'd8e6f3d93082afa49b3905fdf09fb3c073cf97ac',
  baselineTarballSHA256: sha256(readFileSync('artifacts/list-layout-tarball-consumer-20261103/fountainjs-editor-0.4.0-beta.2.tgz')),
  sourceSHA256: sha256(source), clockInput: clock, completeModelEquality: true,
  completeNativeArchiveEqual: true, allNativePartsEqual: true,
  profile: 'StarterKit + Pages + Math, with the unchanged real lab MathJax adapter',
  nativeParts: Object.keys(newParts).length, representedNodeCounts: counts,
  unchangedHostMathAdapterSHA256: sha256(previousHostMath),
  findings, contextualLayoutFixed: false,
};
writeFileSync('artifacts/docx-contextual-spacing-model-comparison-20261103.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Complete imported JSON and all ${report.nativeParts} native export parts equal the retained pre-change tarball; four precise spacing-loss findings added.`);
