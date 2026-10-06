import { CoreSchemaSpec, HTMLExporter, MarkdownImporter, Schema } from '../dist/index.js';
import { ServerHTMLImporter } from '../dist/html-server.js';
import { checkMarkdownFlowSources } from './fixtures/markdown-flow-source-check.mjs';
import { checkHTMLPageSettings } from './fixtures/html-page-settings-check.mjs';
import { checkHTMLComments } from './fixtures/html-comments-check.mjs';
import { checkHTMLFlow } from './fixtures/html-flow-check.mjs';
import * as blockAtomCore from '../dist/index.js';
import { checkMarkdownBlockAtoms } from './fixtures/markdown-block-atoms-check.mjs';
import { checkMarkdownEmphasis } from './fixtures/markdown-emphasis-check.mjs';
import { checkModelIntegrity } from './fixtures/model-integrity-check.mjs';
import { checkInertHTMLSource } from './fixtures/html-inert-source-check.mjs';
import { checkHTMLLinkControls } from './fixtures/html-link-controls-check.mjs';
import * as inertHTML from '../dist/html-inert.js';

for (const name of ['window', 'document', 'DOMParser', 'HTMLElement', 'MutationObserver']) {
  if (name in globalThis) throw new Error(`Server HTML runtime unexpectedly exposes ${name}.`);
}

const schema = new Schema(CoreSchemaSpec);
checkInertHTMLSource(blockAtomCore, { ServerHTMLImporter }, inertHTML);
console.log(`Compiled runtime: ${checkHTMLLinkControls(blockAtomCore, { ServerHTMLImporter })} link normalization/security/history/destination contracts passed.`);
console.log('Compiled runtime: inert inline lexical data, full reopen, real transactions/history and altered-carrier refusal passed.');
console.log(`Compiled runtime: ${checkModelIntegrity(blockAtomCore)} owned-attribute checks plus immutable snapshots/history passed.`);
checkHTMLFlow();
checkMarkdownBlockAtoms(blockAtomCore, { ServerHTMLImporter });
console.log(`Compiled runtime: ${checkMarkdownEmphasis(blockAtomCore)} native emphasis and partial-schema retention checks passed.`);
console.log('Compiled runtime: protected Markdown images/rules/tables, exact source, native/canonical reopen and refusal guards passed.');
console.log('Compiled runtime: anonymous HTML flow, native/canonical reopening and exact source passed.');
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
checkHTMLPageSettings(schema);
checkHTMLComments();
console.log(`${runtime}: inert HTML comment retention, canonical reopen and breakout rejection passed.`);
console.log(`${runtime}: complete HTML page-settings retention and invalid/fragment boundaries passed.`);

const paragraph = MarkdownImporter.parse('Before <h2>Heading</h2> After', schema, {
  parseHTMLParagraph: ServerHTMLImporter.parseParagraph,
});
if (paragraph.childCount !== 4 || paragraph.child(1).type.name !== 'heading'
  || paragraph.child(1).textContent !== 'Heading') {
  throw new Error('Compiled server runtime paragraph HTML recovery failed.');
}
console.log(`${runtime}: block-returning Markdown paragraph recovery passed.`);
checkMarkdownFlowSources();
console.log(`${runtime}: lazy Markdown flow paragraph sources passed.`);
const tightList = MarkdownImporter.parse('- Before <h2>Heading</h2> After', schema, {
  parseHTMLParagraph: ServerHTMLImporter.parseParagraph,
});
if (tightList.child(0).child(0).childCount !== 3) throw new Error('Compiled runtime added a phantom tight-list paragraph.');
const preformatted = MarkdownImporter.parse('Before <pre>one\ntwo</pre> After', schema, {
  parseHTMLParagraph: ServerHTMLImporter.parseParagraph,
});
if (preformatted.child(1).type.name !== 'code_block' || preformatted.child(1).textContent !== 'one\ntwo') {
  throw new Error('Compiled runtime lost preformatted line breaks.');
}
