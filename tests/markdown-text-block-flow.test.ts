import { describe, expect, it, vi } from 'vitest';
import { MarkdownImporter, MarkdownExporter, Schema, type MarkdownHTMLFlowContext } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';

describe('source-aware heading and code HTML flow', () => {
  const schema = new Schema(CoreSchemaSpec);
  const wrap = (source: string) => `<div><pre>\n\n${source}\n\n</pre></div>\n`;
  const cases = [
    ['ATX heading', '# Heading', 'Heading\n'],
    ['Setext heading', 'First\nsecond\n---', 'First\nsecond\n'],
    ['fenced code', '```\nx\n```', 'x\n\n'],
    ['indented code', '    x', 'x\n\n'],
    ['empty fenced code', '```\n```', '\n'],
    ['blank fenced code', '```\n\n```', '\n\n'],
    ['literal code', '```\n<b>x</b> &amp; *y*\n```', '<b>x</b> &amp; *y*\n\n'],
    ['mixed text blocks', '# Recovery note\n\nfirst line\n  second line\n\n```\nconst n = 1;\n```', 'Recovery note\nfirst line\n  second line\nconst n = 1;\n\n'],
  ];
  it.each(cases)('recovers %s without confusing syntax with rendered text', (_name, body, expected) => {
    for (const ending of ['\n', '\r\n']) {
      const source = wrap(body).replaceAll('\n', ending);
      const fallback = vi.fn();
      const parsed = MarkdownImporter.parseWithSource(source, schema, {
        parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback,
      });
      expect(fallback).not.toHaveBeenCalled();
      expect(parsed.document.child(0).type.name).toBe('code_block');
      expect(parsed.document.child(0).textContent).toBe(expected);
      expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
      schema.validate(parsed.document);
    }
  });

  it('shares lazy syntax snapshots, captures direct order and does not replay inline adapters', () => {
    const inline = vi.fn(() => null);
    let captured: MarkdownHTMLFlowContext | undefined;
    MarkdownImporter.parse('<div>\n\nFirst\n\n# H <b>x</b>\n\n```js\na\n```\n\nLast\n\n</div>', schema, {
      parseHTMLInline: inline,
      parseHTMLFlow(_segments, _schema, context) { captured = context; return null; },
    });
    const calls = inline.mock.calls.length;
    const blocks = captured!.readTextBlockSources!();
    expect(blocks.map(block => block.kind)).toEqual(['paragraph', 'heading', 'code', 'paragraph']);
    expect(captured!.readTextBlockSources!()).toBe(blocks);
    expect(captured!.readParagraphSources()).toEqual([blocks[0], blocks[3]]);
    expect(captured!.readParagraphSources()[0]).toBe(blocks[0]);
    expect(inline).toHaveBeenCalledTimes(calls);
    expect(Object.isFrozen(blocks)).toBe(true);
    expect(blocks.every(block => Object.isFrozen(block) && Object.isFrozen(block.segments))).toBe(true);
  });

  it('retains heading and code structure outside pre, including language and marks', () => {
    const fallback = vi.fn();
    const doc = MarkdownImporter.parse('<div>\n\n# **Heading**\n\n```python\nx < y\n```\n\n</div>', schema, {
      parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback,
    });
    expect(fallback).not.toHaveBeenCalled();
    expect(doc.content.map(node => node.type.name)).toEqual(['heading', 'code_block']);
    expect(doc.child(0).attrs.level).toBe(1);
    expect(doc.child(0).child(0).marks.map(mark => mark.type.name)).toContain('strong');
    expect(doc.child(1).attrs.language).toBe('python');
    expect(doc.child(1).textContent).toBe('x < y\n');
  });

  it.each(['heading', 'code_block'])('refuses custom %s metadata even in schema defaults', type => {
    const custom = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      [type]: { ...CoreSchemaSpec.nodes[type], attrs: { ...CoreSchemaSpec.nodes[type].attrs, owner: { default: 'Alice' } } },
    } });
    const source = wrap(type === 'heading' ? '# Keep' : '```\nKeep\n```');
    const fallback = vi.fn();
    const doc = MarkdownImporter.parse(source, custom, { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback });
    expect(fallback).toHaveBeenCalledOnce();
    expect(doc.toJSON()).toEqual(MarkdownImporter.parse(source, custom).toJSON());
  });

  it.each(['- one\n- two', 'line  \nbreak', '# ![image](https://example.test/a.png)'])('refuses unsupported structure: %s', body => {
    const source = wrap(body);
    const fallback = vi.fn();
    const doc = MarkdownImporter.parse(source, schema, { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback });
    expect(fallback).toHaveBeenCalledOnce();
    expect(doc.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
  });

  it('does not expand the paragraph-only contract and requires text-block context', () => {
    const fallback = vi.fn();
    MarkdownImporter.parse(wrap('# Heading'), schema, { parseHTMLFlow: ServerHTMLImporter.parseParagraphFlow, onHTMLFlowFallback: fallback });
    expect(fallback).toHaveBeenCalledOnce();
    expect(() => ServerHTMLImporter.parseTextBlockFlow([], schema, { readParagraphSources: () => [] })).toThrow('text-block source context');
  });

  it('preserves direct source order when list paragraphs were deferred for tightness', () => {
    let captured: MarkdownHTMLFlowContext | undefined;
    MarkdownImporter.parse('- <div>\n\n  First\n\n  # Heading\n\n  Last\n\n  </div>', schema, {
      parseHTMLFlow(_segments, _schema, context) { captured = context; return null; },
    });
    expect(captured!.readTextBlockSources!().map(block => block.kind)).toEqual(['paragraph', 'heading', 'paragraph']);
  });

  it('refuses changed heading text/marks from an inline adapter', () => {
    const source = wrap('# <i>Original</i>');
    const fallback = vi.fn();
    const parsed = MarkdownImporter.parse(source, schema, {
      parseHTMLInline: () => [schema.text('Modified')],
      parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow,
      onHTMLFlowFallback: fallback,
    });
    expect(fallback).toHaveBeenCalledOnce();
    expect(parsed.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
  });

  it('keeps hostile fence info inert rather than creating HTML attributes', () => {
    // The supplied schema rejects these labels. Exercise a host that explicitly
    // permits them, so the adapter's escaping is tested independently.
    const custom = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      code_block: { ...CoreSchemaSpec.nodes.code_block, attrs: { ...CoreSchemaSpec.nodes.code_block.attrs,
        language: { default: 'text', validate: (value: unknown) => typeof value === 'string' },
      } },
    } });
    const fallback = vi.fn();
    const parsed = MarkdownImporter.parse('<div>\n\n```x"onclick="bad\nSafe\n```\n\n</div>', custom, {
      parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback,
    });
    expect(fallback).not.toHaveBeenCalled();
    expect(parsed.child(0).textContent).toBe('Safe\n');
    expect(parsed.content).toHaveLength(1);
  });
});
