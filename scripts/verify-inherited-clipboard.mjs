import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const destination = 'artifacts/inherited-clipboard-verification-20261102.json';
const read = path => readFileSync(new URL(path, root));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const blob = path => git(['hash-object', `--path=${path}`, path]);
if (process.argv.includes('--check')) {
  const report = JSON.parse(read(destination));
  for (const item of report.hashes) assert.equal(blob(item.path), item.gitBlob, item.path);
  console.log(`Verified ${report.hashes.length} clipboard checkpoint blobs; not a release certificate.`);
} else {
  assert(!existsSync(new URL(destination, root)), 'Preserve the historical checkpoint; do not rebind it.');
  assert.equal(git(['diff', '7ad224a', '--', 'package.json', 'pnpm-lock.yaml', 'api-surface.json']), '');
  const logs = [
    'shared-direction-child-copy-red', 'shared-direction-child-copy-red-20261102.stderr',
    'shared-direction-child-copy-focused', 'inherited-clipboard-native', 'inherited-clipboard-budget',
    'inherited-clipboard-units', 'inherited-clipboard-index-reuse', 'inherited-clipboard-build-confirm',
    'inherited-clipboard-budget-reuse', 'inherited-clipboard-budget-reviewed', 'inherited-clipboard-api-confirm',
    'inherited-clipboard-headless-confirm', 'inherited-clipboard-types-final', 'inherited-clipboard-registration',
    'inherited-clipboard-package-final', 'inherited-clipboard-performance', 'inherited-clipboard-performance-confirm',
    'inherited-clipboard-retention', 'inherited-clipboard-units-final', 'inherited-clipboard-package-contract',
  ].map(name => `artifacts/${name.endsWith('.stderr') ? name : `${name}-20261102`}.log`);
  const log = name => read(`artifacts/${name}-20261102.log`).toString();
  assert.match(log('shared-direction-child-copy-red'), /2 failed.*8 passed/s);
  assert.match(log('inherited-clipboard-index-reuse'), /79 passed/);
  assert.match(log('inherited-clipboard-units-final'), /222 passed[\s\S]*2988 passed/);
  assert.match(log('inherited-clipboard-package-final'), /4 passed/);
  assert.match(log('inherited-clipboard-budget'), /exceeds its budget/);
  assert.match(log('inherited-clipboard-budget-reuse'), /exceeds its budget/);
  assert(!/Error:|failed/i.test(log('inherited-clipboard-budget-reviewed')));
  assert.match(log('inherited-clipboard-api-confirm'), /411 declaration files/);
  assert.match(log('inherited-clipboard-headless-confirm'), /104 modules/);
  assert.match(log('inherited-clipboard-types-final'), /0 errors and 0 warnings/);
  assert.match(log('inherited-clipboard-registration'), /Total: 12 tests in 2 files/);
  assert.match(log('inherited-clipboard-performance'), /100-block server HTML p95 36\.39 ms exceeds 35 ms/);
  assert(!/Error:|failed/i.test(log('inherited-clipboard-performance-confirm')));
  assert.match(log('inherited-clipboard-package-contract'), /package exports loaded successfully/);
  const retention = JSON.parse(log('inherited-clipboard-retention'));
  assert(retention.liveGrowthBytes < retention.liveLimitBytes && retention.destroyedGrowthBytes < retention.destroyedLimitBytes);
  const nativeRoot = 'artifacts/inherited-clipboard-package-final-20261102';
  const folders = readdirSync(new URL(nativeRoot, root)).filter(name => name.startsWith('inherited-clipboard-real-'));
  assert.equal(folders.length, 4);
  const observations = folders.map(folder => `${nativeRoot}/${folder}/inherited-clipboard-observations.json`);
  for (const path of observations) {
    const observation = JSON.parse(read(path));
    assert.equal(observation.delivered.trusted, true);
    assert.equal(observation.delivered.text, 'English child');
    assert(!observation.delivered.html.includes('שלום anchor'));
    assert.deepEqual(observation.errors, []);
    assert.deepEqual(observation.pasted.source, observation.before.source);
    assert.equal(observation.pasted.target.content[0].attrs.dir, 'rtl');
  }
  const screenshots = folders.flatMap(folder => ['independent-pasted-child.png', 'fountain-pasted-child.png'].map(file => `${nativeRoot}/${folder}/${file}`));
  const source = [...git(['diff', '--name-only']).split(/\r?\n/), ...git(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/)].filter(Boolean);
  const paths = [...new Set([...source, ...logs, ...observations, ...screenshots, 'scripts/check-performance-budgets.mjs'])];
  const report = { date: '2026-11-02', baseCommit: git(['rev-parse', 'HEAD']),
    scope: 'Whole-node model-owned inherited direction in clipboard; not universal clipboard parity or release certification',
    units: { passed: 2988, files: 222, focusedPassed: 79, focusedFiles: 5 },
    native: { passed: 4, retries: 0, engines: ['chromium', 'firefox'], fixture: 'Public API host consuming built package',
      actions: ['copy', 'cut'], destinations: ['Independent native contenteditable', 'Fountain'], screenshotsReviewed: screenshots,
      videos: 'Recorded, not watched', linuxClipboardCasesRegistered: 12, linuxCurrentSource: 'Not yet certified' },
    size: { measuredKiB: { esm: 1615.65234375, cjs: 1344.2255859375 }, reviewedAggregateCapsKiB: { esm: 1616, cjs: 1344.5 },
      decision: 'Explicit capacity for the verified correction, not a size optimization; entry/CSS/performance/heap limits unchanged' },
    performance: { first: '100-block server HTML p95 36.39 ms exceeds unchanged 35 ms ceiling',
      unchangedConfirmation: 'Passed', note: 'Both retained; not a claim of consistent latency or proof of the variance cause', retention },
    gates: { apiDeclarations: 411, headlessModules: 104, types: 'passed', package: 'passed' },
    open: ['Linux current-source full matrix', 'Actual Safari and Windows WebKit event-authored clipboard', 'Custom renderer isolation',
      'Restricted-schema native fallback fidelity', 'External Word/Google Docs', 'Performance variance', 'Remaining parity roadmap'],
    unchanged: ['npm 0.4.0-beta.2', 'PROD-04 Partial', 'Public API snapshot', 'Dependencies'],
    hashes: paths.map(path => ({ path, sha256: createHash('sha256').update(read(path)).digest('hex'), gitBlob: blob(path) })),
  };
  writeFileSync(new URL(destination, root), JSON.stringify(report, null, 2) + '\n');
  console.log(`Saved ${destination}; ${paths.length} source/evidence hashes. Release remains unproven.`);
}
