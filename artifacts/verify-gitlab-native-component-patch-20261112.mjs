import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
if (process.platform !== 'linux') throw new Error('Run against the pinned Linux source.');
const root = new URL('../', import.meta.url);
const source = '/home/eddolo/.cache/fountainjs-gitlab-product/source';
const temporary = await mkdtemp(join(tmpdir(), 'fountain-native-component-patch-'));
const env = { ...process.env, GIT_INDEX_FILE: join(temporary, 'index') };
const run = (...args) => execFileSync('git', args, { cwd: source, env, encoding: 'utf8' });
const patches = ['gitlab-19.5.3-current-document.patch', 'gitlab-19.5.3-native-host-tests.patch',
  'gitlab-19.5.3-native-component-tests.patch'].map(name => `integrations/gitlab/patches/${name}`);
try {
  const revision = run('rev-parse', 'HEAD').trim();
  if (revision !== '0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf') throw new Error('Unexpected source revision');
  run('read-tree', 'HEAD');
  const hashes = {};
  for (const path of patches) {
    const absolute = fileURLToPath(new URL(path, root));
    run('apply', '--cached', '--check', absolute);
    run('apply', '--cached', '--whitespace=nowarn', absolute);
    hashes[path] = createHash('sha256').update(await readFile(absolute)).digest('hex');
  }
  for (const path of ['spec/frontend/content_editor/components/content_editor_spec.js',
    'spec/frontend/vue_shared/components/markdown/markdown_editor_spec.js']) {
    if (run('show', `:${path}`) !== await readFile(join(source, path), 'utf8'))
      throw new Error(`Patched spec differs from tested live source: ${path}`);
  }
  execFileSync('git', ['apply', '--reverse', '--check', fileURLToPath(new URL(patches[2], root))],
    { cwd: source, encoding: 'utf8' });
  await writeFile(new URL('artifacts/gitlab-native-component-patch-verification-20261112.json', root),
    JSON.stringify({ status: 'passed', revision, patches: hashes,
      checks: ['Three patches apply in order to pinned HEAD in a temporary index',
        'Both reconstructed native specs exactly equal the tested live files',
        'Component migration reverse-check succeeds against the installed source'],
      isolation: 'Source worktree and main index untouched; temporary index removed',
    }, null, 2) + '\n');
  console.log('Native host/component patches reconstruct the actual tested source.');
} finally { await rm(temporary, { recursive: true, force: true }); }
