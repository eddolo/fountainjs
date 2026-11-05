import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const path = 'api-surface.json', snapshot = JSON.parse(readFileSync(path, 'utf8'));
const baseline = JSON.parse(execFileSync('git', ['show', '217c3d742c8a57ad0ea128a2379e7658f185c874:api-surface.json'], { encoding: 'utf8' }));
const hash = text => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
const files = ['dist/view/selection-handler.d.ts', 'dist/view/selection-handler.d.cts'];
const changes = files.map(file => {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(text.split('    private onHostFocus;\n').length, 2, file);
  const previousText = text.replace('    private onHostFocus;\n', '');
  assert.equal(hash(previousText), baseline.files[file], `${file}: all previous declaration text must be exact`);
  assert.ok([baseline.files[file], hash(text)].includes(snapshot.files[file]));
  return { file, before: baseline.files[file], after: hash(text), onlyChange: 'private onHostFocus declaration' };
});
const report = { declarationFiles: Object.keys(snapshot.files).length, publicSignaturesUnchanged: true, changes };
writeFileSync('artifacts/structural-formatting-api-review-20261105.json', JSON.stringify(report, null, 2) + '\n');
if (process.argv.includes('--apply')) {
  for (const change of changes) snapshot.files[change.file] = change.after;
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + '\n');
}
console.log(JSON.stringify(report));
