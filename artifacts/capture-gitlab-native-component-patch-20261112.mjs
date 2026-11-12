import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const original = fileURLToPath(new URL('gitlab-native-component-tests-prepared-20261112.js', import.meta.url));
const path = 'spec/frontend/content_editor/components/content_editor_spec.js';
const target = `/home/eddolo/.cache/fountainjs-gitlab-product/source/${path}`;
let diff;
try { diff = execFileSync('git', ['diff', '--no-index', '--', original, target], { encoding: 'utf8' }); }
catch (error) { if (error.status !== 1) throw error; diff = error.stdout; }
diff = diff.split('\n').filter(line => !line.startsWith('old mode ') && !line.startsWith('new mode '))
  .map(line => line.startsWith('diff --git ') ? `diff --git a/${path} b/${path}`
    : line.startsWith('--- ') ? `--- a/${path}` : line.startsWith('+++ ') ? `+++ b/${path}` : line).join('\n');
await writeFile(new URL('../integrations/gitlab/patches/gitlab-19.5.3-native-component-tests.patch', import.meta.url), diff);
console.log('Retained the native component migration as a patch after the prepared host patch.');
