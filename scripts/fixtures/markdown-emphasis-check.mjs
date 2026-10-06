// Run against each actual consumer's constructors, with no DOM or reference
// parser. Partial schemas must preserve unsupported syntax in its real scope.
export function checkMarkdownEmphasis(core) {
  for (const name of ['window', 'document', 'DOMParser']) {
    if (name in globalThis) throw new Error(`Emphasis runtime unexpectedly exposes ${name}.`);
  }
  const verify = (schema, source, html) => {
    const parsed = core.MarkdownImporter.parseWithSource(source, schema, { autolinkLiterals: false });
    if (core.HTMLExporter.export(parsed.document, { document: false }) !== html) {
      throw new Error(`Compiled emphasis scope mismatch: ${JSON.stringify(source)}`);
    }
    if (core.MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown !== source) {
      throw new Error('Compiled emphasis changed exact source.');
    }
    const saved = core.MarkdownExporter.exportWithReport(parsed.document);
    if (saved.losses.length || JSON.stringify(core.MarkdownImporter.parse(saved.markdown, schema,
      { autolinkLiterals: false }).toJSON()) !== JSON.stringify(parsed.document.toJSON())) {
      throw new Error('Compiled emphasis canonical reopen changed the complete native model.');
    }
  };
  let checked = 0;
  const full = new core.Schema(core.CoreSchemaSpec);
  for (const [source, html] of [
    ['***a*', '<p>**<em>a</em></p>'],
    ['___a_', '<p>__<em>a</em></p>'],
    ['****a***', '<p>*<em><strong>a</strong></em></p>'],
    ['____!__', '<p>__<strong>!</strong></p>'],
    ['***`code`*', '<p>**<em><code>code</code></em></p>'],
    ['Before ***!] beta **中*._`code` after.', '<p>Before ***!] beta *<em>中</em>._<code>code</code> after.</p>'],
  ]) for (const ending of ['\n', '\r\n']) {
    verify(full, source + ending, html);
    checked++;
  }
  for (const names of [[], ['em'], ['strong'], ['em', 'strong']]) {
    const schema = new core.Schema({ ...core.CoreSchemaSpec,
      marks: Object.fromEntries(names.map(name => [name, core.CoreSchemaSpec.marks[name]])) });
    for (const outer of ['*', '_', '**', '__']) for (const inner of ['*', '_', '**', '__']) {
      // Spaces fix the flanking contract; different runs cannot accidentally
      // join. This tests available and unavailable nested/repeated marks.
      const wrap = (marker, content) => {
        const name = marker.length === 1 ? 'em' : 'strong';
        const tag = name === 'em' ? 'em' : 'strong';
        return names.includes(name) ? `<${tag}>${content}</${tag}>` : marker + content + marker;
      };
      for (const ending of ['\n', '\r\n']) {
        const source = `${outer}before ${inner}中 beta${inner} after${outer}${ending}`;
        verify(schema, source, `<p>${wrap(outer, `before ${wrap(inner, '中 beta')} after`)}</p>`);
        checked++;
      }
    }
  }
  if (checked !== 140) throw new Error('Review intentional changes to compiled emphasis coverage.');
  return checked;
}
