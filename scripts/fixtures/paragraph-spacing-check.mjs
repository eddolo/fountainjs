import assert from 'node:assert/strict';

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
}
