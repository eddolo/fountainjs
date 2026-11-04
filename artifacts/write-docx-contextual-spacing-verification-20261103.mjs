import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const output = 'artifacts/docx-contextual-spacing-verification-20261103.json';
const digest = value => createHash('sha256').update(value).digest('hex');
const paths = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], { encoding: 'utf8' })
  .split('\0').filter(path => path && path !== output);
const stagedSHA256 = Object.fromEntries(paths.map(path => [path,
  digest(execFileSync('git', ['show', `:${path}`], { maxBuffer: 16 * 1024 * 1024 }))]));
const browsers = Object.fromEntries(['chromium', 'firefox', 'webkit'].map(engine => {
  const root = `artifacts/docx-contextual-spacing-real-20261103/${engine}`;
  const observations = JSON.parse(readFileSync(`${root}/observations.json`));
  return [engine, { observations,
    manuallyReviewed: ['located-warning.png', 'reopened.png'].map(name => ({ path: `${root}/${name}`,
      sha256: digest(readFileSync(`${root}/${name}`)) })) }];
}));
const report = {
  previousCheckpoint: 'f9546582b3177e71207ed748da5095171b06b2fa',
  status: 'private Word declaration/cascade and precise loss-report checkpoint; contextual layout is not fixed; unmerged/unpublished',
  scope: 'Strict contextual-spacing on/off parsing, absolute cascade overrides and effective located unsupported-behavior reports.',
  sourceSHA256: digest(readFileSync('tests/fixtures/native-docx/cooling-report.docx')),
  checks: { focusedDOCX: { tests: 489, files: 32, newContracts: 21, exit: 0 }, build: 0,
    api: { exit: 0, declarations: 417, snapshotChanged: false }, types: { initialExit: 1, finalExit: 0 },
    builtPackageEntries: 0, headless: { exit: 0, modules: 117 },
    recordedBrowser: { exit: 0, journeys: 3, workers: 1, headless: true },
    size: { exit: 1, failedCeilings: 7, limitsChanged: false } },
  comparison: JSON.parse(readFileSync('artifacts/docx-contextual-spacing-model-comparison-20261103.json')),
  auditCorrections: [
    'Initial test setup used an incorrect XML helper import and schema export; corrected before the valid 21-case baseline.',
    'The first retained-source expectation omitted its Title style; independent source XML identifies paths 0, 5, 6 and 7.',
    'The invalid-programmatic-input test needed an explicit unknown cast for the TypeScript check; production behavior was unchanged.',
    'Comparing separate real-time exports first failed on creation/modification timestamps. Both implementations now receive the same clock input; no output normalization or byte assertion was removed.',
    'The minimal-core comparison was extended to the full lab schema and its unchanged host math adapter before claiming full-document/native-part equality.',
  ],
  browsers,
  remaining: [
    'Portable opaque paragraph spacing-group identity and retained contextual intent.',
    'DOM-free adjacent-flow gap resolution, including the official 10/12 -> 2 pt example.',
    'Live browser/virtualized reuse, HTML and native projection recomputation after structural and remote edits.',
    'Native visual proof of the actual spacing fix, broader list behavior and current size failures.',
  ],
  stagedSHA256,
};
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(`Bound ${paths.length} staged source/evidence files; six warning/reopen captures manually reviewed.`);
