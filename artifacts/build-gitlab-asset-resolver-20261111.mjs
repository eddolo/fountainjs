import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { stat, writeFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = new URL('./gitlab-asset-resolver-browser-20261111/', import.meta.url);
await build({ configFile: false, root, build: {
  outDir: fileURLToPath(directory),
  lib: { entry: fileURLToPath(new URL('../integrations/gitlab/services/asset_resolver.ts', import.meta.url)),
    formats: ['es'], fileName: 'asset-resolver' },
} });
const bytes = (await stat(new URL('asset-resolver.js', directory))).size;
await writeFile(new URL('build-report.json', directory), JSON.stringify({
  target: 'Private GitLab browser integration prototype', format: 'ESM', bytes,
  scope: 'Browser-targeted Vite bundle of the actual resolver, parse5 and public URL gate; not a running GitLab service or complete product.',
  packageRuntimeChanged: false,
}, null, 2) + '\n');
console.log(JSON.stringify({ bytes }));
