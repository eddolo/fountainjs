import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { gitlabVue2BridgePlugin } from './tools/gitlab-bridge/vite-plugin.mjs';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: false,
  plugins: [gitlabVue2BridgePlugin()],
  server: { open: false },
  build: {
    outDir: 'artifacts/gitlab-vue2-site',
    rollupOptions: { input: fileURLToPath(new URL('./tests/browser/fixtures/gitlab-vue2.html', import.meta.url)) },
  },
});
