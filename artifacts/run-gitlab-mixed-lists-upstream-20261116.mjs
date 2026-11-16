import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const installation = JSON.parse(await readFile(new URL('artifacts/gitlab-native-browser-install/install.json', root)));
const source = installation.source;
const previous = JSON.parse(await readFile(new URL('artifacts/gitlab-quick-action-controls-jest-20261114.json', root)));
assert.equal(previous.numPassedTests, 462); assert.equal(previous.numTotalTestSuites, 21);
const paths = [...new Set([...previous.testResults.map(item => {
  assert.ok(item.name.startsWith(source + '/')); return item.name.slice(source.length + 1);
}), 'spec/frontend/content_editor/components/fountain_autocomplete_spec.js',
  'spec/frontend/super_sidebar/components/super_sidebar_spec.js'])];
assert.equal(paths.length, 23);
const output = fileURLToPath(new URL('artifacts/gitlab-mixed-lists-upstream-20261116.json', root));
try {
  const result = execFileSync('corepack', ['yarn', 'jest', ...paths, '--runInBand', '--json', '--outputFile=' + output],
    { cwd: source, encoding: 'utf8', timeout: 300000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  process.stdout.write(result);
} catch (error) {
  process.stdout.write(error.stdout ?? ''); process.stderr.write(error.stderr ?? ''); throw error;
}
const report = JSON.parse(await readFile(output));
console.log(JSON.stringify({ suites: report.numPassedTestSuites, passed: report.numPassedTests,
  skipped: report.numPendingTests, failed: report.numFailedTests, success: report.success }));
if (!report.success) process.exitCode = 1;
