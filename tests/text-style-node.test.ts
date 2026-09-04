import { describe, expect, it } from 'vitest';
import {
  CoreExtension,
  MarkdownExporter,
  MarkdownImporter,
  Schema,
  composeExtensions,
} from '../src';

describe('text-style server interchange', () => {
  it('round-trips style and semantic marks without a browser DOM', () => {
    expect(typeof DOMParser).toBe('undefined');
    const schema = new Schema(composeExtensions([CoreExtension]).schema);
    const document = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Server safe', [
      schema.mark('strong'),
      schema.mark('em'),
      schema.mark('link', { href: 'https://example.com/docs', title: 'Guide', target: '_self' }),
      schema.mark('font_family', { family: 'IBM Plex Sans, sans-serif' }),
      schema.mark('font_size', { size: '18px' }),
      schema.mark('line_height', { lineHeight: '1.7' }),
      schema.mark('text_color', { color: '#123456' }),
      schema.mark('highlight', { color: '#fedcba' }),
    ])])]);

    const exported = MarkdownExporter.exportWithReport(document);
    expect(exported.losses).toEqual([]);
    const restored = MarkdownImporter.parse(exported.markdown, schema);
    const text = restored.child(0).child(0);
    expect(text.text).toBe('Server safe');
    expect(Object.fromEntries(text.marks.map((mark) => [mark.type.name, mark.attrs]))).toMatchObject({
      strong: {},
      em: {},
      link: { href: 'https://example.com/docs', title: 'Guide', target: '_self' },
      font_family: { family: 'IBM Plex Sans, sans-serif' },
      font_size: { size: '18px' },
      line_height: { lineHeight: '1.7' },
      text_color: { color: '#123456' },
      highlight: { color: '#fedcba' },
    });
  });

  it('does not promote hostile generated HTML into executable marks', () => {
    const schema = new Schema(composeExtensions([CoreExtension]).schema);
    const restored = MarkdownImporter.parse(
      '<span data-fountain-text-style="true" style="font-family:url(evil);font-size:calc(1px);color:red"><a href="javascript:alert(1)">Readable</a></span>',
      schema,
    );
    const text = restored.child(0).child(0);
    expect(text.text).toBe('Readable');
    expect(text.marks).toEqual([]);
  });
});
