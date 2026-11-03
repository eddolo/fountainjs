import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const nativeFile = 'artifacts/docx-theme-native-evidence-20261103/exported.docx';
const native = unzipSync(readFileSync(nativeFile));
const results = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const base = `artifacts/docx-theme-size-real-20261103/${engine}/`;
  const current = unzipSync(readFileSync(base + 'exported.docx'));
  assert.deepEqual(Object.keys(current).sort(), Object.keys(native).sort());
  const parts = Object.keys(native).sort().map(path => {
    const identical = sha(native[path]) === sha(current[path]);
    if (path === 'docProps/core.xml') {
      // Compare explicit date elements only; preserve both original files.
      const withoutDates = bytes => strFromU8(bytes).replace(
        /(<dcterms:(created|modified)\b[^>]*>)[^<]*(<\/dcterms:\2>)/gu, '$1[export timestamp]$3');
      assert.equal(withoutDates(current[path]), withoutDates(native[path]));
    } else assert.equal(identical, true, `Changed native-render input: ${engine}/${path}`);
    return { path, nativeSHA256: sha(native[path]), currentSHA256: sha(current[path]), identical };
  });
  const previous = `artifacts/docx-theme-language-real-20261103/${engine}/`;
  const models = ['source-model.json', 'reopened-model.json'].map(name => {
    assert.deepEqual(JSON.parse(readFileSync(base + name)), JSON.parse(readFileSync(previous + name)));
    return { currentPath: base + name, referencePath: previous + name,
      currentSHA256: sha(readFileSync(base + name)), referenceSHA256: sha(readFileSync(previous + name)) };
  });
  const captures = ['editor-top.png', 'editor-reopened.png'].map(name => ({
    path: base + name, SHA256: sha(readFileSync(base + name)),
    identicalToPreviousReviewedCapture: sha(readFileSync(base + name)) === sha(readFileSync(previous + name)),
  }));
  results.push({ engine, exportedPath: base + 'exported.docx', exportedSHA256: sha(readFileSync(base + 'exported.docx')),
    parts, models, captures, sourceAndReopenedModelsUnchanged: true });
}
const report = {
  reference: { path: nativeFile, nativeSourceCommit: '73ad110708c5d2dcb2c7ec4f9a3d06f128a8c7c4', run: 41720509194 },
  results,
  scope: 'Uncompressed native-render inputs match the prior independent render, except export timestamps in core metadata. No source, export, PDF or PNG is modified. This is not a new native-render run or broader layout certification.',
};
writeFileSync('artifacts/docx-theme-size-output-comparison-20261103.json', JSON.stringify(report, null, 2) + '\n');
console.log('Three current browser exports retain every native-render XML/asset part byte-for-byte; core metadata differs only by timestamps. Source/reopened models also match the preceding font audit.');
console.log(JSON.stringify(results.map(({ engine, parts, captures }) => ({ engine, parts: parts.length, captures }))));
