import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from 'vite';
import { Miniflare } from 'miniflare';
import { strToU8, zipSync } from 'fflate';
const result = await build({ configFile: false, publicDir: false, logLevel: 'error',
  build: { write: false, target: 'es2022', minify: false,
    lib: { entry: resolve('artifacts/docx-spacing-identity-worker-20261104.mjs'), formats: ['es'] },
    rollupOptions: { output: { codeSplitting: false } },
  },
});
const chunks = (Array.isArray(result) ? result : [result]).flatMap(item => item.output).filter(item => item.type === 'chunk');
assert.equal(chunks.length, 1);
assert.doesNotMatch(chunks[0].code, /\bfrom\s+["']node:/u);
const worker = new Miniflare({ modules: true, script: chunks[0].code, compatibilityDate: '2025-01-01', cf: false });
try {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const bytes = zipSync({ 'word/document.xml': strToU8(`<w:document xmlns:w="${W}"><w:body><w:p><w:pPr><w:spacing w:before="0" w:after="200"/><w:contextualSpacing/></w:pPr><w:r><w:t>Before</w:t></w:r></w:p><w:p><w:pPr><w:spacing w:before="240" w:after="0"/><w:contextualSpacing w:val="0"/></w:pPr><w:r><w:t>After</w:t></w:r></w:p></w:body></w:document>`) });
  const response = await worker.dispatchFetch('https://fountain.test/native-spacing', { method: 'POST', body: bytes });
  assert.equal(response.status, 200, await response.clone().text());
  const observed = await response.json();
  assert.deepEqual(observed, { before: 2, after: 12, retainedDeclaredBefore: 12, retainedOff: false,
    importLoss: 0, exportLoss: 2, nativeBytes: true, htmlEqual: true, noDOM: true });
  console.log('Real workerd: actual DOCX bytes, retained Word identity/off declarations, core transaction, HTML reopening and explicitly lossy native export passed without DOM globals.');
  console.log(JSON.stringify(observed));
} finally { await worker.dispose(); }
