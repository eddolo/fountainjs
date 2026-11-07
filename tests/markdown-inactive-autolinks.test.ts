import { expect, it } from 'vitest';
import { parseFragment } from 'parse5';
import { CoreSchemaSpec } from '../src/extensions';
import { HTMLExporter, MarkdownExporter, MarkdownImporter, Schema } from '../src/headless';
import { createInertHTMLAnchorExtension } from '../src/html/inert';
import { ServerHTMLImporter } from '../src/html/server';
import { createHTMLSourceMarkdownAdapter, exportHTMLSource } from '../src/html/source';

const plain = new Schema(CoreSchemaSpec);
const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...createInertHTMLAnchorExtension().nodes } });
const options = { retainBlockedAutolinks: true, parseHTMLDocument: createHTMLSourceMarkdownAdapter() };
const safeHTML = (document: ReturnType<typeof MarkdownImporter.parse>) => HTMLExporter.export(document, { document: false });

it.each(['irc://example.org/room', 'a+b+c:d', 'made-up-scheme://foo,bar', 'localhost:5001/foo', 'javascript:alert(1)', 'data:text/html,%3Cscript%3E'])(
  'captures <%s> without generating an active link in HTML',
  address => {
    const markdown = '<' + address + '>\r\n';
    const capture = MarkdownImporter.parseWithSource(markdown, schema, options);
    const anchor = capture.document.child(0).child(0);
    expect(anchor.type.name).toBe('html_inert_anchor');
    expect(anchor.attrs.attributes).toEqual({ href: address });
    expect(anchor.textContent).toBe(address);
    const html = safeHTML(capture.document);
    const wrapper = parseFragment(html).childNodes[0];
    expect(wrapper).toMatchObject({ tagName: 'p', childNodes: [{ tagName: 'span' }] });
    expect(html).not.toMatch(/<a(?:\s|>)/);
    expect(new ServerHTMLImporter().parse(html, schema).toJSON()).toEqual(capture.document.toJSON());
    expect(MarkdownExporter.exportWithSource(capture.document, capture.source).markdown).toBe(markdown);
    expect(exportHTMLSource(capture.document, { document: false })).toMatchObject({
      ok: true, sanitized: false, sourceHTML: '<p><a href="' + address + '">' + address + '</a></p>',
    });
  },
);

it('requires both the policy and the inert anchor schema, and leaves safe links active', () => {
  const source = '<irc://example.org> <https://example.org>';
  for (const document of [MarkdownImporter.parse(source, schema), MarkdownImporter.parse(source, plain, options)]) {
    expect(document.child(0).child(0).textContent).toContain('<irc://example.org>');
  }
  expect(safeHTML(MarkdownImporter.parse(source, schema, options))).toContain('<a href="https://example.org"');
});

it('does not put an inert anchor inside a hyperlink or reinterpret code, escapes, and oversized data', () => {
  const document = MarkdownImporter.parse('[outer <irc:x>](/target) \x60<irc:code>\x60 \\<irc:escape> <irc:' + 'z'.repeat(8_193) + '>', schema, options);
  const anchors: string[] = [];
  document.descendants(node => { if (node.type.name === 'html_inert_anchor') anchors.push(node.textContent); });
  expect(anchors).toEqual(['irc:x']);
  expect(safeHTML(document)).not.toContain('href="/target"');
  expect(document.textContent).toContain('<irc:code> <irc:escape>');
});

it('reopens an edited label through the safe Markdown HTML carrier', () => {
  const original = MarkdownImporter.parse('Open <irc://example.org/room>.', schema, options);
  const paragraph = original.child(0);
  const edited = original.copy([paragraph.copy(paragraph.content.map(node =>
    node.type.name === 'html_inert_anchor' ? node.copy([schema.text('Project channel')]) : node))]);
  const markdown = MarkdownExporter.export(edited);
  expect(markdown).toContain('data-fountain-inert-anchor');
  expect(markdown).not.toMatch(/<a(?:\s|>)/);
  expect(MarkdownImporter.parse(markdown, schema, options).toJSON()).toEqual(edited.toJSON());
});

it('keeps quote-shaped URI data inside the inert attribute payload', () => {
  const address = 'irc:x"onmouseover="alert(1)';
  const document = MarkdownImporter.parse('<' + address + '>', schema, options);
  const html = safeHTML(document);
  expect(html).toContain('data-fountain-inert-data');
  expect(html).not.toMatch(/\sonmouseover=/);
  expect(new ServerHTMLImporter().parse(html, schema).toJSON()).toEqual(document.toJSON());
});
