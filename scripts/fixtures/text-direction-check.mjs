import assert from 'node:assert/strict';

/** Consumer-side proof: emitted ESM/CJS APIs, no browser or fake DOM. */
export function checkTextDirection(api, root, serverHTML, docx) {
  assert.equal('document' in globalThis, false);
  assert.equal('window' in globalThis, false);
  assert.equal(typeof api.setTextDirection, 'function');
  assert.equal(typeof api.setTextAlignment, 'function');
  const codeEditor = api.createEditor({ schema: root.CoreSchemaSpec, plugins: [api.createHistoryPlugin()], content: {
    type: 'doc', content: [{ type: 'code_block', attrs: { language: 'python' }, content: [{ type: 'text', text: '# שלום\nprint("مرحبا")' }] }],
  } });
  try {
    const original = codeEditor.getJSON();
    assert.equal(api.setTextDirection(codeEditor, 'rtl'), true);
    assert.equal(codeEditor.state.doc.child(0).attrs.dir, 'rtl');
    assert.equal(codeEditor.state.doc.child(0).textContent, '# שלום\nprint("مرحبا")');
    const html = api.HTMLExporter.export(codeEditor.state.doc, { document: false });
    assert.deepEqual(serverHTML.ServerHTMLImporter.parse(html, codeEditor.state.schema).toJSON(), codeEditor.getJSON());
    assert.equal(api.undo(codeEditor), true); assert.deepEqual(codeEditor.getJSON(), original);
  } finally { codeEditor.destroy(); }
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
  const autoEditor = api.createEditor({ schema: root.CoreSchemaSpec, plugins: [api.createHistoryPlugin()], content: {
    type: 'doc', content: [{ type: 'ordered_list', attrs: { dir: 'auto', start: 0 }, content:
      ['שלום', 'English selected', 'English tail'].map(text => ({ type: 'list_item', content: [
        { type: 'paragraph', content: [{ type: 'text', text }] },
      ] })),
    }],
  } });
  try {
    autoEditor.dispatch(autoEditor.createTransaction().setSelection(api.Selection.cursor([0, 1, 0, 0], 2)));
    const original = autoEditor.getJSON();
    assert.equal(api.outdentListItem(autoEditor), true);
    assert.equal(autoEditor.state.doc.child(0).type.name, 'direction_scope');
    assert.equal(autoEditor.state.doc.child(0).attrs.dir, 'auto');
    assert.equal(api.toggleList(autoEditor, 'bullet'), true);
    assert.deepEqual(autoEditor.state.selection.path, [0, 1, 0, 0, 0]);
    const html = api.HTMLExporter.export(autoEditor.state.doc, { document: false });
    assert.equal(html.match(/dir="auto"/g).length, 1);
    assert.deepEqual(serverHTML.ServerHTMLImporter.parse(html, autoEditor.state.schema).toJSON(), autoEditor.getJSON());
    assert.equal(api.undo(autoEditor), true);
    assert.equal(api.undo(autoEditor), true);
    assert.deepEqual(autoEditor.getJSON(), original);
  } finally { autoEditor.destroy(); }
  const moveEditor = api.createEditor({ schema: root.CoreSchemaSpec, plugins: [api.createHistoryPlugin()], content: {
    type: 'doc', content: [
      { type: 'blockquote', attrs: { dir: 'rtl' }, content: ['Keep', 'Move'].map(text => ({ type: 'paragraph', content: [{ type: 'text', text }] })) },
      { type: 'blockquote', attrs: { dir: 'ltr' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Target' }] }] },
    ],
  } });
  try {
    const original = moveEditor.getJSON();
    const move = { fromPath: [0, 1], toParentPath: [1], toIndex: 0 };
    assert.equal(api.canMoveNode(moveEditor, move), true);
    assert.equal(api.moveNode(moveEditor, move), true);
    const moved = moveEditor.state.doc.child(1).child(0);
    assert.equal(moved.textContent, 'Move');
    assert.equal(moved.attrs.dir, 'rtl');
    assert.equal(moved.attrs.align, 'start');
    const html = api.HTMLExporter.export(moveEditor.state.doc, { document: false });
    assert.deepEqual(serverHTML.ServerHTMLImporter.parse(html, moveEditor.state.schema).toJSON(), moveEditor.getJSON());
    assert.equal(api.undo(moveEditor), true);
    assert.deepEqual(moveEditor.getJSON(), original);
    assert.equal(api.redo(moveEditor), true);
    assert.equal(moveEditor.state.doc.child(1).child(0).attrs.dir, 'rtl');
  } finally { moveEditor.destroy(); }
}
