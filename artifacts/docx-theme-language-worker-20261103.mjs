import { CoreSchemaSpec, Schema } from '../dist/index.js';
import { importDOCX, exportDOCX } from '../dist/docx.js';

export default {
  async fetch(request) {
    for (const key of ['document', 'window', 'DOMParser', 'HTMLElement']) {
      if (key in globalThis) throw Error(`Unexpected fake DOM: ${key}`);
    }
    const schema = new Schema(CoreSchemaSpec);
    const parsed = importDOCX(new Uint8Array(await request.arrayBuffer()), schema);
    const reopened = importDOCX(exportDOCX(parsed.document).bytes, schema).document;
    const font = node => ({
      text: node.textContent,
      paragraphFamily: node.attrs.layout?.fontFamily,
      textFamily: node.child(0).marks.find(mark => mark.type.name === 'font_family')?.attrs.family,
    });
    return Response.json({ imported: font(parsed.document.child(0)), reopened: font(reopened.child(0)) });
  },
};
