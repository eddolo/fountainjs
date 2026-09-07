// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CoreExtension, HTMLExporter, HTMLImporter, MarkdownExporter, MarkdownImporter, MediaExtension, Schema, composeExtensions } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(composeExtensions([CoreExtension, MediaExtension]).schema);
const image = '<img src="/diagram.png" alt="Diagram">';
const fixtures = [
  '<p>First</p><p>Second</p>',
  `Before${image}<p>After</p>`,
  `${image}<figcaption><strong>Important</strong> <a href="/evidence">evidence</a></figcaption>`,
  `${image}<figcaption>First caption</figcaption><figcaption>Second caption</figcaption>`,
  `${image}<p>Between</p>${image}<figcaption>Both diagrams</figcaption>`,
  `<div>${image}<p>Nested evidence</p></div><figcaption>Caption</figcaption>`,
  '<table><tr><td>Measured result</td></tr></table><figcaption>Table caption</figcaption>',
  '<pre><code>if (x &lt; y) {\n  return x;\n}</code></pre><figcaption>Algorithm</figcaption>',
  `${image}\u00a0<figcaption>Significant spacing</figcaption>`,
];

describe('HTML figure content retention', () => {
  it('preserves the canonical file preview without consuming a different image as decoration', () => {
    const original = schema.node('doc', {}, [schema.node('file_attachment', { src: '/art.svg', name: 'art.svg', mimeType: 'image/svg+xml', description: 'Artwork' })]);
    const html = HTMLExporter.export(original, { document: false });
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      expect(importer.parse(html, schema).toJSON()).toEqual(original.toJSON());
      const changed = importer.parse(html.replace('src="/art.svg"', 'src="/other.svg"'), schema);
      expect(changed.content.map(node => node.type.name)).toEqual(['image_super', 'file_attachment', 'paragraph']);
      expect(changed.child(0).attrs.src).toBe('/other.svg');
      expect(changed.child(2).textContent).toBe('Artwork');
    }
  });

  it.each(['constructor', '__proto__', 'toString'])('does not interpret unknown media type %s as a selector', type => {
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      expect(importer.parse(`<figure data-fountain-media="${type}">${image}<figcaption>Caption</figcaption></figure>`, schema).child(0).attrs.caption).toBe('Caption');
    }
  });

  it('keeps registered custom figure rules authoritative', () => {
    const custom = new Schema({ ...schema.spec, nodes: { ...schema.spec.nodes,
      scientific_figure: { group: 'block', content: 'block+', parseHTML: [{ tag: 'figure[data-scientific]' }] },
    } });
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const document = importer.parse('<figure data-scientific><h2>Evidence</h2><p>Notes</p></figure>', custom);
      expect(document.childCount).toBe(1);
      expect(document.child(0).type.name).toBe('scientific_figure');
      expect(document.child(0).content.map(node => node.textContent)).toEqual(['Evidence', 'Notes']);
    }
  });

  it.each(fixtures)('preserves ordered content instead of extracting only images: %s', inner => {
    const html = `<figure>${inner}</figure>`;
    const expected = HTMLImporter.parse(inner, schema).toJSON();
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const document = importer.parse(html, schema);
      expect(document.toJSON()).toEqual(expected);
      expect(importer.parse(HTMLExporter.export(document, { document: false }), schema).toJSON()).toEqual(expected);
    }
    expect(ServerHTMLImporter.parseWithReport(html, schema).issues.some(issue => issue.code === 'unmapped-block-wrapper')).toBe(true);
  });

  it('keeps a simple image and plain caption attached with its dimensions and alignment', () => {
    const html = `<figure data-align="left" style="width:75%">\n${image}\n<figcaption>Caption</figcaption>\n</figure>`;
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const document = importer.parse(html, schema);
      expect(document.childCount).toBe(1);
      expect(document.child(0).attrs).toMatchObject({ caption: 'Caption', width: '75%', align: 'left' });
    }
    expect(ServerHTMLImporter.parseWithReport(html, schema).issues).toEqual([]);
  });

  it.each(['', ' data-fountain-media="video"'])('keeps captions when the media cannot be imported: %s', attribute => {
    const media = attribute ? '<video src="javascript:private()"></video>' : '<img src="javascript:private()">';
    const html = `<figure${attribute}>${media}<figcaption>Keep this explanation</figcaption></figure>`;
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      expect(importer.parse(html, schema).textContent).toBe('Keep this explanation');
    }
    expect(JSON.stringify(ServerHTMLImporter.parseWithReport(html, schema).issues)).not.toContain('private()');
  });

  it('does not consume prose in a typed media figure', () => {
    const inner = '<video src="/clip.mp4" controls></video><p>Transcript</p><figcaption>Clip</figcaption>';
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      expect(importer.parse(`<figure data-fountain-media="video">${inner}</figure>`, schema).toJSON()).toEqual(importer.parse(inner, schema).toJSON());
    }
  });

  it('retains source and reports figure projection through the Markdown adapter', () => {
    const html = `<figure>${image}<p>Do not lose this</p><figcaption><em>Caption</em></figcaption></figure>`;
    const issues: string[] = [];
    const options = { parseHTMLBlock(source: string, target: Schema) {
      const result = ServerHTMLImporter.parseWithReport(source, target);
      issues.push(...result.issues.map(issue => issue.code));
      return result.document;
    } };
    const parsed = MarkdownImporter.parseWithSource(html, schema, options);
    expect(parsed.document.textContent).toContain('Do not lose this');
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(html);
    expect(issues).toContain('unmapped-block-wrapper');
    expect(MarkdownImporter.parse(MarkdownExporter.export(parsed.document), schema).toJSON()).toEqual(parsed.document.toJSON());
  });
});
