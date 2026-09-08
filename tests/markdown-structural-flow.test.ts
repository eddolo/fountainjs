import { describe, expect, it, vi } from 'vitest';
import { MarkdownImporter, MarkdownExporter, Schema, type MarkdownHTMLFlowBlockSource, type MarkdownHTMLFlowContext } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';

describe('recursive Markdown source projection', () => {
  const schema = new Schema(CoreSchemaSpec);
  const wrap = (body: string) => `<div><pre>\n\n${body}\n\n</pre></div>`;
  it('captures tightness, ordered starts and quote/list nesting without replaying adapters', () => {
    let context: MarkdownHTMLFlowContext | undefined;
    const inline = vi.fn(() => null);
    MarkdownImporter.parse(wrap('3. **first**\n   - child\n4. > quoted'), schema, {
      parseHTMLInline: inline,
      parseHTMLFlow(_segments, _schema, value) { context = value; return null; },
    });
    const calls = inline.mock.calls.length;
    const tree = context!.readBlockSources!();
    expect(context!.readBlockSources!()).toBe(tree);
    const kinds: string[] = [];
    const visit = (sources: readonly MarkdownHTMLFlowBlockSource[]) => {
      expect(Object.isFrozen(sources)).toBe(true);
      for (const source of sources) {
        expect(Object.isFrozen(source)).toBe(true);
        expect(Object.isFrozen(source.blocks)).toBe(true);
        kinds.push(source.kind === 'container' ? source.tag : source.kind);
        if (source.kind === 'container') {
          expect(source.children.flatMap(child => child.blocks)).toEqual(source.blocks[0].content);
          if (source.tag === 'ol') expect(source.start).toBe(3);
          visit(source.children);
        }
        if (source.kind === 'paragraph' && source.source === '**first**') expect(source.tightList).toBe(true);
      }
    };
    visit(tree);
    expect(kinds).toEqual(['html', 'ol', 'li', 'paragraph', 'ul', 'li', 'paragraph', 'li', 'blockquote', 'paragraph', 'paragraph']);
    expect(inline).toHaveBeenCalledTimes(calls);
    expect(context!.readTextBlockSources!().map(source => source.source)).toEqual(['</pre></div>']);
  });

  it.each(['bullet_list', 'ordered_list', 'list_item', 'blockquote', 'paragraph'])('refuses custom %s attributes through every nested level', type => {
    const custom = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      [type]: { ...CoreSchemaSpec.nodes[type], attrs: { ...CoreSchemaSpec.nodes[type].attrs, owner: { default: 'Alice' } } },
    } });
    const source = wrap('1. outer\n   - > inner');
    const fallback = vi.fn();
    const result = MarkdownImporter.parseWithSource(source, custom, { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback });
    expect(fallback).toHaveBeenCalledOnce();
    expect(result.document.toJSON()).toEqual(MarkdownImporter.parse(source, custom).toJSON());
    expect(MarkdownExporter.exportWithSource(result.document, result.source).markdown).toBe(source);
  });

  it('rolls back a nested speculative conversion instead of overwriting its changed content', () => {
    const source = wrap('- <b>Original</b>\n- second');
    const inline = vi.fn(() => [schema.text('Changed')]);
    const fallback = vi.fn();
    const result = MarkdownImporter.parse(source, schema, { parseHTMLInline: inline, parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback });
    // The item HTML and the direct closing-pre paragraph each invoke the adapter once.
    expect(inline).toHaveBeenCalledTimes(2);
    expect(fallback).toHaveBeenCalledOnce();
    expect(result.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
  });

  it('enforces structural depth limits without partial replacement', () => {
    const importer = new ServerHTMLImporter({ maxDepth: 2 });
    const source = wrap('- outer\n  - > inner');
    const fallback = vi.fn();
    const result = MarkdownImporter.parse(source, schema, {
      parseHTMLFlow: (segments, target, context) => importer.parseTextBlockFlow(segments, target, context), onHTMLFlowFallback: fallback,
    });
    expect(fallback).toHaveBeenCalledOnce();
    expect(result.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
  });

  it('preserves list/quote structure and ordered starts outside a pre', () => {
    const source = '<blockquote>\n\n3. first\n   - child\n4. > quoted\n\n</blockquote>';
    const fallback = vi.fn();
    const doc = MarkdownImporter.parse(source, schema, { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback });
    expect(fallback).not.toHaveBeenCalled();
    const list = doc.child(0).child(0);
    expect(doc.child(0).type.name).toBe('blockquote');
    expect(list.type.name).toBe('ordered_list');
    expect(list.attrs.start).toBe(3);
    expect(list.child(0).child(1).type.name).toBe('bullet_list');
    expect(list.child(1).child(0).type.name).toBe('blockquote');
  });
});
