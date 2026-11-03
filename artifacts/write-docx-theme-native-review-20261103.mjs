import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, ''));
const root = 'artifacts/docx-theme-native-evidence-20261103/';
const report = json(root + 'native-report.json');
const metadata = json('artifacts/docx-theme-native-cloud-metadata-20261103.json').artifacts[0];
const fonts = json('artifacts/docx-theme-native-font-observations-20261103.json');
assert.equal(metadata.workflow_run.head_sha, '73ad110708c5d2dcb2c7ec4f9a3d06f128a8c7c4');
assert.equal(sha(readFileSync('artifacts/native-docx-theme-language-41720509194.zip')), metadata.digest.replace('sha256:', ''));
assert.equal(sha(readFileSync(root + 'exported.docx')), report.exportedSHA256);
assert.equal(report.sourceSHA256, json('tests/fixtures/native-docx/provenance.json').sha256);
const reviewed = [];
for (const kind of ['source', 'exported']) {
  assert.equal(report.rendered[kind].pages, 2);
  assert.equal(sha(readFileSync(root + `native/${kind}/${kind}.pdf`)), report.rendered[kind].pdfSHA256);
  for (const number of [1, 2]) {
    const path = root + `native/${kind}/page-${number}.png`;
    const expected = fonts[kind][number - 1];
    assert.equal(sha(readFileSync(path)), expected.imageSHA256);
    assert.ok(expected.topHeaderBandDarkPixels > 5000);
    reviewed.push({ path, SHA256: expected.imageSHA256 });
  }
  const title = fonts[kind][0].targets.find(word => word.text === 'Cooling' && word.size === 25);
  const heading = fonts[kind][0].targets.find(word => word.text === 'Experimental');
  assert.match(title.fontname, /Carlito-Regular$/u);
  assert.equal(title.size, 25);
  assert.match(heading.fontname, /Carlito-Bold$/u);
  assert.equal(heading.size, 16);
}
assert.ok(Object.values(fonts.sourcePageImagesMatchPreviousRun).every(Boolean));
assert.match(readFileSync('artifacts/docx-theme-language-worker-final-20261103.log', 'utf8'), /Real Cloudflare workerd/u);
git('diff', '--exit-code', 'HEAD', '--', 'src', 'scripts', 'tests', 'package.json', 'pnpm-lock.yaml');

const output = 'artifacts/docx-theme-native-review-20261103.json';
const files = git('diff', '--cached', '--name-only', '-z').toString().split('\0').filter(file => file && file !== output);
writeFileSync(output, JSON.stringify({
  nativeSourceCommit: metadata.workflow_run.head_sha,
  run: 41720509194, job: 126211719668, conclusion: 'success', artifact: metadata.id,
  artifactArchiveSHA256: metadata.digest, archiveIndependentlyRehashed: true,
  sourceSHA256: report.sourceSHA256, exportedSHA256: report.exportedSHA256,
  reviewed, allNativePagesReviewed: true, sourcePagePNGsIdenticalToPreviousRun: true,
  result: 'Both native PDFs use Carlito Regular 25 pt for the title and Carlito Bold 16 pt for the setup heading.',
  remaining: ['Title final-word x position differs by 0.6 pt', 'List indentation/spacing', 'Header placement',
    'Source footnote validity/rendering discrepancy', 'Capacity approval before changing four code limits', 'Fresh broad cloud gate before npm release'],
  worker: 'Real workerd production DOCX import/export/reopen retains title paragraph/text Calibri without DOM or Node built-ins.',
  pixelFidelityCertified: false, microsoftWordCertified: false,
  capacityPatchApplied: false, npm: 'unchanged at 0.4.0-beta.2',
  sourceBinding: 'SHA-256 of staged Git blobs; this manifest excluded to avoid circular hashes. Runtime source equals native audit commit.',
  hashes: Object.fromEntries(files.map(file => [file, sha(git('show', ':' + file))])),
}, null, 2) + '\n');
console.log(`Verified all four native pages, font observations and original ZIP digest; bound ${files.length} evidence files.`);
