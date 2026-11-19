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
const files = ({ 4: 13, 5: 15, 6: 17, 7: 19, 8: 20, 9: 22, 10: 22, 11: 25, 12: 27, 13: 28, 14: 30, 15: 31, 16: 32, 17: 34, 18: 35, 19: 36, 20: 38 })[before.formatVersion];
if (before.source !== source || before.restored || !files || Object.keys(before.files).length !== files)
  throw new Error('Unexpected source install generation.');
const install = restore => execFileSync(process.execPath,
  [fileURLToPath(new URL('scripts/install-gitlab-native-browser.mjs', root)), source, ...(restore ? ['--restore'] : [])], { stdio: 'inherit' });
const backup = name => new URL('artifacts/gitlab-native-browser-install/prepared-' + name, root);
const originals = new Map([
  ['app/assets/javascripts/notes/components/noteable_note.vue', backup('noteable-note.vue')],
  ['app/assets/javascripts/notes/store/legacy_notes/actions.js', backup('review-actions.js')],
  ['app/assets/javascripts/content_editor/components/content_editor.vue', backup('content-editor.vue')],
  ['app/assets/javascripts/vue_shared/components/markdown/markdown_editor.vue', backup('markdown-editor.vue')],
  ['babel.config.js', backup('babel.config.js')],
  ['app/assets/javascripts/lib/mermaid_sandbox.js', backup('mermaid-sandbox.js')],
  ['app/assets/javascripts/behaviors/markdown/render_sandboxed_mermaid.js', backup('mermaid-reader.js')],
  ['app/assets/javascripts/behaviors/markdown/render_gfm.js', backup('render-gfm.js')],
  ['app/assets/javascripts/lazy_loader.js', backup('lazy-loader.js')],
  ['app/assets/javascripts/content_editor/components/bubble_menus/code_block_bubble_menu.vue', backup('code-block-bubble-menu.vue')],
  ['app/assets/javascripts/content_editor/components/bubble_menus/media_bubble_menu.vue', backup('media-bubble-menu.vue')],
  ['app/assets/javascripts/issues/show/utils.js', new URL('integrations/gitlab/fixtures/task-conversion-upstream.js', root)],
  ['app/assets/javascripts/work_items/components/work_item_detail.vue', backup('work-item-detail.vue')],
  ['app/assets/javascripts/work_items/components/work_item_description.vue', backup('work-item-description.vue')],
].filter(([path]) => Object.hasOwn(before.files, path)));
const reviewHeaderPath = 'app/assets/javascripts/vue_shared/components/markdown/suggestion_diff_header.vue';
const applyControlPath = 'app/assets/javascripts/vue_shared/components/markdown/apply_suggestion.vue';
if (before.files[applyControlPath]) originals.set(applyControlPath,
  execFileSync('git',['-C',source,'show',before.revision+':'+applyControlPath]));
if (before.files[reviewHeaderPath]) originals.set(reviewHeaderPath,
  execFileSync('git',['-C',source,'show',before.revision+':'+reviewHeaderPath]));
let restored = false;
try {
  install(true); restored = true;
  if (!JSON.parse(await readFile(manifest)).restored) throw new Error('Missing restore receipt.');
  for (const [path, reference] of originals) {
    if (!(await readFile(source + '/' + path)).equals(Buffer.isBuffer(reference) ? reference : await readFile(reference))) throw new Error('Restored source differs: ' + path);
  }
  for (const path of Object.keys(before.files).filter(path => !originals.has(path))) {
    try { await access(`${source}/${path}`); throw new Error(`Owned addition remains after source rollback: ${path}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
} finally { if (restored) install(false); }
const after = JSON.parse(await readFile(manifest));
if (after.integrationSHA256 !== before.integrationSHA256 || after.nativeRuntime.sha256 !== before.nativeRuntime.sha256)
  throw new Error('Reinstall changed the editor build identity.');
for (const [path, digest] of Object.entries(before.files))
  if (after.files[path] !== digest || createHash('sha256').update(await readFile(`${source}/${path}`)).digest('hex') !== digest)
    throw new Error(`Reinstalled source differs: ${path}`);
const authoring = process.argv.includes('--diagram-authoring');
const reader = process.argv.includes('--diagram-reader');
const frontmatter = process.argv.includes('--frontmatter');
const suggestionEffects = process.argv.includes('--suggestion-effects');
const suggestionTransport = process.argv.includes('--suggestion-transport');
const suggestions = suggestionEffects || suggestionTransport || process.argv.includes('--suggestions');
const footnoteSource = suggestions || process.argv.includes('--footnote-source');
const autocomplete = process.argv.includes('--autocomplete') || footnoteSource;
const quickActionControls = process.argv.includes('--quick-action-controls') || autocomplete;
const quickActions = process.argv.includes('--quick-actions') || quickActionControls;
const refined = process.argv.includes('--context-ui') || quickActions;
const contextual = process.argv.includes('--context-menus') || refined;
const profile = suggestionEffects ? 'suggestion-effects' : suggestionTransport ? 'suggestion-transport' : suggestions ? 'suggestion' : footnoteSource ? 'footnote-source' : autocomplete ? 'autocomplete' : quickActionControls ? 'quick-action-controls' : quickActions ? 'quick-actions' : refined ? 'context-ui' : contextual ? 'context-menus' : frontmatter ? 'frontmatter' : reader ? 'diagram-reader' : authoring ? 'diagram-authoring' : process.argv.includes('--diagrams') ? 'diagram' : process.argv.includes('--reference-contexts') ? 'reference-context' : process.argv.includes('--references') ? 'reference' : process.argv.includes('--media-files') ? 'media-files' : before.formatVersion === 5 ? 'media' : 'alert';
const receipt = before.formatVersion >= 14 ? 'artifacts/gitlab-native-browser-install/roundtrip.json' :
  `artifacts/gitlab-native-${profile}-install-roundtrip-${suggestions ? '20261116' : quickActions ? '20261114' : authoring || reader || frontmatter || contextual ? '20261113' : '20261112'}.json`;
await writeFile(new URL(receipt, root), JSON.stringify({
  status: 'passed', formatVersion: before.formatVersion, files, revision: after.revision,
  integrationSHA256: after.integrationSHA256, runtimeSHA256: after.nativeRuntime.sha256,
  checks: [`Guarded ${files}-file source rollback succeeds`, `${originals.size} originals restored byte-for-byte`, `${files - originals.size} verified additions are removed`,
    'Exact current source generation is reinstalled', `All ${files} source digests match`],
  scope: 'Source rollback with application stopped; compiled deployment rollback remains separate acceptance work',
}, null, 2) + '\n');
