// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, HTMLExporter, HTMLImporter, MarkdownExporter, MarkdownImporter, Schema } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(CoreSchemaSpec);
const variants = [
  ['emphasis', ['strong', 'em', 'underline', 'strike', 'subscript', 'superscript'].map(name => schema.mark(name))],
  ['inline code', [schema.mark('code')]],
  ['colors', [schema.mark('text_color', { color: '#cc0000' }), schema.mark('highlight', { color: '#ffee66' })]],
  ['safe link', [schema.mark('link', { href: 'https://example.com/reference', title: 'Reference', target: '_self' })]],
] as const;

for (const [name, importer] of [['browser', HTMLImporter], ['server', ServerHTMLImporter]] as const) {
  describe(`${name} preformatted text formatting`, () => {
    it.each(variants)('retains %s through safe HTML without interpreting source characters', (_name, marks) => {
      const source = '<em>literal</em>\t😀\r\nsecond';
      const document = schema.node('doc', {}, [schema.node('code_block', { language: 'python', lineNumbers: false }, [
        schema.text('first\n'), schema.text(source, marks), schema.text('\nlast'),
      ])]);
      const html = HTMLExporter.export(document, { document: false });
      expect(html).toContain('&lt;em&gt;literal&lt;/em&gt;');
      const reopened = importer.parse(html, schema);
      expect(reopened.toJSON()).toEqual(document.toJSON());
    });

    it('imports actual preformatted emphasis and independent BR/LF lines', () => {
      const result = importer.parse('<pre>first <em>important<br>\nline</em> last</pre>', schema).child(0);
      expect(result.textContent).toBe('first important\n\nline last');
      expect(result.content.filter(node => node.marks.some(mark => mark.type.name === 'em')).map(node => node.text).join(''))
        .toBe('important\n\nline');
      expect(importer.parse(HTMLExporter.export(schema.node('doc', {}, [result])), schema).toJSON())
        .toEqual(schema.node('doc', {}, [result]).toJSON());
    });

    it('treats the sole code wrapper as structural while preserving nested inline code', () => {
      const result = importer.parse('<pre><code class="language-python">plain <code>literal</code> end</code></pre>', schema).child(0);
      expect(result.attrs.language).toBe('python');
      expect(result.content.filter(node => node.marks.some(mark => mark.type.name === 'code')).map(node => node.text)).toEqual(['literal']);
    });

    it('keeps an empty marked source position', () => {
      const document = schema.node('doc', {}, [schema.node('code_block', {}, [schema.text('', [schema.mark('em')])])]);
      expect(importer.parse(HTMLExporter.export(document), schema).toJSON()).toEqual(document.toJSON());
    });

    it('coalesces equivalent adjacent runs without inventing empty marked positions', () => {
      const result = importer.parse('<pre><em>first</em><em><span>second</span></em></pre>', schema).child(0);
      expect(result.childCount).toBe(1);
      expect(result.child(0).text).toBe('firstsecond');
      expect(result.child(0).marks.map(mark => mark.type.name)).toEqual(['em']);
    });

    it('retains owned preformatted layout and direction', () => {
      const document = schema.node('doc', {}, [schema.node('code_block', {
        language: 'lean', dir: 'rtl', layout: { unit: 'pt', fontFamily: 'Georgia', fontSize: 14,
          lineHeight: 1.5, lineHeightUnit: 'multiple', lineHeightRule: 'auto', background: '#fff4dd', spacingAfter: 12 },
      }, [schema.text('theorem retained : True := by trivial')])]);
      const html = HTMLExporter.export(document);
      expect(html).toContain('data-fountain-paragraph-layout');
      expect(importer.parse(html, schema).toJSON()).toEqual(document.toJSON());
    });

    it('keeps literal markup as source and rejects active navigation', () => {
      const result = importer.parse('<pre>&lt;em&gt;literal&lt;/em&gt; <a href="javascript:alert(1)">unsafe</a> <b>kept</b></pre>', schema);
      expect(result.textContent).toBe('<em>literal</em> unsafe kept');
      expect(result.child(0).content.some(node => node.marks.some(mark => mark.type.name === 'link'))).toBe(false);
      expect(result.child(0).content.some(node => node.text === 'kept' && node.marks.some(mark => mark.type.name === 'strong'))).toBe(true);
      expect(HTMLExporter.export(result)).not.toContain('javascript:');
    });

    it('round-trips a registered extension mark through the same boundary', () => {
      const target = new Schema({ ...CoreSchemaSpec, marks: { ...CoreSchemaSpec.marks, marker: {
        attrs: { id: { default: '' } },
        parseHTML: [{ tag: 'span[data-marker]', getAttrs: element => ({ id: element.getAttribute('data-marker') }) }],
        parseDOM: [{ tag: 'span[data-marker]', getAttrs: element => ({ id: element.getAttribute('data-marker') }) }],
        toDOM: mark => ['span', { 'data-marker': mark.attrs.id }, 0],
      } } });
      const document = target.node('doc', {}, [target.node('code_block', {}, [
        target.text('extension source', [target.mark('marker', { id: 'review-7' })]),
      ])]);
      expect(importer.parse(HTMLExporter.export(document), target).toJSON()).toEqual(document.toJSON());
    });

    it('keeps supported text formatting around unsupported media without creating an active node', () => {
      const document = importer.parse('<pre><em>before<img src="https://example.com/private-image">after</em></pre>', schema);
      expect(document.textContent).toBe('beforeafter');
      expect(document.child(0).content.every(node => node.isText)).toBe(true);
      expect(document.child(0).child(0).marks.map(mark => mark.type.name)).toEqual(['em']);
      expect(HTMLExporter.export(document)).not.toContain('<img');
    });
  });
}

it('describes the conversion without falsely claiming supported emphasis was lost', () => {
  const result = ServerHTMLImporter.parseWithReport('<pre><em>retained</em><img src="private-image"></pre>', schema);
  const notice = result.issues.find(issue => issue.code === 'preformatted-html-projection');
  expect(notice?.message).toContain('supported text formatting');
  expect(notice?.message).toContain('media');
  expect(notice?.message).not.toContain('child formatting, links');
  expect(JSON.stringify(result.issues)).not.toContain('private-image');
});

it('reports marks and layout omitted by ordinary Markdown fences while keeping code literal', () => {
  const document = schema.node('doc', {}, [schema.node('code_block', { layout: { unit: 'pt', fontSize: 14 } }, [
    schema.text('**literal**\nx < y', [schema.mark('em')]),
  ])]);
  const result = MarkdownExporter.exportWithReport(document);
  expect(result.markdown).toContain('**literal**\nx < y');
  expect(MarkdownImporter.parse(result.markdown, schema).textContent).toBe(document.textContent);
  expect(result.losses).toContainEqual(expect.objectContaining({ kind: 'mark', type: 'em', path: [0, 0] }));
  expect(result.losses).toContainEqual(expect.objectContaining({ kind: 'attribute', type: 'code_block', path: [0] }));
});

it('bounds repeated code-format diagnostics by mark type per block', () => {
  const document = schema.node('doc', {}, [schema.node('code_block', {}, Array.from({ length: 100 }, () => schema.text('word', [schema.mark('em')])))]);
  expect(MarkdownExporter.exportWithReport(document).losses.filter(loss => loss.kind === 'mark' && loss.type === 'em')).toHaveLength(1);
});

it('does not report fence losses when the schema explicitly exports code as HTML', () => {
  const target = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
    code_block: { ...CoreSchemaSpec.nodes.code_block!, markdown: 'html' },
  } });
  const document = target.node('doc', {}, [target.node('code_block', { layout: { unit: 'pt', fontSize: 14 } }, [
    target.text('retained', [target.mark('em')]),
  ])]);
  const result = MarkdownExporter.exportWithReport(document);
  expect(result.markdown).toContain('<em>retained</em>');
  expect(result.markdown).toContain('data-fountain-paragraph-layout');
  expect(result.losses.filter(loss => loss.kind === 'mark' || loss.kind === 'attribute')).toEqual([]);
});

it('does not invent canonical fence losses when exact Markdown source is reused', () => {
  const source = '<div><pre>\n\n*retained*\n\n</pre></div>\n';
  const parsed = MarkdownImporter.parseWithSource(source, schema, { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow });
  const result = MarkdownExporter.exportWithSource(parsed.document, parsed.source);
  expect(result.markdown).toBe(source);
  expect(result.preservation).toBe('exact');
  expect(result.losses).toEqual([]);
});
