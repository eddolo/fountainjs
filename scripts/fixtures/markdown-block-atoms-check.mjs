// Accept each actual consumer's modules, so no ESM class can accidentally
// stand in for the CommonJS or bundled Worker document implementation.
export function checkMarkdownBlockAtoms(core, server) {
  for (const name of ['window', 'document', 'DOMParser']) if (name in globalThis) throw new Error(`Block-atom runtime unexpectedly exposes ${name}.`);
  const schema = new core.Schema({ ...core.CoreSchemaSpec, nodes: { ...core.CoreSchemaSpec.nodes,
    ...core.HTMLContainerExtension.nodes, ...core.HTMLFlowExtension.nodes } });
  const options = { parseHTMLDocument: server.ServerHTMLImporter.parseTextBlockFlow };
  const source = '<section id="report">\n\nBefore.\n\n---\n\n![A & B](/diagram.png "Diagram")\n\nAfter **review**.\n\n</section>\n';
  for (const ending of ['\n', '\r\n']) {
    const input = source.replaceAll('\n', ending);
    const fallbacks = [];
    const parsed = core.MarkdownImporter.parseWithSource(input, schema, { ...options, onHTMLFlowFallback: issue => fallbacks.push(issue) });
    const section = parsed.document.child(0);
    if (fallbacks.length || section.type.name !== 'html_container'
      || section.content.map(node => node.type.name).join(',') !== 'paragraph,horizontal_rule,image_super,paragraph'
      || section.child(2).attrs.alt !== 'A & B' || section.child(2).attrs.src !== '/diagram.png') throw new Error('Compiled Markdown block-atom import lost structure or data.');
    const expected = JSON.stringify(parsed.document.toJSON());
    if (core.MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown !== input) throw new Error('Compiled block-atom projection lost exact source.');
    if (JSON.stringify(core.MarkdownImporter.parse(core.MarkdownExporter.export(parsed.document), schema, options).toJSON()) !== expected) throw new Error('Compiled block-atom canonical reopen changed the complete model.');
    if (JSON.stringify(server.ServerHTMLImporter.parse(core.HTMLExporter.export(parsed.document, { document: false }), schema).toJSON()) !== expected) throw new Error('Compiled block-atom native HTML reopen changed the complete model.');
  }
  for (const opening of ['<div><pre>', '<a href="/details">']) {
    const input = `${opening}\n\n![Diagram](/diagram.png)\n\n${opening.startsWith('<div>') ? '</pre></div>' : '</a>'}\n`;
    const fallbacks = [];
    const doc = core.MarkdownImporter.parse(input, schema, { ...options, onHTMLFlowFallback: issue => fallbacks.push(issue) });
    if (!fallbacks.length || JSON.stringify(doc.toJSON()) !== JSON.stringify(core.MarkdownImporter.parse(input, schema).toJSON())) throw new Error('Compiled block-atom flow silently flattened an image or discarded its HTML link.');
  }
  const tableSource = '<section id="results">\n\n| Name | Result |\n| :--- | ---: |\n| **Alpha** | [Ready][r] |\n\nAfter.\n\n</section>\n\n[r]: /ready\n';
  for (const ending of ['\n', '\r\n']) {
    const input = tableSource.replaceAll('\n', ending);
    const fallbacks = [];
    const parsed = core.MarkdownImporter.parseWithSource(input, schema, { ...options, onHTMLFlowFallback: issue => fallbacks.push(issue) });
    const section = parsed.document.child(0);
    const table = section.child(0);
    if (fallbacks.length || section.type.name !== 'html_container' || table.type.name !== 'table'
      || table.childCount !== 2 || table.child(0).child(0).type.name !== 'table_header'
      || table.child(1).child(1).child(0).attrs.align !== 'right'
      || table.child(1).child(1).child(0).child(0).marks[0]?.attrs.href !== '/ready') throw new Error('Compiled mixed Markdown table import lost geometry, alignment or reference marks.');
    const expected = JSON.stringify(parsed.document.toJSON());
    if (core.MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown !== input) throw new Error('Compiled Markdown table import lost exact source.');
    if (JSON.stringify(core.MarkdownImporter.parse(core.MarkdownExporter.export(parsed.document), schema, options).toJSON()) !== expected) throw new Error('Compiled Markdown table canonical reopen changed the complete model.');
    if (JSON.stringify(server.ServerHTMLImporter.parse(core.HTMLExporter.export(parsed.document, { document: false }), schema).toJSON()) !== expected) throw new Error('Compiled Markdown table native HTML reopen changed the complete model.');
  }
  const hiddenTable = '<div><pre>\n\n| A |\n| --- |\n| x |\n\n</pre></div>';
  const fallbacks = [];
  const doc = core.MarkdownImporter.parse(hiddenTable, schema, { ...options, onHTMLFlowFallback: issue => fallbacks.push(issue) });
  if (!fallbacks.length || JSON.stringify(doc.toJSON()) !== JSON.stringify(core.MarkdownImporter.parse(hiddenTable, schema).toJSON())) throw new Error('Compiled mixed Markdown flow flattened a protected table.');
  return true;
}
