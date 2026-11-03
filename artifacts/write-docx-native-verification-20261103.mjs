import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const output = 'artifacts/docx-native-verification-20261103.json';
const files = git('diff', '--cached', '--name-only', '-z').toString().split('\0').filter(file => file && file !== output);
const json = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, ''));
const log = name => readFileSync(`artifacts/docx-native-${name}-20261103.log`, 'utf8');
git('diff', '--quiet');
git('diff', '--exit-code', 'HEAD', '--', 'scripts/check-build-budgets.mjs', 'scripts/check-performance-budgets.mjs',
  'scripts/performance-sampling.mjs', 'scripts/check-markdown-conformance.mjs', 'scripts/check-complete-source-conformance.mjs',
  'tests/fixtures/markdown', 'api-surface.json', 'package.json', 'pnpm-lock.yaml', 'src/docx/style-projection.ts');
assert.match(log('shading-before'), /7 failed \| 10 passed/u);
assert.match(log('shading-focused'), /Tests\s+74 passed/u);
assert.match(log('shading-full-tests'), /Tests\s+3388 passed/u);
assert.match(log('shading-full-tests'), /Test Files\s+240 passed/u);
assert.match(log('browser'), /1 passed/u);
assert.match(log('shading-api'), /415 declaration/u);
assert.match(log('shading-headless'), /113 modules/u);
assert.doesNotMatch(log('shading-size'), /exceeds|Build budget failed/u);
assert.ok(json('artifacts/docx-native-shading-checks-20261103.json').every(check => check.exitCode === 0));
const provenance = json('tests/fixtures/native-docx/provenance.json');
assert.equal(sha(git('show', ':tests/fixtures/native-docx/cooling-report.docx')), provenance.sha256);
const evidence = 'artifacts/docx-native-local-evidence-20261103/';
const interchange = json(evidence + 'interchange-report.json');
assert.equal(interchange.sourceSHA256, provenance.sha256);
assert.equal(sha(git('show', ':' + evidence + 'exported.docx')), interchange.exportedSHA256);
assert.equal(interchange.browser.typingUndoRedo, true); assert.equal(interchange.browser.actualDownload, true);
assert.equal(interchange.browser.actualReopen, true); assert.equal(interchange.browser.roundTripEqual, false);
assert.equal(interchange.initial.imageSHA256.length, 3); assert.equal(interchange.reopened.imageSHA256.length, 3);
assert.deepEqual([...interchange.initial.imageSHA256].sort(), [...interchange.reopened.imageSHA256].sort());
const review = json('artifacts/docx-native-local-visual-review-20261103.json');
assert.equal(review.reviewed.length, 9);
for (const image of review.reviewed) assert.equal(sha(git('show', ':' + image.path)), image.SHA256);
assert.ok(!files.some(file => file.startsWith('artifacts/docx-native-audit/')), 'CI requires a fresh working directory.');
writeFileSync(output, JSON.stringify({
  baseCommit: git('rev-parse', 'HEAD').toString().trim(),
  scope: 'Repeated Word shading recovery and independent native source/browser-export CI audit',
  verified: { tests: 3388, files: 240, newContracts: 8, focusedTests: 74, actualBrowserJourneys: 1,
    declarations: 415, headlessModules: 113, independentPythonDOCXAndPackageAndTypesAndSiteAndSize: 'passed',
    sourceUnchanged: provenance.sha256, imageHashesPreserved: 3, math: 2, footnotes: 1, tables: 1, manualBreaks: 1,
    actualTypingUndoRedoDownloadReopen: true, completeReopenedJSONEquality: false,
    manuallyReviewed: review.reviewed, visualFindings: review.findings },
  implementation: { addedAggregateESMBytes: 54, addedAggregateCJSBytes: 19,
    limitsChanged: false, dependenciesChanged: false, APIOrSchemaChanged: false,
    styleReferenceAmbiguityRulesChanged: false },
  pending: { nativeCI: 'pending first push/run', nativePageInspection: 'not performed yet',
    microsoftWordCertification: false, pixelFidelity: false, numberedListIndentDiscrepancy: 'open',
    newSourceCloudChecks: 'pending push', npm: 'unchanged at 0.4.0-beta.2' },
  sourceBinding: 'SHA-256 of staged Git blobs; manifest excluded to avoid circular hashes.',
  hashes: Object.fromEntries(files.map(file => [file, sha(git('show', ':' + file))])),
}, null, 2) + '\n');
console.log(`Bound ${files.length} source/evidence files. Local checks pass; native CI rendering remains pending.`);
