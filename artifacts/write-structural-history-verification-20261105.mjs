import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const baseCommit = '1a9e1640ef8d2fd6f955baeac5b078ba9b0db859';
const text = path => readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
const json = path => JSON.parse(text(path));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const checks = json('artifacts/structural-history-checks-20261105.json');
assert.equal(checks.length, 8);
for (const check of checks) assert.equal(check.exitCode, ['unit', 'size'].includes(check.id) ? 1 : 0, check.id);
const unit = text('artifacts/structural-history-unit-verified-20261105.log');
assert.match(unit, /6 failed \| 4133 passed \(4139\)/);
const failures = [...unit.matchAll(/^ FAIL\s+([^\r\n]+)/gm)].map(match => match[1]);
assert.equal(failures.length, 6); assert.ok(failures.every(title => title.startsWith('tests/yjs-document-range.test.ts >')));
assert.match(text('artifacts/structural-history-browser-direction-20261105.log'), /6 passed/);
const browserRoot = 'artifacts/structural-history-browser-direction-20261105';
const observations = [];
for (const entry of readdirSync(browserRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = `${browserRoot}/${entry.name}`;
  const history = entry.name.startsWith('history-retention-');
  const record = json(`${directory}/${history ? 'history-observations.json' : 'structural-wrapping/observations.json'}`);
  assert.equal(record.observations.length, history ? 2 : 8); assert.deepEqual(record.errors, []);
  observations.push({ kind: history ? 'native-history' : 'native-wrapping', ...record });
}
assert.equal(observations.length, 6);
const visual = json('artifacts/structural-history-visual-review-20261105.json');
assert.equal(visual.stages.length, 36); assert.equal(visual.stageContactsReviewed, true); assert.equal(visual.sampledVideoContactsReviewed, true);
for (const capture of [...visual.stages, ...visual.recordings]) assert.equal(hash(capture.path), capture.sha256);
const sources = ['src/core/commands.ts', 'src/core/structure-commands.ts', 'src/core/block-range.ts',
  'src/core/transaction/mapping.ts', 'src/core/transaction/step.ts', 'src/core/transaction/transform.ts',
  'src/core/transaction/transaction.ts', 'src/core/transaction/restructure-children-step.ts',
  'src/core/transaction/split-node-step.ts', 'src/core/transaction/rebase-insertion.ts',
  'src/core/transaction/rebase-deletion.ts', 'src/extensions/plugins/history.ts', 'src/view/selection-handler.ts', 'src/view/view.ts'];
const provenance = [];
for (const file of readdirSync('dist').filter(file => /\.(?:js|cjs)\.map$/.test(file))) {
  const map = json(`dist/${file}`);
  for (let index = 0; index < map.sources.length; index++) for (const source of sources) {
    if (!map.sources[index].replaceAll('\\', '/').endsWith('/' + source)) continue;
    assert.equal(map.sourcesContent[index].replace(/\r\n/g, '\n'), text(source).replace(/\r\n/g, '\n'), `${file}: ${source}`);
    provenance.push({ file: `dist/${file}`, source, sha256: hash(source) });
  }
}
for (const source of sources) assert.ok(provenance.filter(entry => entry.source === source).length >= 2, source);
assert.equal(execFileSync('git', ['diff', baseCommit, '--', 'package.json', 'pnpm-lock.yaml', 'scripts/check-build-budgets.mjs', 'src/yjs/index.ts'], { encoding: 'utf8' }).trim(), '');
const previousBrowser = execFileSync('git', ['show', `${baseCommit}:tests/browser/editor.spec.ts`], { encoding: 'utf8' }).replace(/\r\n/g, '\n');
const currentBrowser = text('tests/browser/editor.spec.ts').replace(/\r\n/g, '\n')
  .replace("import '../manual/structural-wrapping-real.spec';\n", '').replace("import '../manual/history-retention-real.spec';\n", '');
assert.equal(currentBrowser, previousBrowser, 'Existing browser assertions are unchanged; two recorded journeys added to CI');
const packed = json('artifacts/structural-history-packed-node-20261105.json');
assert.equal(packed.exitCode, 0); assert.equal(packed.proof.cases, 28); assert.ok(packed.allBuildFilesMatch >= 881);
const sizes = json('artifacts/structural-history-loaded-size-20261105.json');
const previous = json('artifacts/resize-retention-loaded-size-20261105.json');
const loadedSize = ['.', './core', './react', './docx', './yjs', './html/server'].map(entry => {
  const after = sizes.entries.find(value => value.entry === entry), before = previous.entries.find(value => value.entry === entry);
  return { entry, rawBytes: after.closureRawBytes, gzipBytes: after.closureGzipBytes,
    rawDelta: after.closureRawBytes - before.closureRawBytes, gzipDelta: after.closureGzipBytes - before.closureGzipBytes };
});
const historyRetention = json('artifacts/structural-history-memory-20261105.json');
const report = { baseCommit, releaseCertified: false, acceptanceLimitsChanged: false, runtimeDependenciesChanged: false,
  unit: { passed: 4133, failed: 6, total: 4139, files: 282, failures }, checks,
  api: json('artifacts/structural-history-api-review-20261105.json'), provenance, packed, observations, visual,
  loadedSize: { consumerTreeShakingApplied: false, payloadIsNotSpeedMeasurement: true, entries: loadedSize }, historyRetention,
  scope: ['Native directed quote/list wrapping, retained positions and exact JSON/reader/history',
    'Paragraph/heading/list split maps and comments across local undo/redo',
    'Independent same-leaf ReplaceTextStep insertions/deletions/replacements; not arbitrary custom/structural independent steps'],
  remaining: ['Six required offline Yjs retention failures; no storage migration implemented',
    'Broader custom/structural independent-edit rebasing', 'Fresh complete CI and unchanged size failures',
    'Broader parity, format fidelity and physical-device coverage'],
  committedLogNormalization: 'Line endings and trailing whitespace only; result content retained' };
writeFileSync('artifacts/structural-history-verification-20261105.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ unit: report.unit, provenanceEntries: provenance.length, packedCases: packed.proof.cases, loadedSize }));
