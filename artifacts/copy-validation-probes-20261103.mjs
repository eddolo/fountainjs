import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as baseline from './perf-focus-baseline-f293269-20261103/dist/index.js';
import * as current from '../dist/index.js';

// The archived control's schema implementation is identical to base HEAD.
execFileSync('git', ['diff', '--exit-code', 'f293269', '5659540', '--',
  'src/core/schema/schema.ts', 'src/core/schema/node.ts', 'src/core/schema/child-offset.ts']);
const cases = [];
for (const count of [1000, 10000]) for (const [label, api] of [['baseline', baseline], ['candidate', current]]) {
  const schema = new api.Schema({ nodes: { doc: { content: 'paragraph+' },
    paragraph: { group: 'block', content: 'text*' }, text: { inline: true } } });
  const paragraph = text => schema.node('paragraph', {}, [schema.text(text)]);
  const doc = schema.node('doc', {}, Array.from({ length: count }, (_, index) => paragraph(`p${index}`)));
  schema.validate(doc);
  const candidate = doc.copy([...doc.content.slice(0, -1), paragraph('changed')]);
  const original = WeakSet.prototype.has;
  let probes = 0;
  try {
    WeakSet.prototype.has = function (value) { probes++; return original.call(this, value); };
    schema.validate(candidate);
  } finally { WeakSet.prototype.has = original; }
  assert.equal(candidate.child(count - 1).textContent, 'changed');
  assert.equal(doc.child(count - 1).textContent, `p${count - 1}`);
  assert.ok(label === 'baseline' ? probes >= count : probes < 20);
  cases.push({ implementation: label, blocks: count, probes });
}
const report = { runtime: process.version, baselineCommit: 'f293269d49b840452af04d227e23421be47163e6',
  schemaCodeIdenticalThroughBaseCommit: '56595406f114b7de7e849042e90e1ec3b37e215a',
  assertion: 'Same one-child edit; count WeakSet.has calls only during schema.validate, after source validation.', cases };
writeFileSync('artifacts/copy-validation-probes-report-20261103.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
