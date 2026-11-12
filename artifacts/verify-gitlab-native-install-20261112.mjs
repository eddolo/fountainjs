import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const install = JSON.parse(await readFile(resolve(root, 'artifacts/gitlab-native-browser-install/install.json')));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const snapshot = new Map();
for (const [path, hash] of Object.entries(install.files)) {
  const bytes = await readFile(resolve(install.source, path));
  assert.equal(digest(bytes), hash);
  snapshot.set(path, bytes);
}
const probe = 'app/assets/javascripts/content_editor/components/fountain_formatting_toolbar.vue';
const changed = Buffer.concat([snapshot.get(probe), Buffer.from('\n<!-- changed-file guard probe -->\n')]);
try {
  await writeFile(resolve(install.source, probe), changed);
  for (const options of [[], ['--restore']]) {
    let refused = false;
    try { execFileSync(process.execPath, [resolve(root, 'scripts/install-gitlab-native-browser.mjs'), install.source, ...options], { stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { assert.equal(error.status, 1); refused = true; }
    assert.equal(refused, true);
    for (const [path, bytes] of snapshot) assert.deepEqual(await readFile(resolve(install.source, path)), path === probe ? changed : bytes);
  }
} finally {
  await writeFile(resolve(install.source, probe), snapshot.get(probe));
}
for (const [path, bytes] of snapshot) assert.deepEqual(await readFile(resolve(install.source, path)), bytes);
console.log('Passed: install and restore both refuse a changed owned file without modifying any input; the guard probe was restored and all seven source digests match.');
