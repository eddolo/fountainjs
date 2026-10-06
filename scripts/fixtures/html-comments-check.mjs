import { CoreSchemaSpec, HTMLCommentExtension, HTMLExporter, Schema, MarkdownImporter, MarkdownExporter } from '../../dist/index.js';
import { ServerHTMLImporter } from '../../dist/html-server.js';

export function checkHTMLComments() {
  const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...HTMLCommentExtension.nodes } });
  const source = 'Release <!-- <strong>a</strong><strong>b</strong> --> **notes**.\n';
  const options = { parseHTMLDocument: ServerHTMLImporter.parseTextBlockFlow };
  const doc = MarkdownImporter.parse(source, schema, options);
  const html = HTMLExporter.export(doc);
  if (!html.includes('<!-- <strong>a</strong><strong>b</strong> -->')
    || JSON.stringify(ServerHTMLImporter.parse(html, schema).toJSON()) !== JSON.stringify(doc.toJSON())
    || JSON.stringify(MarkdownImporter.parse(MarkdownExporter.export(doc), schema, options).toJSON()) !== JSON.stringify(doc.toJSON())) {
    throw new Error('Compiled inert comment conversion altered source data or document semantics.');
  }
  try { schema.node('html_comment', { data: 'bad --> <script>run()</script>' }); }
  catch { return true; }
  throw new Error('Compiled HTML comment schema accepted a breakout payload.');
}
