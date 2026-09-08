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
    ['tight list', '- one\n- two', '\none\ntwo\n\n'],
    ['space hard break', 'line  \nbreak', 'line\nbreak\n'],
    ['backslash hard break', 'line\\\nbreak', 'line\nbreak\n'],
    ['literal space', 'line break', 'line break\n'],
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
    // A wrapper must not add the HTML renderer's terminal LF to the code buffer.
    expect(doc.child(1).textContent).toBe('x < y');
    expect(doc.child(1).textContent).toBe(MarkdownImporter.parse('```python\nx < y\n```', schema).child(0).textContent);
  });

  it.each(['c++', 'c#', 'my.dsl'])('does not truncate the %s code label during source projection', language => {
    const source = `<div>\n\n\`\`\`${language}\nx\n\`\`\`\n\n</div>`;
    const fallback = vi.fn();
    const doc = MarkdownImporter.parse(source, schema, { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback });
    expect(fallback).not.toHaveBeenCalled();
    expect(doc.child(0).attrs.language).toBe(language);
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

  it.each(['- [x] task', '# ![image](https://example.test/a.png)', '**line  \nbreak**'])('refuses unsupported structure: %s', body => {
    const source = wrap(body);
    const fallback = vi.fn();
    const doc = MarkdownImporter.parse(source, schema, { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback });
    expect(fallback).toHaveBeenCalledOnce();
    expect(doc.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
  });

  it('refuses custom hard-break attributes rather than losing them in pre', () => {
    const custom = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      hard_break: { ...CoreSchemaSpec.nodes.hard_break, attrs: { owner: { default: 'Alice' } } },
    } });
    const source = wrap('line  \nbreak');
    const fallback = vi.fn();
    const parsed = MarkdownImporter.parseWithSource(source, custom, { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback });
    expect(fallback).toHaveBeenCalledOnce();
    expect(parsed.document.toJSON()).toEqual(MarkdownImporter.parse(source, custom).toJSON());
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
  });

  it('does not mistake authored raw br HTML for a generated Markdown hard break', () => {
    const source = wrap('one<br />two');
    const fallback = vi.fn();
    const parsed = MarkdownImporter.parseWithSource(source, schema, { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback });
    expect(fallback).toHaveBeenCalledOnce();
    expect(parsed.document.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
  });

  it('keeps the renderer newline collapsible outside pre so the editor shows only one break', () => {
    const source = '<blockquote>\n\none  \ntwo\n\n</blockquote>';
    const fallback = vi.fn();
    const doc = MarkdownImporter.parse(source, schema, { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback });
    expect(fallback).not.toHaveBeenCalled();
    const paragraph = doc.child(0).child(0);
    expect(paragraph.content.filter(node => node.type.name === 'hard_break')).toHaveLength(1);
    expect(paragraph.content.filter(node => node.isText).map(node => node.text).join('')).toBe('onetwo');
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
    const fallback = vi.fn();
    const parsed = MarkdownImporter.parse('<div>\n\n```x"onclick="bad\nSafe\n```\n\n</div>', schema, {
      parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback,
    });
    expect(fallback).not.toHaveBeenCalled();
    expect(parsed.child(0).textContent).toBe('Safe');
    expect(parsed.child(0).attrs.language).toBe('x"onclick="bad');
    expect(parsed.content).toHaveLength(1);
  });
});
