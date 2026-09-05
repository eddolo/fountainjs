import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: {
        index: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        react: fileURLToPath(new URL('./src/react/index.ts', import.meta.url)),
        'document-utilities': fileURLToPath(new URL('./src/document-utilities.ts', import.meta.url)),
        'emoji-data': fileURLToPath(new URL('./src/emoji-data.ts', import.meta.url)),
        yjs: fileURLToPath(new URL('./src/yjs/index.ts', import.meta.url)),
        comments: fileURLToPath(new URL('./src/comments/index.ts', import.meta.url)),
        'react-comments': fileURLToPath(new URL('./src/react/comments.ts', import.meta.url)),
        'tracked-changes': fileURLToPath(new URL('./src/tracked-changes/index.ts', import.meta.url)),
        'react-tracked-changes': fileURLToPath(new URL('./src/react/tracked-changes.ts', import.meta.url)),
        versions: fileURLToPath(new URL('./src/versions/index.ts', import.meta.url)),
        'react-versions': fileURLToPath(new URL('./src/react/versions.ts', import.meta.url)),
        details: fileURLToPath(new URL('./src/details/index.ts', import.meta.url)),
        ruby: fileURLToPath(new URL('./src/ruby/index.ts', import.meta.url)),
        'text-style': fileURLToPath(new URL('./src/text-style/index.ts', import.meta.url)),
        testing: fileURLToPath(new URL('./src/testing/index.ts', import.meta.url)),
        migrations: fileURLToPath(new URL('./src/migrations/index.ts', import.meta.url)),
        'node-ids': fileURLToPath(new URL('./src/node-ids/index.ts', import.meta.url)),
        pages: fileURLToPath(new URL('./src/pages/index.ts', import.meta.url)),
        'pages-dom': fileURLToPath(new URL('./src/pages/dom.ts', import.meta.url)),
        'pages-preview': fileURLToPath(new URL('./src/pages/preview.ts', import.meta.url)),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'yjs'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react-dom/client': 'ReactDOM',
          'react/jsx-runtime': 'ReactJSXRuntime',
        },
      },
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
