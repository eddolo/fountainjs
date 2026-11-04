import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';

export function checkParagraphSpacing(api, server, word, spec) {
  assert.equal(typeof globalThis.document, 'undefined');
  const before = { unit: 'pt', spacingGroup: 'body', spacingBefore: 0, spacingAfter: 10, contextualSpacing: true };
  const after = { ...before, spacingBefore: 12, spacingAfter: 0, contextualSpacing: false };
  assert.equal(api.resolveParagraphGap(before, after), 2);
  assert.equal(api.resolveParagraphGap(before, { ...after, spacingGroup: 'Body' }), 12);
  assert.equal(api.isParagraphLayout({ unit: 'pt', contextualSpacing: true }), false);
  const schema = new api.Schema(spec);
  const p = (text, layout) => schema.node('paragraph', { layout }, [schema.text(text)]);
  const document = schema.node('doc', {}, [p('Before', before), p('After', after)]);
  assert.equal(schema.nodeFromJSON(document.toJSON()).eq(document), true);
  assert.equal(api.paragraphSpacingAt(document, [1]).spacingBefore, 2);
  const html = api.HTMLExporter.export(document, { document: false });
  assert.match(html, /margin-block-start:2pt/u);
  assert.equal(server.ServerHTMLImporter.parse(html, schema).eq(document), true);
  const editor = api.createEditor({ schema: spec, content: document.toJSON() });
  try {
    editor.dispatch(editor.createTransaction().setNodeAttrs([0], { ...editor.state.doc.child(0).attrs,
      layout: { ...before, spacingGroup: 'other' } }));
    assert.equal(api.paragraphSpacingAt(editor.state.doc, [1]).spacingBefore, 12);
    assert.equal(document.child(1).attrs.layout.spacingBefore, 12);
    assert.equal(api.paragraphSpacingAt(document, [1]).spacingBefore, 2);
  } finally { editor.destroy(); }
  assert.deepEqual(word.exportDOCX(document).report.issues.filter(issue => issue.code === 'paragraph-contextual-spacing-not-exported').map(issue => issue.path), [[0], [1]]);
  const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const native = zipSync({
    'word/document.xml': strToU8(`<w:document xmlns:w="${namespace}"><w:body><w:p><w:pPr><w:spacing w:before="0" w:after="200"/><w:contextualSpacing/></w:pPr><w:r><w:t>Before</w:t></w:r></w:p><w:p><w:pPr><w:spacing w:before="240" w:after="0"/><w:contextualSpacing w:val="0"/></w:pPr><w:r><w:t>After</w:t></w:r></w:p></w:body></w:document>`),
  });
  const imported = word.importDOCX(native, schema);
  assert.equal(api.paragraphSpacingAt(imported.document, [1]).spacingBefore, 2);
  assert.equal(imported.document.child(1).attrs.layout.spacingBefore, 12);
  assert.equal(imported.document.child(1).attrs.layout.contextualSpacing, false);
  assert.equal(imported.report.issues.some(issue => issue.code === 'paragraph-contextual-spacing-not-imported'), false);
}
