// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, HTMLExporter, HTMLImporter, MarkdownImporter, Schema } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(CoreSchemaSpec);
for (const [name, importer] of [['browser', HTMLImporter], ['server', ServerHTMLImporter]] as const) {
  describe(`${name} empty heading HTML retention`, () => {
    it.each([1, 2, 3, 4, 5, 6])('keeps an empty text leaf in level %i through safe HTML', level => {
      const doc = schema.node('doc', {}, [schema.node('heading', { level, dir: 'rtl', align: 'right' }, [schema.text('')]),
        schema.node('paragraph', {}, [schema.text('Keep this sibling.')])]);
      const html = HTMLExporter.export(doc);
      expect(html).toContain(`h${level} data-fountain-empty="text"`);
      const reopened = importer.parse(html, schema);
      expect(reopened.toJSON()).toEqual(doc.toJSON());
      expect(HTMLExporter.export(reopened)).toBe(html);
    });

    it('keeps a genuinely childless heading distinct and does not change unmarked HTML', () => {
      const doc = schema.node('doc', {}, [schema.node('heading', { level: 2 })]);
      const html = HTMLExporter.export(doc);
      expect(html).not.toContain('data-fountain-empty');
      expect(importer.parse(html, schema).toJSON()).toEqual(doc.toJSON());
      expect(importer.parse('<h2></h2>', schema).child(0).childCount).toBe(0);
    });

    it.each(['visible', ' ', '<em></em>', '<!--retained elsewhere-->', '<span></span>', '<br>'])
      ('does not let an empty-text marker override existing source children: %s', content => {
        const plain = importer.parse(`<h3>${content}</h3>`, schema);
        const marked = importer.parse(`<h3 data-fountain-empty="text">${content}</h3>`, schema);
        expect(marked.toJSON()).toEqual(plain.toJSON());
      });

    it('does not interpret unknown marker values', () => {
      for (const marker of ['block', 'TEXT', 'false', '', 'text extra']) {
        expect(importer.parse(`<h4 data-fountain-empty="${marker}"></h4>`, schema).child(0).childCount).toBe(0);
      }
    });

    it('retains existing marked empty text without adding or dropping emphasis', () => {
      const doc = schema.node('doc', {}, [schema.node('heading', { level: 3 }, [schema.text('', [schema.mark('em')])])]);
      expect(importer.parse(HTMLExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
    });

    it('keeps empty Markdown headings exact after HTML reopening', () => {
      const original = MarkdownImporter.parse('#\n\n##\n\n###', schema);
      expect(importer.parse(HTMLExporter.export(original), schema).toJSON()).toEqual(original.toJSON());
    });
  });
}
