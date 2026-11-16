import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.argv[2] || !isAbsolute(process.argv[2])) throw new Error('Pass the absolute pinned GitLab source checkout.');
const source = await realpath(process.argv[2]);
const root = new URL('../', import.meta.url);
const pin = JSON.parse(await readFile(new URL('integrations/gitlab/runtime/upstream.json', root)));
const temporary = await mkdtemp(join(tmpdir(), 'fountain-gitlab-patch-check-'));
const env = { ...process.env, GIT_INDEX_FILE: join(temporary, 'index') };
const run = (...args) => execFileSync('git', args, { cwd: source, env, encoding: 'utf8' });
const names = ['current-document', 'native-host-tests', 'native-component-tests', 'native-attachment-tests',
  'native-upload-capacity-tests', 'native-link-tests', 'native-code-tests', 'native-alert-tests', 'native-media-tests', 'native-reference-tests', 'native-diagram-tests'];
const frontmatter = process.argv.includes('--frontmatter');
const suggestions = process.argv.includes('--suggestions');
const footnoteSource = suggestions || process.argv.includes('--footnote-source');
const autocomplete = process.argv.includes('--autocomplete') || footnoteSource;
const quickActionControls = process.argv.includes('--quick-action-controls') || autocomplete;
const quickActions = process.argv.includes('--quick-actions') || quickActionControls;
const refined = process.argv.includes('--context-ui') || quickActions;
const contextual = process.argv.includes('--context-menus') || refined;
if (process.argv.includes('--diagram-reader') || frontmatter || contextual) names.push('native-diagram-reader-tests');
if (frontmatter || contextual) names.push('native-frontmatter-tests');
if (contextual) names.push('native-context-menu-tests');
if (quickActions) names.push('native-quick-action-tests');
if (quickActionControls) names.push('native-quick-action-controls-tests');
if (autocomplete) names.push('native-autocomplete-tests', 'native-sidebar-focus-tests');
if (suggestions) names.push('native-suggestion-tests');
const patches = names.map(name => `integrations/gitlab/patches/gitlab-19.5.3-${name}.patch`);
try {
  const revision = run('rev-parse', 'HEAD').trim();
  if (revision !== pin.commit) throw new Error('Unexpected GitLab source revision.');
  run('read-tree', 'HEAD');
  const hashes = {};
  for (const path of patches) {
    const absolute = fileURLToPath(new URL(path, root));
    run('apply', '--cached', '--check', absolute);
    run('apply', '--cached', '--whitespace=nowarn', absolute);
    hashes[path] = createHash('sha256').update(await readFile(absolute)).digest('hex');
  }
  for (const path of [...(autocomplete ? ['app/assets/javascripts/super_sidebar/components/super_sidebar.vue',
    'spec/frontend/super_sidebar/components/super_sidebar_spec.js',
    'spec/frontend/content_editor/components/fountain_autocomplete_spec.js',
    'spec/frontend/content_editor/fixtures/fountain_autocomplete_live.json'] : []), ...(quickActionControls ? ['spec/frontend/content_editor/components/fountain_quick_action_menu_spec.js',
    'spec/frontend/content_editor/components/fountain_quick_action_host_spec.js',
    'spec/frontend/content_editor/fixtures/fountain_quick_action_commands_live.json'] : []), ...(quickActions ? ['app/assets/javascripts/work_items/components/work_item_description.vue',
    'spec/frontend/work_items/components/work_item_description_spec.js'] : []), 'spec/frontend/content_editor/components/content_editor_spec.js',
    'spec/frontend/vue_shared/components/markdown/markdown_editor_spec.js',
    ...['link', 'code', 'alert', 'media', 'reference'].map(kind => `spec/frontend/content_editor/components/fountain_${kind}_menu_spec.js`),
    'spec/frontend/content_editor/fixtures/fountain_reference_live_html.json',
    'spec/frontend/content_editor/components/fountain_diagram_preview_spec.js',
    'spec/frontend/content_editor/components/fountain_diagram_authoring_host_spec.js',
    'spec/frontend/content_editor/fixtures/fountain_diagram_live_html.json',
    ...(process.argv.includes('--diagram-reader') || frontmatter || contextual ? ['spec/frontend/behaviors/markdown/fountain_diagram_reader_spec.js', 'spec/frontend/behaviors/markdown/fountain_reader_images_spec.js'] : []),
    ...(frontmatter || contextual ? ['spec/frontend/content_editor/components/fountain_frontmatter_spec.js', 'spec/frontend/content_editor/fixtures/fountain_frontmatter_live_html.json'] : []),
    ...(contextual ? ['spec/frontend/content_editor/components/fountain_context_surface_spec.js', 'spec/frontend/content_editor/fixtures/fountain_media_live_html.json'] : [])]) {
    if (run('show', `:${path}`) !== await readFile(join(source, path), 'utf8'))
      throw new Error(`Reconstructed test source differs: ${path}`);
  }
  run('apply', '--reverse', '--check', fileURLToPath(new URL(patches.at(-1), root)));
  const report = { status: 'passed', revision, patches: hashes,
    checks: [`${patches.length} patches apply in order using a separate temporary index`,
      'Reconstructed host and native menu specs match the tested checkout byte for byte',
      'Last native test patch reverse-check passes'],
    isolation: 'Upstream worktree and main index are unchanged; temporary index removed' };
  const authoring = process.argv.includes('--diagram-authoring');
  const reader = process.argv.includes('--diagram-reader');
  const profile = suggestions ? 'suggestion' : footnoteSource ? 'footnote-source' : autocomplete ? 'autocomplete' : quickActionControls ? 'quick-action-controls' : quickActions ? 'quick-actions' : refined ? 'context-ui' : contextual ? 'context-menus' : frontmatter ? 'frontmatter' : reader ? 'diagram-reader' : authoring ? 'diagram-authoring' : process.argv.includes('--diagrams') ? 'diagram' : process.argv.includes('--references') ? 'reference' : process.argv.includes('--media-files') ? 'media-files' : 'media';
  await writeFile(new URL(`artifacts/gitlab-native-${profile}-patch-verification-${suggestions ? '20261116' : quickActions ? '20261114' : authoring || reader || frontmatter || contextual ? '20261113' : '20261112'}.json`, root), JSON.stringify(report, null, 2) + '\n');
  console.log(`${patches.length} ordered native patches reconstruct the tested pinned source.`);
} finally { await rm(temporary, { recursive: true, force: true }); }
