import { describe, expect, it } from 'vitest';
import { CoreExtension, Schema, composeExtensions, MarkdownExporter, MarkdownImporter } from '../src';
import { RubyExtension } from '../src/ruby';

const schema = new Schema(composeExtensions([CoreExtension]).schema);

describe('Markdown literal text newlines', () => {
  it.each(['&#10;', '&#xA;', '&NewLine;', '&#13;', '&#xD;', '&#13;&#10;'])(
    'decodes %s without treating the decoded value as a source soft break', entity => {
      const expected = entity === '&#13;&#10;' ? '\r\n' : /13|xD/.test(entity) ? '\r' : '\n';
      for (const [before, after, mark] of [['', '', undefined], ['**', '**', 'strong']] as const) {
        const doc = MarkdownImporter.parse(`${before}a${entity}b\nc${after}`, schema);
        expect(doc.child(0).child(0).text).toBe(`a${expected}b c`);
        expect(doc.child(0).child(0).marks.map(value => value.type.name)).toEqual(mark ? [mark] : []);
      }
    },
  );

  it.each(['a\nb', 'a\r\nb', 'a\rb', 'a\n# heading', 'a\n- list', 'a\n---', 'a\n\nb', '\nedge\n'])(
    'retains literal text and structure through canonical export: %j', text => {
      for (const marks of [[], [schema.mark('strong')], [schema.mark('code')],
        [schema.mark('highlight', { color: '#aabbcc' })],
        [schema.mark('link', { href: 'https://example.com' }), schema.mark('code')]]) {
        const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text(text, marks)])]);
        const output = MarkdownExporter.exportWithReport(doc);
        expect(output.losses).toEqual([]);
        expect(output.markdown).not.toMatch(/[\r\n]/);
        expect(MarkdownImporter.parse(output.markdown, schema).toJSON()).toEqual(doc.toJSON());
      }
    },
  );

  it('keeps soft breaks, hard-break nodes, and literal newlines distinct', () => {
    const doc = MarkdownImporter.parse('a\nb  \nc\\\nd&#10;e', schema);
    expect(doc.child(0).content.map(node => node.isText ? node.text : node.type.name))
      .toEqual(['a b', 'hard_break', 'c', 'hard_break', 'd\ne']);
    expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
  });

  it('does not change CommonMark code-span normalization or decode entities in code', () => {
    const doc = MarkdownImporter.parse('`a\nb` and `&#10;`', schema);
    expect(doc.child(0).content.map(node => node.text)).toEqual(['a b', ' and ', '&#10;']);
  });

  it('retains literal newlines in headings, quotes, list items and table cells', () => {
    const paragraph = () => schema.node('paragraph', {}, [schema.text('a\r\nb\n# literal')]);
    const doc = schema.node('doc', {}, [
      schema.node('heading', { level: 2 }, [schema.text('Title\ncontinued')]),
      schema.node('blockquote', {}, [paragraph()]),
      schema.node('bullet_list', {}, [schema.node('list_item', {}, [paragraph()])]),
      schema.node('table', {}, [
        schema.node('table_row', {}, [schema.node('table_header', {}, [paragraph()])]),
        schema.node('table_row', {}, [schema.node('table_cell', {}, [paragraph()])]),
      ]),
    ]);
    expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
  });

  it('retains literal line endings in semantic ruby base text', () => {
    const rubySchema = new Schema(composeExtensions([CoreExtension, RubyExtension]).schema);
    const doc = rubySchema.node('doc', {}, [rubySchema.node('paragraph', {}, [
      rubySchema.node('ruby', { rt: 'reading' }, [rubySchema.text('base\r\ntext')]),
    ])]);
    expect(MarkdownImporter.parse(MarkdownExporter.export(doc), rubySchema).toJSON()).toEqual(doc.toJSON());
  });

  it('preserves unchanged source and protects a regenerated newline-bearing block', () => {
    const captured = MarkdownImporter.parseWithSource('# Title ###\r\n\r\nOld text\r\n', schema);
    const doc = schema.node('doc', {}, [captured.document.child(0),
      schema.node('paragraph', {}, [schema.text('Line\n# not a heading\r\nEnd')])]);
    const output = MarkdownExporter.exportWithSource(doc, captured.source);
    expect(output.preservation).toBe('blocks');
    expect(output.markdown.startsWith('# Title ###\r\n\r\n')).toBe(true);
    expect(MarkdownImporter.parse(output.markdown, schema).toJSON()).toEqual(doc.toJSON());
  });
});
