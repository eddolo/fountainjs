import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import { Miniflare } from 'miniflare';

const built = await build({
  configFile: false, publicDir: false, logLevel: 'error',
  build: { write: false, target: 'es2022', minify: false,
    lib: { entry: resolve('artifacts/list-layout-worker-20261103.mjs'), formats: ['es'] },
    rollupOptions: { output: { codeSplitting: false } },
  },
});
const chunks = (Array.isArray(built) ? built : [built]).flatMap(item => item.output).filter(item => item.type === 'chunk');
assert.equal(chunks.length, 1);
assert.doesNotMatch(chunks[0].code, /\bfrom\s+["']node:/u);
const worker = new Miniflare({ modules: true, script: chunks[0].code, compatibilityDate: '2025-01-01', cf: false });
try {
  const response = await worker.dispatchFetch('https://fountain.test/docx', {
    method: 'POST', body: readFileSync('tests/fixtures/native-docx/cooling-report.docx'),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const result = await response.json();
  const layout = { unit: 'pt', indentStart: 18, indentEnd: 0, markerOffset: -18, markerStyle: 'decimal', markerAlign: 'left', markerPrefix: '', markerSuffix: '.', firstLineIndent: 0 };
  assert.deepEqual(result, { list: { imported: layout, reopened: layout },
    imported: { text: 'Cooling experiment report', paragraphFamily: 'Calibri', textFamily: 'Calibri' },
    reopened: { text: 'Cooling experiment report', paragraphFamily: 'Calibri', textFamily: 'Calibri' },
  });
  console.log('Real Cloudflare workerd: production DOCX import/export/reopen preserves declared en-US theme font without DOM or Node built-ins.');
  console.log(JSON.stringify(result));
} finally { await worker.dispose(); }
