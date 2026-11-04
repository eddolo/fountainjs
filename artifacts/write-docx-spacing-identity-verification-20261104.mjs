import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const output = 'artifacts/docx-spacing-identity-verification-20261104.json';
const digest = value => createHash('sha256').update(value).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const git = args => execFileSync('git', args, { maxBuffer: 16 * 1024 * 1024 });
const paths = git(['diff', '--cached', '--no-renames', '--diff-filter=ACMT', '--name-only', '-z'])
  .toString('utf8').split('\0').filter(path => path && path !== output);
const deleted = git(['diff', '--cached', '--no-renames', '--diff-filter=D', '--name-only', '-z'])
  .toString('utf8').split('\0').filter(Boolean);
const stagedSHA256 = Object.fromEntries(paths.map(path => [path, digest(git(['show', `:${path}`]))]));
const deletedSourceSHA256 = Object.fromEntries(deleted.map(path => [path, digest(git(['show', `HEAD:${path}`]))]));
const initial = read('artifacts/docx-spacing-identity-final-checks-20261104.json');
const final = read('artifacts/docx-spacing-identity-verified-checks-20261104.json');
assert.equal(initial.fullUnit, 0); assert.equal(initial.build, 0); assert.equal(initial.package, 0);
assert.equal(initial.comparison, 0); assert.equal(initial.api, 0); assert.equal(initial.headless, 0);
assert.deepEqual(final, { browser: 0, interop: 0, types: 0 });
assert.match(readFileSync('artifacts/docx-spacing-identity-full-unit-20261104.log', 'utf8'), /Tests\s+3532 passed/);
const budget = git(['show', 'HEAD:scripts/check-build-budgets.mjs']);
assert.equal(readFileSync('scripts/check-build-budgets.mjs', 'utf8').replace(/\r\n/g, '\n'), budget.toString('utf8'));
const captures = read('artifacts/docx-spacing-identity-capture-comparison-20261104.json');
for (const value of Object.values(captures.observations)) {
  assert.equal(value.readerImages.length, 3);
  assert.ok(value.readerImages.every(image => image.width > 0 && image.height > 0));
  assert.equal(value.nativeExportRuleRetained, false);
}
const report = {
  previousCheckpoint: 'ec2f4a2b6a52907e2af56fead11a7574cfc46617',
  status: 'unmerged/unpublished Word-import spacing checkpoint; native export, visual marker defect, size and prior timing acceptance remain open',
  scope: 'Exact/default style identities join portable contextual gaps; rules retain declarations, omitted/off neighbours and explicit unsupported-flow diagnostics.',
  checks: { fullUnit: { exit: 0, tests: 3532, files: 250, newContracts: 23 },
    build: initial.build, frameworkTypes: final.types, packageEntries: initial.package,
    headless: { exit: initial.headless, modules: 118 }, publicAPI: { exit: initial.api, declarationFiles: 419, snapshotChanged: false },
    interoperability: final.interop, fullDocumentComparison: initial.comparison,
    recordedBrowsers: { exit: final.browser, journeys: 3, workers: 1, headless: true },
    packedConsumer: { exit: 0, variants: ['ESM root', 'ESM core', 'CommonJS root', 'CommonJS core'], noDOM: true },
    workerd: { exit: 0, actualNativeDOCXBytes: true, noDOM: true, beforeGapPt: 2, afterEditGapPt: 12, retainedOff: false, explicitlyReportedExportLosses: 2 },
    size: { exit: initial.size, failures: 7, ceilingsChanged: false },
    performance: { priorGateStillFailed: true, rerunThisCheckpoint: false,
      reason: 'Runtime-scope comparison proves that only DOCX ESM/CommonJS changed; the prior HTML timing failure is neither cleared nor replaced.' },
  },
  nativeComparison: read('artifacts/docx-spacing-identity-full-comparison-20261104.json'),
  runtimeScope: read('artifacts/docx-spacing-identity-runtime-scope-20261104.json'),
  browsers: captures.observations,
  reviewedCaptures: captures.captures.map(item => ({ path: item.path, sha256: item.sha256,
    review: item.needsFreshReview ? 'fresh final visual inspection' : 'byte-identical to previously visually inspected capture' })),
  actualTarball: captures.tarball,
  approvalReconciliation: {
    approvedHistoricalProposal: 'artifacts/docx-theme-language-capacity-proposal-20261103.patch',
    approvedCapsKiB: { docxESM: 185, docxCommonJS: 149.5, aggregateESM: 1652.5, aggregateCommonJS: 1375.5 },
    disposition: 'Unapplied: the proposal had already been superseded by optimization within the existing limits. Approval is not repurposed to the larger spacing feature.',
    supersedingRecord: 'artifacts/docx-theme-size-verification-20261103.json',
    unchangedBudgetBlobSHA256: digest(budget),
  },
  auditCorrections: [
    'Initial new test setup passed a node owned by another schema and imported the wrong HTML export API. Corrected the test setup; neither error is represented as a production fix.',
    'Projecting every Word identity initially added unrelated metadata and broke 52 old contracts. The final projection retains all members of groups with a declaration, and leaves unrelated ordinary paragraphs unchanged. No expected source fields are stripped by the comparison harness.',
    'Custom-carrier/quote and image-promotion/split cases exposed missing diagnostics; both pairs failed before repair. An unresolved explicit off declaration also failed before its reporting repair.',
    'The initial final-check invocation misspelled test:docx-interoperability, and the strengthened image audit needed runtime type narrowing. Original failed logs are retained; corrected commands/types pass.',
    'The first Firefox full-reader screenshot captured an offscreen lazy image before loading. Final journeys scroll to and verify natural dimensions for all three decoded images; the packaged PNG also has valid chunk CRCs.',
    'The historical four-unsupported-rules journey is replaced with the actual imported-rule/edit/reader/native-loss journey; the old assertions became obsolete after the import repair.',
  ],
  remaining: [
    'Native Word style/group binding and contextual-spacing output, with fresh independent native rendering proof of the actual repair.',
    'Empty numbered item has no painted number after Enter, despite a present CSS pseudo-marker declaration and advanced following counters. Preserve the screenshots/DOM diagnostic and repair this visual defect.',
    'Quote boundaries, split paragraphs, promoted images, caption flows and custom carrier limitations retain explicit diagnostics; do not claim complete contextual spacing for every Word structure.',
    'Standalone HTML currently shows math source and separate unpaginated header/footer stories, not a full native Word publication.',
    'Seven size gates and the previous server-HTML timing gate must be resolved before merge/release. No parity row or percentage is promoted.',
  ],
  deletedSourceSHA256, stagedSHA256,
};
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(`Bound ${paths.length} staged source/evidence files and ${deleted.length} superseded audit file; twelve reviewed captures; native/visual/acceptance limits remain explicit.`);
