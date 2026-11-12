import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.argv[2] || !isAbsolute(process.argv[2])) throw new Error('Pass the absolute pinned GitLab source checkout.');
const source = await realpath(process.argv[2]);
const root = new URL('../', import.meta.url);
const pin = JSON.parse(await readFile(new URL('integrations/gitlab/runtime/upstream.json', root)));
const temporary = await mkdtemp(join(tmpdir(), 'fountain-gitlab-patch-check-'));
const env = { ...process.env, GIT_INDEX_FILE: join(temporary, 'index') };
const run = (...args) => execFileSync('git', args, { cwd: source, env, encoding: 'utf8' });
const names = ['current-document', 'native-host-tests', 'native-component-tests', 'native-attachment-tests',
  'native-upload-capacity-tests', 'native-link-tests', 'native-code-tests', 'native-alert-tests', 'native-media-tests', 'native-reference-tests'];
const patches = names.map(name => `integrations/gitlab/patches/gitlab-19.5.3-${name}.patch`);
try {
  const revision = run('rev-parse', 'HEAD').trim();
  if (revision !== pin.commit) throw new Error('Unexpected GitLab source revision.');
  run('read-tree', 'HEAD');
  const hashes = {};
  for (const path of patches) {
    const absolute = fileURLToPath(new URL(path, root));
    run('apply', '--cached', '--check', absolute);
    run('apply', '--cached', '--whitespace=nowarn', absolute);
    hashes[path] = createHash('sha256').update(await readFile(absolute)).digest('hex');
  }
  for (const path of ['spec/frontend/content_editor/components/content_editor_spec.js',
    'spec/frontend/vue_shared/components/markdown/markdown_editor_spec.js',
    ...['link', 'code', 'alert', 'media', 'reference'].map(kind => `spec/frontend/content_editor/components/fountain_${kind}_menu_spec.js`),
    'spec/frontend/content_editor/fixtures/fountain_reference_live_html.json']) {
    if (run('show', `:${path}`) !== await readFile(join(source, path), 'utf8'))
      throw new Error(`Reconstructed test source differs: ${path}`);
  }
  run('apply', '--reverse', '--check', fileURLToPath(new URL(patches.at(-1), root)));
  const report = { status: 'passed', revision, patches: hashes,
    checks: ['Ten patches apply in order using a separate temporary index',
      'Reconstructed host and native menu specs match the tested checkout byte for byte',
      'Native reference test patch reverse-check passes'],
    isolation: 'Upstream worktree and main index are unchanged; temporary index removed' };
  const profile = process.argv.includes('--references') ? 'reference' : process.argv.includes('--media-files') ? 'media-files' : 'media';
  await writeFile(new URL(`artifacts/gitlab-native-${profile}-patch-verification-20261112.json`, root), JSON.stringify(report, null, 2) + '\n');
  console.log('Ten ordered native patches reconstruct the tested pinned source.');
} finally { await rm(temporary, { recursive: true, force: true }); }
