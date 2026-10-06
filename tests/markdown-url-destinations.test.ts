import { describe, expect, it } from 'vitest';
import { Schema, MarkdownImporter, MarkdownExporter } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
const schema = new Schema(CoreSchemaSpec);
const punctuation = Array.from('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');
describe('Markdown literal backslash destinations', () => {
  it.each(['inline', 'reference'] as const)('retains every backslash punctuation pair in %s link destinations', linkStyle => {
    for (const suffix of punctuation) for (const value of [
      `folder\\${suffix}file`, `folder\\\\${suffix}file`, `https://example.test/folder\\${suffix}file`,
    ]) {
      const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [
        schema.text('label', [schema.mark('link', { href: value })]),
      ])]);
      const markdown = MarkdownExporter.export(doc, { linkStyle });
      expect(MarkdownImporter.parse(markdown, schema).toJSON(), markdown).toEqual(doc.toJSON());
    }
  });
  it('retains backslashes in ordinary image destinations too', () => {
    for (const value of ['assets/plot\\%0A.svg', 'assets/plot\\#v.svg', 'assets/plot\\\\.png']) {
      const doc = schema.node('doc', {}, [schema.node('image_super', { src: value, alt: 'Plot' })]);
      for (const linkStyle of ['inline', 'reference'] as const) {
        const markdown = MarkdownExporter.export(doc, { linkStyle });
        expect(MarkdownImporter.parse(markdown, schema).toJSON(), markdown).toEqual(doc.toJSON());
      }
    }
  });
});
