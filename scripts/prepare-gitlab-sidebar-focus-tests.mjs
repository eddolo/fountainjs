import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'linux' || !isAbsolute(process.argv[2] ?? '')) throw new Error('Pass the pinned Linux checkout.');
const root = fileURLToPath(new URL('../', import.meta.url)), source = resolve(process.argv[2]);
const pin = JSON.parse(await readFile(resolve(root, 'integrations/gitlab/runtime/upstream.json')));
const directory = await mkdtemp(resolve(tmpdir(), 'fountain-sidebar-focus-'));
const env = { ...process.env, GIT_INDEX_FILE: resolve(directory, 'index') };
const git = (...args) => execFileSync('git', ['-C', source, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const component = 'app/assets/javascripts/super_sidebar/components/super_sidebar.vue';
const spec = 'spec/frontend/super_sidebar/components/super_sidebar_spec.js';
const require = createRequire(resolve(source, 'package.json')), prettier = require('prettier');
const output = resolve(root, 'integrations/gitlab/patches/gitlab-19.5.3-native-sidebar-focus-tests.patch');
try {
  if (git('rev-parse', 'HEAD').trim() !== pin.commit) throw new Error('Unexpected upstream revision.');
  const original = git('show', `HEAD:${component}`), originalSpec = git('show', `HEAD:${spec}`);
  const needle = '        if (!collapsed) {';
  if (original.split(needle).length !== 2) throw new Error('Sidebar focus ownership changed.');
  const fixed = original.replace(needle, '        // Desktop expansion follows responsive layout; it must not steal editor focus.\n        if (!collapsed && this.isOverlapping()) {');
  const marker = '    it("doesn\'t focus the first focusable element when sidebar is collapsed", async () => {';
  if (originalSpec.split(marker).length !== 2) throw new Error('Sidebar test boundary changed.');
  const regression = `    it('keeps the active page control focused when the desktop sidebar expands', async () => {
      jest.spyOn(GlBreakpointInstance, 'windowWidth').mockReturnValue(xl);
      const field = document.createElement('textarea');
      document.body.append(field);
      try {
        field.focus();
        wrapper.vm.sidebarState.isCollapsed = false;
        await nextTick();
        await nextTick();
        expect(focusSpy).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(field);
      } finally {
        field.remove();
      }
    });

`;
  for (const [path, previous, next] of [[component, original, fixed], [spec, originalSpec, originalSpec.replace(marker, regression + marker)]]) {
    const options = await prettier.resolveConfig(resolve(source, path));
    const formatted = await prettier.format(next, { ...options, filepath: resolve(source, path),
      plugins: (options.plugins ?? []).map(plugin => require.resolve(plugin)), tailwindConfig: resolve(source, options.tailwindConfig) });
    const current = await readFile(resolve(source, path), 'utf8');
    if (current !== previous && current !== formatted) throw new Error('Unrecognized source: ' + path);
    if (path !== component || !process.argv.includes('--tests-only')) await writeFile(resolve(source, path), formatted);
  }
  if (process.argv.includes('--tests-only')) { console.log('Prepared desktop-focus regression; production component unchanged.'); }
  else {
    // This patch is independent of the editor patches and applies to their final tree.
    git('read-tree', 'HEAD'); git('add', '--', component, spec);
    const patch = git('diff', '--cached', '--binary', '--full-index', '-U4', '--', component, spec);
    await writeFile(output, patch);
    git('read-tree', 'HEAD'); git('apply', '--cached', '--check', output); git('apply', '--cached', output);
    for (const path of [component, spec]) if (git('show', `:${path}`) !== await readFile(resolve(source, path), 'utf8')) throw new Error('Patch differs: ' + path);
    console.log('Prepared native sidebar focus repair and regression; exact reconstruction verified.');
  }
} finally { await rm(directory, { recursive: true, force: true }); }
