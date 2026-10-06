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
  if (body.paragraphRecovered !== true) throw new Error('Worker paragraph HTML recovery failed.');
  if (body.paragraphSources !== true) throw new Error('Worker Markdown flow paragraph inspection failed.');
  if (body.pageSettingsChecked !== true) throw new Error('Worker complete HTML page-settings interchange failed.');
  if (body.commentsChecked !== true) throw new Error('Worker inert HTML comment interchange failed.');
  if (body.flowChecked !== true) throw new Error('Worker anonymous HTML flow interchange failed.');
  if (body.blockAtomsChecked !== true) throw new Error('Worker protected Markdown block-atom interchange/refusal failed.');
  if (body.emphasisChecked !== 140) throw new Error('Worker native emphasis/partial-schema interchange failed.');
  if (body.modelIntegrityChecked !== 576) throw new Error('Worker native model integrity failed.');
  if (body.inertSourceChecked !== true) throw new Error('Worker inert inline source preservation failed.');
  if (body.linkControlsChecked !== 486) throw new Error('Worker HTML link normalization/security/history failed.');
  console.log(`Cloudflare workerd (Miniflare): ${body.linkControlsChecked} link normalization/security/history/destination contracts passed.`);
  console.log('Cloudflare workerd (Miniflare): inert inline lexical data, complete reopen, transactions/history and carrier refusal passed.');
  console.log('Cloudflare workerd (Miniflare): 576 owned-attribute checks plus immutable snapshots/history passed.');
  console.log('Cloudflare workerd (Miniflare): 140 native emphasis and partial-schema retention checks passed.');
  console.log('Cloudflare workerd (Miniflare): protected Markdown images/rules/tables, full reopen and refusal guards passed.');
  console.log('Cloudflare workerd (Miniflare): anonymous HTML flow without synthetic paragraphs and native/canonical reopening passed.');
  console.log('Cloudflare workerd (Miniflare): inert HTML comment retention, canonical reopen and breakout rejection passed.');
  console.log('Cloudflare workerd (Miniflare): DOM-free server HTML import/export passed.');
  console.log('Cloudflare workerd (Miniflare): complete HTML page-settings retention and invalid/fragment boundaries passed.');
} finally {
  await worker.dispose();
}
