import { CoreSchemaSpec, HTMLContainerExtension, HTMLFlowExtension, HTMLExporter, MarkdownImporter, MarkdownExporter, Schema } from '../../dist/index.js';
import { ServerHTMLImporter } from '../../dist/html-server.js';

export function checkHTMLFlow() {
  const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...HTMLContainerExtension.nodes, ...HTMLFlowExtension.nodes } });
  const options = { parseHTMLDocument: ServerHTMLImporter.parseTextBlockFlow };
  const source = '<a href="/guide">First paragraph.\n\nSecond **paragraph**.</a>\n';
  const parsed = MarkdownImporter.parseWithSource(source, schema, options);
  const html = HTMLExporter.export(parsed.document);
  if (parsed.document.child(1).type.name !== 'html_flow' || html.match(/<p[ >]/g)?.length !== 2) throw new Error('Anonymous HTML flow invented another paragraph.');
  const expected = JSON.stringify(parsed.document.toJSON());
  if (JSON.stringify(ServerHTMLImporter.parse(html, schema).toJSON()) !== expected) throw new Error('Native HTML flow reopen changed the complete model.');
  if (JSON.stringify(MarkdownImporter.parse(MarkdownExporter.export(parsed.document), schema, options).toJSON()) !== expected) throw new Error('Canonical HTML flow reopen changed the complete model.');
  if (MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown !== source) throw new Error('Anonymous HTML flow lost exact source.');
  const standalone = ServerHTMLImporter.parse('<strong>First</strong><p>Middle</p><em>Last</em>', schema);
  if (JSON.stringify(ServerHTMLImporter.parse(HTMLExporter.export(standalone), schema).toJSON()) !== JSON.stringify(standalone.toJSON())) throw new Error('Standalone HTML pretty printing polluted anonymous flow.');
  for (const content of [[], [schema.text('')], [schema.text('', [schema.mark('strong')])]]) {
    const empty = schema.node('doc', {}, [schema.node('html_flow', {}, content)]);
    const reopened = MarkdownImporter.parse(MarkdownExporter.export(empty), schema, options);
    if (JSON.stringify(reopened.toJSON()) !== JSON.stringify(empty.toJSON())) throw new Error('Canonical empty HTML flow changed its caret shape.');
  }
  for (const text of ['\n*bar*\n\n', '\r*bar*\r\r', '\r\n*bar*\r\n\r\n', ' \t\n\n']) {
    for (const marks of [[], [schema.mark('strong')]]) {
      const doc = schema.node('doc', {}, [schema.node('html_flow', {}, [schema.text(text, marks)])]);
      const saved = MarkdownExporter.export(doc);
      if (JSON.stringify(MarkdownImporter.parse(saved, schema, options).toJSON()) !== JSON.stringify(doc.toJSON())) throw new Error('Canonical HTML flow lost literal line endings or marks.');
      if (JSON.stringify(ServerHTMLImporter.parse(saved, schema).toJSON()) !== JSON.stringify(doc.toJSON())) throw new Error('Canonical HTML flow carrier changed the complete model.');
    }
  }
  return true;
}
