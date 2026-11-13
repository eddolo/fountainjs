import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
if (process.platform !== 'linux' || !process.argv[2] || !isAbsolute(process.argv[2])) throw new Error('Pass the pinned Linux GitLab checkout.');
const root = fileURLToPath(new URL('../', import.meta.url)), source = resolve(process.argv[2]);
const pin = JSON.parse(await readFile(resolve(root, 'integrations/gitlab/runtime/upstream.json')));
if (execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== pin.commit) throw new Error('Unexpected GitLab revision.');
const require = createRequire(resolve(source, 'package.json')), prettier = require('prettier');
const temporary = await mkdtemp(resolve(tmpdir(), 'fountain-context-menu-tests-'));
const env = { ...process.env, GIT_INDEX_FILE: resolve(temporary, 'index') };
const git = (...args) => execFileSync('git', ['-C', source, ...args], { env, encoding: 'utf8' });
const patchPath = resolve(root, 'integrations/gitlab/patches/gitlab-19.5.3-native-context-menu-tests.patch');
let priorVerified = false;
try {
  await readFile(patchPath);
  git('apply', '--reverse', '--check', patchPath);
  priorVerified = true;
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const names = ['current-document', 'native-host-tests', 'native-component-tests', 'native-attachment-tests',
  'native-upload-capacity-tests', 'native-link-tests', 'native-code-tests', 'native-alert-tests', 'native-media-tests', 'native-reference-tests', 'native-diagram-tests', 'native-diagram-reader-tests', 'native-frontmatter-tests'];
const pairs = [
  ['integrations/gitlab/specs/fountain_context_surface_spec.js', 'spec/frontend/content_editor/components/fountain_context_surface_spec.js', false],
  ['integrations/gitlab/fixtures/media-live-html.json', 'spec/frontend/content_editor/fixtures/fountain_media_live_html.json', false],
  ['integrations/gitlab/specs/fountain_diagram_authoring_host_spec.js', 'spec/frontend/content_editor/components/fountain_diagram_authoring_host_spec.js', true],
  ['integrations/gitlab/specs/fountain_frontmatter_spec.js', 'spec/frontend/content_editor/components/fountain_frontmatter_spec.js', true],
];
try {
  git('read-tree', 'HEAD');
  for (const name of names) git('apply', '--cached', '--whitespace=nowarn', resolve(root, `integrations/gitlab/patches/gitlab-19.5.3-${name}.patch`));
  let patch = '';
  for (const [input, path, exists] of pairs) {
    const target = resolve(source, path), options = await prettier.resolveConfig(target);
    const value = await prettier.format(await readFile(resolve(root, input), 'utf8'), { ...options, filepath: target,
      plugins: (options.plugins ?? []).map(plugin => require.resolve(plugin)), tailwindConfig: resolve(source, options.tailwindConfig) });
    const baseline = exists ? git('show', `:${path}`) : '';
    try {
      const current = await readFile(target, 'utf8');
      if (!priorVerified && current !== baseline && current !== value) throw new Error('Unrecognized contextual-menu test source at ' + path);
    } catch (error) { if (error.code !== 'ENOENT') throw error; if (exists) throw error; }
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, value);
    const before = resolve(temporary, 'before'); if (exists) await writeFile(before, baseline);
    let diff;
    try { diff = execFileSync('git', ['diff', '--no-index', '--unified=1', '--', exists ? before : '/dev/null', target], { encoding: 'utf8' }); }
    catch (error) { if (error.status !== 1) throw error; diff = error.stdout; }
    patch += diff.split('\n').filter(line => !line.startsWith('old mode ') && !line.startsWith('new mode '))
      .map(line => line.startsWith('diff --git ') ? `diff --git a/${path} b/${path}`
        : line.startsWith('--- ') ? exists ? `--- a/${path}` : '--- /dev/null'
          : line.startsWith('+++ ') ? `+++ b/${path}` : line).join('\n');
  }
  await writeFile(patchPath, patch);
  console.log('Prepared native contextual-menu integration tests after the preceding thirteen patches.');
} finally { await rm(temporary, { recursive: true, force: true }); }
