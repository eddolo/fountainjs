import { build } from 'vite';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
await build({ configFile: false, root: fileURLToPath(root), build: {
  outDir: fileURLToPath(new URL('artifacts/gitlab-footnote-probe/', root)),
  emptyOutDir: true, target: 'es2022', minify: false,
  lib: { entry: fileURLToPath(new URL('integrations/gitlab/runtime/footnote_probe_capture.ts', root)),
    formats: ['es'], fileName: () => 'source.mjs' },
} });
