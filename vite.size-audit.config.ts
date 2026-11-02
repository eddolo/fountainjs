import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.lib.config.ts';

// Diagnostic-only metadata. Do not alter transforms/minification/chunking or
// empty the package dist consumed by the user's running demo.
export default mergeConfig(base, defineConfig({
  build: { outDir: 'artifacts/shared-direction-size-audit-dist-20261011', emptyOutDir: false },
  plugins: [{
    name: 'shared-direction-rendered-size-audit',
    generateBundle(options, bundle) {
      const chunks = Object.values(bundle).filter(item => item.type === 'chunk').map(chunk => ({
        file: chunk.fileName, bytes: Buffer.byteLength(chunk.code),
        sha256: createHash('sha256').update(chunk.code).digest('hex'),
        modules: Object.entries(chunk.modules).map(([id, module]) => ({
          source: relative(process.cwd(), id).replaceAll('\\', '/'), renderedLength: module.renderedLength,
        })),
      }));
      writeFileSync(`artifacts/shared-direction-size-audit-${options.format}-20261011.json`, JSON.stringify({
        format: options.format, diagnosticOnly: true, chunks,
      }, null, 2) + '\n');
    },
  }],
}));
