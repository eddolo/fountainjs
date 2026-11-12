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
  'integrations/gitlab/services/markdown_insertion.ts',
  'integrations/gitlab/services/attachment_uploads.ts',
  'integrations/gitlab/services/host_configuration.ts',
  'integrations/gitlab/services/serialized_content.ts',
  'integrations/gitlab/services/markdown_codec.ts',
  'integrations/gitlab/services/math.ts',
  'integrations/gitlab/services/asset_resolver.ts',
  'integrations/gitlab/plugins/reference_navigation.ts',
  'dist/index.js',
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
