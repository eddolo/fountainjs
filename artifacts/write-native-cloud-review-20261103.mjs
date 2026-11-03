import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, ''));
const reviewPath = 'artifacts/docx-native-cloud-review-20261103.json';
const review = json(reviewPath);
review.nextWork[0] = 'Resolve supported theme-language defaults: theme-fonts.ts currently rejects even the related en-US language, then uses the named Arial fallback. Preserve existing same-declaration and inheritance semantics.';
writeFileSync(reviewPath, JSON.stringify(review, null, 2) + '\n');

const browserRoot = 'artifacts/preformatted-markup-assertion-verified-20261103/';
const reviewed = [];
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const folder = readdirSync(browserRoot).find(name => name.endsWith('-' + engine));
  assert.ok(folder);
  for (const name of ['paragraph-flow-editor.png', 'paragraph-flow-reader.png', 'paragraph-flow-mobile.png',
    ...(engine === 'chromium' ? ['paragraph-flow-conversion.png'] : [])]) {
    const path = browserRoot + folder + '/' + name;
    reviewed.push({ path, SHA256: sha(readFileSync(path)) });
  }
}
writeFileSync('artifacts/preformatted-markup-visual-review-20261103.json', JSON.stringify({
  reviewed,
  findings: ['Literal lines and leading spaces remain visible in code.',
    'The editor retains its code formatting; the ordinary Markdown fence reports omitted marks.',
    'Reopened readers remain readable at desktop and 390 CSS pixels in all three engines.'],
  scope: 'Ten selected captures inspected; other captures, videos and traces retained but not manually reviewed. Desktop narrow viewports are not physical-device evidence.',
}, null, 2) + '\n');

if (process.argv.includes('--bind')) {
  const output = 'artifacts/native-cloud-and-browser-verification-20261103.json';
  git('diff', '--quiet');
  git('diff', '--exit-code', 'HEAD', '--', 'src', 'scripts', 'package.json', 'pnpm-lock.yaml',
    'api-surface.json', 'tests/fixtures/markdown', '.github/workflows', 'playwright.config.ts');
  const log = name => readFileSync(`artifacts/preformatted-markup-assertion-${name}-20261103.log`, 'utf8');
  assert.match(log('before'), /3 failed/u);
  assert.match(log('verified'), /3 passed/u);
  assert.match(log('types'), /0 errors and 0 warnings/u);
  assert.match(log('site'), /built in/u);
  const native = json('artifacts/docx-native-cloud-evidence-20261103/native-report.json');
  assert.equal(review.nativeAuditConclusion, 'success');
  assert.equal(review.allNativePagesInspected, true);
  for (const image of review.manualNativePageReview) assert.equal(sha(readFileSync(image.path)), image.SHA256);
  const metadata = json('artifacts/docx-native-cloud-artifact-metadata-20261103.json').artifacts[0];
  assert.equal(metadata.workflow_run.head_sha, review.sourceCommit);
  assert.equal(metadata.id, 13268303392);
  const files = git('diff', '--cached', '--name-only', '-z').toString().split('\0').filter(file => file && file !== output);
  assert.ok(!files.some(file => file.startsWith('artifacts/docx-native-audit/')));
  writeFileSync(output, JSON.stringify({
    baseCommit: git('rev-parse', 'HEAD').toString().trim(),
    scope: 'Independent native DOCX visual results and strengthened serialized-HTML browser assertions',
    native: { sourceCommit: review.sourceCommit, run: review.workflowRun, job: review.job, conclusion: 'success',
      artifact: metadata.id, serverSuppliedArchiveDigest: metadata.digest, archiveDigestIndependentlyRehashed: false,
      reviewedPages: review.manualNativePageReview, findings: review.findings, nextWork: review.nextWork,
      report: native, completePixelFidelity: false, microsoftWordCertification: false },
    browser: { before: '3 failed at stale serialized-string assertion',
      intermediate: 'Parsed HTML passed; exact DOM segmentation assertion failed because syntax decorations split marked runs.',
      final: '3 passed; exact parsed text/newlines and combined code-mark scope', reviewed,
      types: 'passed', website: 'passed', fullCloudBrowser: 'pending new source push',
      ordinaryMarkdownFormattingLoss: 'reported; not claimed retained after Markdown reopen' },
    unchanged: ['runtime source', 'dependencies', 'public API', 'CommonMark v13 and fixture ranges', 'all numerical limits'],
    npm: 'unchanged at 0.4.0-beta.2',
    sourceBinding: 'SHA-256 of staged Git blobs; this manifest excluded to avoid circular hashes.',
    hashes: Object.fromEntries(files.map(file => [file, sha(git('show', ':' + file))])),
  }, null, 2) + '\n');
  console.log(`Bound ${files.length} source/evidence files; no runtime or limit changes.`);
}
