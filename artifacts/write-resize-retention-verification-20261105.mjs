import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const json = p => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const text = p => readFileSync(p, 'utf8');
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const baseCommit = '252509009058fb974a7d9b8fb2c1d84632cd6923';
const checks = json('artifacts/resize-retention-checks-20261105.json');
assert.equal(checks.length, 8);
for (const check of checks) assert.equal(check.exitCode, check.id === 'size' ? 1 : 0, check.id);
assert.match(text('artifacts/resize-retention-unit-verified-20261105.log'), /4061 passed/);
assert.match(text('artifacts/resize-retention-unit-verified-20261105.log'), /276 passed/);
assert.match(text('artifacts/native-resize-semantic-browser-20261105.log'), /3 passed/);
assert.match(text('artifacts/resize-retention-recovery-browser-20261105.log'), /63 passed/);
assert.match(text('artifacts/resize-retention-regression-browser-20261105.log'), /27 passed/);
const sources = ['src/core/table-commands.ts', 'src/extensions/nodes/table-cell-view.ts', 'src/view/selection-handler.ts'];
const mappedSources = [];
for (const file of readdirSync('dist').filter(p => /\.(?:js|cjs)\.map$/.test(p))) {
  const map = json(join('dist', file));
  for (const source of sources) for (let i = 0; i < map.sources.length; i++) {
    if (!map.sources[i].replaceAll('\\', '/').endsWith('/' + source)) continue;
    assert.equal(map.sourcesContent[i].replace(/\r\n/g, '\n'), text(source).replace(/\r\n/g, '\n'), `${file}: ${source}`);
    mappedSources.push({ file: `dist/${file}`, source, sha256: hash(source) });
  }
}
assert.equal(mappedSources.length, 6);
assert.equal(execFileSync('git', ['diff', baseCommit, '--', 'package.json', 'pnpm-lock.yaml', 'scripts/check-build-budgets.mjs',
  'tests/browser/editor.spec.ts', 'tests/browser/mobile.spec.ts'], { encoding: 'utf8' }).trim(), '');
const packed = json('artifacts/resize-retention-packed-node-20261105.json');
assert.equal(packed.exitCode, 0); assert.equal(packed.proof.cases, 24); assert.ok(packed.allBuildFilesMatch > 800);
const visual = json('artifacts/resize-retention-visual-review-20261105.json');
assert.equal(visual.stageCaptures.length, 6); assert.equal(visual.stageContactsReviewed, true);
assert.equal(visual.sampledVideoContactsReviewed, true);
const sizes = json('artifacts/resize-retention-loaded-size-20261105.json');
const beforeSizes = json('artifacts/native-focus-loaded-size-20261105.json');
const loadedSize = ['.', './core', './react', './docx', './yjs', './html/server'].map(entry => {
  const after = sizes.entries.find(e => e.entry === entry), before = beforeSizes.entries.find(e => e.entry === entry);
  return { entry, beforeRaw: before.closureRawBytes, afterRaw: after.closureRawBytes,
    rawDelta: after.closureRawBytes - before.closureRawBytes,
    beforeGzip: before.closureGzipBytes, afterGzip: after.closureGzipBytes, gzipDelta: after.closureGzipBytes - before.closureGzipBytes };
});
const report = { baseCommit, releaseCertified: false, acceptanceLimitsChanged: false, runtimeDependenciesChanged: false,
  browserAssertionsUnchanged: true, committedLogNormalization: 'Line endings and trailing whitespace only; result content retained',
  unit: { passed: 4061, files: 276, addedSinceBase: 9 },
  browser: { previousCiRun: 42090626543, previousBrowserJob: 127467375835,
    previousRemainingMatrix: { passed: 894, failed: 3 }, repairedResizeJourneys: 3,
    earlierRecoveryCasesPassed: 63, existingPlatformSkips: 2, additionalControlCasesPassed: 27,
    completeFreshCiCertified: false, physicalMobileCertified: false },
  checks, api: json('artifacts/resize-retention-api-review-20261105.json'), mappedSources, packed, visual,
  loadedSize: { method: sizes.method, consumerTreeShakingApplied: false, runtimeSpeedMeasured: false, entries: loadedSize },
  remaining: ['Full fresh CI', 'Existing core-facade and aggregate size failures',
    'Separate unfinished structural/history work: six Yjs retention failures and an independent-deletion history failure',
    'Broader parity, conversion and physical-device coverage'] };
writeFileSync('artifacts/resize-retention-verification-20261105.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ unit: report.unit, browser: report.browser, loadedSize }));
