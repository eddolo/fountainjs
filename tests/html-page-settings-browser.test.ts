// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Schema } from '../src/core';
import { HTMLExporter } from '../src/core/exporters/html-exporter';
import { HTMLImporter } from '../src/core/importers/html-importer';
import { StarterKit } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(StarterKit.schema);
describe('browser/server HTML page-settings agreement', () => {
  it('retains the exact complete document in both importers', () => {
    const doc = schema.node('doc', { pageSettings: { unit: 'pt', width: 612, height: 792, marginTop: -12.5, marginBottom: 0, gutter: 0 } }, [
      schema.node('paragraph', {}, [schema.text('Styled', [schema.mark('letter_spacing', { spacing: '-0.5pt' })])]),
    ]);
    const html = HTMLExporter.export(doc);
    expect(HTMLImporter.parse(html, schema).toJSON()).toEqual(doc.toJSON());
    expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(doc.toJSON());
  });
  it.each(['null', '{', '{"unit":"pt","marginLeft":-1}', ' '.repeat(2049)])('ignores invalid metadata while preserving text: case %#', raw => {
    const html = `<body data-fountain-page-settings='${raw}'><p>Safe</p></body>`;
    expect(HTMLImporter.parse(html, schema).toJSON()).toEqual(ServerHTMLImporter.parse(html, schema).toJSON());
    expect(HTMLImporter.parse(html, schema).attrs).toEqual({});
  });
  it('ignores page metadata on nested blocks', () => {
    const html = '<p data-fountain-page-settings=\'{"unit":"pt","width":612}\'>Safe</p>';
    expect(HTMLImporter.parse(html, schema).attrs).toEqual({});
  });
});
