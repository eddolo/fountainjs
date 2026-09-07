import { describe, expect, it } from 'vitest';
import { CoreExtension, MathExtension, MarkdownExporter, MarkdownImporter, Schema, composeExtensions } from '../src';

const schema = new Schema(composeExtensions([CoreExtension, MathExtension]).schema);

describe('literal text in canonical Markdown output', () => {
  it.each([
    '~not deleted~', '~~not deleted~~', '==not highlighted==', '$not_math$',
    '$$not_math$$', 'https://example.com/path', 'www.example.com',
    'writer@example.com', 'Ask writer@example.com or visit https://example.com.',
  ])('does not reinterpret unmarked text as syntax: %s', text => {
    const document = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text(text)])]);
    const result = MarkdownExporter.exportWithReport(document);
    expect(result.losses).toEqual([]);
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(document.toJSON());
  });

  it.each(['strong', 'em', 'strike', 'highlight'])('preserves literal delimiters inside %s', mark => {
    const document = schema.node('doc', {}, [schema.node('paragraph', {}, [
      schema.text('Literal ~a~ ==b== $c$ and writer@example.com', [schema.mark(mark)]),
    ])]);
    expect(MarkdownImporter.parse(MarkdownExporter.export(document), schema).toJSON()).toEqual(document.toJSON());
  });

  it('keeps actual links, code and math as their existing structured nodes', () => {
    const document = schema.node('doc', {}, [schema.node('paragraph', {}, [
      schema.text('writer@example.com', [schema.mark('link', { href: 'mailto:writer@example.com' })]),
      schema.text(' / '), schema.text('$x$ ==y== https://example.com', [schema.mark('code')]),
      schema.text(' / '), schema.node('inline_math', { latex: 'x^2' }),
    ])]);
    const output = MarkdownExporter.export(document);
    expect(output).toContain('[writer@example.com](mailto:writer@example.com)');
    expect(output).toContain('`$x$ ==y== https://example.com`');
    expect(output).toContain('$x^2$');
    expect(MarkdownImporter.parse(output, schema).toJSON()).toEqual(document.toJSON());
  });

  it('protects newly edited literal content without rewriting a mapped untouched block', () => {
    const source = '# Heading ###\r\n\r\nEdit.\r\n';
    const captured = MarkdownImporter.parseWithSource(source, schema);
    const document = schema.node('doc', {}, [captured.document.child(0),
      schema.node('paragraph', {}, [schema.text('Keep $x$ and ==y== literal; writer@example.com.')]),
    ]);
    const output = MarkdownExporter.exportWithSource(document, captured.source);
    expect(output.preservation).toBe('blocks');
    expect(output.markdown.startsWith('# Heading ###\r\n\r\n')).toBe(true);
    expect(MarkdownImporter.parse(output.markdown, schema).toJSON()).toEqual(document.toJSON());
  });
});
