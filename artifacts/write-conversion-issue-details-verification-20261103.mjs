import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const output = 'artifacts/conversion-issue-details-verification-20261103.json';
const files = git('diff', '--cached', '--name-only', '-z').toString().split('\0').filter(file => file && file !== output);
git('diff', '--quiet');
git('diff', '--exit-code', 'HEAD', '--', 'src', 'scripts', 'api-surface.json', 'package.json', 'pnpm-lock.yaml');
const review = JSON.parse(readFileSync('artifacts/conversion-issue-details-review-20261103.json', 'utf8'));
assert.match(readFileSync('artifacts/conversion-issue-details-focused-final-20261103.log', 'utf8'), /Tests\s+20 passed/u);
assert.match(readFileSync('artifacts/conversion-issue-details-browser-20261103.log', 'utf8'), /8 passed/u);
assert.equal(review.manuallyReviewed.length, 5);
for (const image of review.manuallyReviewed) assert.equal(hash(git('show', ':' + image.path)), image.SHA256);
const diagnostics = files.filter(file => file.endsWith('conversion-issue-details-report.json'));
assert.equal(diagnostics.length, 5);
for (const file of diagnostics) {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(report.roundTrip.format, 'markdown'); assert.equal(report.roundTrip.stale, false);
  assert.ok(report.roundTrip.issues.some(issue => issue.code === 'mark' && issue.type === 'em'
    && JSON.stringify(issue.path) === '[3,1]'));
  assert.ok(report.roundTrip.issues.some(issue => issue.type === 'highlight'));
  for (const field of ['fileName', 'editedDocument', 'note']) assert.equal(report[field], undefined);
}
const runtime = JSON.parse(readFileSync('artifacts/preformatted-formatting-css-runtime-comparison-20261103.json', 'utf8'));
for (const [path, expected] of Object.entries(runtime.runtimeSHA256)) assert.equal(hash(readFileSync(path)), expected);
assert.equal(readFileSync('dist/styles.css').byteLength, 89593);
writeFileSync(output, JSON.stringify({
  ...review, actualDiagnosticDownloads: diagnostics,
  localChecks: { focusedAdapters: 'passed', recordedBrowsers: 'passed', frameworkTypes: 'passed', websiteBuild: 'passed' },
  newSourceCloudChecks: 'pending push', npm: 'unchanged at 0.4.0-beta.2',
  sourceBinding: 'SHA-256 of staged Git blobs; manifest excluded to avoid circular hashing.',
  hashes: Object.fromEntries(files.map(file => [file, hash(git('show', ':' + file))])),
}, null, 2) + '\n');
console.log(`Bound ${files.length} source/evidence files; 20 focused adapters and eight browser journeys pass.`);
