import { describe, expect, it, vi } from 'vitest';
import { Schema } from '../src/core/schema';
import { CoreSchemaSpec } from '../src/extensions';
import { DetailsExtension } from '../src/details';
import { MarkdownImporter, type MarkdownHTMLInlineFallback, type MarkdownHTMLInlineSegment } from '../src/core/importers/markdown-importer';
import { MarkdownExporter } from '../src/core/exporters/markdown-exporter';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(CoreSchemaSpec);
const options = { parseHTMLInline: ServerHTMLImporter.parseInline };
const parse = (source: string) => MarkdownImporter.parse(source, schema, options);
const textWithMark = (source: string, name: string) => {
  const found: string[] = [];
  parse(source).descendants(node => { if (node.isText && node.marks.some(mark => mark.type.name === name)) found.push(node.text!); });
  return found.join('');
};

describe('opt-in inline HTML boundary', () => {
  it('is DOM-free and leaves the default interpretation unchanged', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    const source = 'Before <em>important</em> after.';
    expect(MarkdownImporter.parse(source, schema).textContent).toBe(source);
    expect(parse(source).textContent).toBe('Before important after.');
    expect(textWithMark(source, 'em')).toBe('important');
  });

  it('projects the whole inline stream once, including recursive Markdown scopes', () => {
    const callback = vi.fn(ServerHTMLImporter.parseInline);
    MarkdownImporter.parse('A <em>one **two**</em> three.', schema, { parseHTMLInline: callback });
    expect(callback).toHaveBeenCalledTimes(1);
    const segments = callback.mock.calls[0][0];
    expect(Object.isFrozen(segments)).toBe(true);
    expect(segments.every(Object.isFrozen)).toBe(true);
    expect(segments.filter(segment => segment.kind === 'html').map(segment => segment.html)).toEqual(['<em>', '</em>']);
    expect(segments.find(segment => segment.kind === 'node' && segment.node.text === 'two')).toMatchObject({ node: { marks: [{ type: { name: 'strong' } }] } });
  });

  it.each([
    ['A <em>one **two**</em> three.', 'one two', 'em'],
    ['A *<a href="/safe">one* two</a>.', 'one', 'em'],
    ['A *<a href="/safe">one* two</a>.', 'one two', 'link'],
    ['A <em>one *two</em> three*.', 'one two three', 'em'],
    ['A <strong>**one** two</strong>.', 'one two', 'strong'],
  ])('preserves crossing Markdown/HTML scopes: %s', (source, expected, mark) => {
    expect(textWithMark(source, mark)).toBe(expected);
  });

  it('retains Markdown-created nodes and their metadata without reserializing them', () => {
    const custom = new Schema({ ...CoreSchemaSpec, nodes: {
      ...CoreSchemaSpec.nodes, secret: { inline: true, group: 'inline', atom: true, attrs: { payload: { default: 'native-only' } } },
    } });
    const node = custom.node('secret', { payload: { nested: ['not HTML'], id: 'stable-42' } });
    const segments: MarkdownHTMLInlineSegment[] = [
      { kind: 'node', node }, { kind: 'html', html: '<em>', marks: [] },
      { kind: 'node', node: custom.text('marked') }, { kind: 'html', html: '</em>', marks: [] },
    ];
    const output = ServerHTMLImporter.parseInline(segments, custom);
    expect(output[0]).toBe(node);
    expect(output[0].attrs).toBe(node.attrs);
    expect(output[1].marks[0].type.name).toBe('em');
    const marked = ServerHTMLImporter.parseInline([segments[1], segments[0], segments[3]], custom)[0];
    expect(marked.type).toBe(node.type);
    expect(marked.attrs).toEqual(node.attrs);
    expect(marked.marks[0].type.name).toBe('em');
  });

  it('keeps existing Markdown links authoritative inside HTML link scopes', () => {
    const doc = parse('A <a href="/outer">[inner](/native) tail</a>.');
    const inner = doc.content[0].content.find(node => node.text === 'inner')!;
    expect(inner.marks.filter(mark => mark.type.name === 'link').map(mark => mark.attrs.href)).toEqual(['/native']);
  });

  it('applies local Markdown marks to HTML atoms without leaking them down tag scopes', () => {
    const doc = parse('A *<img src="/safe.png" alt="diagram">* and *<br>* end.');
    const atoms = doc.content[0].content.filter(node => !node.isText);
    expect(atoms.map(node => node.type.name)).toEqual(['inline_image', 'hard_break']);
    expect(atoms.every(node => node.marks.some(mark => mark.type.name === 'em'))).toBe(true);
    expect(textWithMark('A *<a href="/safe">one* two</a>.', 'em')).toBe('one');
  });

  it.each(['# A <em>heading</em>', 'A <em>heading</em>\n===', '> A <em>quote</em>', '- A <em>list</em>', '| A <em>cell</em> |\n| --- |'])('propagates options to inline content in %s', source => {
    expect(textWithMark(source, 'em')).not.toBe('');
    expect(parse(source).textContent).not.toContain('<em>');
  });

  it('does not invoke an adapter for code, escaped tags, autolinks, or plain Markdown', () => {
    const callback = vi.fn(ServerHTMLImporter.parseInline);
    MarkdownImporter.parse('A `<em>code</em>` and \\<em> and <https://example.org> and **bold**.', schema, { parseHTMLInline: callback });
    expect(callback).not.toHaveBeenCalled();
  });

  it.each(['declined', 'throws', 'foreign-schema', 'block', 'invalid', 'not-array'] as const)('retains exactly the inert document on %s', kind => {
    const issues: MarkdownHTMLInlineFallback[] = [];
    const source = 'A <em>one **two**</em> after.';
    const callback = () => {
      if (kind === 'declined') return null;
      if (kind === 'throws') throw new Error('No conversion');
      if (kind === 'foreign-schema') return [new Schema(CoreSchemaSpec).text('foreign')];
      if (kind === 'block') return [schema.node('paragraph', {}, [schema.text('block')])];
      if (kind === 'invalid') return [schema.text('bad', [new Schema(CoreSchemaSpec).marks.em.create()])];
      return 'invalid' as unknown as [];
    };
    const doc = MarkdownImporter.parse(source, schema, { parseHTMLInline: callback, onHTMLInlineFallback: issue => issues.push(issue) });
    expect(doc.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toBe(kind === 'declined' ? 'declined' : 'error');
    expect(Object.isFrozen(issues[0])).toBe(true);
  });

  it.each(['A <script>**code**</script> end.', 'A <textarea>text</textarea> end.', 'A <div>text</div> end.', 'A <table>one<tr><td>two</td></tr></table> end.'])('fails closed on unsupported inline structures: %s', source => {
    const issues: MarkdownHTMLInlineFallback[] = [];
    const doc = MarkdownImporter.parse(source, schema, { ...options, onHTMLInlineFallback: issue => issues.push(issue) });
    expect(doc.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
    expect(issues).toHaveLength(1);
  });

  it('uses collision-free slots and does not interpret text-node markup', () => {
    const node = schema.text('<script>alert(1)</script> & **original**');
    const output = ServerHTMLImporter.parseInline([
      { kind: 'html', html: '<fountain-markdown-slot-0 data-index="99">', marks: [] },
      { kind: 'node', node },
      { kind: 'html', html: '</fountain-markdown-slot-0>', marks: [] },
    ], schema);
    expect(output).toEqual([node]);
    expect(output[0]).toBe(node);
  });

  it('reports projection loss and applies safe URL rules', () => {
    const importer = new ServerHTMLImporter();
    const issues: string[] = [];
    const doc = MarkdownImporter.parse('A <a href="javascript:alert(1)" onclick="alert(2)">safe</a><!-- comment --> end.', schema, {
      parseHTMLInline: (segments, target) => {
        const result = importer.parseInlineWithReport(segments, target);
        issues.push(...result.issues.map(issue => issue.code));
        return result.nodes;
      },
    });
    expect(doc.textContent).toBe('A safe end.');
    expect(JSON.stringify(doc.toJSON())).not.toContain('javascript:');
    expect(issues).toContain('inline-html-projection');
  });

  it('preserves repeated immutable node references as distinct protected positions', () => {
    const node = schema.text('same');
    const nodes = ServerHTMLImporter.parseInline([{ kind: 'node', node }, { kind: 'node', node }], schema);
    expect(nodes).toHaveLength(2);
    expect(nodes.every(value => value.eq(node))).toBe(true);
  });

  it('rejects a custom atom that would consume existing Markdown children', () => {
    const custom = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      opaque: { inline: true, group: 'inline', atom: true, parseHTML: [{ tag: 'opaque-widget' }] },
    } });
    expect(() => ServerHTMLImporter.parseInline([
      { kind: 'html', html: '<opaque-widget>', marks: [] },
      { kind: 'node', node: custom.text('must survive') },
      { kind: 'html', html: '</opaque-widget>', marks: [] },
    ], custom)).toThrow(/every Markdown node/);
  });

  it('preserves exact source and mapped untouched blocks without duplicating fallback notifications', () => {
    const source = 'A <em>exact &amp; *original*</em>.\r\n\r\nOld.\r\n';
    const parsed = MarkdownImporter.parseWithSource(source, schema, options);
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
    const edited = parsed.document.copy([parsed.document.content[0], schema.node('paragraph', {}, [schema.text('New.')])]);
    expect(MarkdownExporter.exportWithSource(edited, parsed.source).markdown).toContain('A <em>exact &amp; *original*</em>.');
    const fallback = vi.fn();
    MarkdownImporter.parseWithSource('A <script>text</script>.\n\nSecond.', schema, { ...options, onHTMLInlineFallback: fallback });
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('lets host reporting failures propagate', () => {
    expect(() => MarkdownImporter.parse('A <em>x</em>', schema, {
      parseHTMLInline: () => null, onHTMLInlineFallback: () => { throw new Error('report failed'); },
    })).toThrow('report failed');
  });

  it('projects disclosure summaries without swallowing host reporting failures', () => {
    const detailsSchema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...DetailsExtension.nodes } });
    const source = '<details>\n<summary>A <em>summary</em></summary>\nBody\n</details>';
    const doc = MarkdownImporter.parse(source, detailsSchema, options);
    expect(doc.content[0].type.name).toBe('details');
    expect(doc.content[0].content[0].content[1].marks[0].type.name).toBe('em');
    expect(() => MarkdownImporter.parse(source, detailsSchema, {
      parseHTMLInline: () => null, onHTMLInlineFallback: () => { throw new Error('summary report failed'); },
    })).toThrow('summary report failed');
  });

  it('enforces the optional parser resource limits', () => {
    const importer = new ServerHTMLImporter({ maxInputBytes: 20 });
    expect(() => importer.parseInline([{ kind: 'node', node: schema.text('original') }], schema)).toThrow(/input limit/);
    expect(() => importer.parseInline([{ kind: 'html', html: '<em>text</em>', marks: [] }], schema)).toThrow(/exactly one/);
  });
});
