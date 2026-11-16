import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const files = [
  'integrations/gitlab/services/code_suggestion_editing.ts', 'integrations/gitlab/services/content_editor.ts',
  'integrations/gitlab/services/code_editing.ts', 'integrations/gitlab/services/host_configuration.ts',
  'tests/gitlab-suggestion-editing.test.ts', 'tests/browser/gitlab-suggestion-editing-fixture.ts',
  'tests/browser/gitlab-suggestion-editing.html', 'tests/browser/gitlab-suggestion-editing.spec.ts',
  'scripts/build-gitlab-native-runtime.mjs', 'playwright.config.ts',
  'artifacts/suggestion-editing-unit-20261116.log', 'artifacts/suggestion-editing-types-20261116.log',
  'artifacts/suggestion-editing-desktop-20261116.log', 'artifacts/suggestion-editing-desktop-accepted-20261116.log',
];
for (const browser of ['chromium', 'firefox']) {
  const output = `artifacts/suggestion-editing-desktop-20261116/${browser}`;
  const test = (await readdir(resolve(root, 'test-results'))).find(name => name.startsWith('gitlab-suggestion-editing-') && name.endsWith('-' + browser));
  if (!test) throw new Error('Missing accepted browser recording: ' + browser);
  await copyFile(resolve(root, 'test-results', test, 'video.webm'), resolve(root, output, 'video.webm'));
  execFileSync('C:/ProgramData/chocolatey/bin/ffmpeg.exe', ['-hide_banner', '-loglevel', 'error', '-y', '-threads', '1',
    '-i', resolve(root, output, 'video.webm'), '-vf', 'fps=2,scale=480:-1,tile=4x2', '-frames:v', '1', '-threads', '1', resolve(root, output, 'frames.png')], { timeout: 30000 });
  for (const file of ['range.png', 'frames.png', 'video.webm', 'observations.json']) files.push(`${output}/${file}`);
}
const hashes = {};
for (const file of files) hashes[file] = createHash('sha256').update(await readFile(resolve(root, file))).digest('hex');
await writeFile(resolve(root, 'artifacts/suggestion-editing-integration-20261116.json'), JSON.stringify({
  scope: 'Private GitLab service foundation and local browser controls; not actual MR suggestion posting/application or full product acceptance.',
  parentRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  verified: {
    integrationUnitTests: { passed: 1290, files: 50, workers: 2 },
    newSessionTests: 43,
    types: 'pnpm exec tsc --noEmit passed',
    browserJourneys: { passed: 2, browsers: ['Chromium', 'Firefox'], workers: 1, recorded: true },
    cases: ['insertion with captured original lines and offsets', 'plain source/empty deletion suggestions', 'source-preserving range changes',
      'exact raw snapshot recheck including line endings', 'owned target mapping across unrelated edits', 'cross-block selection refusal',
      'equal-source replacement invalidation', 'atomic conversion/filter refusal', 'async supersession/close/revocation',
      'service disposal aborts owned requests', 'Ctrl/Cmd+Enter leaves source at its actual parent', 'separate undo for exit and typing'],
  },
  firstBrowserFailure: 'The test assumed a trailing prose paragraph after a directly editable code suggestion. No paragraph existed. Added a real private Ctrl/Cmd+Enter exit using existing parent-aware commands and tested root/quote/list boundaries; retained ordinary Enter as literal source.',
  evidenceLimits: [
    'Local browser controls use actual pinned GitLab preview captures and a declared fixed raw-file fixture, not a running GitLab repository.',
    'The active native host configuration guard remains unchanged and refuses active suggestions.',
    'Contiguous selected lines only; noncontiguous/unknown context requires further host adaptation.',
    'No real inline context capture, MR posting/applying, batching, new native runtime/frontend/upstream/restart acceptance in this checkpoint.',
    '1290 tests are the GitLab integration subset, not a fresh full root suite or hosted CI.',
    'No new public package code, API/size/performance limit changes, version bump, release, push or publication.',
    'Video contact sheets sample the recordings; they do not prove exhaustive continuous visual review.',
  ],
  hashes,
}, null, 2) + '\n');
console.log('Recorded suggestion editing service evidence.');
