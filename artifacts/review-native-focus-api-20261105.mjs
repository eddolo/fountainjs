import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const base = '8a9c51f650317b8598356badaa452faec6568ec7';
const baseline = JSON.parse(execFileSync('git', ['show', `${base}:api-surface.json`], { encoding: 'utf8' }));
const hash = text => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
const reviewed = ['dist/view/selection-handler.d.ts', 'dist/view/selection-handler.d.cts'];
const changes = [];
for (const [file, previous] of Object.entries(baseline.files)) {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  if (!reviewed.includes(file)) { assert.equal(hash(text), previous, file); continue; }
  assert.equal(text.split('    private pendingFocusSelection;\n').length, 2, file);
  assert.equal(text.split('requestModelSync(preserveForFocus?: boolean): void;').length, 2, file);
  const restored = text.replace('    private pendingFocusSelection;\n', '')
    .replace('requestModelSync(preserveForFocus?: boolean): void;', 'requestModelSync(): void;');
  assert.equal(hash(restored), previous, `${file}: no other declaration changes`);
  changes.push({ file, before: previous, after: hash(text),
    changes: ['private pendingFocusSelection', 'optional preserveForFocus parameter on SelectionHandler.requestModelSync'] });
}
const report = { baseCommit: base, declarationFiles: Object.keys(baseline.files).length,
  editorViewFocusSignatureUnchanged: true, existingCallsCompatible: true, changes };
writeFileSync('artifacts/native-focus-api-review-20261105.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
