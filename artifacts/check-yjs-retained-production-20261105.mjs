import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function snapshot(directory = 'dist', prefix = '') {
  const result = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = join(prefix, entry.name).replaceAll('\\', '/'), path = join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, snapshot(path, name));
    else if (/\.(?:js|mjs|cjs|css|wasm|woff2?)$/.test(name)) result[name] = createHash('sha256').update(readFileSync(path)).digest('hex');
  }
  return result;
}
const baseline = 'artifacts/yjs-retained-production-baseline-20261105.json';
if (process.argv.includes('--before')) { writeFileSync(baseline, JSON.stringify(snapshot(), null, 2) + '\n'); process.exit(0); }
assert.deepEqual(snapshot(), JSON.parse(readFileSync(baseline, 'utf8')), 'Existing runtime distribution changed');
const records = [];
for (const format of ['es', 'cjs']) {
  const result = spawnSync(process.execPath, ['artifacts/yjs-retained-node-probe-20261105.mjs', format], { encoding: 'utf8' });
  writeFileSync(`artifacts/yjs-retained-node-${format}-20261105.log`, result.stdout + result.stderr);
  assert.equal(result.status, 0, result.stderr);
  const proof = JSON.parse(result.stdout); assert.equal(proof.cases, 10); records.push(proof);
}
const report = { existingRuntimeFilesByteIdentical: Object.keys(snapshot()).length, candidateNodeCases: 20, records,
  publicAdapterChanged: false, publiclyExported: false, releaseCertified: false };
writeFileSync('artifacts/yjs-retained-production-verification-20261105.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ existingRuntimeFilesByteIdentical: report.existingRuntimeFilesByteIdentical, candidateNodeCases: 20 }));
