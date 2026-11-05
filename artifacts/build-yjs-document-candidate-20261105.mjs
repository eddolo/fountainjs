import { build } from 'vite';
import { resolve } from 'node:path';

await build({ configFile: false, build: {
  lib: { entry: { 'retained-document': resolve('src/yjs/retained-document.ts') }, formats: ['es', 'cjs'],
    fileName: format => `retained-document.${format === 'es' ? 'mjs' : 'cjs'}` },
  rollupOptions: { external: ['yjs'] }, outDir: 'artifacts/yjs-document-build-20261105',
  sourcemap: true, minify: false, emptyOutDir: true,
} });
