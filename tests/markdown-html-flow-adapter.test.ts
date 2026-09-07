import { describe, expect, it, vi } from 'vitest';
import { MarkdownExporter, MarkdownImporter, Schema, type MarkdownImportOptions } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';

describe('opt-in HTML block flow', () => {
  const schema = new Schema(CoreSchemaSpec);
  const options: MarkdownImportOptions = { parseHTMLFlow: ServerHTMLImporter.parseFlow };

  it('resolves a table split by CommonMark blank-line boundaries in pure Node', () => {
    expect(typeof document).toBe('undefined');
    const source = '<table>\n\n<tr>\n\n<td>\nHi\n</td>\n\n</tr>\n\n</table>\n';
    const parsed = MarkdownImporter.parseWithSource(source, schema, options);
    expect(parsed.document.content.map(node => node.type.name)).toEqual(['table']);
    expect(parsed.document.content[0].content[0].content[0].textContent.trim()).toBe('Hi');
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
    expect(parsed.source.blocks).toHaveLength(0);
    schema.validate(parsed.document);
  });

  it('keeps Markdown blocks inside an HTML wrapper without phantom boundary paragraphs', () => {
    const source = '<DIV CLASS="foo">\n\n*Markdown*\n\n</DIV>\n';
    const parsed = MarkdownImporter.parseWithSource(source, schema, options);
    expect(parsed.document.content).toHaveLength(1);
    expect(parsed.document.content[0].content[0].marks[0].type.name).toBe('em');
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
  });

  it('preserves protected block identity, source-like text and duplicates inside a table cell', () => {
    const node = schema.node('paragraph', { nodeId: 'original' }, [schema.text('<& **literal**')]);
    const result = new ServerHTMLImporter().parseFlowWithReport([
      { kind: 'html', html: '<table><tr><td>' },
      { kind: 'node', node }, { kind: 'node', node },
      { kind: 'html', html: '</td></tr></table>' },
    ], schema);
    expect(result.nodes[0].content[0].content[0].content).toEqual([node, node]);
    expect(result.nodes[0].content[0].content[0].content[0]).toBe(node);
    expect(result.nodes[0].content[0].content[0].content[1]).toBe(node);
    expect(result.issues.map(issue => issue.code)).toContain('block-html-projection');
    expect(Object.isFrozen(result.nodes)).toBe(true);
  });

  it.each(['> ', '- '])('keeps an HTML flow inside its Markdown container (%s)', prefix => {
    const source = ['<div>', '', '**Inside**', '', '</div>'].map((line, index) =>
      prefix === '- ' && index ? `  ${line}` : `${prefix}${line}`).join('\n');
    const parsed = MarkdownImporter.parse(source, schema, options);
    expect(parsed.content[0].type.name).toBe(prefix === '> ' ? 'blockquote' : 'bullet_list');
    expect(parsed.textContent).toBe('Inside');
    schema.validate(parsed);
  });

  it('does not invoke flow conversion for fences or escaped HTML', () => {
    const adapter = vi.fn(ServerHTMLImporter.parseFlow);
    const source = '```html\n<div>\n```\n\n\\<div>';
    expect(MarkdownImporter.parse(source, schema, { parseHTMLFlow: adapter }).toJSON())
      .toEqual(MarkdownImporter.parse(source, schema).toJSON());
    expect(adapter).not.toHaveBeenCalled();
  });

  it('takes precedence over per-block conversion and provides immutable segments', () => {
    const block = vi.fn();
    MarkdownImporter.parse('<div>\n\nHi\n\n</div>', schema, {
      parseHTMLBlock: block,
      parseHTMLFlow(segments, target) {
        expect(Object.isFrozen(segments)).toBe(true);
        expect(segments.every(Object.isFrozen)).toBe(true);
        return ServerHTMLImporter.parseFlow(segments, target);
      },
    });
    expect(block).not.toHaveBeenCalled();
  });

  it.each(['<pre>', '<script>'])('refuses unsupported scopes that would consume or alter original blocks (%s)', opening => {
    const node = schema.node('paragraph', {}, [schema.text('original')]);
    expect(() => ServerHTMLImporter.parseFlow([{ kind: 'html', html: opening }, { kind: 'node', node }], schema)).toThrow();
  });

  it('converts standalone pre blocks but reports the mixed table/pre CommonMark boundary', () => {
    const report = vi.fn();
    const standalone = MarkdownImporter.parse('<pre>\n\n*literal*\n\n</pre>', schema, { ...options, onHTMLFlowFallback: report });
    expect(standalone.content[0].type.name).toBe('code_block');
    expect(standalone.textContent).toContain('*literal*');
    expect(report).not.toHaveBeenCalled();
    const mixed = '<table><tr><td>\n<pre>\n**Hello**,\n\n_world_.\n</pre>\n</td></tr></table>\n';
    const parsed = MarkdownImporter.parse(mixed, schema, { ...options, onHTMLFlowFallback: report });
    expect(report).toHaveBeenCalledTimes(1);
    expect(parsed.toJSON()).toEqual(MarkdownImporter.parse(mixed, schema).toJSON());
  });

  it('applies cross-block deletion marks without losing Markdown emphasis or source', () => {
    const source = '<del>\n\n*foo*\n\n</del>\n';
    const parsed = MarkdownImporter.parseWithSource(source, schema, options);
    expect(parsed.document.content).toHaveLength(1);
    expect(parsed.document.content[0].content[0].marks.map(mark => mark.type.name)).toEqual(['strike', 'em']);
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
  });

  it('inherits HTML marks through lists and tables while retaining node identities and local marks', () => {
    const text = schema.text('Same source', [schema.mark('link', { href: '/local' })]);
    const paragraph = schema.node('paragraph', { nodeId: 'paragraph-id', customData: { value: 2 } }, [text]);
    const list = schema.node('bullet_list', { nodeId: 'list-id' }, [schema.node('list_item', {}, [paragraph])]);
    const result = ServerHTMLImporter.parseFlow([
      { kind: 'html', html: '<a href="/outer"><del>' },
      { kind: 'node', node: list }, { kind: 'html', html: '</del></a>' },
    ], schema);
    expect(result[0].attrs).toEqual(list.attrs);
    const child = result[0].content[0].content[0];
    expect(child.attrs).toEqual(paragraph.attrs);
    expect(child.content[0].text).toBe(text.text);
    expect(child.content[0].marks.find(mark => mark.type.name === 'link')?.attrs.href).toBe('/local');
    expect(child.content[0].marks.map(mark => mark.type.name)).toContain('strike');
    expect(list.content[0].content[0]).toBe(paragraph);
    expect(paragraph.content[0]).toBe(text);
    expect(text.marks.map(mark => mark.type.name)).toEqual(['link']);
  });

  it('keeps repeated originals distinct under different formatting and preserves untouched atoms', () => {
    const paragraph = schema.node('paragraph', {}, [schema.text('Repeated')]);
    const atom = schema.node('horizontal_rule');
    const result = ServerHTMLImporter.parseFlow([
      { kind: 'html', html: '<del>' }, { kind: 'node', node: paragraph },
      { kind: 'node', node: atom }, { kind: 'html', html: '</del>' },
      { kind: 'node', node: paragraph },
    ], schema);
    expect(result[0].content[0].marks[0].type.name).toBe('strike');
    expect(result[1]).toBe(atom);
    expect(result[2]).toBe(paragraph);
  });

  it('uses the same style and custom-mark rules for native HTML and protected Markdown blocks', () => {
    const custom = new Schema({ ...CoreSchemaSpec, marks: {
      ...CoreSchemaSpec.marks,
      annotation: { attrs: { label: { default: '' } }, parseHTML: [{ tag: 'review-mark', getAttrs: element => ({ label: element.getAttribute('data-label') ?? '' }) }] },
    } });
    const paragraph = custom.node('paragraph', {}, [custom.text('Markdown')]);
    const nodes = ServerHTMLImporter.parseFlow([
      { kind: 'html', html: '<review-mark data-label="Review"><div style="font-weight:bold;text-decoration:underline"><p>HTML</p>' },
      { kind: 'node', node: paragraph }, { kind: 'html', html: '</div></review-mark>' },
    ], custom);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].content[0].marks.map(mark => mark.toJSON())).toEqual(nodes[1].content[0].marks.map(mark => mark.toJSON()));
    expect(nodes[1].content[0].marks.map(mark => mark.type.name)).toEqual(['annotation', 'strong', 'underline']);
    expect(nodes[1].content[0].marks[0].attrs.label).toBe('Review');
    const nested = ServerHTMLImporter.parseFlow([
      { kind: 'html', html: '<review-mark data-label="Outer"><review-mark data-label="Inner">' },
      { kind: 'node', node: paragraph }, { kind: 'html', html: '</review-mark></review-mark>' },
    ], custom);
    expect(nested[0].content[0].marks[0].attrs.label).toBe('Inner');
  });

  it('rejects unsafe surrounding links while keeping protected blocks unchanged', () => {
    const node = schema.node('paragraph', {}, [schema.text('Keep')]);
    const result = new ServerHTMLImporter().parseFlowWithReport([
      { kind: 'html', html: '<a href="javascript:alert(1)">' }, { kind: 'node', node }, { kind: 'html', html: '</a>' },
    ], schema);
    expect(result.nodes[0]).toBe(node);
    expect(result.issues.map(issue => issue.code)).toContain('rejected-url');
  });

  it('avoids author-controlled slot names and rejects invalid or over-limit input', () => {
    const node = schema.node('paragraph', {}, [schema.text('original')]);
    const segments = [{ kind: 'html' as const, html: '<div data-fountain-block-slot-0="0">Author</div>' }, { kind: 'node' as const, node }];
    const result = ServerHTMLImporter.parseFlow(segments, schema);
    expect(result.at(-1)).toBe(node);
    expect(() => new ServerHTMLImporter({ maxInputBytes: 4 }).parseFlow(segments, schema)).toThrow('limit');
    expect(() => ServerHTMLImporter.parseFlow([{ kind: 'node', node: schema.text('inline') }], schema)).toThrow('block');
  });

  it('preserves extension blocks but refuses custom HTML renderers that consume them', () => {
    const custom = new Schema({ ...CoreSchemaSpec, nodes: {
      ...CoreSchemaSpec.nodes,
      widget: { group: 'block', atom: true, attrs: { source: { default: '' } }, parseHTML: [{ tag: 'custom-widget' }] },
    } });
    const node = custom.node('widget', { source: '<& private source' });
    const retained = ServerHTMLImporter.parseFlow([
      { kind: 'html', html: '<div>' }, { kind: 'node', node }, { kind: 'html', html: '</div>' },
    ], custom);
    expect(retained[0]).toBe(node);
    expect(() => ServerHTMLImporter.parseFlow([
      { kind: 'html', html: '<custom-widget>' }, { kind: 'node', node }, { kind: 'html', html: '</custom-widget>' },
    ], custom)).toThrow('preserve every Markdown block');
  });

  it('keeps unsafe URLs inert and reports their removal without losing protected text', () => {
    const node = schema.node('paragraph', {}, [schema.text('Keep')]);
    const result = new ServerHTMLImporter().parseFlowWithReport([
      { kind: 'html', html: '<div><p><a href="javascript:alert(1)">Unsafe</a></p>' },
      { kind: 'node', node }, { kind: 'html', html: '</div>' },
    ], schema);
    expect(result.nodes[1]).toBe(node);
    expect(result.issues.map(issue => issue.code)).toContain('rejected-url');
    expect(JSON.stringify(result.nodes.map(node => node.toJSON()))).not.toContain('javascript:');
  });

  it.each(['declined', 'throws', 'foreign', 'inline', 'orphan'] as const)('keeps inert source on %s adapter results', kind => {
    const source = '<div>\n\nKeep\n\n</div>';
    const report = vi.fn();
    const parsed = MarkdownImporter.parseWithSource(source, schema, {
      parseHTMLFlow() {
        if (kind === 'declined') return null;
        if (kind === 'throws') throw new Error('Unavailable');
        if (kind === 'foreign') return [new Schema(CoreSchemaSpec).node('paragraph')];
        if (kind === 'inline') return [schema.text('bad')];
        return [schema.node('list_item', {}, [schema.node('paragraph')])];
      },
      onHTMLFlowFallback: report,
    });
    expect(parsed.document.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('does not swallow host reporting errors', () => {
    expect(() => MarkdownImporter.parse('<div>hello</div>', schema, {
      parseHTMLFlow: () => null,
      onHTMLFlowFallback: () => { throw new Error('Host error'); },
    })).toThrow('Host error');
  });
});
