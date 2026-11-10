import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  cacheDir: 'node_modules/.vite-yjs-default',
  optimizeDeps: { entries: ['artifacts/yjs-default-fixture.html'], include: ['yjs'] },
  server: { watch: null, open: false, host: '127.0.0.1', port: 4196, strictPort: true },
});
