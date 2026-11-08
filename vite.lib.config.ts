import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import MagicString from 'magic-string';
import { minify } from 'terser';
import { defineConfig } from 'vite';

const optionalRootChunks = ['ai-document-tools', 'ai-conversation', 'ai-generated-media'];

function deferCommonJsRootExports(code: string) {
  const edited = new MagicString(code);
  for (const chunk of optionalRootChunks) {
    const declaration = new RegExp(`^const (\\w+) = require\\(['"]\\./${chunk}\\.cjs['"]\\);$`, 'm').exec(code);
    if (!declaration) throw new Error(`Missing direct CommonJS re-export chunk ${chunk}.`);
    const binding = declaration[1];
    const assignments = [...code.matchAll(new RegExp(`^exports\\.(\\w+) = ${binding}\\.(\\w+);$`, 'gm'))];
    const references = [...code.matchAll(new RegExp(`\\b${binding}\\b`, 'g'))];
    if (!assignments.length || references.length !== assignments.length + 1) {
      throw new Error(`Cannot defer ${chunk}: the CommonJS root uses it outside direct re-exports.`);
    }
    edited.overwrite(declaration.index, declaration.index + declaration[0].length,
      `const ${binding} = () => require("./${chunk}.cjs");`);
    for (const assignment of assignments) {
      const [statement, name, member] = assignment;
      // The assignment keeps the name visible to Node's CommonJS export lexer.
      const alias = name === member ? '' : `, "${member}"`;
      edited.overwrite(assignment.index, assignment.index + statement.length,
        `exports.${name} = undefined; deferFountainExport("${name}", ${binding}${alias});`);
    }
  }
  edited.append(`
function deferFountainExport(name, load, member = name) {
  let initialized = false;
  let cached;
  Object.defineProperty(exports, name, {
    enumerable: true,
    configurable: true,
    get() {
      if (!initialized) {
        cached = load()[member];
        initialized = true;
      }
      return cached;
    },
    set(value) {
      Object.defineProperty(this, name, { value, enumerable: true, configurable: true, writable: true });
    }
  });
}
`);
  return { code: edited.toString(), map: edited.generateMap({ hires: true }) };
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'fountain-library-output',
      outputOptions(options) {
        const extension = options.format === 'cjs' ? 'cjs' : 'js';
        return {
          ...options,
          // Terser compacts ESM without stripping downstream tree-shaking annotations.
          ...(options.format === 'es' ? { minify: false } : {}),
          chunkFileNames({ name }) {
            // The size gate locates the shared HTML entity decoder by this prefix.
            const prefix = name === 'decode' || name === 'markdown-html' ? '[name]-' : '';
            return `${prefix}[hash].${extension}`;
          },
        };
      },
      renderChunk: {
        order: 'post',
        async handler(code, chunk, options) {
          if (options.format === 'cjs' && chunk.fileName === 'index.cjs') return deferCommonJsRootExports(code);
          if (options.format !== 'es') return;
          const output = await minify({ [chunk.fileName]: code }, {
            module: true,
            ecma: 2022,
            safari10: true,
            compress: { passes: 2 },
            format: { preserve_annotations: true },
            sourceMap: Boolean(options.sourcemap),
          });
          if (output.code === undefined) throw new Error(`Minification did not emit ${chunk.fileName}.`);
          return { code: output.code, map: output.map };
        },
      },
    },
  ],
  build: {
    lib: {
      entry: {
        index: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        core: fileURLToPath(new URL('./src/headless/index.ts', import.meta.url)),
        'ai-document-tools': fileURLToPath(new URL('./src/ai/document-tools.ts', import.meta.url)),
        'ai-conversation': fileURLToPath(new URL('./src/ai/conversation.ts', import.meta.url)),
        'ai-generated-media': fileURLToPath(new URL('./src/ai/generated-media.ts', import.meta.url)),
        docx: fileURLToPath(new URL('./src/docx/index.ts', import.meta.url)),
        react: fileURLToPath(new URL('./src/react/index.ts', import.meta.url)),
        vue: fileURLToPath(new URL('./src/vue/index.ts', import.meta.url)),
        svelte: fileURLToPath(new URL('./src/svelte/index.ts', import.meta.url)),
        'document-utilities': fileURLToPath(new URL('./src/document-utilities.ts', import.meta.url)),
        'emoji-data': fileURLToPath(new URL('./src/emoji-data.ts', import.meta.url)),
        yjs: fileURLToPath(new URL('./src/yjs/index.ts', import.meta.url)),
        'yjs-room': fileURLToPath(new URL('./src/yjs/room.ts', import.meta.url)),
        'yjs-retained': fileURLToPath(new URL('./src/experimental/yjs-retained.ts', import.meta.url)),
        comments: fileURLToPath(new URL('./src/comments/index.ts', import.meta.url)),
        'react-comments': fileURLToPath(new URL('./src/react/comments.ts', import.meta.url)),
        'tracked-changes': fileURLToPath(new URL('./src/tracked-changes/index.ts', import.meta.url)),
        'react-tracked-changes': fileURLToPath(new URL('./src/react/tracked-changes.ts', import.meta.url)),
        versions: fileURLToPath(new URL('./src/versions/index.ts', import.meta.url)),
        'react-versions': fileURLToPath(new URL('./src/react/versions.ts', import.meta.url)),
        'react-integrity': fileURLToPath(new URL('./src/react/integrity.ts', import.meta.url)),
        details: fileURLToPath(new URL('./src/details/index.ts', import.meta.url)),
        ruby: fileURLToPath(new URL('./src/ruby/index.ts', import.meta.url)),
        'text-style': fileURLToPath(new URL('./src/text-style/index.ts', import.meta.url)),
        testing: fileURLToPath(new URL('./src/testing/index.ts', import.meta.url)),
        migrations: fileURLToPath(new URL('./src/migrations/index.ts', import.meta.url)),
        'node-ids': fileURLToPath(new URL('./src/node-ids/index.ts', import.meta.url)),
        'table-of-contents': fileURLToPath(new URL('./src/table-of-contents/index.ts', import.meta.url)),
        integrity: fileURLToPath(new URL('./src/integrity/index.ts', import.meta.url)),
        'integrity-dom': fileURLToPath(new URL('./src/integrity/dom.ts', import.meta.url)),
        'structured-attributes': fileURLToPath(new URL('./src/structured-attributes/index.ts', import.meta.url)),
        'html-server': fileURLToPath(new URL('./src/html/server.ts', import.meta.url)),
        'html-inert': fileURLToPath(new URL('./src/html/inert.ts', import.meta.url)),
        'html-source': fileURLToPath(new URL('./src/html/source.ts', import.meta.url)),
        widgets: fileURLToPath(new URL('./src/widgets/index.ts', import.meta.url)),
        'widgets-dom': fileURLToPath(new URL('./src/widgets/dom.ts', import.meta.url)),
        'react-widgets': fileURLToPath(new URL('./src/react/widgets.tsx', import.meta.url)),
        pages: fileURLToPath(new URL('./src/pages/index.ts', import.meta.url)),
        'pages-dom': fileURLToPath(new URL('./src/pages/dom.ts', import.meta.url)),
        'pages-preview': fileURLToPath(new URL('./src/pages/preview.ts', import.meta.url)),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'vue', 'svelte', 'svelte/store', 'yjs'],
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
