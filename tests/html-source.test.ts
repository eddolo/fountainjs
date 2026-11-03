// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { Schema, HTMLExporter, MarkdownImporter, HTMLContainerExtension, HTMLFlowExtension, HTMLCommentExtension, HTMLAnchorExtension } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { createInertHTMLInlineExtension, createInertHTMLRawTextExtension } from '../src/html/inert';
import { ServerHTMLImporter } from '../src/html/server';
import { exportHTMLSource } from '../src/html/source';

const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
  ...HTMLContainerExtension.nodes, ...HTMLFlowExtension.nodes, ...HTMLCommentExtension.nodes, ...HTMLAnchorExtension.nodes,
  ...createInertHTMLInlineExtension({ tags: ['foo', 'lab-widget', 'bar', 'warning', 'bab', 'c2c', 'b2', 'responsive-image'] }).nodes,
  ...createInertHTMLRawTextExtension({ tags: ['script', 'style', 'textarea'] }).nodes } });
function rawDocument(tag: string, text: string) {
  return schema.node('doc', {}, [schema.node('paragraph', {}, [schema.node('html_inert_raw_text', { tag }, [schema.text(text)])])]);
}

describe('explicit HTML source-data serialization', () => {
  const corpus = createRequire(import.meta.url)('commonmark-spec').tests as Array<{ number: number; markdown: string }>;
  for (const ending of ['\n', '\r\n']) it.each([150, 163, 170, 171, 172, 173, 176, 178, 201, 491, 524, 536, 613, 614, 615, 617])
  ('reconstructs official retained-source example %i / ' + JSON.stringify(ending), number => {
    const importer = new ServerHTMLImporter({ sourceTokens: true });
    const source = corpus.find(example => example.number === number)!.markdown.replaceAll('\n', ending);
    const doc = MarkdownImporter.parse(source, schema, { parseHTMLDocument: importer.parseTextBlockFlow.bind(importer) });
    const before = doc.toJSON();
    const result = exportHTMLSource(doc);
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    expect(doc.toJSON()).toEqual(before);
  });

  it.each(['script', 'style', 'textarea'])('writes current %s source without changing the safe reader export', tag => {
    const doc = rawDocument(tag, 'literal <tag> & "quotes"\nsecond');
    const result = exportHTMLSource(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sanitized).toBe(false);
    expect(result.sourceHTML).toContain(`<${tag}>`);
    expect(ServerHTMLImporter.parse(result.sourceHTML, schema).toJSON()).toEqual(doc.toJSON());
    expect(HTMLExporter.export(doc, { document: false })).not.toContain(`<${tag}>`);
    expect(typeof document).toBe('undefined');
  });

  it('keeps textarea leading LF, CR/CRLF and literal closing markup', () => {
    const doc = rawDocument('textarea', '\nfirst\r\nsecond\rthird\n</textarea>&');
    const result = exportHTMLSource(doc);
    expect(result.ok).toBe(true);
    if (result.ok) expect(ServerHTMLImporter.parse(result.sourceHTML, schema).toJSON()).toEqual(doc.toJSON());
  });

  it.each([
    ['script', '"</script><p>outside</p>"'],
    ['style', '/* </style><p>outside</p> */'],
    ['script', '<!--<script>'],
    ['script', 'first\r\nsecond'],
    ['style', 'first\rsecond'],
    ['textarea', 'a\0b'],
    ['textarea', 'a\ud800b'],
    ['textarea', 'a\udc00b'],
  ])('refuses an unrepresentable %s source edit with no partial output', (tag, body) => {
    const result = exportHTMLSource(rawDocument(tag, body));
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('sourceHTML');
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('does not rewrite markup-like strings in nested source bodies or attributes', () => {
    const body = 'const value = "</em><em></strong><strong>";';
    const inner = schema.node('html_inert_raw_text', { tag: 'script' }, [schema.text(body)]);
    const wrapper = schema.node('html_inert_inline', { tag: 'foo', attributes: { title: '</em><em>', onclick: 'hostile()' } }, [inner]);
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [wrapper])]);
    const result = exportHTMLSource(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceHTML).toContain(body);
    expect(result.sourceHTML).toContain('onclick="hostile()"');
    expect(ServerHTMLImporter.parse(result.sourceHTML, schema).toJSON()).toEqual(doc.toJSON());
    expect(HTMLExporter.export(doc)).not.toContain(' onclick=');
  });

  it('exports current children without reusing stale original tag tokens', () => {
    const original = new ServerHTMLImporter({ sourceTokens: true }).parse('<p><FoO data-v=old>before</FOO></p>', schema);
    const wrapper = original.child(0).child(0);
    const doc = original.copy([schema.node('paragraph', {}, [wrapper.withAttrs({ ...wrapper.attrs, attributes: { 'data-v': 'new' } }).copy([schema.text('after')])])]);
    const result = exportHTMLSource(doc);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sourceHTML).toContain('<p><foo data-v="new">after</foo></p>');
    expect(original.child(0).child(0).textContent).toBe('before');
  });

  it('does not mistake an escaped source string for a NUL character', () => {
    const wrapper = schema.node('html_inert_inline', { tag: 'foo', attributes: { 'data-code': '\\u0000' } }, [schema.text('literal \\u0000')]);
    expect(exportHTMLSource(schema.node('doc', {}, [schema.node('paragraph', {}, [wrapper])])).ok).toBe(true);
  });

  it('keeps leading raw source in explicit document body context', () => {
    const raw = schema.node('html_inert_raw_text', { tag: 'script' }, [schema.text('let x = 1;')]);
    const doc = schema.node('doc', {}, [schema.node('html_flow', {}, [raw, schema.text('\n')]), schema.node('paragraph', {}, [schema.text('After')])]);
    const complete = exportHTMLSource(doc);
    expect(complete.ok).toBe(true);
    if (complete.ok) expect(ServerHTMLImporter.parse(complete.sourceHTML, schema).toJSON()).toEqual(doc.toJSON());
    const fragment = exportHTMLSource(doc, { document: false });
    expect(fragment.ok).toBe(true);
    if (fragment.ok) expect(fragment.sourceHTML.startsWith('<script>')).toBe(true);
  });

  it('refuses a fragment and a document beyond the depth bound', () => {
    expect(exportHTMLSource(schema.node('paragraph', {}, [schema.text('x')])).ok).toBe(false);
    let child = schema.text('x');
    for (let index = 0; index < 65; index++) child = schema.node('html_inert_inline', { tag: 'foo' }, [child]);
    const result = exportHTMLSource(schema.node('doc', {}, [schema.node('paragraph', {}, [child])]));
    expect(result.ok).toBe(false);
    expect(result.issues[0].code).toBe('limit');
  });

  it('reports native metadata differences without conflating them with broken HTML', () => {
    const local = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, doc: { ...CoreSchemaSpec.nodes.doc, attrs: { revision: { default: '' } } } } });
    const doc = local.node('doc', { revision: 'keep in native JSON' }, [local.node('paragraph', {}, [local.text('Readable')])]);
    const result = exportHTMLSource(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.modelRoundTrip).toBe('different');
      expect(result.issues.map(issue => issue.code)).toEqual(['model-canonicalization']);
      expect(result.sourceHTML).toContain('<p>Readable</p>');
    }
  });

  it('bounds both input size and escaped output expansion', () => {
    for (const body of ['x'.repeat(1_048_576), '&'.repeat(900_000)]) {
      const result = exportHTMLSource(rawDocument('textarea', body));
      expect(result.ok).toBe(false);
      expect(result.issues[0].code).toBe('limit');
      expect(result).not.toHaveProperty('sourceHTML');
    }
  });
});
