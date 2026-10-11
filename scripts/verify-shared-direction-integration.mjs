import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// A bounded, unreleased checkpoint, not a release or parity certificate.
// Never overwrite historical evidence by rebinding old logs to newer source.
const root = new URL('../', import.meta.url);
const destination = 'artifacts/shared-direction-integration-verification-20261011.json';
const read = path => readFileSync(new URL(path, root));
const blob = path => execFileSync('git', ['hash-object', `--path=${path}`, path], { cwd: root, encoding: 'utf8' }).trim();
if (process.argv.includes('--check')) {
  const report = JSON.parse(read(destination));
  for (const item of report.hashes) assert.equal(blob(item.path), item.gitBlob, item.path);
  console.log(`Verified ${report.hashes.length} source/evidence blobs. This remains an unreleased checkpoint with explicit open boundaries.`);
} else {
  assert(!existsSync(new URL(destination, root)), 'Historical report already exists; use --check, not regeneration against later source.');
  const logs = [
    'artifacts/shared-direction-private-focused-20261011.log',
    'artifacts/shared-direction-full-confirm-20261011.log',
    'artifacts/shared-direction-api-confirm-20261011.log',
    ...['test-headless', 'test-package', 'test-budget', 'typecheck'].map(name => `artifacts/shared-direction-confirm-${name}-20261011.log`),
    'artifacts/shared-direction-native-confirm-20261011.log',
    'artifacts/shared-direction-nested-cold-confirm-20261011.log',
    'artifacts/shared-direction-cold-diagnostic-20261011.log',
    'artifacts/shared-direction-webkit-independent-20261011.jsonl',
  ];
  assert.match(read(logs[0]).toString(), /Tests\s+158 passed/);
  assert.match(read(logs[1]).toString(), /Tests\s+2963 passed \(2963\)/);
  assert.match(read(logs[1]).toString(), /Test Files\s+220 passed \(220\)/);
  assert.match(read(logs[2]).toString(), /411 declaration files/);
  assert.match(read(logs[3]).toString(), /103 modules/);
  assert.match(read(logs[4]).toString(), /package exports loaded successfully/);
  assert.match(read(logs[5]).toString(), /Build budget failed/);
  assert.match(read(logs[6]).toString(), /0 errors and 0 warnings/);
  assert.match(read(logs[7]).toString(), /3 failed[\s\S]*15 passed/);
  assert.match(read(logs[8]).toString(), /12 passed/);
  assert(!/optimized dependencies changed\. reloading/.test(read(logs[8]).toString()), 'Cold confirmation still reloads.');
  assert.match(read(logs[9]).toString(), /new dependencies found: docx-preview, fflate, entities\/decode/);
  execFileSync('git', ['diff', '--exit-code', '--', 'tests/manual/nested-direction-real.spec.ts', 'api-surface.json'], { cwd: root });
  const diagnostic = read(logs[10]).toString().split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  assert.equal(diagnostic.length, 12);
  assert(diagnostic.filter(row => row.formats === 'native-default').every(row => row.transferred));
  assert(diagnostic.filter(row => row.formats !== 'native-default').every(row => !row.transferred));

  const tracked = execFileSync('git', ['diff', '--name-only', '--', 'src', 'vite.config.ts', 'vite.input-audit.config.ts', 'playwright.config.ts', 'scripts/generate-bidi-strong.mjs', 'tests/first-strong-direction.test.ts', 'tests/browser/editor.spec.ts', 'docs/HTML_CONTAINERS.md', 'docs/ROADMAP.md', 'docs/TIPTAP_PARITY.md', 'CHANGELOG.md'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
  const source = [...tracked, 'src/core/first-strong-direction.ts', 'src/core/shared-direction.ts', 'src/view/shared-direction.ts',
    'tests/shared-direction-ownership.test.ts', 'tests/shared-direction-view.test.ts',
    'tests/manual/nested-direction-real.spec.ts', 'tests/manual/shared-direction-copy-real.spec.ts',
    'playwright.shared-direction-audit.config.ts', 'scripts/verify-shared-direction-integration.mjs', 'api-surface.json'];
  const nativeRoot = 'artifacts/shared-direction-nested-cold-confirm-20261011';
  const reviewedPNGs = ['chromium', 'firefox', 'webkit'].flatMap(engine => [
    `${nativeRoot}/nested-direction-real-nested-lift-auto-${engine}/nested-toolbar-transformed.png`,
    `${nativeRoot}/nested-direction-real-indent-under-fixed-item-${engine}/nested-anchor-edited.png`,
  ]);
  const observations = ['chromium', 'firefox', 'webkit'].flatMap(engine => ['nested-lift-auto', 'nested-lift-fixed-control', 'indent-under-fixed-item', 'indent-same-context-control'].map(name => `${nativeRoot}/nested-direction-real-${name}-${engine}/nested-direction-observations.json`));
  const paths = [...new Set([...source, ...logs, ...reviewedPNGs, ...observations])];
  const report = {
    date: '2026-10-11', baseSource: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    scope: 'Unreleased shared-auto integration; bounded local verification, not full editor parity or production readiness',
    fullUnits: { passed: 2963, files: 220, runtimeSourceFrozenDuringRun: true },
    focused: { passed: 158, files: 10 },
    gates: { apiDeclarations: 411, apiSnapshotUnchanged: true, headlessModules: 103, package: 'passed', frameworkTypes: 'passed', aggregateSize: 'FAILED; existing caps unchanged' },
    browser: { originalConfirmation: { passed: 15, failed: 3 }, coldDirectionConfirmation: { passed: 12, retries: 0, unchangedAssertions: true },
      clipboard: 'Four complete/partial Chromium/Firefox journeys pass in the original confirmation. Two Windows WebKit journeys remain failed.',
      coldFix: 'Trace pins late docx-preview/fflate/entities-decode optimization; explicit preloading prevents the confirmed cold reload.',
      reviewedPNGs, videos: 'Recorded locally, not watched' },
    independentWebKit: { nativeDefaultTransfers: 4, eventAuthoredDeliveryFailures: 8, conclusion: 'Reproduced without Fountain; not a passing Fountain or real Safari certification' },
    open: ['Aggregate runtime size overrun', 'Incremental huge-document shared-group resolution', 'Windows WebKit event-authored clipboard and actual Safari evidence', 'Custom renderer isolation', 'Ancestor-only context on node-selected descendant copies', 'Unsupported formats', 'Current-source full Linux/release matrix'],
    unchanged: ['npm 0.4.0-beta.2', 'PROD-04 Partial', 'Parity ledger', 'Public API snapshot', 'Nested direction source/assertions/timeouts', 'Performance/heap and build-size ceilings'],
    hashes: paths.map(path => ({ path, sha256: createHash('sha256').update(read(path)).digest('hex'), gitBlob: blob(path) })),
  };
  writeFileSync(new URL(destination, root), JSON.stringify(report, null, 2) + '\n');
  console.log(`Saved ${destination}; ${paths.length} source/evidence hashes. Release remains unproven.`);
}
