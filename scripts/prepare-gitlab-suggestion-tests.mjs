import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
if (process.platform !== 'linux' || !isAbsolute(process.argv[2] ?? '')) throw new Error('Pass pinned Linux GitLab source.');
const root = fileURLToPath(new URL('../', import.meta.url)), source = resolve(process.argv[2]);
const pin = JSON.parse(await readFile(resolve(root, 'integrations/gitlab/runtime/upstream.json')));
if (execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== pin.commit) throw new Error('Wrong source revision.');
const temporary = await mkdtemp(resolve(tmpdir(), 'fountain-suggestion-tests-'));
const env = { ...process.env, GIT_INDEX_FILE: resolve(temporary, 'index') };
const git = (...args) => execFileSync('git', ['-C', source, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const names = ['current-document', 'native-host-tests', 'native-component-tests', 'native-attachment-tests', 'native-upload-capacity-tests',
  'native-link-tests', 'native-code-tests', 'native-alert-tests', 'native-media-tests', 'native-reference-tests', 'native-diagram-tests',
  'native-diagram-reader-tests', 'native-frontmatter-tests', 'native-context-menu-tests', 'native-quick-action-tests',
  'native-quick-action-controls-tests', 'native-autocomplete-tests', 'native-sidebar-focus-tests'];
const output = resolve(root, 'integrations/gitlab/patches/gitlab-19.5.3-native-suggestion-tests.patch');
const path = 'spec/frontend/content_editor/components/fountain_code_menu_spec.js', target = resolve(source, path);
const require = createRequire(resolve(source, 'package.json')), prettier = require('prettier');
try {
  git('read-tree', 'HEAD');
  for (const name of names) git('apply', '--cached', '--whitespace=nowarn', resolve(root, `integrations/gitlab/patches/gitlab-19.5.3-${name}.patch`));
  const baseline = git('show', `:${path}`), current = await readFile(target, 'utf8');
  if (current !== baseline) { await readFile(output); git('apply', '--reverse', '--check', output); }
  const options = await prettier.resolveConfig(target);
  const next = await prettier.format(await readFile(resolve(root, 'integrations/gitlab/specs/fountain_code_menu_spec.js'), 'utf8'), {
    ...options, filepath: target, plugins: (options.plugins ?? []).map(plugin => require.resolve(plugin)), tailwindConfig: resolve(source, options.tailwindConfig) });
  await writeFile(resolve(temporary, 'before'), baseline); await writeFile(target, next);
  let patch;
  try { patch = execFileSync('git', ['diff', '--no-index', '--unified=1', '--', resolve(temporary, 'before'), target], { encoding: 'utf8' }); }
  catch (error) { if (error.status !== 1) throw error; patch = error.stdout; }
  await writeFile(output, patch.split('\n').filter(line => !line.startsWith('old mode ') && !line.startsWith('new mode ')).map(line =>
    line.startsWith('diff --git ') ? `diff --git a/${path} b/${path}` : line.startsWith('--- ') ? `--- a/${path}` : line.startsWith('+++ ') ? `+++ b/${path}` : line).join('\n'));
  console.log('Prepared suggestion menu tests after 18 verified source patches.');
} finally { await rm(temporary, { recursive: true, force: true }); }
