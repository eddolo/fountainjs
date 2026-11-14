import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve } from 'node:path';
import { tmpdir } from 'node:os';

if (process.platform !== 'linux' || !isAbsolute(process.argv[2] ?? '')) throw new Error('Pass the pinned Linux GitLab checkout.');
const root = fileURLToPath(new URL('../', import.meta.url)), source = resolve(process.argv[2]);
const pin = JSON.parse(await readFile(resolve(root, 'integrations/gitlab/runtime/upstream.json')));
if (execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== pin.commit) throw new Error('Unexpected GitLab revision.');
const require = createRequire(resolve(source, 'package.json')), prettier = require('prettier');
const temporary = await mkdtemp(resolve(tmpdir(), 'fountain-quick-action-tests-'));
const env = { ...process.env, GIT_INDEX_FILE: resolve(temporary, 'index') };
const git = (...args) => execFileSync('git', ['-C', source, ...args], { env, encoding: 'utf8' });
const names = ['current-document', 'native-host-tests', 'native-component-tests', 'native-attachment-tests',
  'native-upload-capacity-tests', 'native-link-tests', 'native-code-tests', 'native-alert-tests', 'native-media-tests',
  'native-reference-tests', 'native-diagram-tests', 'native-diagram-reader-tests', 'native-frontmatter-tests', 'native-context-menu-tests'];
const component = 'app/assets/javascripts/work_items/components/work_item_description.vue';
const spec = 'spec/frontend/work_items/components/work_item_description_spec.js';
try {
  git('read-tree', 'HEAD');
  for (const name of names) git('apply', '--cached', '--whitespace=nowarn', resolve(root, `integrations/gitlab/patches/gitlab-19.5.3-${name}.patch`));
  let patch = '';
  for (const path of [component, spec]) {
    const baseline = git('show', `:${path}`), target = resolve(source, path);
    const anchor = path === component ? '    async startEditing() {' : "      it('clears conflict warning on save', async () => {";
    if (baseline.split(anchor).length !== 2) throw new Error('Inspect the pinned fresh-session contract: ' + path);
    const replacement = path === component ? `${anchor}
      // A completed quick action can normalize the saved description while the
      // previous form is still mounted. A new session compares against its own
      // current server baseline, rather than carrying that old conflict flag.
      this.conflictedDescription = '';` : `      it('starts a new edit session without a conflict retained from the previous session', async () => {
        await wrapper.setProps({ editMode: false });
        await wrapper.setProps({ editMode: true });
        await waitForPromises();

        expect(findConflictedDescription().exists()).toBe(false);
        expect(findMarkdownEditor().props('value')).toBe('description updated by someone else');
      });

${anchor}`;
    const options = await prettier.resolveConfig(target);
    const value = await prettier.format(baseline.replace(anchor, replacement), { ...options, filepath: target,
      plugins: (options.plugins ?? []).map(plugin => require.resolve(plugin)), tailwindConfig: resolve(source, options.tailwindConfig) });
    const current = await readFile(target, 'utf8');
    if (current !== baseline && current !== value) throw new Error('Unrecognized quick-action integration source: ' + path);
    await writeFile(target, value);
    const before = resolve(temporary, 'before'); await writeFile(before, baseline);
    let diff;
    try { diff = execFileSync('git', ['diff', '--no-index', '--unified=1', '--', before, target], { encoding: 'utf8' }); }
    catch (error) { if (error.status !== 1) throw error; diff = error.stdout; }
    patch += diff.split('\n').map(line => line.startsWith('diff --git ') ? `diff --git a/${path} b/${path}`
      : line.startsWith('--- ') ? `--- a/${path}` : line.startsWith('+++ ') ? `+++ b/${path}` : line).join('\n');
  }
  await writeFile(resolve(root, 'integrations/gitlab/patches/gitlab-19.5.3-native-quick-action-tests.patch'), patch);
  console.log('Prepared fresh-session conflict reset and regression after the preceding fourteen patches.');
} finally { await rm(temporary, { recursive: true, force: true }); }
