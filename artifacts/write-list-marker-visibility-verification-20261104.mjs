import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const output = 'artifacts/list-marker-visibility-verification-20261104.json';
const digest = value => createHash('sha256').update(value).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const git = args => execFileSync('git', args, { maxBuffer: 16 * 1024 * 1024 });
assert.equal(git(['status', '--porcelain', '--', 'src', 'package.json', 'pnpm-lock.yaml', 'api-surface.json', 'scripts/check-build-budgets.mjs']).toString('utf8'), '');
const manual = read('artifacts/list-marker-visibility-verified-checks-20261104.json');
const standard = read('artifacts/list-marker-default-checks-20261104.json');
assert.equal(manual.browser, 0); assert.equal(manual.types, 0);
assert.equal(standard.browser, 0); assert.equal(standard.types, 0);
const original = read('artifacts/list-marker-original-inspection-20261104.json');
assert.ok(original.records.every(item => item.markerPatchRGBAEqual));
const standardRoot = 'artifacts/list-marker-default-browser-20261104';
const standardReports = readdirSync(standardRoot, { recursive: true }).map(path => path.replace(/\\/g, '/'))
  .filter(path => path.endsWith('/list-marker-visibility/observations.json'));
assert.equal(standardReports.length, 3);
const canonicalRoot = 'artifacts/list-marker-visibility-verified-real-20261104/chromium';
const modelSHA = digest(readFileSync(`${canonicalRoot}/before.json`));
const browsers = {};
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const root = `artifacts/list-marker-visibility-verified-real-20261104/${engine}`;
  const observed = read(`${root}/observations.json`);
  assert.ok(observed.actual.pixels.dark > 4 && observed.positive.pixels.dark > 4);
  assert.equal(observed.negative.pixels.dark, 0);
  const models = {};
  for (const name of ['before.json', 'after.json']) {
    models[name] = digest(readFileSync(`${root}/${name}`));
    assert.equal(models[name], modelSHA);
  }
  const path = standardReports.find(path => path.includes(`-${engine}/`));
  assert.ok(path);
  const standardObserved = read(`${standardRoot}/${path}`);
  assert.equal(standardObserved.completeJSONAfterEnterBackspaceEqual, true);
  assert.ok(standardObserved.actual.pixels.dark > 4);
  assert.equal(standardObserved.negative.pixels.dark, 0);
  for (const name of ['before.json', 'after.json']) assert.equal(digest(readFileSync(`${standardRoot}/${path.replace('observations.json', name)}`)), modelSHA);
  browsers[engine] = { observations: observed, exactModelDownloadSHA256: models, standardSuiteObservation: `${standardRoot}/${path}`,
    reviewedActualMarker: { path: `${root}/actual-marker.png`, sha256: digest(readFileSync(`${root}/actual-marker.png`)) } };
}
const paths = git(['diff', '--cached', '--name-only', '-z']).toString('utf8').split('\0').filter(path => path && path !== output);
const stagedSHA256 = Object.fromEntries(paths.map(path => [path, digest(git(['show', `:${path}`]))]));
const report = {
  previousCheckpoint: 'd0c8d75f37bf064d316ee40cc6a256fc4afc6e41',
  sourceDOCXSHA256: digest(readFileSync('tests/fixtures/native-docx/cooling-report.docx')),
  status: 'Corrected a visual-review false finding; added real paint/model-retention regression to the standard desktop suite. No production repair or release.',
  correction: 'The original empty item already painted 2. Overview inspection misread it; all original/repeated marker RGBA patches are identical. The earlier missing-marker remaining item is superseded.',
  originalInspection: original,
  checks: { recordedManual: { exit: 0, engines: 3, workers: 1 },
    standardDesktopEntry: { exit: 0, engines: 3, workers: 1, file: 'tests/browser/editor.spec.ts', filteredRun: true, cloudCIRun: false },
    frameworkTypes: 0, completeJSONEnterBackspaceEqual: true,
    runtimeScope: read('artifacts/list-marker-runtime-scope-20261104.json'),
    fullUnit: { rerun: false, previousSourceResult: '3532 tests / 250 files at d0c8d75', reason: 'No production source or runtime artifact changed.' },
    acceptanceThresholdChanges: false },
  canonicalModelDownloads: { before: `${canonicalRoot}/before.json`, after: `${canonicalRoot}/after.json`, sha256: modelSHA,
    deduplication: 'All twelve model downloads across the manual and standard entry points have this exact hash. One canonical before/after pair is retained in Git.' },
  browsers,
  auditCorrection: 'The initial WebKit negative control contained two preceding-line descender pixels at the top edge. The final crop stays inside the measured line. Zero-pixel negative and >4-pixel positive/actual requirements were not relaxed.',
  remaining: ['Native DOCX contextual-spacing export, validated identities/roles and independent native rendering proof.',
    'Seven size failures and the preceding server-HTML timing failure remain unresolved. No parity percentage promotion.'],
  stagedSHA256,
};
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(`Bound ${paths.length} staged source/evidence files; original finding corrected; standard-suite paint and exact model-retention checks pass in all three engines.`);
