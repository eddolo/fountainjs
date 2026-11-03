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
  return 6;
}
