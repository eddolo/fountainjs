export function checkMarkdownNestedSource(api, specification = api.CoreSchemaSpec) {
  const schema = new api.Schema(specification);
  const replace = (node, path, value) => !path.length ? value
    : node.copy(node.content.map((child, index) => index === path[0] ? replace(child, path.slice(1), value) : child));
  let checks = 0;
  const verify = (imported, document, expected) => {
    const result = api.MarkdownExporter.exportWithSource(document, imported.source);
    if (result.markdown !== expected) throw Error('Nested Markdown edit rewrote unrelated source.');
    if (JSON.stringify(api.MarkdownImporter.parse(result.markdown, schema).toJSON()) !== JSON.stringify(document.toJSON())) {
      throw Error('Nested source export changed complete document semantics.');
    }
    if (api.MarkdownExporter.exportWithSource(imported.document, imported.source).markdown !== imported.source.source) {
      throw Error('Nested export mutated original source ownership.');
    }
    checks++;
  };
  for (const ending of ['\n', '\r\n', '\r']) {
    const listSource = ['*   First __source__.', '', '*   Edit.', '', '*   Last _source_.', ''].join(ending);
    const list = api.MarkdownImporter.parseWithSource(listSource, schema);
    verify(list, replace(list.document, [0, 1, 0], schema.node('paragraph', {}, [schema.text('Changed.')])), listSource.replace('Edit.', 'Changed.'));
    const quoteSource = ['> First __source__.', '>', '  > Edit.', '>', ' > Last _source_.', ''].join(ending);
    const quote = api.MarkdownImporter.parseWithSource(quoteSource, schema);
    verify(quote, replace(quote.document, [0, 1], schema.node('paragraph', {}, [schema.text('Changed.')])), quoteSource.replace('Edit.', 'Changed.'));
    const taskSource = ['- [ ] First __source__.', '- [X] Last _source_.', ''].join(ending);
    const tasks = api.MarkdownImporter.parseWithSource(taskSource, schema);
    const item = tasks.document.child(0).child(0);
    verify(tasks, replace(tasks.document, [0, 0], item.withAttrs({ ...item.attrs, checked: true })), taskSource.replace('[ ]', '[x]'));
    const adjacent = api.MarkdownImporter.parseWithSource(['> # Title ###', '> Following __source__.', ''].join(ending), schema);
    verify(adjacent, replace(adjacent.document, [0, 0], schema.node('paragraph', {}, [schema.text('Changed.')])),
      ['> Changed.', '> ', '> Following __source__.', ''].join(ending));
  }
  return checks;
}
