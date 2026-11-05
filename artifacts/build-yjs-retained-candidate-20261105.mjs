import { build } from 'vite';
import { resolve } from 'node:path';

await build({ configFile: false, build: {
  lib: { entry: Object.fromEntries(['text', 'nodes', 'mapping'].map(name => [`retained-${name}`, resolve(`src/yjs/retained-${name}.ts`)])),
    formats: ['es', 'cjs'], fileName: (format, name) => `${name}.${format === 'es' ? 'mjs' : 'cjs'}` },
  rollupOptions: { external: ['yjs'] },
  outDir: 'artifacts/yjs-retained-build-20261105', sourcemap: true, minify: false, emptyOutDir: false,
} });
