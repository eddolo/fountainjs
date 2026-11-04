import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const logContracts = [
  ['artifacts/math-paragraph-layout-baseline-20261104.log', /7 failed/],
  ['artifacts/math-paragraph-layout-full-unit-20261104.log', /3608 passed/],
  ['artifacts/math-paragraph-layout-final-unit-20261104.log', /3609 passed/],
  ['artifacts/math-paragraph-layout-browser-20261104.log', /3 passed/],
  ['artifacts/math-paragraph-layout-build-20261104.log', /built in/],
  ['artifacts/math-paragraph-types-20261104.log', /0 errors and 0 warnings/],
  ['artifacts/math-paragraph-package-20261104.log', /package exports loaded successfully/],
  ['artifacts/math-paragraph-headless-20261104.log', /119 modules/],
  ['artifacts/math-paragraph-interop-20261104.log', /CommonJS: complete bordered/],
  ['artifacts/math-paragraph-api-20261104.log', /419 declaration files/],
  ['artifacts/math-paragraph-markdown-20261104.log', /Complete-source oracle sensitivity/],
  ['artifacts/math-paragraph-server-runtimes-20261104.log', /complete HTML page-settings retention/],
  ['artifacts/math-paragraph-packed-consumer-20261104.log', /Actual packed ESM\/CommonJS root\/core/],
  ['artifacts/math-paragraph-worker-20261104.log', /"undoExact":true/],
  ['artifacts/math-paragraph-performance-20261104.log', /100 HTML blocks: server parse p50 14.81 ms, p95 28.61 ms/],
  ['artifacts/math-paragraph-budget-20261104.log', /Build budget failed/],
];
const logs = [];
for (const [path, expected] of logContracts) {
  const text = (await readFile(path, 'utf8')).replaceAll('\r\n', '\n').trimEnd() + '\n';
  assert.match(text, expected, path);
  await writeFile(path, text);
  logs.push({ path, sha256: sha(text), canonicalText: 'UTF-8 LF with one final newline' });
}
async function inventory(root) {
  const items = {};
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.(?:js|cjs|css)$/.test(path)) {
        const bytes = await readFile(path);
        items[relative(root, path).replaceAll('\\', '/')] = { bytes: bytes.length, sha256: sha(bytes) };
      }
    }
  }
  await walk(root);
  return items;
}
const current = await inventory(resolve('dist'));
const previous = await inventory(resolve('artifacts/image-paragraph-tarball-consumer-20261104/node_modules/fountainjs-editor/dist'));
assert.equal(current['styles.css'].sha256, previous['styles.css'].sha256);
const runtimeChanges = [...new Set([...Object.keys(current), ...Object.keys(previous)])].sort()
  .filter(path => current[path]?.sha256 !== previous[path]?.sha256).map(path => ({ path, previous: previous[path], current: current[path] }));
const nativeReview = JSON.parse(await readFile('artifacts/math-paragraph-native-review-20261104.json', 'utf8'));
assert.equal(nativeReview.expandedGate.report.scope.length, 11);
assert.ok(Object.values(nativeReview.deltasPt).every(delta => Object.values(delta).every(value => Math.abs(value) <= 0.01)));
assert.ok(nativeReview.expandedGate.allFourRastersEqualReviewedImplementationRun);
const browserEvidence = JSON.parse(await readFile('artifacts/math-paragraph-layout-real-20261104/evidence.json', 'utf8'));
assert.ok(browserEvidence.records.every(record => record.completeUndoInverse && record.observation.mathEditedAndUndone));
const report = { implementationCommit: 'c39d92dc0145927c22dd1b7a8799a687f0ec3b38',
  nativeGateCommit: '497eb5eb05e164cd167630412e06ebee484b49a5', unitTests: 3609, unitFiles: 256,
  browserEngines: ['chromium', 'firefox', 'webkit'], nativeReview, logs, runtimeChanges,
  packedSHA256: sha(await readFile('artifacts/math-paragraph-tarball-consumer-20261104/fountainjs-editor-0.4.0-beta.2.tgz')),
  apiDeclarationsChanged: false, cssChanged: false, performanceAndRetentionGatePassedThisRun: true,
  priorTimingFailuresRetained: true, parserPerformanceRepairClaimed: false,
  approvedLimitsKiB: { docxESM: 185, docxCJS: 149.5, aggregateESM: 1652.5, aggregateCJS: 1375.5 },
  sizeGatePassed: false, failingLimits: ['core ESM', 'core CJS', 'DOCX ESM', 'DOCX CJS', 'CSS', 'aggregate ESM', 'aggregate CJS'],
  released: false, fullFidelityCertified: false };
await writeFile('artifacts/math-paragraph-verification-20261104.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ unitTests: 3609, unitFiles: 256, nativePositions: 11, packedSHA256: report.packedSHA256,
  performancePassed: true, cssChanged: false, sizeGatePassed: false, released: false }, null, 2));
