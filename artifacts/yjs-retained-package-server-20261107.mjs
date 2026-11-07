import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const root = readFileSync('artifacts/yjs-retained-package-consumer-20261107.path', 'utf8').trim();
const server = await createServer({
  configFile: false,
  root,
  optimizeDeps: {
    entries: ['index.html'],
    noDiscovery: true,
    include: ['yjs', 'fountainjs-editor', 'fountainjs-editor/experimental/yjs-retained'],
  },
  server: { host: '127.0.0.1', port: 4195, strictPort: true, open: false, watch: null },
});
await server.listen();
