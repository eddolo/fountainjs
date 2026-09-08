import { CoreSchemaSpec, HTMLExporter, MarkdownImporter, Schema } from '../../dist/index.js';
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
    const paragraph = MarkdownImporter.parse('Before <h2>Heading</h2> After', schema, {
      parseHTMLParagraph: ServerHTMLImporter.parseParagraph,
    });
    const tightList = MarkdownImporter.parse('- Before <h2>Heading</h2> After', schema, {
      parseHTMLParagraph: ServerHTMLImporter.parseParagraph,
    });
    if (tightList.child(0).child(0).childCount !== 3) return new Response('Phantom tight-list paragraph', { status: 500 });
    return new Response(JSON.stringify({
      blocks: result.document.childCount,
      text: result.document.textContent,
      html: HTMLExporter.export(result.document, { document: false }),
      issues: result.issues,
      paragraphRecovered: paragraph.childCount === 4 && paragraph.child(1).type.name === 'heading'
        && paragraph.child(1).textContent === 'Heading',
    }), { headers: { 'content-type': 'application/json' } });
  },
};
