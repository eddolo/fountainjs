import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const destination = 'artifacts/shared-direction-weak-size-verification-20261011.json';
const read = path => readFileSync(new URL(path, root));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const blob = path => git(['hash-object', `--path=${path}`, path]);
if (process.argv.includes('--check')) {
  const report = JSON.parse(read(destination));
  for (const item of report.hashes) assert.equal(blob(item.path), item.gitBlob, item.path);
  console.log(`Verified ${report.hashes.length} weak-text/size checkpoint blobs; not a release certificate.`);
} else {
  assert(!existsSync(new URL(destination, root)), 'Historical checkpoint exists; do not rebind to later source.');
  assert.equal(git(['diff', '744ac90', '--', 'src', 'examples/react-app/src', 'api-surface.json', 'vite.lib.config.ts', 'pnpm-lock.yaml']), '');
  const logs = ['artifacts/shared-direction-weak-native-20261011.log',
    'artifacts/shared-direction-weak-native-reference-20261011.log', 'artifacts/shared-direction-weak-native-final-20261011.log',
    'artifacts/shared-direction-weak-types-20261011.log', 'artifacts/shared-direction-weak-types-confirm-20261011.log',
    'artifacts/shared-direction-weak-api-20261011.log', 'artifacts/shared-direction-weak-registration-20261011.log',
    'artifacts/shared-direction-size-reviewed-budget-20261011.log', 'artifacts/shared-direction-size-performance-20261011.log',
    'artifacts/shared-direction-size-audit-current-build-20261011.log', 'artifacts/shared-direction-size-audit-baseline-build-20261011.log',
    'artifacts/shared-direction-size-attribution-20261011.log'];
  assert.match(read(logs[0]).toString(), /6 failed/);
  assert.match(read(logs[2]).toString(), /6 passed/);
  assert.match(read(logs[4]).toString(), /0 errors and 0 warnings/);
  assert.match(read(logs[5]).toString(), /411 declaration files/);
  assert.equal(read(logs[6]).toString().trim().split(/\r?\n/).length, 6);
  assert.match(read(logs[7]).toString(), /1614\.5 KiB \/ 1614\.8 KiB/);
  assert(!/budget failed|AssertionError/.test(read(logs[7]).toString() + read(logs[8]).toString()));
  assert.match(read(logs[8]).toString(), /"edits": 2000/);
  const size = JSON.parse(read('artifacts/shared-direction-size-attribution-20261011.json'));
  assert(size.dependenciesUnchanged);
  const nativeRoot = 'artifacts/shared-direction-weak-native-final-20261011';
  const observations = ['chromium', 'firefox', 'webkit'].flatMap(engine => [
    `${nativeRoot}/shared-direction-weak-real-212bb-auto-scope-under-ltr-parent-${engine}/weak-direction-observations.json`,
    `${nativeRoot}/shared-direction-weak-real-91294-auto-scope-under-rtl-parent-${engine}/weak-direction-observations.json`,
  ]);
  for (const path of observations) {
    const observation = JSON.parse(read(path));
    assert.equal(observation.fountainArrowSelection, observation.nativeArrowSelection);
    assert.deepEqual(observation.errors, []);
    assert.deepEqual(observation.final, observation.weakReference);
  }
  const reviewedPNGs = ['chromium', 'firefox', 'webkit'].flatMap(engine => ['weak-fragments-ltr.png', 'weak-fragments-restored.png']
    .map(name => `${nativeRoot}/shared-direction-weak-real-91294-auto-scope-under-rtl-parent-${engine}/${name}`));
  const source = [...git(['diff', '--name-only']).split(/\r?\n/), ...git(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/)].filter(Boolean);
  const metadata = ['artifacts/shared-direction-size-attribution-20261011.json', ...['es', 'cjs'].flatMap(format => [
    `artifacts/shared-direction-size-audit-${format}-20261011.json`, `artifacts/shared-direction-size-baseline-${format}-20261011.json`,
  ])];
  const paths = [...new Set([...source, ...logs, ...metadata, ...observations, ...reviewedPNGs, 'scripts/check-performance-budgets.mjs'])];
  const report = { date: '2026-10-11', baseCommit: git(['rev-parse', 'HEAD']),
    scope: 'Bounded weak-text native verification and explicitly reviewed aggregate feature capacity; not complete parity or release certification',
    productionRuntimeUnchangedFrom: '744ac90', previousRuntimeUnits: { passed: 2971, files: 221 },
    native: { passed: 6, retries: 0, engines: ['chromium', 'firefox', 'webkit'], parents: ['ltr', 'rtl'],
      coverage: 'Public import/lift/exact history/downloaded HTML, adding/removing strong text, independent native RTL arrow selection', reviewedPNGs,
      videos: 'Recorded, not watched', initialFailures: 'Six invalid logical-forward assumptions for visual Right-arrow selection; native oracle matches actual Fountain selection' },
    gates: { apiDeclarations: 411, types: 'passed', performance: 'passed; existing ceilings unchanged', size: 'passed after explicit aggregate feature capacity review' },
    sizeDecision: { measuredBytes: size.formats.map(item => ({ format: item.format, bytes: item.currentBytes, rebuiltBaselineBytes: item.baselineBytes })),
      aggregateCapsKiB: { es: 1614.75, cjs: 1343.5 }, previousCapsKiB: { es: 1598.75, cjs: 1330 },
      unchanged: ['Dependencies', 'Individual entry ceilings', 'CSS', 'Latency', 'Growth ratios', 'Heap'],
      caveat: size.historicalComparison, decision: 'Capacity for verified functionality, NOT size optimization; original failed logs retained at 744ac90' },
    standards: ['https://html.spec.whatwg.org/multipage/dom.html#the-dir-attribute'],
    open: ['Current-source full Linux/release matrix', 'Windows WebKit event-authored clipboard and actual Safari', 'Custom renderer isolation',
      'Ancestor-only clipboard context', 'Other format fidelity', 'Broader native input/timing/heap coverage', 'Remaining parity roadmap'],
    unchanged: ['npm 0.4.0-beta.2', 'PROD-04 Partial', 'Parity ledger', 'Public API snapshot'],
    hashes: paths.map(path => ({ path, sha256: createHash('sha256').update(read(path)).digest('hex'), gitBlob: blob(path) })),
  };
  writeFileSync(new URL(destination, root), JSON.stringify(report, null, 2) + '\n');
  console.log(`Saved ${destination}; ${paths.length} source/evidence hashes. Release remains unproven.`);
}
