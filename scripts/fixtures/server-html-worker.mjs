import { CoreSchemaSpec, HTMLExporter, MarkdownImporter, Schema } from '../../dist/index.js';
import { ServerHTMLImporter } from '../../dist/html-server.js';
import { checkMarkdownFlowSources } from './markdown-flow-source-check.mjs';
import { checkHTMLPageSettings } from './html-page-settings-check.mjs';
import { checkHTMLComments } from './html-comments-check.mjs';
import { checkHTMLFlow } from './html-flow-check.mjs';
import * as blockAtomCore from '../../dist/index.js';
import { checkMarkdownBlockAtoms } from './markdown-block-atoms-check.mjs';
import { checkMarkdownEmphasis } from './markdown-emphasis-check.mjs';
import { checkModelIntegrity } from './model-integrity-check.mjs';
import { checkInertHTMLSource } from './html-inert-source-check.mjs';
import { checkHTMLLinkControls } from './html-link-controls-check.mjs';
import * as inertHTML from '../../dist/html-inert.js';

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
    const preformatted = MarkdownImporter.parse('Before <pre>one\ntwo</pre> After', schema, {
      parseHTMLParagraph: ServerHTMLImporter.parseParagraph,
    });
    if (preformatted.child(1).textContent !== 'one\ntwo') return new Response('Lost preformatted line breaks', { status: 500 });
    return new Response(JSON.stringify({
      blocks: result.document.childCount,
      text: result.document.textContent,
      html: HTMLExporter.export(result.document, { document: false }),
      issues: result.issues,
      paragraphSources: checkMarkdownFlowSources(),
      pageSettingsChecked: checkHTMLPageSettings(schema),
      commentsChecked: checkHTMLComments(),
      flowChecked: checkHTMLFlow(),
      blockAtomsChecked: checkMarkdownBlockAtoms(blockAtomCore, { ServerHTMLImporter }),
      emphasisChecked: checkMarkdownEmphasis(blockAtomCore),
      modelIntegrityChecked: checkModelIntegrity(blockAtomCore),
      inertSourceChecked: checkInertHTMLSource(blockAtomCore, { ServerHTMLImporter }, inertHTML),
      linkControlsChecked: checkHTMLLinkControls(blockAtomCore, { ServerHTMLImporter }),
      paragraphRecovered: paragraph.childCount === 4 && paragraph.child(1).type.name === 'heading'
        && paragraph.child(1).textContent === 'Heading',
    }), { headers: { 'content-type': 'application/json' } });
  },
};
