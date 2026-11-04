import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from 'vite';
import { Miniflare } from 'miniflare';
const result = await build({ configFile: false, publicDir: false, logLevel: 'error',
  build: { write: false, target: 'es2022', minify: false,
    lib: { entry: resolve('artifacts/paragraph-spacing-worker-20261104.mjs'), formats: ['es'] },
    rollupOptions: { output: { codeSplitting: false } },
  },
});
const chunks = (Array.isArray(result) ? result : [result]).flatMap(item => item.output).filter(item => item.type === 'chunk');
assert.equal(chunks.length, 1);
assert.doesNotMatch(chunks[0].code, /\bfrom\s+["']node:/u);
const worker = new Miniflare({ modules: true, script: chunks[0].code, compatibilityDate: '2025-01-01', cf: false });
try {
  const before = { unit: 'pt', spacingGroup: 'body', spacingBefore: 0, spacingAfter: 10, contextualSpacing: true };
  const after = { ...before, spacingBefore: 12, spacingAfter: 0, contextualSpacing: false };
  const p = (text, layout) => ({ type: 'paragraph', attrs: { layout }, content: [{ type: 'text', text }] });
  const response = await worker.dispatchFetch('https://fountain.test/spacing', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'doc', content: [p('First', before), p('Second', after)] }) });
  assert.equal(response.status, 200, await response.clone().text());
  const value = await response.json();
  assert.deepEqual(value, { before: 2, after: 12, retainedDeclaredBefore: 12, htmlEqual: true, noDOM: true });
  console.log('Real Cloudflare workerd: DOM-free contextual gaps, immutable declarations, transactions and HTML retention passed.');
  console.log(JSON.stringify(value));
} finally { await worker.dispose(); }
