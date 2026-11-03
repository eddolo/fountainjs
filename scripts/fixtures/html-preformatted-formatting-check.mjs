/** Public runtime contracts: no DOM globals, Node built-ins or reference AST. */
export function checkHTMLPreformattedFormatting(core, html, spec = core.CoreSchemaSpec) {
  const schema = new core.Schema(spec);
  let checked = 0;
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const verify = (document, target = schema) => {
    for (const documentMode of [false, true]) {
      const exported = core.HTMLExporter.export(document, { document: documentMode });
      if (!same(html.ServerHTMLImporter.parse(exported, target).toJSON(), document.toJSON())) {
        throw Error(`Preformatted formatting contract ${checked + 1} changed native document data.`);
      }
    }
    checked++;
  };
  const source = '<em>literal</em>\t😀\r\nsecond';
  for (const marks of [
    [schema.mark('strong'), schema.mark('em')], [schema.mark('code')],
    [schema.mark('text_color', { color: '#cc0000' }), schema.mark('highlight', { color: '#ffee66' })],
    [schema.mark('link', { href: 'https://example.com/reference', title: 'Reference', target: '_self' })],
  ]) verify(schema.node('doc', {}, [schema.node('code_block', { language: 'python', lineNumbers: false }, [
    schema.text('first\n'), schema.text(source, marks), schema.text('\nlast'),
  ])]));
  verify(schema.node('doc', {}, [schema.node('code_block', {}, [schema.text('', [schema.mark('em')])])]));
  verify(schema.node('doc', {}, [schema.node('code_block', { language: 'lean', dir: 'rtl',
    layout: { unit: 'pt', fontFamily: 'Georgia', fontSize: 14, background: '#fff4dd', spacingAfter: 12 } }, [schema.text('owned layout')])]));

  const direct = html.ServerHTMLImporter.parse('<pre>first <em>important<br>\nline</em> last</pre>', schema).child(0);
  if (direct.textContent !== 'first important\n\nline last'
    || direct.content.filter(node => node.marks.some(mark => mark.type.name === 'em')).map(node => node.text).join('') !== 'important\n\nline') {
    throw Error('Preformatted HTML lost explicit lines or emphasis.');
  }
  verify(schema.node('doc', {}, [direct]));
  const nested = html.ServerHTMLImporter.parse('<pre><code class="language-python">plain <code>literal</code> end</code></pre>', schema).child(0);
  if (nested.attrs.language !== 'python' || !same(nested.content.filter(node => node.marks.some(mark => mark.type.name === 'code')).map(node => node.text), ['literal'])) {
    throw Error('Structural and inline code were conflated.');
  }
  checked++;
  const custom = new core.Schema({ ...spec, marks: { ...spec.marks, marker: {
    attrs: { id: { default: '' } }, parseHTML: [{ tag: 'span[data-marker]', getAttrs: element => ({ id: element.getAttribute('data-marker') }) }],
    toDOM: mark => ['span', { 'data-marker': mark.attrs.id }, 0],
  } } });
  verify(custom.node('doc', {}, [custom.node('code_block', {}, [custom.text('extension', [custom.mark('marker', { id: 'review-7' })])])]), custom);
  const marked = schema.node('doc', {}, [schema.node('code_block', { layout: { unit: 'pt', fontSize: 14 } }, [schema.text('**literal**', [schema.mark('em')])])]);
  const markdown = core.MarkdownExporter.exportWithReport(marked);
  if (!markdown.losses.some(loss => loss.kind === 'mark' && loss.type === 'em')
    || !markdown.losses.some(loss => loss.kind === 'attribute' && loss.type === 'code_block')
    || core.MarkdownImporter.parse(markdown.markdown, schema).textContent !== marked.textContent) throw Error('Markdown fence losses or literal source changed.');
  checked++;
  const original = '<div><pre>\n\n*retained*\n\n</pre></div>\n';
  const captured = core.MarkdownImporter.parseWithSource(original, schema, { parseHTMLFlow: html.ServerHTMLImporter.parseTextBlockFlow });
  const restored = core.MarkdownExporter.exportWithSource(captured.document, captured.source);
  if (restored.markdown !== original || restored.preservation !== 'exact' || restored.losses.length) throw Error('Exact Markdown source acquired false fence losses.');
  checked++;
  const htmlSchema = new core.Schema({ ...spec, nodes: { ...spec.nodes, code_block: { ...spec.nodes.code_block, markdown: 'html' } } });
  const htmlMarkdown = core.MarkdownExporter.exportWithReport(htmlSchema.node('doc', {}, [htmlSchema.node('code_block', {}, [htmlSchema.text('retained', [htmlSchema.mark('em')])])]));
  if (!htmlMarkdown.markdown.includes('<em>retained</em>') || htmlMarkdown.losses.some(loss => loss.kind === 'mark' || loss.kind === 'attribute')) throw Error('HTML-enabled Markdown code formatting changed.');
  checked++;
  const safe = html.ServerHTMLImporter.parse('<pre><a href="javascript:alert(1)">unsafe</a><b>kept</b></pre>', schema);
  if (safe.child(0).content.some(node => node.marks.some(mark => mark.type.name === 'link'))
    || !safe.child(0).content.some(node => node.marks.some(mark => mark.type.name === 'strong'))) throw Error('Code formatting bypassed link policy or dropped safe emphasis.');
  checked++;
  const colored = schema.node('doc', {}, [schema.node('code_block', {}, [schema.text('red', [schema.mark('text_color', { color: '#cc0000' })])])]);
  if (!core.HTMLExporter.export(colored).includes('data-fountain-code-theme="light"')) throw Error('The safe reader lost its source-aware palette.');
  return checked + 1;
}
