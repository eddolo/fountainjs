export function checkMarkdownHTMLSourceBoundaries(api, specification = api.CoreSchemaSpec) {
  const schema = new api.Schema(specification);
  let checks = 0;
  for (const ending of ['\n', '\r\n', '\r']) for (const name of ['parseHTMLInline', 'parseHTMLBlock', 'parseHTMLParagraph', 'parseHTMLFlow']) {
    const options = { [name]: () => null };
    const source = ['[ref]: /target "Original"', '', '# Keep [link][ref] ###', '', '~~~~js', 'first', ''].join(ending);
    const imported = api.MarkdownImporter.parseWithSource(source, schema, options);
    const [heading, code] = imported.document.content;
    const paragraph = schema.node('paragraph', {}, [schema.text('Keep added text.')]);
    for (const content of [[code, heading], [heading, code, paragraph], [code], [heading, paragraph, code]]) {
      const changed = imported.document.copy(content);
      const result = api.MarkdownExporter.exportWithSource(changed, imported.source);
      if (JSON.stringify(api.MarkdownImporter.parse(result.markdown, schema, options).toJSON()) !== JSON.stringify(changed.toJSON())) {
        throw Error(`Source export consumed supported Markdown with ${name} enabled.`);
      }
      if (content.includes(heading) && !result.markdown.includes('# Keep [link][ref] ###')) throw Error('Unrelated heading source was rewritten.');
      if (api.MarkdownExporter.exportWithSource(imported.document, imported.source).markdown !== source) throw Error('Original source ownership was mutated.');
      checks++;
    }
  }
  const parseHTMLFlow = segments => {
    const trigger = segments.some(segment => segment.kind === 'node' && segment.node.textContent === 'Trigger.');
    return segments.flatMap(segment => segment.kind === 'node' ? [segment.node] : [schema.node('paragraph', {}, [
      schema.text(segment.html.replace(/\r\n$|[\r\n]$/u, ''), trigger ? [schema.mark('strong')] : []),
    ])]);
  };
  const options = { parseHTMLFlow };
  for (const append of [false, true]) {
    const imported = api.MarkdownImporter.parseWithSource('<aside>Original.</aside>\n\nMiddle.\n\nKeep.\n', schema, options);
    if (imported.source.blocks.length !== 3) throw Error('The whole-result control has no partial-source capture.');
    const changed = imported.document.copy([...imported.document.content.slice(0, append ? 3 : 2), schema.node('paragraph', {}, [schema.text('Trigger.')])]);
    const result = api.MarkdownExporter.exportWithSource(changed, imported.source);
    if (result.preservation !== 'canonical' || JSON.stringify(api.MarkdownImporter.parse(result.markdown, schema, options).toJSON()) !== JSON.stringify(changed.toJSON())) {
      throw Error('A nonlocal HTML projection changed the exported document.');
    }
    checks++;
  }
  return checks;
}
