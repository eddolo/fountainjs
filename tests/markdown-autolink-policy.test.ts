import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec } from '../src/extensions';
import { HTMLExporter, MarkdownExporter, MarkdownImporter, Schema, type Node } from '../src/headless';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(CoreSchemaSpec);
const links = (document: Node): string[] => {
  const result: string[] = [];
  document.descendants(node => node.marks.forEach(mark => {
    if (mark.type.name === 'link') result.push(String(mark.attrs.href));
  }));
  return result;
};

describe('Markdown literal autolink policy', () => {
  it.each([
    'https://example.com', 'www.example.com', 'writer@example.com',
    '**https://example.com**', '*writer@example.com*', '~~www.example.com~~',
    '# https://example.com', '> writer@example.com', '- www.example.com',
    '| URL |\n| --- |\n| https://example.com |',
  ])('can leave an unbracketed address as text: %s', source => {
    const standard = MarkdownImporter.parse(source, schema);
    expect(links(standard).length).toBeGreaterThan(0);
    const literal = MarkdownImporter.parse(source, schema, { autolinkLiterals: false });
    expect(links(literal)).toEqual([]);
    expect(literal.textContent).toBe(standard.textContent);
    schema.validate(literal);
    expect(MarkdownImporter.parse(MarkdownExporter.export(literal), schema, { autolinkLiterals: false }).toJSON())
      .toEqual(literal.toJSON());
    expect(MarkdownImporter.parse(source, schema).toJSON()).toEqual(standard.toJSON());
  });

  it('retains explicit links and safe angle autolinks without weakening URL policy', () => {
    const source = '[Docs](https://example.com) <https://example.com> <writer@example.com> [Ref][r] <javascript:alert(1)>\n\n[r]: /guide';
    const document = MarkdownImporter.parse(source, schema, { autolinkLiterals: false });
    expect(links(document)).toEqual(['https://example.com', 'https://example.com', 'mailto:writer@example.com', '/guide']);
    expect(document.textContent).toContain('<javascript:alert(1)>');
  });

  it('applies the policy during source capture, edits and structural export', () => {
    const source = 'Edit.\r\n\r\n[ref]: /guide\r\nKeep __this__ https://example.com and [ref].\r\n';
    const imported = MarkdownImporter.parseWithSource(source, schema, { autolinkLiterals: false });
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(source);
    const changed = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Changed.')]), imported.document.child(1)]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);
    expect(result.preservation).toBe('blocks');
    expect(result.markdown).toBe(source.replace('Edit.', 'Changed.'));
    const moved = schema.node('doc', {}, [imported.document.child(1)]);
    const mapped = MarkdownExporter.exportWithSource(moved, imported.source);
    expect(mapped.preservation).toBe('mapped-blocks');
    expect(MarkdownImporter.parse(mapped.markdown, schema, { autolinkLiterals: false }).toJSON()).toEqual(moved.toJSON());
    expect(links(moved)).toEqual(['/guide']);
  });

  it.each(['project', 'decline', 'throw'] as const)('retains policy across inline HTML adapter %s', behavior => {
    const source = 'A <em>https://example.com **writer@example.com**</em>.';
    const document = MarkdownImporter.parse(source, schema, {
      autolinkLiterals: false,
      parseHTMLInline: (segments, target) => {
        if (behavior === 'decline') return null;
        if (behavior === 'throw') throw new Error('Test adapter failure');
        return ServerHTMLImporter.parseInline(segments, target);
      },
    });
    expect(links(document)).toEqual([]);
    expect(document.textContent).toContain('https://example.com');
    expect(HTMLExporter.export(document)).toContain('<strong>writer@example.com</strong>');
  });
});
