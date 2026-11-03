import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, ''));
const log = name => readFileSync(`artifacts/docx-theme-language-${name}-20261103.log`, 'utf8');
assert.match(log('before'), /20 failed \| 5 passed/u);
assert.match(log('focused-final'), /Tests\s+48 passed/u);
assert.match(log('full-tests'), /Tests\s+3413 passed/u);
assert.match(log('full-tests'), /Test Files\s+241 passed/u);
assert.match(log('browser'), /3 passed/u);
assert.match(log('types-final'), /0 errors and 0 warnings/u);
assert.match(log('site'), /built in/u);
const checks = json('artifacts/docx-theme-language-checks-20261103.json');
assert.ok(checks.filter(item => item.name !== 'types').every(item => item.exitCode === 0));
assert.match(log('api'), /415 declaration/u);
assert.match(log('headless'), /113 modules/u);
const sourceSHA = sha(readFileSync('tests/fixtures/native-docx/cooling-report.docx'));
assert.equal(sourceSHA, json('tests/fixtures/native-docx/provenance.json').sha256);

const reviewed = [], exported = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const root = `artifacts/docx-theme-language-real-20261103/${engine}/`;
  const report = json(root + 'interchange-report.json');
  assert.equal(report.sourceSHA256, sourceSHA);
  assert.equal(report.exportedSHA256, sha(readFileSync(root + 'exported.docx')));
  assert.ok(report.browser.actualDownload && report.browser.typingUndoRedo && report.browser.actualReopen);
  assert.deepEqual([...report.initial.imageSHA256].sort(), [...report.reopened.imageSHA256].sort());
  assert.equal(report.initial.imageSHA256.length, 3);
  exported.push({ engine, exportedSHA256: report.exportedSHA256, retainedImageSHA256: report.initial.imageSHA256,
    completeJSONEquality: report.browser.roundTripEqual });
  for (const name of ['editor-top.png', 'editor-reopened.png']) {
    const path = root + name;
    reviewed.push({ path, SHA256: sha(readFileSync(path)) });
  }
}
writeFileSync('artifacts/docx-theme-language-visual-review-20261103.json', JSON.stringify({
  reviewed, findings: ['The title remains readable and keeps its font after actual DOCX reopen in every desktop engine.',
    'The known list-text indentation drift remains visible after reopen in each engine.',
    'These are editor captures; native font/substitution equivalence requires the independent CI PDFs.'],
  scope: 'Six selected editor captures reviewed. Other captures, videos and traces were recorded but not manually reviewed.',
}, null, 2) + '\n');

if (process.argv.includes('--bind')) {
  const output = 'artifacts/docx-theme-language-verification-20261103.json';
  git('diff', '--quiet');
  git('diff', '--exit-code', 'HEAD', '--', 'scripts/check-build-budgets.mjs', 'scripts/check-performance-budgets.mjs',
    'scripts/check-markdown-conformance.mjs', 'scripts/check-complete-source-conformance.mjs',
    'tests/fixtures/markdown', 'tests/fixtures/native-docx', 'api-surface.json', 'package.json', 'pnpm-lock.yaml');
  const files = git('diff', '--cached', '--name-only', '-z').toString().split('\0').filter(file => file && file !== output);
  const sizes = Object.fromEntries(['dist/docx.js', 'dist/docx.cjs', 'dist/styles.css'].map(path => [path, statSync(path).size]));
  assert.deepEqual(sizes, { 'dist/docx.js': 189351, 'dist/docx.cjs': 153062, 'dist/styles.css': 89593 });
  const scope = json('artifacts/docx-theme-language-runtime-scope-20261103.json');
  assert.equal(scope.compared, 168);
  assert.deepEqual([...scope.different].sort(), ['dist/docx.cjs', 'dist/docx.js']);
  writeFileSync(output, JSON.stringify({
    baseCommit: git('rev-parse', 'HEAD').toString().trim(),
    scope: 'Declared Word theme languages, supplemental script fonts and regional defaults',
    verified: { newContracts: 25, beforeFailures: 20, focused: 48, fullUnitTests: 3413, files: 241,
      finalTestCleanup: 'The full run preceded a test-only TS annotation cleanup; all 48 focused cases and framework types pass after it. Runtime source is unchanged.',
      actualBrowserJourneys: 3, reviewed, sourceSHA256: sourceSHA, exported,
      API: 415, headless: 113, packedESMAndCJSAndIndependentDOCXInterop: 'passed', frameworkTypes: 'passed', website: 'passed' },
    implementation: { sizes, addedESMBytes: 739, addedCJSBytes: 599, unrelatedBuiltFilesUnchanged: 166,
      sourceReferenceChanged: false, dependenciesOrAPISchemaChanged: false,
      Intl: 'Explicit BCP-47 likely-script resolution; unavailable/invalid/indeterminate input retains fallback warnings. Runtime ICU versions may differ.' },
    capacity: { currentGate: 'fails the four measured code caps', approval: 'pending; proposal prepared and unapplied',
      proposal: 'artifacts/docx-theme-language-capacity-proposal-20261103.patch',
      DOCXKiB: { ESM: [184.25, 185], CJS: [149, 149.5] }, aggregateKiB: { ESM: [1651.75, 1652.5], CJS: [1375, 1375.5] },
      allLimitsChanged: false, runtimeHeapCSSOracleLimitsChanged: false },
    remaining: ['Independent native PDF/page review of this repair', 'Capacity approval before changing limits',
      'List indentation/spacing, header positioning and other documented DOCX gaps', 'Fresh full cloud gate before npm release'],
    npm: 'unchanged at 0.4.0-beta.2',
    sourceBinding: 'SHA-256 of staged Git blobs; this manifest excluded to avoid circular hashes.',
    hashes: Object.fromEntries(files.map(file => [file, sha(git('show', ':' + file))])),
  }, null, 2) + '\n');
  console.log(`Bound ${files.length} source/evidence files. Existing caps remain unchanged; native CI is pending.`);
}
