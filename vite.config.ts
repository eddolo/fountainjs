import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { angularLinker } from './tools/angular-build/vite-plugin.mjs';

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
  plugins: [angularLinker(), react(), svelte({ configFile: false })],
  // The optional Vue demo uses render functions, not the template compiler.
  define: { __VUE_OPTIONS_API__: false, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
  // Export diagnostics and registered HTML recovery load their server adapters
  // lazily. Include their dependencies before first use: discovering these only
  // during an import can re-optimize the graph and reload an active document.
  optimizeDeps: {
    include: ['@mathjax/src/js/adaptors/liteAdaptor.js', 'rxjs', 'rxjs/operators', 'css-select', 'parse5', 'parse5-htmlparser2-tree-adapter', 'fountainjs-editor/html/inert'],
    exclude: ['fountainjs-editor/angular', '@angular/core', '@angular/common', '@angular/platform-browser'],
  },
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
        conversionLab: fileURLToPath(new URL('./examples/react-app/conversion-lab.html', import.meta.url)),
        workflows: fileURLToPath(new URL('./examples/react-app/workflows.html', import.meta.url)),
        taskWorkflow: fileURLToPath(new URL('./examples/react-app/task-workflow.html', import.meta.url)),
        issueEditor: fileURLToPath(new URL('./examples/react-app/issue-editor.html', import.meta.url)),
        mathRenderer: fileURLToPath(new URL('./examples/react-app/math-renderer.html', import.meta.url)),
        mathReferences: fileURLToPath(new URL('./examples/react-app/math-references.html', import.meta.url)),
        blockReordering: fileURLToPath(new URL('./examples/react-app/block-reordering.html', import.meta.url)),
        ...Object.fromEntries(demoSlugs.map((slug) => [
          `demo-${slug}`,
          fileURLToPath(new URL(`./examples/react-app/demos/${slug}.html`, import.meta.url)),
        ])),
      },
    },
  },
});
