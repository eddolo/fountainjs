import { CoreSchemaSpec, HTMLExporter, MarkdownImporter, Schema } from '../dist/index.js';
import { ServerHTMLImporter } from '../dist/html-server.js';

for (const name of ['window', 'document', 'DOMParser', 'HTMLElement', 'MutationObserver']) {
  if (name in globalThis) throw new Error(`Server HTML runtime unexpectedly exposes ${name}.`);
}

const schema = new Schema(CoreSchemaSpec);
const result = ServerHTMLImporter.parseWithReport(
  '<h1>Portable runtime</h1><p><strong>HTML</strong> without a fake DOM.</p>',
  schema,
);
const exported = HTMLExporter.export(result.document, { document: false });

if (result.document.childCount !== 2) throw new Error('Server runtime produced an incomplete document.');
if (result.document.textContent !== 'Portable runtimeHTML without a fake DOM.') {
  throw new Error('Server runtime changed parsed text.');
}
if (result.document.child(1).child(0).marks[0]?.type.name !== 'strong') {
  throw new Error('Server runtime did not preserve semantic marks.');
}
if (result.issues.length !== 0) throw new Error('Valid server HTML unexpectedly produced recovery issues.');
if (!exported.includes('<strong>HTML</strong>')) throw new Error('Server runtime HTML export lost the strong mark.');

const fullPage = HTMLExporter.export(result.document, { title: 'Page title must stay outside document content' });
const reopened = ServerHTMLImporter.parseWithReport(fullPage, schema);
if (JSON.stringify(reopened.document.toJSON()) !== JSON.stringify(result.document.toJSON())) {
  throw new Error('Server runtime full-page reopen changed body content or inserted head metadata.');
}
if (!reopened.issues.some(issue => issue.code === 'document-shell-omitted')) {
  throw new Error('Server runtime full-page reopen did not report omitted shell metadata/styles.');
}

const inline = MarkdownImporter.parse('A <em>one **two**</em>.', schema, { parseHTMLInline: ServerHTMLImporter.parseInline });
if (inline.textContent !== 'A one two.' || !inline.content[0].content.some(node =>
  node.text === 'two' && node.marks.some(mark => mark.type.name === 'strong') && node.marks.some(mark => mark.type.name === 'em')
)) throw new Error('Server runtime inline HTML projection lost original Markdown formatting.');

const runtime = globalThis.Bun
  ? `Bun ${globalThis.Bun.version}`
  : globalThis.Deno
    ? `Deno ${globalThis.Deno.version.deno}`
    : `Node ${globalThis.process?.versions?.node ?? 'unknown'}`;
console.log(`${runtime}: DOM-free server HTML import/export passed.`);
