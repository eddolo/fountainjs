import { expect, it } from 'vitest';
import { HTMLExporter, MarkdownExporter, MarkdownImporter, Schema, StarterKit } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(StarterKit.schema);
const parse = (html: string) => new ServerHTMLImporter().parse(html, schema);
const table = (header: string | undefined, body?: string) => parse(`<table><thead><tr><th${header ? ` style="text-align:${header}"` : ''}>Header</th></tr></thead><tbody><tr><td${body ? ` style="text-align:${body}"` : ''}>Value</td></tr></tbody></table>`);

it('retains uniform physical column alignment in pipe Markdown without reporting false paragraph losses', () => {
  const document = parse('<table><thead><tr><th style="text-align:left">L</th><th style="text-align:center">C</th><th style="text-align:right">R</th></tr></thead><tbody><tr><td style="text-align:left">a</td><td style="text-align:center">b</td><td style="text-align:right">c</td></tr></tbody></table>');
  const result = new MarkdownExporter().exportWithReport(document);
  expect(result.losses).toEqual([]);
  expect(result.markdown).toContain('| :--- | :---: | ---: |');
  const reopened = new MarkdownImporter().parse(result.markdown, schema);
  for (const row of reopened.child(0).content) {
    expect(row.content.map(cell => cell.child(0).attrs.align)).toEqual(['left', 'center', 'right']);
    expect(row.child(0).child(0).attrs.alignExplicit).toBe(true);
  }
});

it('keeps explicit physical-left table text independent of inherited RTL presentation', () => {
  const source = '| ערך |\n| :--- |\n| שלום |';
  const document = new MarkdownImporter().parse(source, schema);
  for (const row of document.child(0).content) expect(row.child(0).child(0).attrs.alignExplicit).toBe(true);
  const html = new HTMLExporter().export(document);
  expect(html.match(/text-align:left/gu)).toHaveLength(2);
  const implicit = new MarkdownImporter().parse(source.replace(':---', '---'), schema);
  expect(implicit.child(0).child(0).child(0).child(0).attrs.alignExplicit).toBeUndefined();
});

it.each([['center', undefined], ['center', 'right'], ['left', 'center'], ['left', undefined], [undefined, 'left']])('reports a body-cell alignment that differs from the %s column: %s', (header, body) => {
  const result = new MarkdownExporter().exportWithReport(table(header, body));
  expect(result.losses).toContainEqual(expect.objectContaining({ kind: 'attribute', type: 'paragraph', path: [0, 1, 0, 0],
    detail: expect.stringContaining('one alignment') }));
});

it('keeps an unmarked table column implicit through canonical export and reopening', () => {
  const source = '| Header |\n| --- |\n| Value |';
  const document = new MarkdownImporter().parse(source, schema);
  const result = new MarkdownExporter().exportWithReport(document);
  expect(result.losses).toEqual([]); expect(result.markdown).toBe(source);
  expect(new MarkdownImporter().parse(result.markdown, schema).toJSON()).toEqual(document.toJSON());
});

it.each(['justify', 'start', 'end'])('reports %s cell alignment because pipe tables cannot express it', align => {
  const result = new MarkdownExporter().exportWithReport(table('center', align));
  expect(result.losses).toContainEqual(expect.objectContaining({ kind: 'attribute', type: 'paragraph', path: [0, 1, 0, 0],
    detail: expect.stringContaining('not represented') }));
});

it('keeps loss reporting for explicit physical-left paragraphs outside a table', () => {
  const result = new MarkdownExporter().exportWithReport(parse('<p style="text-align:left">שלום</p>'));
  expect(result.losses).toContainEqual(expect.objectContaining({ kind: 'attribute', type: 'paragraph', path: [0],
    detail: expect.stringContaining('physical-left') }));
});

it('retains distinct cell alignment through the explicit HTML table format', () => {
  const document = table('center', 'right');
  const result = new MarkdownExporter().exportWithReport(document, { tableFormat: 'html' });
  expect(result.losses).toHaveLength(1);
  expect(result.losses[0]).toMatchObject({ kind: 'node', type: 'table', detail: expect.stringContaining('HTML-enabled Markdown reader') });
  const reopened = parse(result.markdown);
  expect(reopened.child(0).child(0).child(0).child(0).attrs.align).toBe('center');
  expect(reopened.child(0).child(1).child(0).child(0).attrs.align).toBe('right');
});
