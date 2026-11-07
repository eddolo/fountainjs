import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const report = JSON.parse(readFileSync('artifacts/yjs-retained-package-browser-20261107.json', 'utf8'));
assert.equal(report.stats.expected, 39);
for (const key of ['unexpected', 'flaky', 'skipped']) assert.equal(report.stats[key], 0);
function tests(suites) {
  return suites.flatMap(suite => [
    ...(suite.specs ?? []).flatMap(spec => spec.tests.map(test => ({ title: spec.title, ...test }))),
    ...tests(suite.suites ?? []),
  ]);
}
const journeys = tests(report.suites);
assert.equal(journeys.length, 39);
const out = 'artifacts/yjs-retained-package-visual-20261107';
mkdirSync(out, { recursive: true });
const run = args => execFileSync('ffmpeg', ['-v', 'error', '-y', '-threads', '1', '-filter_complex_threads', '1', ...args]);
for (const journey of journeys) {
  assert.equal(journey.results.length, 1);
  const [result] = journey.results;
  assert.equal(result.status, 'passed');
  assert.ok(result.attachments.some(attachment => attachment.name === 'trace' && attachment.path));
  const runtime = result.attachments.find(attachment => attachment.name === 'runtime-modules');
  const paths = JSON.parse(Buffer.from(runtime.body, 'base64').toString('utf8'));
  assert.ok(paths.includes('/node_modules/.vite/deps/fountainjs-editor.js'));
  assert.ok(paths.includes('/node_modules/.vite/deps/fountainjs-editor_experimental_yjs-retained.js'));
  assert.equal(paths.some(path => path.startsWith('/src/')), false);
  assert.ok(result.attachments.some(attachment => attachment.name === 'video' && attachment.path));
}
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const cases = journeys.filter(journey => journey.projectName === engine);
  const video = journey => journey.results[0].attachments.find(attachment => attachment.name === 'video').path;
  const operations = ['Quote', 'Bullet', 'Ordered', 'Task', 'Bold', 'Enter'];
  const selections = operations.map(operation => cases.find(journey => journey.title.startsWith('native offline typing survives ' + operation + ',')));
  const frames = selections.map(journey => join(dirname(video(journey)), 'converged.png'));
  const tiles = frames.map((_, index) => `[${index}:v]scale=480:-1[p${index}]`).join(';');
  run([...frames.flatMap(file => ['-i', file]), '-filter_complex', tiles + ';[p0][p1][p2][p3][p4][p5]xstack=inputs=6:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0[out]', '-map', '[out]', '-frames:v', '1', join(out, engine + '-six-cases.png')]);
  const reopen = cases.find(journey => journey.title.includes('download and reopen'));
  copyFileSync(join(dirname(video(reopen)), 'reopened.png'), join(out, engine + '-reopened.png'));
  const splitRecording = video(selections.at(-1));
  const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', splitRecording], { encoding: 'utf8' }));
  assert.ok(duration > 0);
  run(['-i', splitRecording, '-vf', `fps=${6 / duration},scale=480:-1,tile=3x2`, '-frames:v', '1', join(out, engine + '-split-filmstrip.png')]);
}
console.log('Verified 39 installed-runtime traces and videos. Prepared nine visual review sheets and captures.');
