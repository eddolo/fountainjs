import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const source = '/home/eddolo/.cache/fountainjs-gitlab-product/source';
const temporary = await mkdtemp(join(tmpdir(), 'fountain-native-host-patch-'));
const env = { ...process.env, GIT_INDEX_FILE: join(temporary, 'index') };
const run = (...args) => execFileSync('git', args, { cwd: source, env, encoding: 'utf8' });
const base = 'integrations/gitlab/patches/gitlab-19.5.3-current-document.patch';
const native = 'integrations/gitlab/patches/gitlab-19.5.3-native-host-tests.patch';
try {
  const revision = run('rev-parse', 'HEAD').trim();
  if (revision !== '0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf')
    throw new Error('Unexpected GitLab source revision');
  run('read-tree', 'HEAD');
  run('apply', '--cached', '--whitespace=nowarn', fileURLToPath(new URL(base, root)));
  run('apply', '--cached', '--check', fileURLToPath(new URL(native, root)));
  run('apply', '--cached', fileURLToPath(new URL(native, root)));
  execFileSync('git', ['apply', '--reverse', '--check', fileURLToPath(new URL(native, root))], {
    cwd: source, encoding: 'utf8',
  });
  const path = 'spec/frontend/vue_shared/components/markdown/markdown_editor_spec.js';
  const expected = run('show', `:${path}`);
  if (expected !== await readFile(join(source, path), 'utf8'))
    throw new Error('Live spec differs from reconstructed patch result');
  const hashes = {};
  for (const path of [base, native])
    hashes[path] = createHash('sha256').update(await readFile(new URL(path, root))).digest('hex');
  await writeFile(new URL('gitlab-native-insertion-patch-verification-20261112.json', import.meta.url),
    JSON.stringify({ revision, status: 'passed', patches: hashes,
      checks: ['Prepared patch applies to pinned HEAD in a temporary index',
        'Native host test patch applies after prepared patch',
        'Reverse check passes against actual installed source',
        'Reconstructed host spec exactly matches tested live source'],
      isolation: 'Main index and source worktree untouched; temporary index removed' }, null, 2) + '\n');
  console.log('Native host patch forward/reverse checks and exact live-source comparison passed.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
