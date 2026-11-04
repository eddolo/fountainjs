import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';
import { Miniflare } from 'miniflare';
import { expectedMathParagraph } from './exercise-math-paragraph-20261104.mjs';
const result = await build({ configFile: false, publicDir: false, logLevel: 'error',
  build: { write: false, target: 'es2022', minify: false,
    lib: { entry: resolve('artifacts/math-paragraph-worker-20261104.mjs'), formats: ['es'] },
    rollupOptions: { output: { codeSplitting: false } } } });
const chunks = (Array.isArray(result) ? result : [result]).flatMap(item => item.output).filter(item => item.type === 'chunk');
assert.equal(chunks.length, 1);
assert.doesNotMatch(chunks[0].code, /\bfrom\s+["']node:/u);
const worker = new Miniflare({ modules: true, script: chunks[0].code, compatibilityDate: '2025-01-01', cf: false });
try {
  const response = await worker.dispatchFetch('https://fountain.test/image-paragraph', { method: 'POST',
    body: await readFile('tests/fixtures/native-docx/cooling-report.docx') });
  assert.equal(response.status, 200, await response.clone().text());
  const observed = await response.json();
  assert.deepEqual(observed, expectedMathParagraph);
  console.log('Real workerd actual Word fixture: equation paragraph context, complete HTML, native reopening, source editing and exact undo passed without DOM globals.');
  console.log(JSON.stringify(observed));
} finally { await worker.dispose(); }
