import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareGitLabFootnoteFilter } from '../integrations/gitlab/services/footnote_filter_patch.mjs';

if (!process.argv[2] || !isAbsolute(process.argv[2])) throw new Error('Pass the exact pinned GitLab source root.');
const root = fileURLToPath(new URL('../', import.meta.url)), source = await realpath(process.argv[2]);
const pin = JSON.parse(await readFile(resolve(root, 'integrations/gitlab/runtime/upstream.json')));
const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trimEnd();
if (git('rev-parse', 'HEAD') !== pin.commit || await realpath(git('rev-parse', '--show-toplevel')) !== source)
  throw new Error('Use the exact pinned GitLab source checkout.');
const path = 'lib/banzai/filter/footnote_filter.rb';
const original = git('show', `${pin.commit}:${path}`) + '\n';
const modified = prepareGitLabFootnoteFilter(original);
const output = resolve(root, 'artifacts/gitlab-native-footnote-server');
await mkdir(output, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
await writeFile(resolve(output, 'footnote_filter.rb'), modified);
await writeFile(resolve(output, 'original-footnote-filter.rb'), original);
await writeFile(resolve(output, 'LICENSE'), git('show', `${pin.commit}:LICENSE`) + '\n');
await writeFile(resolve(output, 'build.json'), JSON.stringify({ source, revision: pin.commit, path,
  originalSha256: hash(original), sha256: hash(modified), license: 'LICENSE',
  scope: 'Read-only task server overlay; repeat-reference and generated-backlink repair, not an unmodified GitLab baseline' }, null, 2) + '\n');
console.log('Prepared the pinned repeated-footnote server repair. The base image remains unchanged.');
