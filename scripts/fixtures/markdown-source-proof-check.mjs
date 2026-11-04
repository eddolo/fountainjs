export function checkMarkdownSourceProof(api, specification = api.CoreSchemaSpec) {
  const schema = new api.Schema(specification);
  const source = '# Keep [link][ref] ###\n\n> [ref]: /target "Keep"\n>\n> First __source__.\n>\n> Edit.\n';
  const imported = api.MarkdownImporter.parseWithSource(source, schema);
  const replace = (node, path, value) => !path.length ? value
    : node.copy(node.content.map((child, index) => index === path[0] ? replace(child, path.slice(1), value) : child));
  const equal = (left, right) => JSON.stringify(left.toJSON()) === JSON.stringify(right.toJSON());
  let checks = 0;
  const parse = api.MarkdownImporter.prototype.parse;
  const calls = [];
  try {
    api.MarkdownImporter.prototype.parse = function (...args) { calls.push(args[0]); return parse.apply(this, args); };
    for (const text of ['First edit.', 'Second edit.', 'Third edit.', 'Fourth edit.']) {
      const document = replace(imported.document, [1, 1], schema.node('paragraph', {}, [schema.text(text)]));
      const expected = source.replace('Edit.', text);
      const result = api.MarkdownExporter.exportWithSource(document, imported.source);
      if (result.markdown !== expected || !calls.includes(expected)) throw Error('A source draft bypassed the complete-document parser.');
      if (!equal(api.MarkdownImporter.parse(result.markdown, schema), document)) throw Error('Complete source draft changed the document.');
      checks++;
    }
    api.MarkdownImporter.prototype.parse = () => schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Wrong result.')])]);
    const document = replace(imported.document, [1, 1], schema.node('paragraph', {}, [schema.text('Changed.')]));
    if (api.MarkdownExporter.exportWithSource(document, imported.source).preservation !== 'canonical') throw Error('An incompatible complete-parser result was accepted.');
    checks++;
  } finally { api.MarkdownImporter.prototype.parse = parse; }
  for (const ending of ['\n', '\r\n', '\r']) {
    const raw = ['# Keep [link][ref] ###', '', '> [ref]: /target', '>', '> # Title ###', '> Following __source__ [ref].', ''].join(ending);
    const captured = api.MarkdownImporter.parseWithSource(raw, schema);
    const document = replace(captured.document, [1, 0], schema.node('paragraph', {}, [schema.text('Changed.')]));
    const result = api.MarkdownExporter.exportWithSource(document, captured.source);
    if (result.markdown !== raw.replace('> # Title ###' + ending, '> Changed.' + ending + '> ' + ending)
      || !equal(api.MarkdownImporter.parse(result.markdown, schema), document)) throw Error('Draft rejection bypassed separator repair.');
    checks++;
  }
  for (const ending of ['\n', '\r\n', '\r']) {
    for (const item of [
      { lines: ['> # Title ###', '> Following __source__ [ref].', '>', '> ## Other ###', '> Last.'],
        before: '> # Title ###', after: ['> Changed.', '> '], path: [1, 0] },
      { lines: ['> > # Title ###', '> > Following __source__ [ref].', '> >', '> > ## Other ###', '> > Last.'],
        before: '> > # Title ###', after: ['> > Changed.', '> > '], path: [1, 0, 0] },
      { lines: ['> ```js', '> first', '> ```', '> Following __source__ [ref].', '>', '> ## Other ###', '> Last.'],
        before: ['> ```js', '> first', '> ```'].join(ending), after: ['> Changed.', '> '], path: [1, 0] },
    ]) {
      const raw = ['# Keep [link][ref] ###', '', '> [ref]: /target', '>', ...item.lines, ''].join(ending);
      const captured = api.MarkdownImporter.parseWithSource(raw, schema);
      const document = replace(captured.document, item.path, schema.node('paragraph', {}, [schema.text('Changed.')]));
      const result = api.MarkdownExporter.exportWithSource(document, captured.source);
      if (result.markdown !== raw.replace(item.before + ending, item.after.join(ending) + ending)
        || !equal(api.MarkdownImporter.parse(result.markdown, schema), document)) throw Error('Kind-change repair rewrote unrelated compact source.');
      checks++;
    }
  }
  for (const ending of ['\n', '\r\n', '\r']) for (const prefix of ['*   ', '7) ']) {
    const continuation = ' '.repeat(prefix.length);
    const raw = ['# Keep [link][ref] ###', '', prefix + '[ref]: /target', '', continuation + '# Title ###',
      continuation + 'Following __source__ [ref].', '', prefix + 'Tail.', ''].join(ending);
    const captured = api.MarkdownImporter.parseWithSource(raw, schema), list = captured.document.child(1), item = list.child(0);
    const document = captured.document.copy([captured.document.child(0), list.copy([item.copy([
      schema.node('paragraph', {}, [schema.text('Changed.')]), ...item.content.slice(1),
    ]), ...list.content.slice(1)])]);
    const result = api.MarkdownExporter.exportWithSource(document, captured.source);
    if (result.markdown !== raw.replace(continuation + '# Title ###' + ending, continuation + 'Changed.' + ending + continuation + ending)
      || !equal(api.MarkdownImporter.parse(result.markdown, schema), document)) throw Error('List kind-change repair lost source or content.');
    checks++;
  }
  const references = api.MarkdownImporter.parseWithSource(source.replaceAll('[ref]', '[ref-1]'), schema);
  const linked = replace(references.document, [1, 1], schema.node('paragraph', {}, [schema.text('New link', [schema.mark('link', { href: '/new' })])]));
  const result = api.MarkdownExporter.exportWithSource(linked, references.source, { linkStyle: 'reference' });
  if (result.preservation !== 'canonical' || result.markdown.match(/\[ref-1\]:/gu)?.length !== 1 || result.markdown.match(/\[ref-2\]:/gu)?.length !== 1
    || !equal(api.MarkdownImporter.parse(result.markdown, schema), linked)) throw Error('Discarded draft leaked generated definitions.');
  checks++;
  const paragraph = imported.document.child(1).child(1), losses = [];
  const styled = replace(imported.document, [1, 1], paragraph.withAttrs({ ...paragraph.attrs, align: 'center' }));
  const fallback = api.MarkdownExporter.exportWithSource(styled, imported.source, { onLoss: loss => losses.push(loss) });
  if (fallback.preservation !== 'canonical' || JSON.stringify(losses) !== JSON.stringify(fallback.losses)
    || losses.filter(loss => loss.type === 'paragraph' && loss.detail.includes('alignment')).length !== 1) throw Error('Draft fallback lost or duplicated conversion reports.');
  return checks + 1;
}
