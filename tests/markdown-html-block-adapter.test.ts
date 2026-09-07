import { describe, expect, it, vi } from 'vitest';
import {
  MarkdownExporter, MarkdownImporter,
  MarkdownSourceSnapshot, Schema, composeExtensions,
  type MarkdownHTMLBlockFallback, type MarkdownImportOptions,
} from '../src/headless';
import { CoreExtension, CoreSchemaSpec } from '../src/extensions';
import { DetailsExtension } from '../src/details';
import { PagesExtension } from '../src/pages';
import { ServerHTMLImporter } from '../src/html/server';

describe('opt-in raw HTML block projection', () => {
  const schema = new Schema(composeExtensions([CoreExtension, DetailsExtension, PagesExtension]).schema);
  const options: MarkdownImportOptions = { parseHTMLBlock: ServerHTMLImporter.parse };
  const html = '<div><h2>Incident</h2><p><strong>Owner</strong> &amp; *literal Markdown*</p></div>';

  it.each([
    ['paragraphs', 'Before\n\n<!-- hidden -->\n\nAfter', ['paragraph', 'paragraph']],
    ['lists', '- first\n\n<!-- separator -->\n\n- second', ['bullet_list', 'bullet_list']],
    ['code', '- first\n\n<!-- separator -->\n\n    code', ['bullet_list', 'code_block']],
  ])('does not insert a caret-host paragraph between %s when HTML has no visible blocks', (_name, source, types) => {
    const parsed = MarkdownImporter.parseWithSource(source, schema, { parseHTMLBlock: ServerHTMLImporter.parseFragment });
    expect(parsed.document.content.map(node => node.type.name)).toEqual(types);
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
    schema.validate(parsed.document);
  });

  it('keeps explicit empty blocks and a root caret host without making comments visible', () => {
    const parser = new ServerHTMLImporter();
    const result = parser.parseFragmentWithReport('<!-- private note -->', schema);
    expect(result.nodes).toEqual([]);
    expect(result.issues.map(issue => issue.code)).toContain('discarded-html-comment');
    expect(Object.isFrozen(result.nodes)).toBe(true);
    expect(parser.parse('<!-- note -->', schema).content).toHaveLength(1);
    expect(parser.parseFragment('<p></p><div></div>', schema)).toHaveLength(2);
    const empty = MarkdownImporter.parse('<!-- note -->', schema, { parseHTMLBlock: ServerHTMLImporter.parseFragment });
    expect(empty.content).toHaveLength(1);
    schema.validate(empty);
    const explicit = MarkdownImporter.parse('Before\n\n<!-- note -->\n\n<p data-fountain-empty="block"></p>\n\nAfter', schema, { parseHTMLBlock: ServerHTMLImporter.parseFragment });
    expect(explicit.content).toHaveLength(3);
    expect(explicit.content[1].content).toHaveLength(0);
  });

  it.each(['inline', 'foreign', 'root', 'invalid', 'non-node', 'orphan-list-item'] as const)('retains literal HTML when a fragment contains %s content', kind => {
    const report = vi.fn();
    const node = kind === 'inline' ? schema.text('wrong')
      : kind === 'foreign' ? new Schema(CoreSchemaSpec).node('paragraph')
      : kind === 'root' ? ServerHTMLImporter.parse('<p>root</p>', schema)
      : kind === 'invalid' ? schema.nodes.paragraph.create({}, [schema.node('paragraph')])
      : kind === 'orphan-list-item' ? schema.node('list_item', {}, [schema.node('paragraph')])
      : {};
    const parsed = MarkdownImporter.parse(html, schema, {
      parseHTMLBlock: (() => [node]) as unknown as MarkdownImportOptions['parseHTMLBlock'],
      onHTMLBlockFallback: report,
    });
    expect(parsed.toJSON()).toEqual(MarkdownImporter.parse(html, schema).toJSON());
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0].reason).toBe('error');
  });

  it('applies the same parser limits to fragments as whole documents', () => {
    expect(() => ServerHTMLImporter.parseFragment('<!-- lengthy -->', schema, { maxInputBytes: 4 })).toThrow('maximum');
  });

  it('keeps an unknown HTML wrapper source exact while projecting its descendant blocks', () => {
    const source = '<custom-panel>\n<h2>Incident</h2><p>First</p><p>Second</p>\n</custom-panel>\n';
    const imported = MarkdownImporter.parseWithSource(source, schema, options);
    expect(imported.document.content.map(node => node.type.name)).toEqual(['heading', 'paragraph', 'paragraph']);
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(source);
    const canonical = MarkdownExporter.export(imported.document);
    expect(canonical).not.toContain('custom-panel');
    expect(MarkdownImporter.parse(canonical, schema).toJSON()).toEqual(imported.document.toJSON());
  });

  it('runs in pure Node and keeps raw HTML inert by default', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    const doc = MarkdownImporter.parse(html, schema);
    expect(doc.content[0].type.name).toBe('paragraph');
    expect(doc.content[0].content[0].text).toBe(html);
    expect(MarkdownImporter.parse(html, schema, options).toJSON()).toEqual(ServerHTMLImporter.parse(html, schema).toJSON());
  });

  it.each([
    ['quote', `> ${html}`, 'blockquote'],
    ['list', `- ${html}`, 'bullet_list'],
    ['task', `- [ ] ${html}`, 'task_list'],
    ['details', `<details>\n<summary>Report</summary>\n${html}\n</details>`, 'details'],
    ['footnote', `Note[^a]\n\n[^a]: ${html}`, 'footnote_definition'],
  ])('projects HTML inside a %s without changing Markdown container boundaries', (_name, source, container) => {
    const doc = MarkdownImporter.parse(source, schema, options);
    const found: string[] = [];
    const visit = (node: typeof doc) => { found.push(node.type.name); node.content.forEach(visit); };
    visit(doc);
    expect(found).toContain(container);
    expect(found).toContain('heading');
    expect(JSON.stringify(doc.toJSON())).toContain('*literal Markdown*');
    expect(JSON.stringify(doc.toJSON())).not.toContain('"type":"em"');
    schema.validate(doc);
  });

  it('does not reinterpret inline HTML, fenced code, or Fountain empty/style envelopes', () => {
    const parser = vi.fn(ServerHTMLImporter.parse);
    const source = 'Inline <em>text</em>.\n\n```html\n<div>code</div>\n```\n\n<p data-fountain-empty="block"></p>\n\n<span data-fountain-text-style="true" style=""><strong></strong></span>';
    const doc = MarkdownImporter.parse(source, schema, { parseHTMLBlock: parser });
    expect(doc.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
    expect(parser).not.toHaveBeenCalled();
  });

  it.each(['declined', 'throws', 'foreign-schema', 'non-document', 'invalid-content'] as const)('retains source and reports a %s adapter result', kind => {
    const issues: MarkdownHTMLBlockFallback[] = [];
    const parseHTMLBlock = () => {
      if (kind === 'declined') return null;
      if (kind === 'throws') throw new Error('Conversion unavailable');
      if (kind === 'foreign-schema') return ServerHTMLImporter.parse(html, new Schema(CoreSchemaSpec));
      if (kind === 'non-document') return schema.node('paragraph', {}, [schema.text('Not a document')]);
      return schema.topNodeType.create({}, [schema.text('Invalid direct text')]);
    };
    const doc = MarkdownImporter.parse(html, schema, { parseHTMLBlock, onHTMLBlockFallback: issue => issues.push(issue) });
    expect(doc.toJSON()).toEqual(MarkdownImporter.parse(html, schema).toJSON());
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ html, reason: kind === 'declined' ? 'declined' : 'error' });
    expect(Object.isFrozen(issues[0])).toBe(true);
  });

  it('preserves the HTML importer URL policy without executing scripts', () => {
    const source = '<div onclick="alert(1)"><script>alert(2)</script><p><a href="javascript:alert(3)">Unsafe</a> <a href="/safe">Safe</a></p></div>';
    const doc = MarkdownImporter.parse(source, schema, options);
    expect(doc.toJSON()).toEqual(ServerHTMLImporter.parse(source, schema).toJSON());
    expect(JSON.stringify(doc.toJSON())).not.toContain('javascript:');
    expect(JSON.stringify(doc.toJSON())).not.toContain('onclick');
  });

  it('preserves exact source and unchanged HTML blocks after another block is edited', () => {
    const source = `${html}\r\n\r\nAn old paragraph.\r\n`;
    const parsed = MarkdownSourceSnapshot.parse(source, schema, options);
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
    // This fragment maps to two nodes, so whole-source preservation is still
    // possible but per-block provenance must fail closed.
    expect(parsed.source.blocks).toHaveLength(0);
    const single = '<p><strong>Exact &amp; original</strong></p>';
    const captured = MarkdownImporter.parseWithSource(`${single}\r\n\r\nOld.\r\n`, schema, options);
    expect(captured.source.blocks).toHaveLength(2);
    const edited = captured.document.copy([captured.document.content[0], schema.node('paragraph', {}, [schema.text('New.')])]);
    const output = MarkdownExporter.exportWithSource(edited, captured.source).markdown;
    expect(output).toContain(single);
    expect(output).toContain('New.');
    expect(MarkdownImporter.parse(output, schema, options).toJSON()).toEqual(edited.toJSON());
  });

  it('reports fallback once per source occurrence, not again during provenance capture', () => {
    const report = vi.fn();
    const parsed = MarkdownImporter.parseWithSource('<p>Keep me</p>\n\nAfter', schema, { parseHTMLBlock: () => null, onHTMLBlockFallback: report });
    expect(parsed.source.blocks).toHaveLength(2);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('does not swallow errors from the host reporting callback', () => {
    expect(() => MarkdownImporter.parse(html, schema, {
      parseHTMLBlock: () => null,
      onHTMLBlockFallback: () => { throw new Error('Host reporting failed'); },
    })).toThrow('Host reporting failed');
  });
});
