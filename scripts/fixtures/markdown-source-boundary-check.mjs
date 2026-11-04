export function checkMarkdownSourceBoundaries(api, specification = api.CoreSchemaSpec) {
  const schema = new api.Schema(specification);
  let checks = 0;
  const verify = (imported, changed, expected, retained = []) => {
    const result = api.MarkdownExporter.exportWithSource(changed, imported.source);
    if (expected !== undefined && result.markdown !== expected) throw Error('Markdown source changed outside the intended edit.');
    for (const source of retained) if (!result.markdown.includes(source)) throw Error('Unchanged Markdown region was rewritten.');
    if (JSON.stringify(api.MarkdownImporter.parse(result.markdown, schema).toJSON()) !== JSON.stringify(changed.toJSON())) {
      throw Error('Source-preserving export merged or consumed document blocks.');
    }
    if (api.MarkdownExporter.exportWithSource(imported.document, imported.source).markdown !== imported.source.source) {
      throw Error('Partial export mutated original source provenance.');
    }
    checks++;
  };
  for (const ending of ['\n', '\r\n', '\r']) {
    const source = ['# Keep ###', 'Edit.', '', '~~~~js', 'first', '', 'last', '~~~~', ''].join(ending);
    const imported = api.MarkdownImporter.parseWithSource(source, schema);
    verify(imported, schema.node('doc', {}, [imported.document.child(0),
      schema.node('paragraph', {}, [schema.text('Changed.')]), imported.document.child(2)]), source.replace('Edit.', 'Changed.'));
    verify(imported, schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Changed type.')]),
      ...imported.document.content.slice(1)]), source.replace(`# Keep ###${ending}`, `Changed type.${ending}${ending}`));
    const open = api.MarkdownImporter.parseWithSource(['# Keep ###', '', '~~~~js', 'first', '', 'last', ''].join(ending), schema);
    verify(open, schema.node('doc', {}, [open.document.child(1), open.document.child(0)]),
      ['```js', 'first', '', 'last', '```', '', '# Keep ###'].join(ending));
    const lists = api.MarkdownImporter.parseWithSource(['*   First __source__ item', '', '# Keep ###', '', '*   Second __source__ item', ''].join(ending), schema);
    verify(lists, schema.node('doc', {}, [lists.document.child(1), lists.document.child(0), lists.document.child(2)]),
      undefined, ['# Keep ###', '*   Second __source__ item']);
  }
  return checks;
}
