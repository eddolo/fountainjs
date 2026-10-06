import { describe, expect, it } from 'vitest';
import { Schema, HTMLExporter } from '../src/headless';
import { CoreExtension, composeExtensions } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(composeExtensions([CoreExtension]).schema);
const importer = new ServerHTMLImporter();

describe('HTML childless paragraph retention without a DOM', () => {
  it('styles blank lines without adding text or nodes and leaves unstyled fragments host-owned', () => {
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, []),
      schema.node('paragraph', {}, [schema.text('', [schema.marks.strong.create()])])]);
    const fragment = HTMLExporter.export(doc, { document: false });
    expect(fragment).toBe('<p data-fountain-empty="block"></p>\n<p><strong></strong></p>');
    expect(HTMLExporter.export(doc)).toContain('p{min-height:1em;min-height:1lh}');
    expect(HTMLExporter.export(doc, { includeStyles: false })).not.toContain('min-height:');
    expect(importer.parse(fragment, schema).toJSON()).toEqual(doc.toJSON());
  });
  it('retains childless and caret paragraphs, formatting and nested structure exactly', () => {
    expect(typeof document).toBe('undefined');
    const empty = schema.node('paragraph', { align: 'center', emphasis: 'explicit' }, []);
    const caret = schema.node('paragraph', {}, [schema.text('')]);
    const doc = schema.node('doc', {}, [empty, caret,
      schema.node('blockquote', {}, [empty, caret]),
      schema.node('table', {}, [schema.node('table_row', {}, [schema.node('table_cell', {}, [empty, caret])])]),
    ]);
    for (const document of [true, false]) {
      const html = HTMLExporter.export(doc, { document });
      expect(html.match(/data-fountain-empty="block"/gu)).toHaveLength(3);
      expect(importer.parse(html, schema).toJSON()).toEqual(doc.toJSON());
    }
  });

  it.each(['', 'text', 'invalid', 'BLOCK'])('keeps the ordinary caret default for marker %j', value => {
    const html = value ? `<p data-fountain-empty="${value}"></p>` : '<p></p>';
    expect(importer.parse(html, schema).child(0).toJSON()).toEqual(schema.node('paragraph', {}, [schema.text('')]).toJSON());
  });

  it.each(['Visible', ' ', '<strong>Visible</strong>', '<!--source-->', '<span></span>'])('does not hide children behind a forged childless marker: %s', content => {
    const marked = importer.parse(`<p data-fountain-empty="block">${content}</p>`, schema);
    const ordinary = importer.parse(`<p>${content}</p>`, schema);
    expect(marked.toJSON()).toEqual(ordinary.toJSON());
    expect(marked.child(0).childCount).toBeGreaterThan(0);
  });

  it('retains an image behind a forged empty marker', () => {
    const source = '<img src="/plot.png" alt="Plot">';
    const doc = importer.parse(`<p data-fountain-empty="block">${source}</p>`, schema);
    expect(doc.toJSON()).toEqual(importer.parse(`<p>${source}</p>`, schema).toJSON());
    expect(doc.child(0).child(0).type.name).toBe('inline_image');
    expect(doc.child(0).child(0).attrs.alt).toBe('Plot');
  });
});
