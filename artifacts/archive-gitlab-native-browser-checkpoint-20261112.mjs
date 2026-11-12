import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const parent = 'f4d028e2dd2a4c9f9767cb41fc20b26f36314a12';
for (const [original, archived] of [
  ['artifacts/gitlab-native-runtime/build.json', 'artifacts/gitlab-native-runtime/browser-checkpoint-build-20261112.json'],
  ['artifacts/gitlab-native-browser-install/install.json', 'artifacts/gitlab-native-browser-install/browser-checkpoint-install-20261112.json'],
]) {
  const bytes = execFileSync('git', ['show', `${parent}:${original}`]);
  await writeFile(new URL(archived, root), bytes);
}
const reportPath = new URL('artifacts/gitlab-native-browser-integration-20261112.json', root);
let report = await readFile(reportPath, 'utf8');
report = report.replace('"manifest": "artifacts/gitlab-native-browser-install/install.json"',
  '"manifest": "artifacts/gitlab-native-browser-install/browser-checkpoint-install-20261112.json"');
await writeFile(reportPath, report);
console.log('Previous native-browser manifests retained under checkpoint-specific paths.');
