import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';

if (process.platform !== 'linux' || !isAbsolute(process.argv[2] ?? '')) throw new Error('Pass the pinned Linux GitLab checkout.');
const root = fileURLToPath(new URL('../', import.meta.url)), source = resolve(process.argv[2]);
const pin = JSON.parse(await readFile(resolve(root, 'integrations/gitlab/runtime/upstream.json')));
if (execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== pin.commit) throw new Error('Unexpected GitLab revision.');
const require = createRequire(resolve(source, 'package.json')), prettier = require('prettier');
const temporary = await mkdtemp(resolve(tmpdir(), 'fountain-autocomplete-tests-'));
const env = { ...process.env, GIT_INDEX_FILE: resolve(temporary, 'index') };
const git = (...args) => execFileSync('git', ['-C', source, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const output = resolve(root, 'integrations/gitlab/patches/gitlab-19.5.3-native-autocomplete-tests.patch');
let prior = false;
try { await readFile(output); git('apply', '--reverse', '--check', output); prior = true; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const names = ['current-document', 'native-host-tests', 'native-component-tests', 'native-attachment-tests',
  'native-upload-capacity-tests', 'native-link-tests', 'native-code-tests', 'native-alert-tests', 'native-media-tests',
  'native-reference-tests', 'native-diagram-tests', 'native-diagram-reader-tests', 'native-frontmatter-tests',
  'native-context-menu-tests', 'native-quick-action-tests', 'native-quick-action-controls-tests'];
const pairs = [
  ...['fountain_quick_action_menu_spec.js', 'fountain_quick_action_host_spec.js', 'fountain_autocomplete_spec.js']
    .map(name => [`integrations/gitlab/specs/${name}`, `spec/frontend/content_editor/components/${name}`]),
  ['integrations/gitlab/fixtures/autocomplete-live.json', 'spec/frontend/content_editor/fixtures/fountain_autocomplete_live.json'],
];
try {
  git('read-tree', 'HEAD');
  for (const name of names) git('apply', '--cached', '--whitespace=nowarn', resolve(root, `integrations/gitlab/patches/gitlab-19.5.3-${name}.patch`));
  const baseline = git('write-tree').trim();
  for (const [input, path] of pairs) {
    const target = resolve(source, path), raw = await readFile(resolve(root, input), 'utf8'), options = await prettier.resolveConfig(target);
    const formatted = await prettier.format(raw, { ...options, filepath: target,
      plugins: (options.plugins ?? []).map(plugin => require.resolve(plugin)), tailwindConfig: resolve(source, options.tailwindConfig) });
    let previous;
    try { previous = git('show', `${baseline}:${path}`); } catch (error) { if (error.status !== 128) throw error; }
    try {
      const current = await readFile(target, 'utf8');
      if (!prior && current !== previous && current !== raw && current !== formatted) throw new Error('Unrecognized test source: ' + path);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, formatted);
  }
  const paths = pairs.map(([, path]) => path);
  git('add', '-f', '--', ...paths);
  const patch = git('diff', '--cached', '--binary', '--full-index', baseline, '--', ...paths);
  if (!patch) throw new Error('Expected an autocomplete test patch.');
  await writeFile(output, patch);
  git('read-tree', baseline); git('apply', '--cached', '--check', output);
  git('apply', '--cached', '--whitespace=nowarn', output);
  for (const path of paths) if (git('show', `:${path}`) !== await readFile(resolve(source, path), 'utf8')) throw new Error('Patch does not reproduce ' + path);
  console.log('Prepared autocomplete tests after sixteen ordered patches; two updated specs and two additions verified.');
} finally { await rm(temporary, { recursive: true, force: true }); }
