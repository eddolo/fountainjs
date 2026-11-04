import { CoreSchemaSpec } from 'fountainjs-editor';
import { Schema, createEditor, paragraphSpacingAt, HTMLExporter } from 'fountainjs-editor/core';
import { importDOCX, exportDOCX } from 'fountainjs-editor/docx';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';

export default {
  async fetch(request) {
    for (const name of ['document', 'window', 'DOMParser', 'HTMLElement']) {
      if (name in globalThis) throw Error(`Unexpected browser global: ${name}`);
    }
    const schema = new Schema(CoreSchemaSpec);
    const imported = importDOCX(await request.arrayBuffer(), schema);
    const document = imported.document;
    const before = paragraphSpacingAt(document, [1]).spacingBefore;
    const htmlEqual = ServerHTMLImporter.parse(HTMLExporter.export(document, { document: false }), schema).eq(document);
    const native = exportDOCX(document);
    const editor = createEditor({ schema: CoreSchemaSpec, content: document.toJSON() });
    try {
      editor.dispatch(editor.createTransaction().setNodeAttrs([0], { ...editor.state.doc.child(0).attrs,
        layout: { ...editor.state.doc.child(0).attrs.layout, contextualSpacing: false } }));
      return Response.json({ before, after: paragraphSpacingAt(editor.state.doc, [1]).spacingBefore,
        retainedDeclaredBefore: document.child(1).attrs.layout.spacingBefore,
        retainedOff: document.child(1).attrs.layout.contextualSpacing,
        importLoss: imported.report.issues.filter(issue => issue.code === 'paragraph-contextual-spacing-not-imported').length,
        exportLoss: native.report.issues.filter(issue => issue.code === 'paragraph-contextual-spacing-not-exported').length,
        nativeBytes: native.bytes.length > 0, htmlEqual, noDOM: true });
    } finally { editor.destroy(); }
  },
};
