export function checkMarkdownContainerReferences(api, specification = api.CoreSchemaSpec) {
  const schema = new api.Schema(specification);
  const replace = (node, path, value) => !path.length ? value
    : node.copy(node.content.map((child, index) => index === path[0] ? replace(child, path.slice(1), value) : child));
  const cases = [
    { lines: ['> [ref]: /target "Original title"', '>', '> First __source__ [link][ref].', '>', '  > Edit.', '>', ' > Last _source_ [ref].'], path: [1, 1] },
    { lines: ['> First __source__ [link][ref].', '>', '  > Edit.', '>', ' > Last _source_ [ref].', '>', '> [ref]: /target "Original title"'], path: [1, 1] },
    { lines: ['*   [ref]: /target "Original title"', '', '    First __source__ [link][ref].', '', '    Edit.', '', '    Last _source_ [ref].', '', '*   Tail.'], path: [1, 0, 1] },
    { lines: ['7) [ref]: /target "Original title"', '', '   First __source__ [link][ref].', '', '   Edit.', '', '   Last _source_ [ref].', '', '11) Tail.'], path: [1, 0, 1] },
    { lines: ['> *   [ref]: /target "Original title"', '>', '>     First __source__ [link][ref].', '>', '>     Edit.', '>', '>     Last _source_ [ref].', '>', '> *   Tail.'], path: [1, 0, 0, 1] },
    { lines: ['*   > [ref]: /target "Original title"', '    >', '    > First __source__ [link][ref].', '    >', '    > Edit.', '    >', '    > Last _source_ [ref].'], path: [1, 0, 0, 1] },
  ];
  let checks = 0;
  const verify = (imported, document, expected) => {
    const result = api.MarkdownExporter.exportWithSource(document, imported.source);
    if (expected !== undefined && result.markdown !== expected) throw Error('Container-carried definitions caused unrelated source rewriting.');
    if (JSON.stringify(api.MarkdownImporter.parse(result.markdown, schema).toJSON()) !== JSON.stringify(document.toJSON())) throw Error('Container definition export changed the full document.');
    if (api.MarkdownExporter.exportWithSource(imported.document, imported.source).markdown !== imported.source.source) throw Error('Original source ownership was mutated.');
    checks++;
    return result;
  };
  for (const ending of ['\n', '\r\n', '\r']) {
    for (const { lines, path } of cases) {
      const source = ['# Keep [link][ref] ###', '', ...lines, '', 'After [link][ref].', ''].join(ending);
      const imported = api.MarkdownImporter.parseWithSource(source, schema);
      verify(imported, replace(imported.document, path, schema.node('paragraph', {}, [schema.text('Changed.')])), source.replace('Edit.', 'Changed.'));
    }
    const source = ['# Keep [link][ref] ###', '', '> [ref]: /target "Original title"', '>', '> Visible __source__.', '', 'After [link][ref].', ''].join(ending);
    const imported = api.MarkdownImporter.parseWithSource(source, schema), [heading, owner, after] = imported.document.content;
    for (const content of [[owner, heading, after], [heading, after], [heading, schema.node('paragraph', {}, [schema.text('Replacement.')]), after]]) {
      const result = verify(imported, imported.document.copy(content));
      if (!result.markdown.includes('# Keep [link][ref] ###')) throw Error('External reference source was not retained.');
    }
    const unicode = ['# Keep [link][STRASSE] ###', '', '> [Straße]:', '>   </target?q=a&b=c>', '>   "Original title"', '>',
      '> First __source__ [link][STRASSE].', '>', '> Edit.', '>', '> ~~~~text', '> [Straße]: /fake "Code only"', '> ~~~~', '', '[STRASSE]: /ignored "Ignored"', ''].join(ending);
    const multi = api.MarkdownImporter.parseWithSource(unicode, schema);
    verify(multi, replace(multi.document, [1, 1], schema.node('paragraph', {}, [schema.text('Changed.')])), unicode.replace('Edit.', 'Changed.'));
    const tasks = ['# Keep [link][ref] ###', '', '- [ ] Review __source__ [proof][ref].', '', '  [ref]: /target "Original"', '', '- [X] Done _source_.', '', 'After [link][ref].', ''].join(ending);
    const task = api.MarkdownImporter.parseWithSource(tasks, schema), item = task.document.child(1).child(0);
    if (item.child(0).type.name !== 'paragraph' || !item.child(0).content.some(node => node.text === 'proof' && node.marks.some(mark => mark.type.name === 'link' && mark.attrs.href === '/target'))) throw Error('Task source did not create the intended linked paragraph.');
    verify(task, replace(task.document, [1, 0], item.withAttrs({ ...item.attrs, checked: true })), tasks.replace('[ ]', '[x]'));
  }
  const conflict = api.MarkdownImporter.parseWithSource('# Keep [link][ref] ###\n\n> [ref]: /first "First"\n>\n> First owner.\n\n*   [ref]: /ignored "Ignored"\n\n    Second owner.\n', schema);
  verify(conflict, conflict.document.copy([conflict.document.child(0), conflict.document.child(2), conflict.document.child(1)]));
  const imported = api.MarkdownImporter.parseWithSource('# Keep [link][ref] ###\n\n> [ref]: /target "Keep"\n>\n> Edit.\n', schema);
  verify(imported, replace(imported.document, [1, 0], schema.node('paragraph', {}, [schema.text('[ref]: /evil "Changed"')])));
  const paragraph = imported.document.child(1).child(0);
  const lossy = api.MarkdownExporter.exportWithSource(replace(imported.document, [1, 0], paragraph.withAttrs({ ...paragraph.attrs, align: 'center' })), imported.source);
  if (lossy.preservation !== 'canonical' || lossy.losses.filter(loss => loss.type === 'paragraph' && loss.detail.includes('alignment')).length !== 1) throw Error('Unsupported attributes bypassed fallback/loss reporting.');
  return checks + 1;
}
