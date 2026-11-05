import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const json = p => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const text = p => readFileSync(p, 'utf8');
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const baseCommit = '8a9c51f650317b8598356badaa452faec6568ec7';
const checks = json('artifacts/native-focus-checks-20261105.json');
assert.equal(checks.length, 8);
for (const check of checks) assert.equal(check.exitCode, check.id === 'size' ? 1 : 0, check.id);
const unit = text('artifacts/native-focus-unit-verified-20261105.log');
assert.match(unit, /4052 passed/); assert.match(unit, /275 passed/);
assert.match(text('artifacts/native-focus-recovery-final-20261105.log'), /63 passed/);
assert.match(text('artifacts/native-focus-recovery-final-20261105.log'), /2 skipped/);
assert.match(text('artifacts/native-focus-regression-browser-20261105.log'), /27 passed/);
assert.match(text('artifacts/native-focus-highlight-visual-20261105.log'), /3 passed/);
const sources = ['src/view/selection-handler.ts', 'src/view/view.ts'];
const normalized = value => value.replace(/\r\n/g, '\n');
const maps = readdirSync('dist').filter(p => /^view-.*\.(?:js|cjs)\.map$/.test(p));
const mappedSources = [];
for (const file of maps) {
  const map = json(join('dist', file));
  for (const source of sources) {
    const index = map.sources.findIndex(s => s.replaceAll('\\', '/').endsWith('/' + source));
    assert.notEqual(index, -1, `${file}: ${source}`);
    assert.equal(normalized(map.sourcesContent[index]), normalized(text(source)), `${file}: ${source} build provenance`);
    mappedSources.push({ map: `dist/${file}`, source, sha256: hash(source) });
  }
}
assert.equal(mappedSources.length, 4);
assert.equal(execFileSync('git', ['diff', baseCommit, '--', 'package.json', 'pnpm-lock.yaml', 'scripts/check-build-budgets.mjs',
  'tests/browser/editor.spec.ts', 'tests/browser/mobile.spec.ts'], { encoding: 'utf8' }).trim(), '');
const packed = json('artifacts/native-focus-packed-node-20261105.json');
assert.equal(packed.exitCode, 0); assert.ok(packed.allBuildFilesMatch > 800);
const visual = json('artifacts/native-focus-visual-review-20261105.json');
assert.equal(visual.stageCaptures.length, 48);
assert.equal(visual.stageContactsReviewed, true);
assert.equal(visual.sampledVideoContactsReviewed, true);
const loaded = json('artifacts/native-focus-loaded-size-20261105.json');
const previous = json('artifacts/structural-formatting-loaded-size-20261105.json');
const entries = ['.', './core', './react', './docx', './yjs', './html/server'];
const sizes = entries.map(entry => {
  const after = loaded.entries.find(e => e.entry === entry), before = previous.entries.find(e => e.entry === entry);
  assert.ok(before && after, entry);
  return { entry, beforeRaw: before.closureRawBytes, afterRaw: after.closureRawBytes,
    rawDelta: after.closureRawBytes - before.closureRawBytes,
    beforeGzip: before.closureGzipBytes, afterGzip: after.closureGzipBytes,
    gzipDelta: after.closureGzipBytes - before.closureGzipBytes };
});
const report = { baseCommit, releaseCertified: false, acceptanceLimitsChanged: false, runtimeDependenciesChanged: false,
  committedLogNormalization: 'Line endings and trailing whitespace only; result content retained',
  browserAssertionsUnchanged: true, unit: { passed: 4052, files: 275, added: 7 },
  browser: { previousCiRun: 41972730191, previousCiFailures: 63, recoveryPassed: 63, existingSkips: 2,
    additionalRegressionsPassed: 27, visualHighlightJourneysPassed: 3,
    completeFreshCiCertified: false, physicalMobileCertified: false },
  checks, api: json('artifacts/native-focus-api-review-20261105.json'), mappedSources, packed,
  loadedSize: { method: loaded.method, consumerTreeShakingApplied: false, runtimeSpeedMeasured: false, sizes },
  visual,
  remaining: ['Complete fresh CI', 'Existing core-facade and aggregate size failures',
    'Offline text retention during quote/list reparenting (separate unfinished worktree)',
    'General structural command/open-slice coverage', 'Physical mobile', 'Broader parity roadmap'] };
writeFileSync('artifacts/native-focus-verification-20261105.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ unit: report.unit, browser: report.browser, sizes }));
