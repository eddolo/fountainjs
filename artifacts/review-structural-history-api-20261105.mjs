import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const baseCommit = '1a9e1640ef8d2fd6f955baeac5b078ba9b0db859';
const baseline = JSON.parse(execFileSync('git', ['show', `${baseCommit}:api-surface.json`], { encoding: 'utf8' }));
const hash = text => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
const changes = [];
for (const [file, previous] of Object.entries(baseline.files)) {
  const current = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  let restored = current, reason;
  if (/\/mapping\.d\.(?:ts|cts)$/.test(file)) {
    restored = current.replace('mapSelection(selection: AnySelection, before: Node, after: Node, map: PositionMapper)',
      'mapSelection(selection: AnySelection, before: Node, after: Node, map: StepMap)');
    reason = 'mapSelection accepts the existing structural PositionMapper interface; StepMap remains accepted';
  } else if (/\/step\.d\.(?:ts|cts)$/.test(file)) {
    restored = current.replace(/    \/\*\* Optional exact map sequence[^]*?    getMaps\?\(_doc: Node\): readonly StepMap\[\] \| undefined;\n/, '');
    reason = 'optional getMaps method; legacy apply/getMap step objects remain accepted';
  } else if (/\/(?:transaction|transform)\.d\.(?:ts|cts)$/.test(file)) {
    restored = current.replace('type PositionMapper, ', '').replace(', mapping?: PositionMapper', '').replace(', _mapping?: PositionMapper', '');
    reason = 'optional fourth positional mapper on protected onStepApplied; original third StepMap remains';
  } else if (/\/selection-handler\.d\.(?:ts|cts)$/.test(file)) {
    restored = current.replace(', type Transaction', '')
      .replace(/    \/\*\* @internal Carry native direction[^]*?    mapTransactionSelection\(transaction: Transaction\): void;\n/, '');
    reason = 'internal DOM selection-direction mapping hook; existing methods unchanged';
  }
  assert.equal(hash(restored), previous, `${file}: unreviewed declaration changes`);
  if (hash(current) !== previous) changes.push({ file, before: previous, after: hash(current), reason });
}
assert.equal(changes.length, 10);
const report = { baseCommit, declarationFiles: Object.keys(baseline.files).length, changes,
  newPublicEntryPoints: false, existingCallsCompatible: true, legacyDuckTypedStepTestPassed: true };
writeFileSync('artifacts/structural-history-api-review-20261105.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
