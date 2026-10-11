import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const destination = 'artifacts/shared-direction-index-verification-20261011.json';
const read = path => readFileSync(new URL(path, root));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const blob = path => git(['hash-object', `--path=${path}`, path]);
if (process.argv.includes('--check')) {
  const report = JSON.parse(read(destination));
  for (const item of report.hashes) assert.equal(blob(item.path), item.gitBlob, item.path);
  console.log(`Verified ${report.hashes.length} indexed-direction checkpoint blobs; not a release certificate.`);
} else {
  assert(!existsSync(new URL(destination, root)), 'Historical checkpoint exists; do not rebind old logs to later source.');
  const logs = [
    'artifacts/shared-direction-index-wide-20261011.log',
    'artifacts/shared-direction-index-full-20261011.log',
    ...['test-api', 'test-headless', 'package-final', 'test-budget'].map(name => `artifacts/shared-direction-index-${name}-20261011.log`),
    'artifacts/shared-direction-index-types-confirm-20261011.log',
    'artifacts/shared-direction-index-test-performance-20261011.log',
    'artifacts/shared-direction-index-performance-confirm-20261011.log',
    'artifacts/shared-direction-index-retention-20261011.log',
    'artifacts/shared-direction-index-native-final-20261011.log',
    'artifacts/shared-direction-index-regular-registration-20261011.log',
    'artifacts/shared-direction-index-virtual-20261011.log',
    'artifacts/shared-direction-index-red-20261011.log',
    'artifacts/shared-direction-index-members-red-20261011.log',
    'artifacts/shared-direction-index-typecheck-20261011.log',
    'artifacts/shared-direction-index-performance-registered-final-20261011.log',
    'artifacts/shared-direction-index-copy-final-20261011.log',
  ];
  assert.match(read(logs[0]).toString(), /Tests\s+81 passed/);
  assert.match(read(logs[1]).toString(), /Tests\s+2971 passed \(2971\)/);
  assert.match(read(logs[1]).toString(), /Test Files\s+221 passed \(221\)/);
  assert.match(read(logs[2]).toString(), /411 declaration files/);
  assert.match(read(logs[3]).toString(), /104 modules/);
  assert.match(read(logs[4]).toString(), /package exports loaded successfully/);
  assert.match(read(logs[5]).toString(), /Build budget failed/);
  assert.match(read(logs[6]).toString(), /0 errors and 0 warnings/);
  assert.match(read(logs[7]).toString(), /100-block server HTML p95 39.04 ms exceeds 35 ms/);
  assert(!/Performance budget failed/.test(read(logs[8]).toString()));
  const memory = JSON.parse(read(logs[9]));
  assert(memory.liveGrowthBytes <= memory.liveLimitBytes && memory.destroyedGrowthBytes <= memory.destroyedLimitBytes);
  assert.match(read(logs[10]).toString(), /15 passed/);
  assert(!/optimized dependencies changed|reloading/.test(read(logs[10]).toString()));
  const registrations = read(logs[11]).toString().split(/\r?\n/).filter(line => /\[(chromium|firefox|webkit)\]/.test(line));
  assert.equal(registrations.length, 15);
  assert.match(read(logs[16]).toString(), /"edits": 2000/);
  assert(!/Performance budget failed|AssertionError/.test(read(logs[16]).toString()));
  assert.match(read(logs[17]).toString(), /4 passed/);
  assert.equal(git(['diff', '--', 'api-surface.json', 'tests/manual/nested-direction-real.spec.ts']), '');
  const nativeRoot = 'artifacts/shared-direction-index-native-final-20261011';
  const reviewedPNGs = ['chromium', 'firefox', 'webkit'].flatMap(engine => [
    `${nativeRoot}/shared-direction-virtual-r-56a2d--native-editing-and-history-${engine}/virtual-offscreen-anchor-ltr.png`,
    `${nativeRoot}/shared-direction-virtual-r-56a2d--native-editing-and-history-${engine}/virtual-restored-rtl.png`,
    `${nativeRoot}/nested-direction-real-nested-lift-auto-${engine}/nested-toolbar-transformed.png`,
    `${nativeRoot}/nested-direction-real-indent-under-fixed-item-${engine}/nested-anchor-edited.png`,
  ]);
  const observations = ['chromium', 'firefox', 'webkit'].map(engine =>
    `${nativeRoot}/shared-direction-virtual-r-56a2d--native-editing-and-history-${engine}/virtual-direction-observations.json`);
  const tracked = git(['diff', '--name-only']).split(/\r?\n/).filter(Boolean);
  const untracked = git(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/).filter(Boolean);
  const paths = [...new Set([...tracked, ...untracked, 'api-surface.json', 'tests/manual/nested-direction-real.spec.ts', ...logs, ...reviewedPNGs, ...observations])];
  const report = {
    date: '2026-10-11', baseCommit: git(['rev-parse', 'HEAD']),
    scope: 'Unreleased private immutable subtree index and bounded 100k virtual-view evidence; not parity/release certification',
    fullUnits: { passed: 2971, files: 221 }, focused: { passed: 81, files: 4 },
    indexing: 'Eight tests: zero unchanged-block child reads at 1k/100k; 500 mixed-tree oracle comparisons; 10k depth; barriers/raw/attribute exclusions. Changed ancestor arrays and mixed-group branches still require ordered traversal.',
    browser: { passed: 19, retries: 0, publicNested: 12, virtualIntegration: 3, chromiumFirefoxClipboard: 4,
      setup: '100k model supplied by test-only public API fixture, host offscreen edits, native visible typing/history; explicit viewport assertions; not production import or every large-document workflow',
      reviewedPNGs, videos: 'Recorded, not watched',
      fixtureDiagnostics: 'Wrong initial module URL corrected; mounted-only confirmation replaced with explicit viewport assertions and visible screenshots' },
    gates: { apiDeclarations: 411, headlessModules: 104, package: 'passed', types: 'passed',
      performance: 'Initial 100-block server HTML timing failed; unchanged-code confirmation passes; both retained',
      indexedRetention: memory, aggregateSize: 'FAILED; caps unchanged' },
    open: ['Aggregate size', 'Current-source full Linux/release matrix', 'Windows WebKit event-authored clipboard and real Safari',
      'Custom renderer isolation', 'No-strong inherited fallback audit', 'Ancestor-only clipboard context', 'Other format fidelity', 'Broader browser latency/heap coverage'],
    unchanged: ['npm 0.4.0-beta.2', 'PROD-04 Partial', 'Parity ledger', 'Public API snapshot', 'Original nested assertions', 'Performance/size ceilings'],
    hashes: paths.map(path => ({ path, sha256: createHash('sha256').update(read(path)).digest('hex'), gitBlob: blob(path) })),
  };
  writeFileSync(new URL(destination, root), JSON.stringify(report, null, 2) + '\n');
  console.log(`Saved ${destination}; ${paths.length} source/evidence hashes. Release remains unproven.`);
}
