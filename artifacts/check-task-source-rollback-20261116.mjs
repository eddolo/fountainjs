import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const source = '/home/eddolo/.cache/fountainjs-gitlab-product/source';
for (const [script, suffix] of [['check-gitlab-native-patches.mjs', 'patch-verification'], ['check-gitlab-native-install.mjs', 'install-roundtrip']]) {
  const previous = new URL(`artifacts/gitlab-native-footnote-source-${suffix}-20261114.json`, root);
  const saved = await readFile(previous);
  try {
    execFileSync(process.execPath, [fileURLToPath(new URL('scripts/' + script, root)), source, '--footnote-source'], { stdio: 'inherit', timeout: 120000 });
    await writeFile(new URL(`artifacts/gitlab-native-task-${suffix}-20261116.json`, root), await readFile(previous));
  } finally { await writeFile(previous, saved); }
}
