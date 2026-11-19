import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'linux' || !isAbsolute(process.argv[2] ?? '')) throw new Error('Pass the pinned Linux GitLab source directory.');
const root = fileURLToPath(new URL('../', import.meta.url));
const source = await realpath(process.argv[2]), pin = JSON.parse(await readFile(join(root, 'integrations/gitlab/runtime/upstream.json')));
const git = (...args) => execFileSync('git', ['-C', source, ...args]);
if (git('rev-parse', 'HEAD').toString().trim() !== pin.commit) throw new Error('GitLab checkout differs from the pinned revision.');
const profile = process.argv.includes('--wiki-restore') ? 'wiki-restore' : 'suggestion-history';
const files = profile === 'wiki-restore' ? ['app/controllers/concerns/wiki_actions.rb'] : ['app/services/notes/update_service.rb', 'app/services/suggestions/create_service.rb'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const patch = join(root, 'integrations/gitlab/patches/gitlab-19.5.3-' + profile + '.patch');
const patchSHA256 = hash(await readFile(patch));
const output = resolve(root, 'artifacts/gitlab-' + profile, patchSHA256);
async function saveArtifact(path, content) {
  try { await writeFile(path, content, { flag: 'wx' }); } catch (error) {
    if (error.code !== 'EEXIST' || !(await readFile(path)).equals(Buffer.from(content))) throw error;
  }
}
const stage = await mkdtemp(join(tmpdir(), 'gitlab-' + profile + '-'));
try {
  const receipt = { revision: pin.commit, patchSHA256, files: {} };
  for (const file of files) {
    const original = git('show', pin.commit + ':' + file);
    await mkdir(dirname(join(stage, file)), { recursive: true });
    await writeFile(join(stage, file), original);
    receipt.files[file] = { original: hash(original) };
  }
  execFileSync('git', ['apply', '--whitespace=error', patch], { cwd: stage });
  for (const file of files) {
    const content = await readFile(join(stage, file));
    await mkdir(dirname(join(output, file)), { recursive: true });
    await saveArtifact(join(output, file), content);
    receipt.files[file].patched = hash(content);
  }
  await saveArtifact(join(output, 'LICENSE'), git('show', pin.commit + ':LICENSE'));
  await saveArtifact(join(output, 'build.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log('Prepared GitLab ' + profile + ' at ' + patchSHA256);
} finally {
  await rm(stage, { recursive: true, force: true });
}
