import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = new URL('../', import.meta.url);
const out = new URL('artifacts/gitlab-native-runtime/', root);
await mkdir(out, { recursive: true });
await build({
  configFile: false,
  root: fileURLToPath(root),
  build: {
    outDir: fileURLToPath(out),
    emptyOutDir: false,
    target: 'es2018',
    lib: {
      entry: fileURLToPath(new URL('integrations/gitlab/runtime/browser.ts', root)),
      formats: ['es'],
      fileName: () => 'fountain-runtime.mjs',
    },
    minify: false,
  },
});
const bytes = await readFile(new URL('fountain-runtime.mjs', out));
const inputs = {};
for (const path of [
  'integrations/gitlab/runtime/browser.ts',
  'integrations/gitlab/services/content_editor.ts',
  'src/core/plugin.ts',
  'src/core/clipboard-write.ts',
  'src/core/commands.ts',
  'src/core/table-commands.ts',
  'src/core/table-clipboard.ts',
  'src/view/input.ts',
  'src/pages/clipboard.ts',
  'src/pages/index.ts',
  'integrations/gitlab/services/markdown_insertion.ts',
  'integrations/gitlab/services/attachment_uploads.ts',
  'integrations/gitlab/services/link_editing.ts',
  'integrations/gitlab/services/code_editing.ts',
  'integrations/gitlab/services/code_rendering.ts',
  'integrations/gitlab/services/code_suggestion_source.ts',
  'integrations/gitlab/services/code_suggestion_node.ts',
  'integrations/gitlab/services/code_suggestion_editing.ts',
  'integrations/gitlab/services/frontmatter.ts',
  'integrations/gitlab/services/alerts.ts',
  'integrations/gitlab/services/alert_editing.ts',
  'integrations/gitlab/services/media.ts',
  'integrations/gitlab/components/media_view.ts',
  'integrations/gitlab/services/media_editing.ts',
  'integrations/gitlab/services/host_configuration.ts',
  'integrations/gitlab/services/serialized_content.ts',
  'integrations/gitlab/services/markdown_codec.ts',
  'integrations/gitlab/services/task_rendering.ts',
  'integrations/gitlab/services/task_state.ts',
  'integrations/gitlab/services/footnote_source.ts',
  'integrations/gitlab/services/footnote_codec.ts',
  'integrations/gitlab/services/footnote_boundary.ts',
  'integrations/gitlab/services/task_body_extractor.js',
  'integrations/gitlab/services/task_conversion_patch.mjs',
  'integrations/gitlab/services/save_authority_patch.mjs',
  'integrations/gitlab/services/mode_retention_patch.mjs',
  'integrations/gitlab/services/footnote_editing.ts',
  'integrations/gitlab/services/footnote_renaming.ts',
  'integrations/gitlab/services/footnote_labels.ts',
  'integrations/gitlab/services/footnote_nodes.ts',
  'integrations/gitlab/services/footnote_positions.ts',
  'integrations/gitlab/services/footnote_projection.ts',
  'integrations/gitlab/services/footnote_rendering.ts',
  'integrations/gitlab/services/quick_actions.ts',
  'integrations/gitlab/services/quick_action_editing.ts',
  'integrations/gitlab/services/autocomplete_data.ts',
  'integrations/gitlab/services/autocomplete_editing.ts',
  'integrations/gitlab/services/math.ts',
  'integrations/gitlab/services/asset_resolver.ts',
  'integrations/gitlab/services/reference_editing.ts',
  'integrations/gitlab/plugins/reference_navigation.ts',
  'dist/index.js',
  'dist/document-utilities.js',
  'dist/pages.js',
])
  inputs[path] = createHash('sha256')
    .update(await readFile(new URL(path, root)))
    .digest('hex');
await writeFile(
  new URL('build.json', out),
  JSON.stringify(
    {
      scope:
        'Native Fountain/GitLab integration runtime; not a deployed or complete GitLab replacement',
      packageVersion: JSON.parse(await readFile(new URL('package.json', root), 'utf8')).version,
      entry: 'integrations/gitlab/runtime/browser.ts',
      target: 'es2018',
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      parentRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: fileURLToPath(root),
        encoding: 'utf8',
      }).trim(),
      inputs,
    },
    null,
    2,
  ) + '\n',
);
