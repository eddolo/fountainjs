import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Classify the existing neutral-comparator output; this does not alter its
// projection, required matches, source-retention checks or runtime parser.
const path = 'artifacts/commonmark-current-gaps-20261102.log';
const log = readFileSync(path, 'utf8');
const baseline = JSON.parse(readFileSync('tests/fixtures/markdown/commonmark-semantic-baseline-v1.json', 'utf8'));
const expand = ranges => ranges.split(',').flatMap(range => {
  const [from, to = from] = range.split('-').map(Number);
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
});
const intentional = new Set(baseline.intentionalDivergences.flatMap(item => expand(item.exampleRanges)));
const records = log.split(/\r?\n/).flatMap(line => {
  try { return [JSON.parse(line).documentFlow]; } catch { return []; }
}).filter(record => record?.preserveComments && record.preserveFlow && !record.matched);
const remaining = [...new Map(records.map(record => [record.number, record])).values()];
assert.equal(remaining.length, 39);
assert.equal(remaining.filter(record => intentional.has(record.number)).length, 17);
const groups = [
  { name: 'Inline wrapper identity and placeholder anchors', examples: [150, 163, 201, 491, 524, 536, 613, 614, 615, 616, 617],
    next: 'Define safe schema representation for unknown inline wrappers and anchors without href; preserve their data and distinguish them from links. Reuse existing inert adapters where applicable.' },
  { name: 'Raw-text and active-element adapters', examples: [170, 171, 172, 173, 176, 178],
    next: 'Integrate inert raw-source adapters with whole-document flow. Source must stay non-executable; display/source retention and reference rendering remain distinct contracts.' },
  { name: 'Unfinished HTML tags', examples: [156, 157, 158],
    next: 'Preserve the currently retained source while specifying a browser-equivalent reader projection for tokens a browser discards. Do not remove source to improve the score.' },
  { name: 'Document declaration', examples: [181],
    next: 'Define portable doctype/declaration metadata and an explicit document-vs-fragment export contract.' },
  { name: 'Literal HTML link destination', examples: [631],
    next: 'Audit the rejected raw backslash destination and its browser navigation meaning before proposing a safe retention policy.' },
];
const pending = remaining.filter(record => !intentional.has(record.number)).map(record => record.number).sort((a, b) => a - b);
assert.deepEqual(groups.flatMap(group => group.examples).sort((a, b) => a - b), pending);
assert(records.every(record => records.some(other => other.number === record.number && other.ending !== record.ending)));
const report = { date: '2026-11-02', commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  command: 'node scripts/check-markdown-conformance.mjs --report --show-mismatches --document-flow-report',
  log: { path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') },
  default: { matched: 563, pending: 72, intentional: 17, total: 652 },
  strongestExistingProfile: { matched: 613, pending: 22, intentional: 17, total: 652,
    adapters: ['HTMLContainerExtension', 'HTMLCommentExtension', 'HTMLFlowExtension'], exactSourceChecks: 1304 },
  note: 'Existing parser and comparator unchanged. Optional profile counts do not promote the default baseline or prove full CommonMark conformance.',
  groups,
  pendingCases: remaining.filter(record => !intentional.has(record.number)).map(record => ({ number: record.number,
    source: record.source, issueCodes: [...new Set(record.issues.map(issue => issue.code))],
    fallbacks: [...new Set(record.fallbacks.map(issue => issue.message))] })),
};
writeFileSync('artifacts/commonmark-remaining-plan-20261102.json', JSON.stringify(report, null, 2) + '\n');
console.log('Classified 22 remaining optional-profile gaps in five groups; 17 intentional differences kept separate. No baseline changed.');
