// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CoreExtension, HTMLExporter, HTMLImporter, MarkdownExporter, MarkdownImporter, Schema, composeExtensions, type Node } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(composeExtensions([CoreExtension]).schema);
const textNodes = (node: Node): Node[] => node.isText ? [node] : node.content.flatMap(textNodes);

for (const [name, importer] of [['browser', HTMLImporter], ['server', ServerHTMLImporter]] as const) {
  describe(`${name} HTML formatting around block boundaries`, () => {
    it.each([
      ['strong', 'strong'], ['em', 'em'], ['del', 'strike'], ['u', 'underline'],
      ['span style="color:#123456"', 'text_color'], ['div style="font-weight:bold"', 'strong'],
    ])('retains %s around multiple paragraphs and surrounding text', (opening, mark) => {
      const tag = opening.split(' ')[0];
      const doc = importer.parse(`<${opening}>Before<p>Middle</p>After</${tag}><p>Outside</p>`, schema);
      expect(doc.content.map(node => node.textContent)).toEqual(['Before', 'Middle', 'After', 'Outside']);
      expect(textNodes(doc).map(node => node.marks.map(value => value.type.name))).toEqual([[mark], [mark], [mark], []]);
      expect(importer.parse(HTMLExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
    });

    it('retains combined wrapper formatting through nested lists and table cells', () => {
      const doc = importer.parse('<strong><blockquote><em><p>Intro</p><ul><li>First</li><li><p>Second</p></li></ul><table><tr><td>Cell</td></tr></table></em></blockquote></strong>', schema);
      expect(doc.child(0).type.name).toBe('blockquote');
      expect(doc.child(0).content.map(node => node.type.name)).toEqual(['paragraph', 'bullet_list', 'table']);
      expect(textNodes(doc).map(node => node.text)).toEqual(['Intro', 'First', 'Second', 'Cell']);
      for (const node of textNodes(doc)) expect(node.marks.map(mark => mark.type.name)).toEqual(['strong', 'em']);
      schema.validate(doc);
    });

    it('keeps inner colors authoritative and does not leak them to siblings', () => {
      const doc = importer.parse('<div style="color:#123456"><p>Outer</p><section style="color:#654321"><p>Inner <span style="color:#abcdef">Local</span></p></section><p>Outer again</p></div><p>Plain</p>', schema);
      expect(textNodes(doc).map(node => node.marks.find(mark => mark.type.name === 'text_color')?.attrs.color ?? null)).toEqual(['#123456', '#654321', '#abcdef', '#123456', null]);
    });

    it('honors item, row-group, row and cell formatting with nearest color overrides', () => {
      const doc = importer.parse('<ul><li style="color:#123456">Item</li></ul><table><tbody style="color:#123456"><tr><td>Group</td></tr><tr style="color:#654321"><td>Row</td><td style="color:#abcdef">Cell</td></tr></tbody></table>', schema);
      expect(textNodes(doc).map(node => node.text)).toEqual(['Item', 'Group', 'Row', 'Cell']);
      expect(textNodes(doc).map(node => node.marks.find(mark => mark.type.name === 'text_color')?.attrs.color)).toEqual(['#123456', '#123456', '#654321', '#abcdef']);
    });

    it('also honors a nearer inline style inside an inherited inline wrapper', () => {
      const doc = importer.parse('<p><span style="color:#123456">Outer <span style="color:#654321">Inner</span> Outer again</span></p>', schema);
      expect(textNodes(doc).map(node => node.marks.find(mark => mark.type.name === 'text_color')?.attrs.color)).toEqual(['#123456', '#654321', '#123456']);
    });

    it('preserves native block styles through Markdown handoff without making unsafe links active', () => {
      const doc = importer.parse('<a href="javascript:alert(1)"><div style="font-weight:bold"><p>One</p><p>Two</p></div></a>', schema);
      for (const node of textNodes(doc)) expect(node.marks.map(mark => mark.type.name)).toEqual(['strong']);
      expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
    });
  });
}
