export function checkMarkdownNestedReferences(api, specification = api.CoreSchemaSpec) {
  const schema = new api.Schema(specification);
  const replace = (node, path, value) => !path.length ? value
    : node.copy(node.content.map((child, index) => index === path[0] ? replace(child, path.slice(1), value) : child));
  const cases = [
    { lines: ['*   First __source__ [link][ref].', '*   Edit.', '*   Last _source_ [ref].'], path: [0, 1, 0] },
    { lines: ['*   First __source__ [link][ref].', '', '*   Edit.', '', '*   Last _source_ [ref].'], path: [0, 1, 0] },
    { lines: ['7) First __source__ [link][ref].', '', '9) Edit.', '', '11) Last _source_ [ref].'], path: [0, 1, 0] },
    { lines: ['> First __source__ [link][ref].', '>', '  > Edit.', '>', ' > Last _source_ [ref].'], path: [0, 1] },
    { lines: ['> *   First __source__ [link][ref].', '> *   Edit.', '>', ' > Last _source_ [ref].'], path: [0, 0, 1, 0] },
    { lines: ['*   > First __source__ [link][ref].', '    >', '    > Edit.', '    >', '    > Last _source_ [ref].'], path: [0, 0, 0, 1] },
  ];
  let checks = 0;
  const verify = (imported, document, expected) => {
    const result = api.MarkdownExporter.exportWithSource(document, imported.source);
    if (expected !== undefined && result.markdown !== expected) throw Error('Reference-scoped nested edit rewrote unrelated source.');
    if (JSON.stringify(api.MarkdownImporter.parse(result.markdown, schema).toJSON()) !== JSON.stringify(document.toJSON())) {
      throw Error('Reference-scoped nested source export changed the full document.');
    }
    if (api.MarkdownExporter.exportWithSource(imported.document, imported.source).markdown !== imported.source.source) throw Error('Original source ownership was mutated.');
    checks++;
  };
  for (const ending of ['\n', '\r\n', '\r']) {
    for (const position of ['before', 'after']) for (const { lines, path } of cases) {
      const body = lines.join(ending), definitions = '[ref]: /target "Original title"';
      const source = (position === 'before' ? definitions + ending + ending + body : body + ending + ending + definitions) + ending;
      const imported = api.MarkdownImporter.parseWithSource(source, schema);
      verify(imported, replace(imported.document, path, schema.node('paragraph', {}, [schema.text('Changed.')])), source.replace('Edit.', 'Changed.'));
    }
    const tasks = ['[ref]: /first "First"', '', '- [ ] First __source__ [link][ref].', '- [X] Last _source_ [ref].', '', '[ref]: /ignored "Ignored"', ''].join(ending);
    const task = api.MarkdownImporter.parseWithSource(tasks, schema), item = task.document.child(0).child(0);
    verify(task, replace(task.document, [0, 0], item.withAttrs({ ...item.attrs, checked: true })), tasks.replace('[ ]', '[x]'));
    const source = ['[ref]: /target "Original"', '', '# Keep [link][ref] ###', '## Adjacent ###', '*   First __source__.', '', '*   Last _source_.', '', '~~~~js', 'first', ''].join(ending);
    const imported = api.MarkdownImporter.parseWithSource(source, schema);
    if (imported.source.blocks.length !== 4) throw Error('Parser capture did not retain the full reference scope.');
    const [heading, adjacent, list, code] = imported.document.content;
    verify(imported, imported.document.copy([code, heading, adjacent, list]));
  }
  return checks;
}
