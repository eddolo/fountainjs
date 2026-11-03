import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const output = 'artifacts/workflow-removal-verification-20261103.json';
const root = 'artifacts/workflow-removal-browser-20261103/';
const reviewed = [];
for (const engine of ['chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari']) {
  const folder = readdirSync(root).find(name => name.endsWith('-' + engine));
  assert.ok(folder);
  for (const name of ['issue-breadcrumb.png', 'task-restored-history.png', 'task-empty.png',
    ...(['chromium', 'mobile-safari'].includes(engine) ? ['workflow-parent.png'] : [])]) {
    const path = root + folder + '/' + name;
    reviewed.push({ path, SHA256: sha(readFileSync(path)) });
  }
}
writeFileSync('artifacts/workflow-removal-visual-review-20261103.json', JSON.stringify({
  reviewed,
  findings: ['Breadcrumb links and parent arrows remain visible and wrap on narrow screens.',
    'Restored tasks show the edited draft, original metadata and working undo/redo.',
    'The empty workspace exposes both creation and last-deletion recovery without hidden editor controls.',
    'No horizontal page overflow in captured states; mobile editor toolbar retains its existing horizontal scroll.'],
  limitations: ['Desktop/touch emulation, not physical-device certification',
    'Seventeen selected captures inspected; other images, recordings and traces retained but not manually reviewed',
    'This adds host-demo task management and navigation, not a complete Todoist or GitLab replacement'],
}, null, 2) + '\n');

if (process.argv.includes('--bind')) {
  git('diff', '--quiet');
  git('diff', '--exit-code', 'HEAD', '--', 'src', 'scripts', 'package.json', 'pnpm-lock.yaml',
    'api-surface.json', 'tests/fixtures', '.github/workflows', 'playwright.config.ts');
  const log = name => readFileSync(`artifacts/workflow-removal-${name}-20261103.log`, 'utf8');
  assert.match(log('browser'), /5 passed/u);
  assert.match(log('existing-journey-final'), /3 passed/u);
  assert.match(log('types'), /0 errors and 0 warnings/u);
  assert.match(log('site'), /built in/u);
  const checks = JSON.parse(readFileSync('artifacts/workflow-removal-checks-20261103.json', 'utf8').replace(/^\uFEFF/u, ''));
  assert.ok(Object.values(checks).every(code => code === 0));
  assert.doesNotMatch(log('size'), /exceeds|budget failed/u);
  const files = git('diff', '--cached', '--name-only', '-z').toString().split('\0').filter(file => file && file !== output);
  writeFileSync(output, JSON.stringify({
    baseCommit: git('rev-parse', 'HEAD').toString().trim(),
    scope: 'Task deletion/recovery, empty state, focus and explicit workflow-parent navigation',
    verified: { newRecordedJourneys: 5, existingRecordedJourneys: 3, reviewed,
      nativeTypingHistoryAndPointerTouchActions: true, separateTaskHistories: true,
      restoredMetadataAndOriginalOrder: true, lastTaskDeletionAndCreation: true, liveTaskLimit: 20,
      keyboardParentNavigationFromDirectEntry: true, frameworkTypes: 'passed', website: 'passed', size: 'passed' },
    implementation: { runtimeLibraryOrDependenciesChanged: false, limitsChanged: false,
      recovery: 'One removed editor retained under its original key; next add/delete releases it.',
      maximumRetainedPanes: 21, persistence: 'This tab only; description downloads do not back up task metadata/history.',
      CSSBytes: statSync('dist/styles.css').size },
    fullUnitSuiteRerun: false,
    reason: 'No library source changed; the real host workflows and framework types verify this website-only change.',
    cloudAndPages: 'pending source push', npm: 'unchanged at 0.4.0-beta.2',
    separateThemeFontAudit: 'Remains on audit/docx-theme-languages-20261103 awaiting its additional capacity decision; not merged here.',
    sourceBinding: 'SHA-256 of staged Git blobs; this manifest excluded to avoid circular hashes.',
    hashes: Object.fromEntries(files.map(file => [file, sha(git('show', ':' + file))])),
  }, null, 2) + '\n');
  console.log(`Bound ${files.length} source/evidence files; eight browser journeys and seventeen inspected captures.`);
}
