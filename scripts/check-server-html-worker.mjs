import { resolve } from 'node:path';

import { Miniflare } from 'miniflare';
import { build } from 'vite';

const result = await build({
  configFile: false,
  publicDir: false,
  logLevel: 'error',
  build: {
    write: false,
    target: 'es2022',
    minify: false,
    lib: {
      entry: resolve('scripts/fixtures/server-html-worker.mjs'),
      formats: ['es'],
      fileName: () => 'server-html-worker.js',
    },
    rollupOptions: { output: { codeSplitting: false } },
  },
});

const outputs = Array.isArray(result) ? result : [result];
const chunks = outputs.flatMap((output) => output.output)
  .filter((output) => output.type === 'chunk');
if (chunks.length !== 1) throw new Error(`Expected one bundled Worker module, received ${chunks.length}.`);
const script = chunks[0].code;
if (/\bfrom\s+["']node:/.test(script)) throw new Error('Worker bundle imports a Node built-in module.');

const worker = new Miniflare({
  modules: true,
  script,
  compatibilityDate: '2025-01-01',
  cf: false,
});

try {
  const response = await worker.dispatchFetch('https://fountain.test/convert', {
    method: 'POST',
    body: '<h2>Worker</h2><p><em>real workerd</em> conversion</p>',
  });
  if (!response.ok) throw new Error(`Worker returned ${response.status}: ${await response.text()}`);
  const body = await response.json();
  if (body.blocks !== 2 || body.text !== 'Workerreal workerd conversion') {
    throw new Error(`Worker returned an unexpected document: ${JSON.stringify(body)}`);
  }
  if (!body.html.includes('<em>real workerd</em>') || body.issues.length !== 0) {
    throw new Error(`Worker lost semantic HTML: ${JSON.stringify(body)}`);
  }
  console.log('Cloudflare workerd (Miniflare): DOM-free server HTML import/export passed.');
} finally {
  await worker.dispose();
}
