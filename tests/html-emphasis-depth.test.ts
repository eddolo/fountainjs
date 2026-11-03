// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { CoreSchemaSpec, Schema, HTMLExporter, HTMLImporter, MarkdownImporter, type Node, type NodeSpec } from '../src';
import { ServerHTMLImporter } from '../src/html/server';
import { RubyExtension } from '../src/ruby';

const schema = new Schema(CoreSchemaSpec);
const commonmarkSpec = createRequire(import.meta.url)('commonmark-spec') as {
  tests: Array<{ number: number; markdown: string }>;
};
const texts = (node: Node): Node[] => node.isText ? [node] : node.content.flatMap(texts);
const official = [369, 373, 389, 407, 408, 409, 417, 418, 419, 425, 426, 427, 432, 461, 463, 464, 465, 466, 468];

for (const [name, importer] of [['browser', HTMLImporter], ['server', ServerHTMLImporter]] as const) {
  describe(`${name} explicit emphasis depth`, () => {
    it.each(official)('retains the complete native mark sequence from CommonMark example %i', number => {
      const source = commonmarkSpec.tests.find(example => example.number === number)!.markdown;
      const original = MarkdownImporter.parse(source, schema);
      const html = HTMLExporter.export(original, { document: false });
      const reopened = importer.parse(html, schema);
      expect(reopened.toJSON()).toEqual(original.toJSON());
      expect(HTMLExporter.export(reopened, { document: false })).toBe(html);
    });

    it.each([
      ['em', 'em', 'em'], ['i', 'em', 'em'], ['em', 'i', 'em'],
      ['strong', 'strong', 'strong'], ['b', 'strong', 'strong'], ['strong', 'b', 'strong'],
    ])('retains explicit <%s>/<%s> depth around block and inline content', (outer, inner, mark) => {
      const source = `<${outer}><p>Outer <${inner}>Inner</${inner}> tail</p><ul><li><${inner}>Item</${inner}></li></ul></${outer}><p>Plain</p>`;
      const doc = importer.parse(source, schema);
      expect(texts(doc).map(node => [node.text, node.marks.map(mark => mark.type.name)])).toEqual([
        ['Outer ', [mark]], ['Inner', [mark, mark]], [' tail', [mark]], ['Item', [mark, mark]], ['Plain', []],
      ]);
      expect(importer.parse(HTMLExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
    });

    it('does not manufacture another semantic level from CSS on the same element or a descendant span', () => {
      const source = '<p><em style="font-style:italic">One <em>Two <span style="font-style:italic">Still two</span></em></em> '
        + '<strong style="font-weight:bold">Bold <strong><span style="font-weight:700">Twice</span></strong></strong></p>';
      const doc = importer.parse(source, schema);
      expect(texts(doc).map(node => [node.text, node.marks.map(mark => mark.type.name)])).toEqual([
        ['One ', ['em']], ['Two ', ['em', 'em']], ['Still two', ['em', 'em']], [' ', []],
        ['Bold ', ['strong']], ['Twice', ['strong', 'strong']],
      ]);
      const html = HTMLExporter.export(doc);
      // Safe HTML may merge adjacent equal-mark text leaves after removing a
      // redundant CSS span. The complete rendered text/mark structure must stay.
      expect(HTMLExporter.export(importer.parse(html, schema))).toBe(html);
    });

    it('keeps nearest colors and one safe link while preserving nested emphasis', () => {
      const doc = importer.parse('<p><em><a href="/safe" style="color:#123456">Outer <em><span style="color:#654321">Inner</span></em></a></em></p>', schema);
      const [outer, inner] = texts(doc);
      expect(outer.marks.filter(mark => mark.type.name === 'em')).toHaveLength(1);
      expect(inner.marks.filter(mark => mark.type.name === 'em')).toHaveLength(2);
      expect(inner.marks.filter(mark => mark.type.name === 'link')).toHaveLength(1);
      expect(inner.marks.find(mark => mark.type.name === 'text_color')!.attrs.color).toBe('#654321');
      const rejected = importer.parse('<p><em><a href="javascript:alert(1)"><em>Literal</em></a></em></p>', schema);
      expect(texts(rejected)[0].marks.map(mark => mark.type.name)).toEqual(['em', 'em']);
      expect(HTMLExporter.export(rejected)).not.toContain('javascript:');
    });

    it.each(['inline', 'block'])('owns each scope once across configured inline containers in an %s wrapper', shape => {
      const carrier: NodeSpec = { inline: true, group: 'inline', content: 'inline*',
        parseHTML: [{ tag: 'span[data-depth-carrier]' }],
        toDOM: () => ['span', { 'data-depth-carrier': 'true' }, 0] };
      const target = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, carrier, ...RubyExtension.nodes } });
      for (const [opening, closing] of [['<span data-depth-carrier="true">', '</span>'], ['<ruby><rb>', '</rb><rt>reading</rt></ruby>']]) {
        const contents = `${opening}One <em>Two</em>${closing}`;
        const source = shape === 'inline' ? `<p><em>${contents}</em></p>` : `<em><p>${contents}</p></em>`;
        const doc = importer.parse(source, target);
        const node = doc.child(0).child(0);
        expect(node.marks.map(mark => mark.type.name)).toEqual(['em']);
        expect(node.content.map(child => child.marks.map(mark => mark.type.name))).toEqual([[], ['em']]);
        const html = HTMLExporter.export(doc);
        expect(importer.parse(html, target).toJSON()).toEqual(doc.toJSON());
        const sameStyle = `${opening}<span style="font-style:italic">Same</span>${closing}`;
        const css = importer.parse(shape === 'inline' ? `<p><em>${sameStyle}</em></p>` : `<em><p>${sameStyle}</p></em>`, target);
        expect(css.child(0).child(0).marks.map(mark => mark.type.name)).toEqual(['em']);
        expect(css.child(0).child(0).child(0).marks).toEqual([]);
      }
    });
  });
}
