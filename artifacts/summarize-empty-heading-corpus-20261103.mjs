import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';

const previousPath = 'artifacts/html-emphasis-depth-corpus-frozen-20261103.json';
const currentPath = 'artifacts/empty-heading-complete-corpus-20261103.json';
const previous = JSON.parse(readFileSync(previousPath, 'utf8'));
const current = JSON.parse(readFileSync(currentPath, 'utf8'));
const examples = createRequire(import.meta.url)('commonmark-spec').tests;
const rows = report => (report.records ?? report.cases).filter(row => row.ending === '\n');
const previousDifferences = rows(previous).filter(row => !row.safeHTMLMatch).map(row => row.number);
const differences = rows(current).filter(row => !row.safeHTMLMatch).map(row => row.number);
assert.equal(current.projectionVersion, previous.projectionVersion);
assert.equal(current.matching, 635);
assert.equal(current.safeHTMLMatches, 1288);
assert.deepEqual(previousDifferences.filter(number => !differences.includes(number)), [79]);
assert.deepEqual(differences.filter(number => !previousDifferences.includes(number)), []);
assert.deepEqual(current.matchingExamples, previous.matchingExamples);
assert.deepEqual(rows(current).filter(row => !row.matched).map(row => row.number),
  [207, 218, 239, 240, 280, 281, 282, 283, 284, 315, 596, 598, 599, 601, 608, 611, 612]);
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const summary = {
  date: '2026-11-03', command: 'node scripts/check-markdown-conformance.mjs --complete-source-report=artifacts/empty-heading-complete-corpus-20261103.json',
  projectionVersion: current.projectionVersion, bodyMatches: current.matching, bodyTotal: current.total,
  exactUntouchedMarkdown: current.sourceChecks, exactNativeJSON: current.jsonChecks,
  sourceCaptureBodyMatches: current.capturedMatchingExamples.length,
  sourceCaptureFrontmatterDivergences: current.sourceCaptureFrontmatterDivergences,
  safeHTMLNativeMatches: current.safeHTMLMatches, safeHTMLNativeTotal: current.safeHTMLTotal,
  previousSafeHTMLNativeMatches: previous.safeHTMLMatches, repairedExample: 79,
  sourceModelStatuses: current.modelStatuses,
  unchangedBodyPolicies: {
    editableCaretHosts: [207, 218, 239, 240, 280, 281, 282, 283, 284, 315],
    URIRestrictions: [596, 598, 599, 601],
    defaultGFMLiteralAutolinks: [608, 611, 612],
    note: 'These remain differences from the reference. Existing autolinkLiterals:false is a separate import choice, not a certified full CommonMark mode.',
  },
  remainingSafeHTMLNativeDifferences: rows(current).filter(row => !row.safeHTMLMatch).map(row => ({
    number: row.number, markdown: examples.find(example => example.number === row.number).markdown,
    differences: row.safeHTMLDifferences,
    classification: [187, 494].includes(row.number) ? 'adjacent equal-mark text-leaf merging' : 'declared plain-code projection',
  })),
  SHA256: { previousFullReport: digest(previousPath), currentFullReport: digest(currentPath) },
  limitations: 'Native model retention, body semantic agreement, exact source retention and visual fidelity are separate contracts. No reference AST is imposed on Fountain.',
};
writeFileSync('artifacts/empty-heading-corpus-summary-20261103.json', JSON.stringify(summary, null, 2) + '\n');
console.log(`Safe HTML native retention: ${current.safeHTMLMatches}/${current.safeHTMLTotal}; body profile unchanged ${current.matching}/652; eight native-shape cases remain.`);
