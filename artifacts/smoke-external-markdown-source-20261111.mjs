import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const modules = { esm: await import('fountainjs-editor'), commonjs: createRequire(import.meta.url)('fountainjs-editor') };
assert.equal('window' in globalThis, false);
assert.equal('document' in globalThis, false);
for (const [format, lib] of Object.entries(modules)) {
  const schema = new lib.Schema(lib.CoreSchemaSpec);
  const document = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('External')])]);
  const raw = 'External  \r\n\r\n';
  const snapshot = lib.MarkdownSourceSnapshot.capture(raw, document);
  assert.deepEqual(lib.MarkdownExporter.exportWithSource(document, snapshot), { markdown: raw, preservation: 'exact', losses: [] });
  assert.equal(snapshot.mapBlocks(document), null);
  const changed = document.copy([schema.node('paragraph', {}, [schema.text('Changed')])]);
  assert.equal(lib.MarkdownExporter.exportWithSource(changed, snapshot).preservation, 'canonical');
  console.log(JSON.stringify({ format, scope: 'Actual local public package build; not a sealed archive or registry consumer',
    noBrowserGlobals: true, noFakeDOM: true, exactCapture: true, canonicalAfterEdit: true }));
}
