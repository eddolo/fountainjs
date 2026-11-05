import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const baseCommit = '60c0b498dab597279d60d38c7d555f96a62eca68';
const text = path => readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
const json = path => JSON.parse(text(path));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const bindings = text('artifacts/yjs-retained-bindings-final-20261105.log');
assert.match(bindings, /6 failed \| 88 passed \(94\)/);
const failures = [...bindings.matchAll(/^ FAIL\s+([^\r\n]+)/gm)].map(match => match[1]);
assert.equal(failures.length, 6); assert.ok(failures.every(name => name.startsWith('tests/yjs-document-range.test.ts >')));
assert.equal(text('artifacts/yjs-retained-types-final-20261105.log').trim(), '');
assert.match(text('artifacts/yjs-retained-public-api-20261105.log'), /423 declaration files/);
assert.equal(execFileSync('git', ['diff', baseCommit, '--', 'src/yjs/index.ts', 'tests/yjs-document-range.test.ts', 'package.json',
  'pnpm-lock.yaml', 'api-surface.json', 'scripts/check-build-budgets.mjs'], { encoding: 'utf8' }).trim(), '');
const manifest = json('package.json');
assert.ok(!Object.keys(manifest.exports).some(entry => entry.includes('*') || entry.includes('retained')));
const modules = ['text', 'nodes', 'mapping'].map(name => `src/yjs/retained-${name}.ts`);
const provenance = [];
for (const file of readdirSync('artifacts/yjs-retained-build-20261105').filter(name => /\.(?:mjs|cjs)\.map$/.test(name))) {
  const map = json(`artifacts/yjs-retained-build-20261105/${file}`);
  for (let index = 0; index < map.sources.length; index++) for (const source of modules) {
    if (!map.sources[index].replaceAll('\\', '/').endsWith('/' + source)) continue;
    assert.equal(map.sourcesContent[index].replace(/\r\n/g, '\n'), text(source).replace(/\r\n/g, '\n'), `${file}: stale candidate build`);
    provenance.push({ file, source, sha256: hash(source) });
  }
}
assert.equal(provenance.length, 6);
const compiled = json('artifacts/yjs-retained-production-verification-20261105.json');
assert.equal(compiled.existingRuntimeFilesByteIdentical, 171); assert.equal(compiled.candidateNodeCases, 20);
assert.equal(compiled.records.length, 2);
for (const record of compiled.records) { assert.equal(record.cases, 10); assert.equal(record.noDOM, true); assert.equal(record.currentAdapterReplaced, false); }
const tests = ['text', 'nodes', 'mapping'].map(name => `tests/yjs-retained-${name}.test.ts`);
const report = { baseCommit, userRequestedLocalOnly: true, releaseCertified: false, publicAdapterChanged: false,
  publiclyExported: false, currentWireFormatChanged: false, dependenciesChanged: false, acceptanceLimitsChanged: false,
  focusedBindings: { files: 8, passed: 88, failed: 6, total: 94, candidateCasesPassed: 51, failures },
  fullSourceSuiteRerun: false, typesExitCode: 0, publicApiDeclarationsVerified: 423,
  sources: [...modules, ...tests].map(path => ({ path, sha256: hash(path) })), provenance, compiled,
  protocolTags: ['fountain-retained-text/1', 'fountain-retained-nodes/1'],
  browserValidationClaimed: false,
  remaining: ['Model/graph adapter projection and transaction scheduling', 'Composed concurrent split ordering',
    'Actual adapter selections, awareness, review and combined undo/redo', 'Explicit existing-document/offline-client migration contract',
    'Bounded large-document work and history/offline-aware compaction', 'Original six failures and real browser/provider/export acceptance'],
  committedLogNormalization: 'Line endings and trailing whitespace only; result content retained' };
writeFileSync('artifacts/yjs-retained-storage-verification-20261105.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ candidateTests: 51, focusedBindings: report.focusedBindings, compiledNodeCases: 20,
  sourceMapsMatched: 6, existingRuntimeFilesByteIdentical: 171 }));
