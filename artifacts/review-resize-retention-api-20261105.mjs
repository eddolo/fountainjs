import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const base = '252509009058fb974a7d9b8fb2c1d84632cd6923';
const before = JSON.parse(execFileSync('git', ['show', `${base}:api-surface.json`], { encoding: 'utf8' }));
const hash = text => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
const changes = [];
for (const [file, digest] of Object.entries(before.files)) {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  if (!/\/selection-handler\.d\.(?:ts|cts)$/.test(file)) { assert.equal(hash(text), digest, file); continue; }
  assert.equal(text.split('    private nodeViewPointerActive;\n').length, 2);
  assert.equal(hash(text.replace('    private nodeViewPointerActive;\n', '')), digest, file);
  changes.push({ file, before: digest, after: hash(text), onlyChange: 'private nodeViewPointerActive' });
}
assert.equal(changes.length, 2);
const report = { baseCommit: base, declarationFiles: Object.keys(before.files).length, publicSignaturesUnchangedSinceBase: true, changes };
writeFileSync('artifacts/resize-retention-api-review-20261105.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
