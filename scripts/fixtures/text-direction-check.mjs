import assert from 'node:assert/strict';

/** Consumer-side proof: emitted ESM/CJS APIs, no browser or fake DOM. */
export function checkTextDirection(api, root, serverHTML, docx) {
  assert.equal('document' in globalThis, false);
  assert.equal('window' in globalThis, false);
  assert.equal(typeof api.setTextDirection, 'function');
  assert.equal(typeof api.setTextAlignment, 'function');
  const kit = api.composeExtensions([root.CoreExtension]);
  assert.equal(typeof kit.commands.setTextDirection, 'function');
  const editor = api.createEditor({ schema: root.CoreSchemaSpec, plugins: [api.createHistoryPlugin()], content: {
    type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'אבגד Latin' }] }],
  } });
  try {
    const original = editor.getJSON();
    const text = editor.state.doc.textContent;
    const selection = editor.state.selection;
    assert.equal(api.setTextDirection(editor, 'rtl'), true);
    assert.equal(editor.state.doc.child(0).attrs.dir, 'rtl');
    assert.equal(editor.state.doc.textContent, text);
    assert.equal(editor.state.selection.eq(selection), true);
    assert.match(api.HTMLExporter.export(editor.state.doc, { document: false }), /dir="rtl" style="text-align:left"/);
    assert.equal(api.undo(editor), true);
    assert.deepEqual(editor.getJSON(), original);
    assert.equal(api.redo(editor), true);
    assert.equal(api.setTextAlignment(editor, 'start'), true);
    const html = api.HTMLExporter.export(editor.state.doc, { document: false });
    assert.match(html, /text-align:start/);
    assert.deepEqual(serverHTML.ServerHTMLImporter.parse(html, editor.state.schema).toJSON(), editor.getJSON());
    assert.ok(api.MarkdownExporter.exportWithReport(editor.state.doc).losses.some(loss => loss.detail.includes('direction')));
    const issues = docx.exportDOCX(editor.state.doc).report.issues;
    assert.ok(issues.some(issue => issue.code === 'text-direction-not-exported'));
    assert.ok(issues.some(issue => issue.code === 'logical-alignment-projected'));
    assert.equal(api.setTextDirection(editor, undefined), true);
    assert.equal(Object.hasOwn(editor.state.doc.child(0).attrs, 'dir'), false);
    assert.equal(editor.state.doc.child(0).attrs.align, 'start');
    const unchanged = editor.getJSON();
    assert.equal(api.setTextDirection(editor, 'invalid'), false);
    assert.equal(api.setTextAlignment(editor, { toString: () => 'right' }), false);
    assert.deepEqual(editor.getJSON(), unchanged);
  } finally { editor.destroy(); }
  const listEditor = api.createEditor({ schema: root.CoreSchemaSpec, plugins: [api.createHistoryPlugin()], content: {
    type: 'doc', content: [{ type: 'ordered_list', attrs: { dir: 'rtl', start: 0 }, content:
      ['Before', 'Moved Latin', 'After'].map(text => ({ type: 'list_item', content: [
        { type: 'paragraph', content: [{ type: 'text', text }] },
      ] })),
    }],
  } });
  try {
    listEditor.dispatch(listEditor.createTransaction().setSelection(api.Selection.cursor([0, 1, 0, 0], 2)));
    const original = listEditor.getJSON();
    assert.equal(api.outdentListItem(listEditor), true);
    assert.equal(listEditor.state.doc.child(1).attrs.dir, 'rtl');
    assert.equal(listEditor.state.doc.child(1).attrs.align, 'start');
    assert.equal(listEditor.state.doc.child(2).attrs.start, 2);
    assert.deepEqual(listEditor.state.selection.path, [1, 0]);
    const html = api.HTMLExporter.export(listEditor.state.doc, { document: false });
    assert.match(html, /dir="rtl" style="text-align:start"/);
    assert.deepEqual(serverHTML.ServerHTMLImporter.parse(html, listEditor.state.schema).toJSON(), listEditor.getJSON());
    assert.equal(api.undo(listEditor), true);
    assert.deepEqual(listEditor.getJSON(), original);
    assert.equal(api.redo(listEditor), true);
    assert.equal(listEditor.state.doc.child(1).attrs.dir, 'rtl');
  } finally { listEditor.destroy(); }
}
