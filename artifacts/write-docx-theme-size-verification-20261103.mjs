import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync } from 'node:fs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { maxBuffer: 32 * 1024 * 1024 });
const json = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, ''));
const output = 'artifacts/docx-theme-size-verification-20261103.json';
const checks = json('artifacts/docx-theme-size-checks-20261103.json');
assert.ok(Object.values(checks).every(value => value === 0));
const measured = json('artifacts/docx-theme-size-measurements-20261103.json');
assert.deepEqual(measured, { docxESM: 188544, docxCJS: 152355, allESM: 1691186, allCJS: 1407669, css: 89593 });
assert.equal(statSync('dist/docx.js').size, measured.docxESM);
assert.equal(statSync('dist/docx.cjs').size, measured.docxCJS);
assert.equal(git('diff', '5de6472', '--', 'scripts/check-build-budgets.mjs').length, 0);
const comparison = json('artifacts/docx-theme-size-output-comparison-20261103.json');
assert.equal(comparison.results.length, 3);
const reviewed = comparison.results.flatMap(result => result.captures);
assert.equal(reviewed.length, 6);
const files = git('diff', '--cached', '--name-only', '-z').toString().split('\0').filter(path => path && path !== output);
const hashes = Object.fromEntries(files.map(path => [path, sha(git('show', ':' + path))]));
writeFileSync(output, JSON.stringify({
  baseMaster: '5de64720a4ce8f76b5a8786341130f11a355b304',
  precedingAudit: '5b3ed59',
  scope: 'Merge the verified declared-theme-language repair with current workflow fixes and fit it inside existing capacity by sharing internal namespace/attribute readers.',
  verified: { checks, focusedDOCXTests: 438, fullUnitTests: 3413, files: 241,
    browserJourneys: 3, browserWorkflow: 'Real source upload, typing, undo/redo, actual DOCX download, reopen and preserved assets/equations',
    manuallyReviewedCaptures: reviewed, nativeRenderInputComparison: '18 parts per downloaded package; rendering XML/assets byte-identical to independently rendered audit export; core metadata differs only by timestamps',
    nativeReferenceRun: 41720509194, freshNativeRun: false,
    runtimeScope: json('artifacts/docx-theme-size-runtime-scope-20261103.json'),
    priorBroadCloudGate: json('artifacts/e8953e9-cloud-browser-result-20261103.json'),
    commandCorrection: 'Initial headless check referenced a nonexistent script; the actual package headless command then passed. No product failure was hidden.' },
  sizesBytes: measured,
  deltaFromPrecedingMasterBytes: { ESM: -68, CJS: -108 },
  limitsChanged: false,
  capacityProposal: 'Historical unapplied patch superseded; no further allowance needed.',
  remaining: ['List indentation and spacing', 'Header placement', 'Source-footnote renderer discrepancy', 'Full current-source cloud gate before release', 'Broader FORMAT-05 and parity programme'],
  limitations: ['No complete JSON round-trip equality or pixel/native Word certification', 'Desktop emulation, not physical-device certification', 'Native comparison is input equality with a previous independent rendering, not a new rendering'],
  stagedSourceAndEvidenceSHA256: hashes,
}, null, 2) + '\n');
console.log(`Bound ${files.length} staged source/evidence files and six inspected captures.`);
