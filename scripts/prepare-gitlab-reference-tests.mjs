import { readFile, writeFile, mkdir, access, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';

if (process.platform !== 'linux' || !process.argv[2] || !isAbsolute(process.argv[2]))
  throw new Error('Run in Linux with the absolute pinned GitLab source checkout.');
const root = fileURLToPath(new URL('../', import.meta.url)), source = resolve(process.argv[2]);
const pin = JSON.parse(await readFile(resolve(root, 'integrations/gitlab/runtime/upstream.json')));
if (execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== pin.commit)
  throw new Error('Unexpected GitLab pin.');
const require = createRequire(resolve(source, 'package.json')), prettier = require('prettier');
const patchPath = resolve(root, 'integrations/gitlab/patches/gitlab-19.5.3-native-reference-tests.patch');
let previous = false;
try { await access(patchPath); previous = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (previous) execFileSync('git', ['-C', source, 'apply', '--reverse', '--check', patchPath]);
const pairs = [
  ['integrations/gitlab/specs/fountain_reference_menu_spec.js', 'spec/frontend/content_editor/components/fountain_reference_menu_spec.js'],
  ['integrations/gitlab/fixtures/reference-live-html.json', 'spec/frontend/content_editor/fixtures/fountain_reference_live_html.json'],
];
let patch = '';
for (const [input, path] of pairs) {
  const target = resolve(source, path);
  if (!previous) {
    try { await access(target); throw new Error('Unowned reference-test file exists.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const options = await prettier.resolveConfig(target);
  const value = await prettier.format(await readFile(resolve(root, input), 'utf8'), {
    ...options, filepath: target, plugins: (options.plugins ?? []).map(plugin => require.resolve(plugin)),
    tailwindConfig: resolve(source, options.tailwindConfig),
  });
  await mkdir(dirname(target), { recursive: true }); await writeFile(target, value);
  let diff;
  try { diff = execFileSync('git', ['diff', '--no-index', '--', '/dev/null', target], { encoding: 'utf8' }); }
  catch (error) { if (error.status !== 1) throw error; diff = error.stdout; }
  patch += diff.split('\n').filter(line => !line.startsWith('old mode ') && !line.startsWith('new mode '))
    .map(line => line.startsWith('diff --git ') ? `diff --git a/${path} b/${path}` : line.startsWith('+++ ') ? `+++ b/${path}` : line).join('\n');
}
const hostPath = 'spec/frontend/content_editor/components/content_editor_spec.js';
const temporary = await mkdtemp(resolve(tmpdir(), 'fountain-reference-boundary-'));
try {
  const env = { ...process.env, GIT_INDEX_FILE: resolve(temporary, 'index') };
  const git = (...args) => execFileSync('git', ['-C', source, ...args], { env, encoding: 'utf8' });
  git('read-tree', 'HEAD');
  for (const name of ['current-document', 'native-host-tests', 'native-component-tests', 'native-attachment-tests',
    'native-upload-capacity-tests', 'native-link-tests', 'native-code-tests', 'native-alert-tests', 'native-media-tests'])
    git('apply', '--cached', '--whitespace=nowarn', resolve(root, `integrations/gitlab/patches/gitlab-19.5.3-${name}.patch`));
  const baseline = git('show', `:${hostPath}`);
  const legacyImport = "import ReferenceBubbleMenu from '~/content_editor/components/bubble_menus/reference_bubble_menu.vue';";
  const nativeImport = "import FountainReferenceMenu from '~/content_editor/components/fountain_reference_menu.vue';";
  if (baseline.split(legacyImport).length !== 2 || baseline.split('${ReferenceBubbleMenu}').length !== 2)
    throw new Error('Inspect the original reference-menu boundary.');
  const options = await prettier.resolveConfig(resolve(source, hostPath));
  const prepared = await prettier.format(baseline.replace(legacyImport, nativeImport).replace('${ReferenceBubbleMenu}', '${FountainReferenceMenu}'), {
    ...options, filepath: resolve(source, hostPath), plugins: (options.plugins ?? []).map(plugin => require.resolve(plugin)),
    tailwindConfig: resolve(source, options.tailwindConfig),
  });
  const current = await readFile(resolve(source, hostPath), 'utf8');
  if (current !== baseline && current !== prepared) throw new Error('The host reference test has unrecognized edits.');
  const before = resolve(temporary, 'before.js');
  await writeFile(before, baseline); await writeFile(resolve(source, hostPath), prepared);
  let diff;
  try { diff = execFileSync('git', ['diff', '--no-index', '--unified=1', '--', before, resolve(source, hostPath)], { encoding: 'utf8' }); }
  catch (error) { if (error.status !== 1) throw error; diff = error.stdout; }
  patch += diff.split('\n').filter(line => !line.startsWith('old mode ') && !line.startsWith('new mode '))
    .map(line => line.startsWith('diff --git ') ? `diff --git a/${hostPath} b/${hostPath}` : line.startsWith('--- ') ? `--- a/${hostPath}` : line.startsWith('+++ ') ? `+++ b/${hostPath}` : line).join('\n');
  await writeFile(patchPath, patch);
} finally { await rm(temporary, { recursive: true, force: true }); }
console.log('Prepared native reference behavior tests/fixtures and the equivalent host-render boundary; code/media requirements remain unchanged.');
