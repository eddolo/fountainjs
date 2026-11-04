import { CoreSchemaSpec } from 'fountainjs-editor';
import { Schema, createEditor, paragraphSpacingAt, HTMLExporter } from 'fountainjs-editor/core';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';

export default {
  async fetch(request) {
    for (const name of ['document', 'window', 'DOMParser', 'HTMLElement']) {
      if (name in globalThis) throw Error(`Unexpected DOM global: ${name}`);
    }
    const schema = new Schema(CoreSchemaSpec);
    const document = schema.nodeFromJSON(await request.json());
    const before = paragraphSpacingAt(document, [1]).spacingBefore;
    const htmlEqual = ServerHTMLImporter.parse(HTMLExporter.export(document, { document: false }), schema).eq(document);
    const editor = createEditor({ schema: CoreSchemaSpec, content: document.toJSON() });
    try {
      editor.dispatch(editor.createTransaction().setNodeAttrs([0], { ...editor.state.doc.child(0).attrs,
        layout: { ...editor.state.doc.child(0).attrs.layout, spacingGroup: 'other' } }));
      return Response.json({ before, after: paragraphSpacingAt(editor.state.doc, [1]).spacingBefore,
        retainedDeclaredBefore: document.child(1).attrs.layout.spacingBefore, htmlEqual, noDOM: true });
    } finally { editor.destroy(); }
  },
};
