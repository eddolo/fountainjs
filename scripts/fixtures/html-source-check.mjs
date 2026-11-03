import assert from 'node:assert/strict';

export function checkHTMLSource(root, inert, source) {
  const schema = new root.Schema({ ...root.CoreSchemaSpec, nodes: { ...root.CoreSchemaSpec.nodes,
    ...inert.createInertHTMLRawTextExtension({ tags: ['script', 'textarea'] }).nodes } });
  const doc = (tag, text) => schema.node('doc', {}, [schema.node('paragraph', {}, [
    schema.node('html_inert_raw_text', { tag }, [schema.text(text)]),
  ])]);
  const valid = source.exportHTMLSource(doc('script', 'const value = "</em><em>";'));
  assert.equal(valid.ok, true);
  assert.equal(valid.sanitized, false);
  assert.ok(valid.sourceHTML.includes('const value = "</em><em>";'));
  assert.equal(source.exportHTMLSource(doc('textarea', '\nfirst\r\nsecond')).ok, true);
  for (const body of ['</script><p>escape</p>', 'first\rsecond', 'nul\0', '\ud800']) {
    const refused = source.exportHTMLSource(doc('script', body));
    assert.equal(refused.ok, false);
    assert.equal('sourceHTML' in refused, false);
  }
  assert.ok(!root.HTMLExporter.export(doc('script', 'data')).includes('<script>'));
  const declaration = '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">';
  const imported = source.importHTMLSourceDocument(`${declaration}<p>Evidence</p>`, schema).document;
  assert.equal(imported.attrs.htmlSourceEnvelope.mode, 'quirks');
  const output = source.exportHTMLSource(imported);
  assert.equal(output.ok, true);
  assert.ok(output.sourceHTML.startsWith(declaration));
  assert.deepEqual(source.importHTMLSourceDocument(output.sourceHTML, schema).document.toJSON(), imported.toJSON());
  assert.deepEqual(source.importHTMLSourceDocument(root.HTMLExporter.export(imported), schema).document.toJSON(), imported.toJSON());
  assert.equal(source.exportHTMLSource(imported, { document: false }).ok, false);
  const markdown = `${declaration}\n\nMarkdown evidence.\n`;
  const captured = root.MarkdownImporter.parseWithSource(markdown, schema, { parseHTMLDocument: source.createHTMLSourceMarkdownAdapter() });
  assert.equal(captured.document.attrs.htmlSourceEnvelope.doctype, declaration);
  assert.equal(root.MarkdownExporter.exportWithSource(captured.document, captured.source).markdown, markdown);
  const converted = source.exportHTMLSource(captured.document);
  assert.equal(converted.ok, true);
  assert.deepEqual(source.importHTMLSourceDocument(converted.sourceHTML, schema).document.toJSON(), captured.document.toJSON());
  const emptySchema = new root.Schema({ ...root.CoreSchemaSpec, nodes: { ...root.CoreSchemaSpec.nodes,
    ...inert.createHTMLSourceEmptyBodyExtension().nodes } });
  const empty = root.MarkdownImporter.parse('<!DOCTYPE html>\n', emptySchema,
    { parseHTMLDocument: source.createHTMLSourceMarkdownAdapter() });
  assert.equal(empty.child(0).type.name, 'html_source_empty_body');
  const emptyOutput = source.exportHTMLSource(empty);
  assert.equal(emptyOutput.ok, true); assert.ok(!emptyOutput.sourceHTML.includes('<p'));
  assert.deepEqual(source.importHTMLSourceDocument(root.HTMLExporter.export(empty), emptySchema).document.toJSON(), empty.toJSON());
  const eofSchema = new root.Schema({ ...root.CoreSchemaSpec, nodes: { ...root.CoreSchemaSpec.nodes,
    ...inert.createHTMLSourceEOFExtension().nodes } });
  const eof = root.MarkdownImporter.parse('Evidence.\n\n<div title="<unfinished', eofSchema,
    { parseHTMLDocument: source.createHTMLSourceMarkdownAdapter() });
  assert.equal(eof.content.at(-1).type.name, 'html_source_eof');
  const eofOutput = source.exportHTMLSource(eof);
  assert.equal(eofOutput.ok, true); assert.ok(eofOutput.sourceHTML.endsWith('<div title="<unfinished'));
  assert.equal(source.exportHTMLSource(eof.copy([...eof.content].reverse())).ok, false);
  assert.deepEqual(root.MarkdownImporter.parse(root.MarkdownExporter.export(eof), eofSchema,
    { parseHTMLDocument: source.createHTMLSourceMarkdownAdapter() }).toJSON(), eof.toJSON());
  return 25;
}
