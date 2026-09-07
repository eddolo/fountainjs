import { describe, expect, it } from 'vitest';
import { CoreExtension, CoreSchemaSpec, HTMLExporter, MarkdownExporter, MarkdownImporter, Schema, composeExtensions } from '../src';
import { PagesExtension } from '../src/pages';
import { DetailsExtension } from '../src/details';
import { markdownHTMLBlock, markdownHTMLBlockEnd } from '../src/core/markdown-html';

describe('inert CommonMark HTML block boundaries', () => {
  it.each([
    ['<ScRiPt>', 1, '</pre>'],
    ['<!-- comment', 2, '-->'],
    ['<?processing', 3, '?>'],
    ['<!doctype', 4, '>'],
    ['<![CDATA[', 5, ']]>'],
    ['<div unfinished', 6, ''],
    ['<custom flag="yes">', 7, ''],
  ] as const)('keeps %s opaque until its own terminator', (opening, kind, closing) => {
    const block = markdownHTMLBlock(opening)!;
    expect(block.kind).toBe(kind);
    const lines = [opening, '# not a heading', '**not bold**', closing, '# After'];
    expect(markdownHTMLBlockEnd(lines, 0, block)).toBe(kind < 6 ? 4 : 3);
    const schema = new Schema(CoreSchemaSpec);
    const doc = MarkdownImporter.parse(lines.join('\n'), schema);
    expect(doc.child(0).type.name).toBe('paragraph');
    expect(doc.child(0).content.every(node => !node.marks.length)).toBe(true);
    expect(doc.child(0).textContent).toContain('# not a heading');
    expect(doc.child(1).type.name).toBe('heading');
    expect(HTMLExporter.export(doc, { document: false })).not.toContain(opening);
    expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
  });

  it('rejects incomplete type-seven tags and disallows their paragraph interruption', () => {
    for (const line of ['    <div>', '<custom broken=', '<custom a==b>', '<custom /> trailing']) expect(markdownHTMLBlock(line)).toBeNull();
    expect(markdownHTMLBlock('<custom flag>', true)).toBeNull();
    expect(markdownHTMLBlock('<div>', true)?.kind).toBe(6);
    expect(markdownHTMLBlock('<!-->', true)?.kind).toBe(2);
  });

  it('does not consume reference definitions or Markdown syntax inside an HTML block', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '<script>\n\n[hidden]: /wrong\n# literal\n\n</script>\n\n[hidden]\n\n[real]: /right\n\n[real]';
    const doc = MarkdownImporter.parse(source, schema);
    expect(doc.child(0).textContent).toContain('[hidden]: /wrong');
    expect(doc.child(1).textContent).toBe('[hidden]');
    expect(doc.child(1).child(0).marks).toEqual([]);
    expect(doc.child(2).child(0).marks[0].attrs.href).toBe('/right');
    expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
  });

  it('preserves authored edge whitespace and consecutive hard breaks in canonical Markdown', () => {
    const schema = new Schema(CoreSchemaSpec);
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [
      schema.text('  before  '), schema.node('hard_break'), schema.node('hard_break'), schema.text('\t after '),
    ])]);
    expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
  });

  it.each(['- ', '12. ', '> - ', '- > '])('keeps nested HTML and fenced definitions opaque in %s containers', prefix => {
    const schema = new Schema(CoreSchemaSpec);
    const continuation = prefix.replace(/[^>]/g, ' ');
    for (const [opening, closing] of [['<script>', '</script>'], ['```text', '```']]) {
      const source = `${prefix}${opening}\n${continuation}[hidden]: /wrong\n${continuation}${closing}\n\n[hidden]`;
      const doc = MarkdownImporter.parse(source, schema);
      expect(doc.textContent).toContain('[hidden]: /wrong');
      expect(HTMLExporter.export(doc, { document: false })).not.toContain('href="/wrong"');
      expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
    }
  });

  it('extracts real list-contained reference definitions with marker-relative indentation', () => {
    const schema = new Schema(CoreSchemaSpec);
    const doc = MarkdownImporter.parse('[real]\n\n12. [real]: /right\n    "A title"\n\n    Content', schema);
    expect(doc.child(0).child(0).marks[0]?.attrs).toMatchObject({ href: '/right', title: 'A title' });
    expect(doc.textContent).not.toContain('[real]:');
    expect(doc.textContent).toContain('Content');
  });

  it.each(['- ', '> ', '> - ', '- > '])('ends %s HTML content before an outdented non-lazy paragraph', prefix => {
    const schema = new Schema(CoreSchemaSpec);
    const doc = MarkdownImporter.parse(`${prefix}<script>\n${prefix.replace(/[^>]/g, ' ')}literal\noutside`, schema);
    expect(doc.childCount).toBe(2);
    expect(doc.child(1).textContent).toBe('outside');
  });

  it('keeps footnote-shaped content inside opaque HTML and fenced code', () => {
    const schema = new Schema(composeExtensions([CoreExtension, PagesExtension]).schema);
    for (const source of ['<script>\n[^hidden]: literal\n</script>', '```text\n[^hidden]: literal\n```']) {
      const doc = MarkdownImporter.parse(source, schema);
      expect(doc.content.some(node => node.type.name === 'footnote_definition')).toBe(false);
      expect(doc.textContent).toContain('[^hidden]: literal');
      expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
    }
  });

  it.each(['- ', '12. ', '> - ', '- > '])('does not steal footnote-shaped literal content from %s containers', prefix => {
    const schema = new Schema(composeExtensions([CoreExtension, PagesExtension]).schema);
    const continuation = prefix.replace(/[^>]/g, ' ');
    for (const [opening, closing] of [['<script>', '</script>'], ['```text', '```']]) {
      const source = `${prefix}${opening}\n${continuation}[^hidden]: literal\n${continuation}${closing}`;
      const doc = MarkdownImporter.parse(source, schema);
      expect(doc.content.some(node => node.type.name === 'footnote_definition')).toBe(false);
      expect(doc.textContent).toContain('[^hidden]: literal');
    }
  });

  it.each(['', '- ', '12. ', '> ', '> - ', '- > '])('extracts real %s footnotes once while retaining container content', prefix => {
    const schema = new Schema(composeExtensions([CoreExtension, PagesExtension]).schema);
    const continuation = prefix.replace(/[^>]/g, ' ');
    const source = `Read[^note].\n\n${prefix}[^note]: Evidence\n${continuation}    More evidence\n${continuation}\n${continuation}Body`;
    const doc = MarkdownImporter.parse(source, schema);
    const definitions = doc.content.filter(node => node.type.name === 'footnote_definition');
    expect(definitions).toHaveLength(1);
    expect(definitions[0].textContent).toBe('Evidence More evidence');
    expect(doc.textContent).toContain('Body');
    expect(doc.textContent).not.toContain('[^note]:');
    expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
  });

  it('keeps the footnote dialect paragraph-interrupting without duplicating definitions', () => {
    const schema = new Schema(composeExtensions([CoreExtension, PagesExtension]).schema);
    const doc = MarkdownImporter.parse('Read[^note].\n[^note]: Evidence', schema);
    expect(doc.childCount).toBe(2);
    expect(doc.child(0).textContent).toBe('Read[^note].');
    expect(doc.child(0).child(1).type.name).toBe('footnote_reference');
    expect(doc.child(1).textContent).toBe('Evidence');
  });

  it('keeps the explicit details dialect distinct from unknown inert HTML', () => {
    const schema = new Schema(composeExtensions([CoreExtension, DetailsExtension, PagesExtension]).schema);
    const doc = MarkdownImporter.parse('<details>\n<summary>More</summary>\n\n[entry]: /details\n\n[entry]\n</details>', schema);
    expect(doc.child(0).type.name).toBe('details');
    expect(doc.child(0).child(1).child(0).marks[0].attrs.href).toBe('/details');
    expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
  });
});
