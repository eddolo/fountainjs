import { describe, expect, it } from 'vitest';
import { MarkdownImporter, MarkdownExporter, HTMLExporter, Schema } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';

describe('opaque Markdown code labels', () => {
  const schema = new Schema(CoreSchemaSpec);
  const labels = ['x'.repeat(100), 'x"y', "x'y", '<script>', 'x&y', 'a&amp;b', 'a\\b', '~name', '`name', '__proto__', 'constructor', '日本語'];
  it.each(labels)('retains %s through canonical Markdown and HTML round trips', language => {
    const node = schema.node('doc', {}, [schema.node('code_block', { language }, [schema.text('x\n```\ny')])]);
    const canonical = MarkdownExporter.export(node);
    const imported = MarkdownImporter.parseWithSource(canonical, schema);
    expect(imported.document.toJSON()).toEqual(node.toJSON());
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(canonical);
    const html = HTMLExporter.export(node, { document: false });
    expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(node.toJSON());
    expect(html).not.toContain('<script>');
  });

  it.each([
    ['x"y', 'x"y'], ['x'.repeat(100), 'x'.repeat(100)],
    ['a&#32;b', 'a'], ['a&#10;b', 'a'], ['&#32;a', 'text'],
    ['a\\&amp;b', 'a&amp;b'], ['a&amp;b', 'a&b'],
  ])('decodes %s before taking the first info word', (info, language) => {
    const source = `\`\`\`${info}\nx\n\`\`\``;
    const imported = MarkdownImporter.parseWithSource(source, schema);
    expect(imported.document.child(0).attrs.language).toBe(language);
    expect(imported.document.child(0).textContent).toBe('x');
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(source);
  });

  it('respects a host schema that deliberately narrows labels', () => {
    const strict = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      code_block: { ...CoreSchemaSpec.nodes.code_block, attrs: { ...CoreSchemaSpec.nodes.code_block.attrs,
        language: { default: 'text', validate: (value: unknown) => value === 'text' || value === 'python' },
      } },
    } });
    expect(() => MarkdownImporter.parse('```custom\nx\n```', strict)).toThrow('Invalid value for attribute: language');
  });
});
