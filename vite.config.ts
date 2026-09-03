import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const demoSlugs = [
  'react-article',
  'plain-dom-notes',
  'web-component-cms',
  'vue-runbook',
  'svelte-report',
  'angular-media',
  'node-markdown',
  'python-content-api',
  'go-docs-service',
  'java-approval-workflow',
] as const;

export default defineConfig({
  root: fileURLToPath(new URL('./examples/react-app', import.meta.url)),
  plugins: [react()],
  server: { port: 5173, open: true },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./examples/react-app/index.html', import.meta.url)),
        developers: fileURLToPath(new URL('./examples/react-app/developers.html', import.meta.url)),
        demos: fileURLToPath(new URL('./examples/react-app/demos.html', import.meta.url)),
        ...Object.fromEntries(demoSlugs.map((slug) => [
          `demo-${slug}`,
          fileURLToPath(new URL(`./examples/react-app/demos/${slug}.html`, import.meta.url)),
        ])),
      },
    },
  },
});
