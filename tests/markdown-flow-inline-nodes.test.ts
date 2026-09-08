import { describe, expect, it, vi } from 'vitest';
import { MarkdownImporter, MarkdownExporter, Schema } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';
import { MathExtension } from '../src/extensions/math';
import { EmojiExtension } from '../src/extensions/emoji';

describe('structural HTML flow preserves inline objects without flattening', () => {
  const schema = new Schema(CoreSchemaSpec);
  const wrap = (body: string) => `<blockquote>\n\n${body}\n\n</blockquote>\n`;
  const find = (node: ReturnType<typeof MarkdownImporter.parse>, type: string): typeof node[] =>
    [...(node.type.name === type ? [node] : []), ...node.content.flatMap(child => find(child, type))];

  it.each([
    'Before ![Diagram](https://example.test/diagram.png "Caption") after',
    '# Before ![Diagram](https://example.test/diagram.png "Caption") after',
    '- Before ![Diagram](https://example.test/diagram.png "Caption") after\n- Second',
    '> Before ![Diagram](https://example.test/diagram.png "Caption") after',
    'Before **![Diagram](https://example.test/diagram.png "Caption")** after',
    'Before [![Diagram](https://example.test/diagram.png "Caption")](/details) after',
    '**one  \ntwo**',
  ])('retains source-defined inline content: %s', body => {
    for (const ending of ['\n', '\r\n']) {
      const source = wrap(body).replaceAll('\n', ending);
      const fallback = vi.fn();
      const parsed = MarkdownImporter.parseWithSource(source, schema, {
        parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback,
      });
      expect(fallback).not.toHaveBeenCalled();
      expect(parsed.document.child(0).type.name).toBe('blockquote');
      const expected = MarkdownImporter.parse(body, schema);
      const type = body.includes('![') ? 'inline_image' : 'hard_break';
      expect(find(parsed.document, type).map(node => node.toJSON())).toEqual(find(expected, type).map(node => node.toJSON()));
      expect(find(parsed.document, type)).toHaveLength(1);
      expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
      schema.validate(parsed.document);
    }
  });

  it.each(['inline_image', 'hard_break'])('preserves custom %s metadata outside pre', type => {
    const custom = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      [type]: { ...CoreSchemaSpec.nodes[type], attrs: { ...CoreSchemaSpec.nodes[type].attrs, owner: { default: 'Alice' } } },
    } });
    const body = type === 'inline_image' ? 'Before ![Diagram](/diagram.png) after' : 'one  \ntwo';
    const source = wrap(body);
    const fallback = vi.fn();
    const parsed = MarkdownImporter.parseWithSource(source, custom, {
      parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback,
    });
    expect(fallback).not.toHaveBeenCalled();
    expect(find(parsed.document, type)[0].attrs.owner).toBe('Alice');
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
  });

  it('refuses the same image where pre would erase its data and retains the complete source', () => {
    const source = '<div><pre>\n\nBefore **![Diagram](/diagram.png "Caption")** after\n\n</pre></div>\n';
    const fallback = vi.fn();
    const parsed = MarkdownImporter.parseWithSource(source, schema, {
      parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback,
    });
    expect(fallback).toHaveBeenCalledOnce();
    expect(parsed.document.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
  });

  it('retains optional math and emoji nodes with their source data', () => {
    const extended = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...MathExtension.nodes, ...EmojiExtension.nodes } });
    const source = wrap('Equation $x^2$ and 😀 remain structured.');
    const fallback = vi.fn();
    const parsed = MarkdownImporter.parseWithSource(source, extended, { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback });
    expect(fallback).not.toHaveBeenCalled();
    expect(find(parsed.document, 'inline_math')[0].attrs.latex).toBe('x^2');
    expect(find(parsed.document, 'emoji')[0].attrs.emoji).toBe('😀');
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
  });

  it('refuses a modified inline projection rather than replacing its image data', () => {
    const source = wrap('Before <span>![Original](/original.png)</span> after');
    const fallback = vi.fn();
    const parsed = MarkdownImporter.parseWithSource(source, schema, {
      parseHTMLInline: () => [schema.node('inline_image', { src: '/different.png', alt: 'Changed' })],
      parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback,
    });
    expect(fallback).toHaveBeenCalled();
    expect(parsed.document.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
  });
});
