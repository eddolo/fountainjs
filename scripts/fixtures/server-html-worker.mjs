import { CoreSchemaSpec, HTMLExporter, Schema } from '../../dist/index.js';
import { ServerHTMLImporter } from '../../dist/html-server.js';

const schema = new Schema(CoreSchemaSpec);

export default {
  async fetch(request) {
    if (request.method !== 'POST') return new Response('POST HTML to this endpoint.', { status: 405 });
    for (const name of ['window', 'document', 'DOMParser', 'HTMLElement', 'MutationObserver']) {
      if (name in globalThis) return new Response(`Unexpected browser global: ${name}`, { status: 500 });
    }
    const source = await request.text();
    const result = ServerHTMLImporter.parseWithReport(source, schema);
    return new Response(JSON.stringify({
      blocks: result.document.childCount,
      text: result.document.textContent,
      html: HTMLExporter.export(result.document, { document: false }),
      issues: result.issues,
    }), { headers: { 'content-type': 'application/json' } });
  },
};
