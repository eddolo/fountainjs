import { expect, it } from 'vitest';
import { Schema, HTMLExporter, HTMLAnchorExtension, MarkdownExporter, MarkdownImporter, composeExtensions } from '../src/headless';
import { CoreExtension, StarterKit } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(composeExtensions([CoreExtension, HTMLAnchorExtension]).schema);

it('preserves authored carriage returns in bookmark attributes', () => {
  const anchor = schema.node('html_anchor', { title: 'first\r\nsecond\rthird' }, [schema.text('Bookmark')]);
  const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [anchor])]);
  expect(ServerHTMLImporter.parse(HTMLExporter.export(doc, { document: false }), schema).toJSON()).toEqual(doc.toJSON());
});

it.each(['<a></a>', '<a id=""></a>', '<a id="chapter" name="old-chapter"></a>', '<a title="Note"><strong>Rich</strong> text</a>'])
('preserves a non-link anchor through server HTML: %s', source => {
  expect(typeof document).toBe('undefined');
  const result = ServerHTMLImporter.parseWithReport(`<p>Before ${source} after</p>`, schema);
  expect(result.issues).toEqual([]);
  const node = result.document.child(0).content.find(child => child.type.name === 'html_anchor');
  expect(node).toBeDefined();
  expect(HTMLExporter.export(result.document, { document: false })).toBe(`<p>Before ${source} after</p>`);
  expect(ServerHTMLImporter.parse(HTMLExporter.export(result.document, { document: false }), schema).toJSON()).toEqual(result.document.toJSON());
});

it.each(['', '#chapter', '/path'])('keeps href=%j in the link-mark path', href => {
  const doc = ServerHTMLImporter.parse(`<p><a href="${href}">Link</a></p>`, schema);
  expect(doc.child(0).child(0).type.name).toBe('text');
  expect(doc.child(0).child(0).marks.some(mark => mark.type.name === 'link')).toBe(true);
});

it.each(['onclick="alert(1)"', 'style="color:red"', 'data-unknown="keep"'])('reports unsupported anchor attributes: %s', attribute => {
  const result = ServerHTMLImporter.parseWithReport(`<p><a id="chapter" ${attribute}>Readable</a></p>`, schema);
  expect(result.document.textContent).toBe('Readable');
  expect(result.issues.some(issue => issue.contribution === 'element:a')).toBe(true);
  expect(HTMLExporter.export(result.document, { document: false })).not.toContain('<a');
});

it('preserves original Markdown source and reports canonical HTML requirements', () => {
  const source = 'Before <a id="chapter"><em>named</em></a> after\n';
  const options = { parseHTMLInline: ServerHTMLImporter.parseInline };
  const result = MarkdownImporter.parseWithSource(source, schema, options);
  expect(MarkdownExporter.exportWithSource(result.document, result.source).markdown).toBe(source);
  const exported = MarkdownExporter.exportWithReport(result.document);
  expect(exported.losses.some(loss => loss.type === 'html_anchor')).toBe(true);
  const reopened = MarkdownImporter.parse(exported.markdown, schema, { ...options, parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow });
  expect(reopened.toJSON()).toEqual(result.document.toJSON());
});

it('remains opt-in and validates declared bookmark attributes', () => {
  expect(StarterKit.schema.nodes.html_anchor).toBeUndefined();
  for (const attrs of [{ id: 'x'.repeat(257) }, { dir: 'invalid' }, { name: '\u0000' }]) {
    expect(() => schema.node('html_anchor', attrs)).toThrow();
  }
});

it('rejects nested anchors and linked bookmark content before HTML can relocate it', () => {
  const link = schema.mark('link', { href: '/guide' });
  expect(() => schema.node('html_anchor', {}, [schema.node('html_anchor')])).toThrow();
  expect(() => schema.node('html_anchor', {}, [schema.text('Linked', [link])])).toThrow();
  const anchor = schema.node('html_anchor', { id: 'chapter' }, [schema.text('Chapter')]);
  expect(() => schema.validate(anchor.withMarks([link]))).toThrow();
  expect(() => schema.validate(anchor.copy([schema.text('Linked', [link])]))).toThrow();
});
