import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const capture = JSON.parse(await readFile(new URL('artifacts/suggestion-preview-live-20261116/preview.json', root)));
const pin = JSON.parse(await readFile(new URL('integrations/gitlab/runtime/upstream.json', root)));
const run = (...args) => execFileSync('wsl', ['-d', 'Ubuntu', '--exec', ...args], { encoding: 'utf8', timeout: 30000 });
const deployment = JSON.parse(run('docker', 'inspect', 'fountain-gitlab-integration-baseline-1'))[0];
if (deployment.State.Status !== 'exited' || deployment.Config.Image !== pin.image || deployment.Config.Labels['com.docker.compose.project'] !== 'fountain-gitlab-integration') throw new Error('Wrong or active deployment.');
const volume = deployment.Mounts.find(value => value.Destination === '/var/opt/gitlab')?.Name;
if (volume !== 'fountain-gitlab-integration_baseline-data' || capture.project.id !== 1) throw new Error('Wrong isolated repository data.');
const hash = createHash('sha256').update(String(capture.project.id)).digest('hex');
const repository = `/data/git-data/repositories/@hashed/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.git`;
const git = (...args) => run('docker', 'run', '--rm', '--network=none', '--entrypoint', '/opt/gitlab/embedded/bin/git',
  '--mount', `type=volume,source=${volume},target=/data,readonly`, pin.image, '-c', `safe.directory=${repository}`, '-C', repository, ...args);
const heads = capture.previewHeadSHAs, branchHead = capture.revisions.branchHead;
if (heads.length !== 1 || ![heads[0], branchHead].every(sha => /^[a-f0-9]{40}$/u.test(sha)) || !/^suggestion-context-[a-z0-9]+\.js$/u.test(capture.filePath)) throw new Error('Unexpected captured refs/path.');
const values = git('show', '--no-patch', '--format=%H%n%P%n%s', branchHead, heads[0]).trimEnd().split('\n');
if (values.length !== 6 || values[0] !== branchHead || values[3] !== heads[0]) throw new Error('Unexpected commit output.');
const source = { sha: values[0], parents: values[1].split(' '), subject: values[2] };
const preview = { sha: values[3], parents: values[4].split(' '), subject: values[5] };
if (!preview.parents.includes(source.sha) || !preview.parents.includes(capture.revisions.diffRefs.base_sha)) throw new Error('No proven merge relationship.');
if (git('diff', '--exit-code', source.sha, preview.sha, '--', capture.filePath) !== '') throw new Error('Preview file differs from source branch.');
await writeFile(new URL('artifacts/suggestion-revision-relation-20261116.json', root), JSON.stringify({
  scope: 'Read-only actual Git objects explain this captured MR preview head; not a general branch freshness or suggestion application proof.',
  upstream: capture.upstream, project: capture.project, mergeRequest: capture.mergeRequest, filePath: capture.filePath,
  source, preview, fileContentEqual: true,
  interpretation: 'The preview uses a merge-result commit containing the source branch commit and target base. Preserve the host preview refs; do not replace them with the MR API head merely because the hashes differ.',
  isolation: { containerStopped: true, network: 'none', volumeReadOnly: true, repositoryWrites: false },
}, null, 2) + '\n');
console.log('Verified real source/merge-preview commit relationship and identical file content.');
