import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { maxBuffer: 32 * 1024 * 1024 });
const sha = value => createHash('sha256').update(value).digest('hex');
const json = name => JSON.parse(readFileSync(name, 'utf8').replace(/^\uFEFF/u, ''));
const output = 'artifacts/docx-style-numbering-verification-20261103.json';
const initialChecks = json('artifacts/docx-style-numbering-checks-20261103.json');
const checks = json('artifacts/docx-style-numbering-checks-final-20261103.json');
const measuredChecks = json('artifacts/docx-style-numbering-checks-measured-20261103.json');
assert.equal(initialChecks.build, 0); assert.equal(initialChecks.size, 1);
assert.ok(Object.values(checks).every(code => code === 0));
assert.ok(Object.values(measuredChecks).every(code => code === 0));
assert.equal(git('diff', 'b1dce0e', '--', 'scripts/check-build-budgets.mjs').length, 0);
const source = json('artifacts/docx-style-numbering-source-20261103/provenance.json');
assert.equal(sha(readFileSync('artifacts/docx-style-numbering-source-20261103/runbook.docx')), source.SHA256);
const observations = ['chromium', 'firefox', 'webkit'].map(engine => ({ engine,
  ...json(`artifacts/docx-style-numbering-measured-real-20261103/${engine}/browser-observations.json`),
}));
const files = git('diff', '--cached', '--name-only', '-z').toString().split('\0').filter(path => path && path !== output);
writeFileSync(output, JSON.stringify({
  baseMaster: 'b1dce0e4c3a20f3e341de6edd3e45ab091467b06',
  status: 'in progress; not a release candidate and not merged into master',
  scope: 'Resolve Word numbering instances, style inheritance, associated levels, overrides and explicit removal before repairing list geometry.',
  verified: { newContracts: 20, initialBeforeCases: 15, initialBeforeFailures: 13,
    focusedTests: 458, focusedFiles: 30, fullUnitTests: 3433, files: 242,
    checks, measuredChecks, browserJourneys: 3,
    reviewed: json('artifacts/docx-style-numbering-visual-review-20261103.json'),
    independentInterop: json('artifacts/docx-style-numbering-independent-20261103.json'),
    initialJourneyFailure: 'Exact ending-text locator stopped matching after successful typing; corrected locator retains exact content/history assertions. Initial failure log and recordings retained.',
    publishedFontRepairNativeAudit: json('artifacts/docx-native-b1dce0e-review-20261103.json') },
  remainingGeometryObservations: observations,
  capacity: { measurements: json('artifacts/docx-style-numbering-sizes-20261103.json'),
    currentGate: 'fails four existing code-size ceilings', limitsChanged: false,
    nextDecision: 'Complete and review the geometry boundary before considering a measured capacity proposal.' },
  limitations: ['Correct numbering does not repair layout', 'No independent native rendering of the new runbook',
    'Desktop emulation only', 'Marker formats/templates and contextual spacing remain acceptance work',
    'No npm, website or parity-percentage promotion for this branch'],
  remainingContract: 'docs/DOCX_LIST_LAYOUT.md',
  stagedSourceAndEvidenceSHA256: Object.fromEntries(files.map(path => [path, sha(git('show', ':' + path))])),
}, null, 2) + '\n');
console.log(`Bound ${files.length} staged source/evidence files; capacity and geometry remain explicitly incomplete.`);
