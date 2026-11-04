// Shared behavioral probe: no Node APIs, DOM shim, private engine imports or renderer.
export function exerciseMathParagraph(api, root, server, word, bytes, spec) {
  const schema = new api.Schema(spec);
  const document = word.importDOCX(bytes, schema).document;
  const before = JSON.stringify(document.toJSON());
  const equations = document.content.filter(node => node.type.name === 'math_block');
  const reopened = word.importDOCX(word.exportDOCX(document).bytes, schema).document;
  const nativeEquations = reopened.content.filter(node => node.type.name === 'math_block');
  const htmlEqual = server.ServerHTMLImporter.parse(api.HTMLExporter.export(document), schema).eq(document);
  const editor = api.createEditor({ schema: spec, content: document.toJSON(), plugins: [root.createHistoryPlugin()] });
  let sourceEdit, undoExact;
  try {
    const initial = JSON.stringify(editor.state.doc.toJSON());
    const index = editor.state.doc.content.findIndex(node => node.type.name === 'math_block');
    sourceEdit = root.setMathSource(editor, 'q^2', undefined, [index])
      && editor.state.doc.child(index).attrs.layout.spacingAfter === 7;
    undoExact = root.undo(editor) && JSON.stringify(editor.state.doc.toJSON()) === initial;
  } finally { editor.destroy(); }
  return { noDOM: typeof globalThis.document === 'undefined', equations: equations.length,
    spacingAfter: equations.map(node => node.attrs.layout.spacingAfter),
    fontSize: equations.map(node => node.attrs.layout.fontSize),
    nativeSpacing: nativeEquations.map(node => node.attrs.layout.spacingAfter),
    htmlEqual, sourceEdit, undoExact, originalUnchanged: JSON.stringify(document.toJSON()) === before };
}
export const expectedMathParagraph = { noDOM: true, equations: 2, spacingAfter: [7, 7], fontSize: [11, 11],
  nativeSpacing: [7, 7], htmlEqual: true, sourceEdit: true, undoExact: true, originalUnchanged: true };
