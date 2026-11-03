/** Pure JS public-package contract; also runs in Bun, Deno and workerd. */
export function checkHTMLEmptyHeading(core, html, spec = core.CoreSchemaSpec) {
  const schema = new core.Schema(spec);
  let checks = 0;
  for (const level of [1, 2, 3, 4, 5, 6]) for (const leaf of [false, true]) for (const document of [false, true]) {
    const original = schema.node('doc', {}, [schema.node('heading', { level, dir: 'rtl', align: 'right' }, leaf ? [schema.text('')] : [])]);
    const output = core.HTMLExporter.export(original, { document });
    if (output.includes('data-fountain-empty="text"') !== leaf) throw Error('Empty heading writer marker changed.');
    const reopened = html.ServerHTMLImporter.parse(output, schema);
    if (JSON.stringify(reopened.toJSON()) !== JSON.stringify(original.toJSON())) throw Error('Empty heading model changed on HTML reopen.');
    checks++;
  }
  return checks;
}
