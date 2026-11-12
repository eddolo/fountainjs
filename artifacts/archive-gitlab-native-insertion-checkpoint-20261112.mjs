import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const parent = '11b6d550';
for (const [original, archived] of [
  ['artifacts/gitlab-native-runtime/build.json', 'artifacts/gitlab-native-runtime/insertion-checkpoint-build-20261112.json'],
  ['artifacts/gitlab-native-browser-install/install.json', 'artifacts/gitlab-native-browser-install/insertion-checkpoint-install-20261112.json'],
]) await writeFile(new URL(archived, root), execFileSync('git', ['show', `${parent}:${original}`]));
const path = new URL('artifacts/gitlab-native-insertion-integration-20261112.json', root);
let text = await readFile(path, 'utf8');
text = text.replace('"manifest": "artifacts/gitlab-native-browser-install/install.json"',
  '"manifest": "artifacts/gitlab-native-browser-install/insertion-checkpoint-install-20261112.json"')
  .replace('"runtimeManifest": "artifacts/gitlab-native-runtime/build.json"',
    '"runtimeManifest": "artifacts/gitlab-native-runtime/insertion-checkpoint-build-20261112.json"');
await writeFile(path, text);
console.log('Archived insertion manifests; previous checkpoint keeps exact build/install identity.');
