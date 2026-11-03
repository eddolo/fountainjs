import assert from 'node:assert/strict';
import { strFromU8, unzipSync } from 'fflate';

/** Exercise public built-package entries, not TypeScript source helpers. */
export function checkListLayout(api, server, docx, schemaSpec) {
  assert.equal(typeof globalThis.document, 'undefined');
  const layout = { unit: 'pt', indentStart: 18, indentEnd: 0, markerOffset: -18,
    markerStyle: 'decimal', markerAlign: 'left', markerPrefix: '', markerSuffix: '.', firstLineIndent: 0 };
  assert.equal(api.isListLayout(layout), true);
  assert.equal(api.isListLayout({ ...layout, markerStyle: 'decimal);color:red' }), false);
  const schema = new api.Schema(schemaSpec);
  const paragraph = text => schema.node('paragraph', {}, [schema.text(text)]);
  const document = schema.node('doc', {}, [schema.node('ordered_list', { start: 3, layout }, [
    schema.node('list_item', {}, [paragraph('First')]), schema.node('list_item', {}, [paragraph('Second')]),
  ])]);
  assert.equal(schema.nodeFromJSON(document.toJSON()).eq(document), true);
  const html = api.HTMLExporter.export(document, { document: false });
  assert.match(html, /list-style-type:decimal/u);
  assert.doesNotMatch(html, /list-style:none/u);
  assert.equal(server.ServerHTMLImporter.parse(html, schema).eq(document), true);
  const loss = api.MarkdownExporter.exportWithReport(document);
  assert.ok(loss.losses.some(item => item.detail.includes('List marker')));
  const exported = docx.exportDOCX(document);
  assert.match(strFromU8(unzipSync(exported.bytes)['word/numbering.xml']), /w:left="360" w:right="0" w:hanging="360"/u);
  const reopened = docx.importDOCX(exported.bytes, schema).document.child(0);
  assert.equal(reopened.attrs.start, 3);
  assert.deepEqual(reopened.attrs.layout, layout);
  return 10;
}
