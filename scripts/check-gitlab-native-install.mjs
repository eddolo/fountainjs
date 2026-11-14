import { execFileSync } from 'node:child_process';
import { readFile, writeFile, access, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isAbsolute } from 'node:path';

if (process.platform !== 'linux' || !process.argv[2] || !isAbsolute(process.argv[2]))
  throw new Error('Run in Linux and pass the absolute pinned source checkout.');
const root = new URL('../', import.meta.url), source = await realpath(process.argv[2]);
if (execFileSync('docker', ['inspect', '--format', '{{.State.Running}}', 'fountain-gitlab-integration-baseline-1'], { encoding: 'utf8' }).trim() !== 'false')
  throw new Error('Stop the isolated task application before exercising source rollback.');
const manifest = new URL('artifacts/gitlab-native-browser-install/install.json', root);
const before = JSON.parse(await readFile(manifest));
const files = ({ 4: 13, 5: 15, 6: 17, 7: 19, 8: 20, 9: 22, 10: 22, 11: 25, 12: 27, 13: 28 })[before.formatVersion];
if (before.source !== source || before.restored || !files || Object.keys(before.files).length !== files)
  throw new Error('Unexpected source install generation.');
const install = restore => execFileSync(process.execPath,
  [fileURLToPath(new URL('scripts/install-gitlab-native-browser.mjs', root)), source, ...(restore ? ['--restore'] : [])], { stdio: 'inherit' });
const prepared = ['app/assets/javascripts/content_editor/components/content_editor.vue',
  'app/assets/javascripts/vue_shared/components/markdown/markdown_editor.vue', 'babel.config.js',
  ...(before.formatVersion >= 7 ? ['app/assets/javascripts/lib/mermaid_sandbox.js'] : []),
  ...(before.formatVersion >= 8 ? ['app/assets/javascripts/behaviors/markdown/render_sandboxed_mermaid.js'] : []),
  ...(before.formatVersion === 9 ? ['app/assets/javascripts/behaviors/markdown/render_gfm.js'] : []),
  ...(before.formatVersion >= 10 ? ['app/assets/javascripts/lazy_loader.js'] : []),
  ...(before.formatVersion >= 11 ? ['app/assets/javascripts/content_editor/components/bubble_menus/code_block_bubble_menu.vue',
    'app/assets/javascripts/content_editor/components/bubble_menus/media_bubble_menu.vue'] : [])];
let restored = false;
try {
  install(true); restored = true;
  if (!JSON.parse(await readFile(manifest)).restored) throw new Error('Missing restore receipt.');
  for (const path of Object.keys(before.files).filter(path => !prepared.includes(path))) {
    try { await access(`${source}/${path}`); throw new Error(`Owned addition remains after source rollback: ${path}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
} finally { if (restored) install(false); }
const after = JSON.parse(await readFile(manifest));
for (const [path, digest] of Object.entries(before.files))
  if (after.files[path] !== digest || createHash('sha256').update(await readFile(`${source}/${path}`)).digest('hex') !== digest)
    throw new Error(`Reinstalled source differs: ${path}`);
const authoring = process.argv.includes('--diagram-authoring');
const reader = process.argv.includes('--diagram-reader');
const frontmatter = process.argv.includes('--frontmatter');
const footnoteSource = process.argv.includes('--footnote-source');
const autocomplete = process.argv.includes('--autocomplete') || footnoteSource;
const quickActionControls = process.argv.includes('--quick-action-controls') || autocomplete;
const quickActions = process.argv.includes('--quick-actions') || quickActionControls;
const refined = process.argv.includes('--context-ui') || quickActions;
const contextual = process.argv.includes('--context-menus') || refined;
const profile = footnoteSource ? 'footnote-source' : autocomplete ? 'autocomplete' : quickActionControls ? 'quick-action-controls' : quickActions ? 'quick-actions' : refined ? 'context-ui' : contextual ? 'context-menus' : frontmatter ? 'frontmatter' : reader ? 'diagram-reader' : authoring ? 'diagram-authoring' : process.argv.includes('--diagrams') ? 'diagram' : process.argv.includes('--reference-contexts') ? 'reference-context' : process.argv.includes('--references') ? 'reference' : process.argv.includes('--media-files') ? 'media-files' : before.formatVersion === 5 ? 'media' : 'alert';
await writeFile(new URL(`artifacts/gitlab-native-${profile}-install-roundtrip-${quickActions ? '20261114' : authoring || reader || frontmatter || contextual ? '20261113' : '20261112'}.json`, root), JSON.stringify({
  status: 'passed', formatVersion: before.formatVersion, files, revision: after.revision,
  checks: [`Guarded ${files}-file source rollback succeeds`, `${files - prepared.length} verified additions are removed`,
    'Exact current source generation is reinstalled', `All ${files} source digests match`],
  scope: 'Source rollback with application stopped; compiled deployment rollback remains separate acceptance work',
}, null, 2) + '\n');
