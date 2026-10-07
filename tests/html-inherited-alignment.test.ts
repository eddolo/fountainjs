// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { CoreSchemaSpec, HTMLExporter, HTMLImporter, Schema } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(CoreSchemaSpec);

it.each([
  ['right', '<div style="text-align:right"><p>Paragraph</p><h2>Heading</h2></div>'],
  ['center', '<div style="text-align:right"><section style="text-align:center"><p>Paragraph</p><h2>Heading</h2></section></div>'],
  ['left', '<section dir="auto" style="text-align:left"><p>Paragraph</p><h2>Heading</h2></section>'],
  ['right', '<div style="text-align:right"><p style="text-align:inherit">Paragraph</p><h2 style="text-align:unset">Heading</h2></div>'],
  ['start', '<div style="text-align:right"><p style="text-align:initial">Paragraph</p><h2 style="text-align:start">Heading</h2></div>'],
] as const)('materializes supported inherited inline alignment %s in both importers', (align, source) => {
  const browser = HTMLImporter.parse(source, schema);
  const server = ServerHTMLImporter.parse(source, schema);
  expect(browser.toJSON()).toEqual(server.toJSON());
  expect(browser.childCount).toBe(2);
  for (const block of browser.content) {
    expect(block.attrs.align).toBe(align);
    expect(block.attrs.alignExplicit).toBe(align === 'left' ? true : undefined);
  }
  const html = HTMLExporter.export(server, { document: false });
  expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(server.toJSON());
});

it('keeps a child override independent from its surrounding physical alignment', () => {
  const source = '<div dir="rtl" style="text-align:center"><p>Inherited</p><p style="text-align:end">Override</p></div>';
  const browser = HTMLImporter.parse(source, schema);
  expect(browser.toJSON()).toEqual(ServerHTMLImporter.parse(source, schema).toJSON());
  expect(browser.content.map(block => ({ align: block.attrs.align, dir: block.attrs.dir })))
    .toEqual([{ align: 'center', dir: 'rtl' }, { align: 'end', dir: 'rtl' }]);
});

it('keeps inherited alignment for explicit and anonymous list/cell paragraphs', () => {
  const source = '<div style="text-align:right"><ul><li>Anonymous item</li><li><p>Explicit item</p></li></ul><table><tr><td>Anonymous cell</td><td><p>Explicit cell</p></td></tr></table></div>';
  const browser = HTMLImporter.parse(source, schema);
  expect(browser.toJSON()).toEqual(ServerHTMLImporter.parse(source, schema).toJSON());
  const paragraphs = [browser.child(0).child(0).child(0), browser.child(0).child(1).child(0),
    browser.child(1).child(0).child(0).child(0), browser.child(1).child(0).child(1).child(0)];
  expect(paragraphs.map(block => block.textContent)).toEqual(['Anonymous item', 'Explicit item', 'Anonymous cell', 'Explicit cell']);
  expect(paragraphs.map(block => block.attrs.align)).toEqual(['right', 'right', 'right', 'right']);
});

it('stops at a nearest inline initial reset rather than leaking the outer alignment', () => {
  const source = '<div style="text-align:right"><section style="text-align:initial"><p>Reset</p></section><p>Sibling</p></div>';
  const browser = HTMLImporter.parse(source, schema);
  expect(browser.toJSON()).toEqual(ServerHTMLImporter.parse(source, schema).toJSON());
  expect(browser.content.map(block => block.attrs.align)).toEqual(['start', 'right']);
});

it('retains anonymous wrapper text alignment instead of making a default-left paragraph', () => {
  const source = '<div style="text-align:center">Anonymous centered text</div>';
  const browser = HTMLImporter.parse(source, schema);
  expect(browser.toJSON()).toEqual(ServerHTMLImporter.parse(source, schema).toJSON());
  expect(browser.child(0).textContent).toBe('Anonymous centered text');
  expect(browser.child(0).attrs.align).toBe('center');
});
