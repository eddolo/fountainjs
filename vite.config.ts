import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { svelte } from '@sveltejs/vite-plugin-svelte';
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
  plugins: [react(), svelte({ configFile: false })],
  // The optional Vue demo uses render functions, not the template compiler.
  define: { __VUE_OPTIONS_API__: false, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
  // The export diagnostic is loaded dynamically. Prebundle its server-side
  // adaptor before mounting it so first use cannot trigger a Vite full reload.
  optimizeDeps: { include: ['@mathjax/src/js/adaptors/liteAdaptor.js'] },
  // This lab explicitly selects the bundled TeX font. Avoid also shipping
  // MathJax's unused NewCM default font through SVG's fallback import.
  resolve: { alias: [{
    find: '#default-font/svg/default.js',
    replacement: fileURLToPath(new URL('./node_modules/@mathjax/mathjax-tex-font/mjs/svg/default.js', import.meta.url)),
  }] },
  server: { port: 5173, open: true },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./examples/react-app/index.html', import.meta.url)),
        developers: fileURLToPath(new URL('./examples/react-app/developers.html', import.meta.url)),
        demos: fileURLToPath(new URL('./examples/react-app/demos.html', import.meta.url)),
        mathRenderer: fileURLToPath(new URL('./examples/react-app/math-renderer.html', import.meta.url)),
        mathReferences: fileURLToPath(new URL('./examples/react-app/math-references.html', import.meta.url)),
        ...Object.fromEntries(demoSlugs.map((slug) => [
          `demo-${slug}`,
          fileURLToPath(new URL(`./examples/react-app/demos/${slug}.html`, import.meta.url)),
        ])),
      },
    },
  },
});
