import { describe, expect, it, vi } from 'vitest';
import { MarkdownImporter, MarkdownExporter, Schema, HTMLExporter } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';

describe('registered HTML wrappers during Markdown source recovery', () => {
  const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
    section: {
      group: 'block', content: 'block+',
      attrs: { label: { default: '' } },
      parseHTML: [{ tag: 'section[data-label]', getAttrs: element => ({ label: element.getAttribute('data-label') ?? '' }) }],
      toDOM: node => ['section', { 'data-label': node.attrs.label }, 0],
    },
  } });
  it.each([
    'Inspect logs  \nCheck timestamps',
    '# Heading\n\nInspect logs\\\nCheck timestamps',
    '- Inspect logs  \n  Check timestamps\n- Done',
    '<section data-label="Nested">\n\nInspect logs  \nCheck timestamps\n\n</section>',
  ])('preserves registered wrappers and breaks through content-shape selection: %s', body => {
    for (const ending of ['\n', '\r\n']) {
      const source = `<section data-label="Release">\n\n${body}\n\n</section>`.replaceAll('\n', ending);
      const fallback = vi.fn();
      const result = MarkdownImporter.parseWithSource(source, schema, {
        parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback,
      });
      expect(fallback).not.toHaveBeenCalled();
      expect(result.document.child(0).type.name).toBe('section');
      expect(result.document.child(0).attrs.label).toBe('Release');
      const breaks = (node: typeof result.document): number => Number(node.type.name === 'hard_break') + node.content.reduce((sum, child) => sum + breaks(child), 0);
      expect(breaks(result.document)).toBe(1);
      expect(HTMLExporter.export(result.document, { document: false })).toContain('<section data-label="Release">');
      expect(MarkdownExporter.exportWithSource(result.document, result.source).markdown).toBe(source);
    }
  });

  it('discards evidence from a higher-priority rule with an incompatible content shape', () => {
    const custom = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      rejected: { group: 'block', content: 'image_super+', parseHTML: [{ tag: 'section', priority: 100 }] },
      section: schema.nodes.section.spec,
    } });
    const source = '<section data-label="Release">\n\nInspect logs  \nCheck timestamps\n\n</section>';
    const fallback = vi.fn();
    const result = MarkdownImporter.parse(source, custom, { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback });
    expect(fallback).not.toHaveBeenCalled();
    expect(result.child(0).type.name).toBe('section');
  });

  it('discards speculative visits before a built-in wrapper fallback', () => {
    const custom = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      rejected: { group: 'block', content: 'image_super+', parseHTML: [{ tag: 'blockquote' }] },
    } });
    const fallback = vi.fn();
    const result = MarkdownImporter.parse('<blockquote>\n\none  \ntwo\n\n</blockquote>', custom, {
      parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback,
    });
    expect(fallback).not.toHaveBeenCalled();
    expect(result.child(0).type.name).toBe('blockquote');
  });

  it('still refuses a rule that discards content rather than accepting incomplete evidence', () => {
    const custom = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      section: { ...schema.nodes.section.spec, parseHTML: [{ tag: 'section', contentElement: ':scope > p:first-child' }] },
    } });
    const source = '<section>\n\nfirst  \nline\n\nsecond  \nline\n\n</section>';
    const fallback = vi.fn();
    const result = MarkdownImporter.parseWithSource(source, custom, { parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback });
    expect(fallback).toHaveBeenCalledOnce();
    expect(result.document.toJSON()).toEqual(MarkdownImporter.parse(source, custom).toJSON());
    expect(MarkdownExporter.exportWithSource(result.document, result.source).markdown).toBe(source);
  });
});
