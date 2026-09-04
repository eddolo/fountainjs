import { describe, expect, it, vi } from 'vitest';
import {
  CoreExtension,
  CoreSchemaSpec,
  MarkdownExporter,
  MarkdownImporter,
  Schema,
  composeExtensions,
  defineExtension,
} from '../src';

describe('Markdown interchange', () => {
  it('imports full, collapsed, and shortcut references with titles and nested marks', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = [
      'Read [the **guide**][Docs], [Docs][], and [Docs]. Keep [unsafe][bad] literal.',
      '',
      '![Logo][asset]',
      '',
      '[docs]: <https://example.com/guide> "Guide title"',
      "[asset]: https://cdn.example.com/logo.png 'Logo title'",
      '[bad]: javascript:alert(1)',
    ].join('\n');
    const document = MarkdownImporter.parse(source, schema);
    const paragraph = document.child(0);
    const linked = paragraph.content.filter((node) => node.marks.some((mark) => mark.type.name === 'link'));

    expect(linked.map((node) => node.textContent).join('')).toContain('the guideDocsDocs');
    expect(linked.flatMap((node) => node.marks).find((mark) => mark.type.name === 'link')?.attrs).toMatchObject({
      href: 'https://example.com/guide', title: 'Guide title',
    });
    expect(linked.find((node) => node.textContent === 'guide')?.marks.map((mark) => mark.type.name)).toEqual(['link', 'strong']);
    expect(paragraph.textContent).toContain('[unsafe][bad]');
    expect(document.child(1).type.name).toBe('image_super');
    expect(document.child(1).attrs).toMatchObject({
      src: 'https://cdn.example.com/logo.png', alt: 'Logo', title: 'Logo title',
    });
  });

  it('exports deterministic, deduplicated reference definitions and preserves link titles', () => {
    const schema = new Schema(CoreSchemaSpec);
    const link = schema.mark('link', { href: 'https://example.com/a path', title: 'The "guide"' });
    const document = schema.node('doc', {}, [schema.node('paragraph', {}, [
      schema.text('First', [link]), schema.text(' / '), schema.text('Second', [link]),
    ])]);
    const markdown = MarkdownExporter.export(document, { linkStyle: 'reference' });

    expect(markdown).toContain('[First][ref-1] / [Second][ref-1]');
    expect(markdown.match(/^\[ref-1\]:/gm)).toHaveLength(1);
    expect(markdown).toContain('[ref-1]: <https://example.com/a path> "The \\"guide\\""');
    expect(MarkdownImporter.parse(markdown, schema).toJSON()).toEqual(document.toJSON());
    expect(MarkdownImporter.parse(MarkdownExporter.export(document), schema).toJSON()).toEqual(document.toJSON());
  });

  it('keeps nested mark order inside links across reference export', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = [
      'A [**bold _and italic_**][guide].',
      '',
      '[guide]: https://example.com/guide "Nested marks"',
    ].join('\n');
    const document = MarkdownImporter.parse(source, schema);
    const markdown = MarkdownExporter.export(document, { linkStyle: 'reference' });

    expect(markdown).toContain('[**bold **][ref-1][**_and italic_**][ref-1]');
    expect(MarkdownImporter.parse(markdown, schema).toJSON()).toEqual(document.toJSON());
  });

  it('parses escaped table pipes, alignment, marks, and short rows without changing shape', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = [
      '| Path \\| label | Center | Right |',
      '| --- | :---: | ---: |',
      '| C:\\\\tmp \\| one | **two** | |',
      '| short | | |',
    ].join('\n');
    const document = MarkdownImporter.parse(source, schema);
    const table = document.child(0);

    expect(table.content.every((row) => row.childCount === 3)).toBe(true);
    expect(table.child(0).child(0).textContent).toBe('Path | label');
    expect(table.child(1).child(0).textContent).toBe('C:\\tmp | one');
    expect(table.child(1).child(1).child(0).child(0).marks[0]?.type.name).toBe('strong');
    expect(table.child(1).content.map((cell) => cell.child(0).attrs.align)).toEqual(['left', 'center', 'right']);

    const markdown = MarkdownExporter.export(document);
    expect(markdown).toContain('| :--- | :---: | ---: |');
    expect(markdown).toContain('Path \\| label');
    expect(MarkdownImporter.parse(markdown, schema).toJSON()).toEqual(document.toJSON());
  });

  it('round-trips recursive blockquotes with paragraphs, lists, and nested quotes', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = [
      '> First **paragraph**.',
      '>',
      '> - One',
      '>   - Nested',
      '>',
      '> > Inner quote',
      '>',
      '> Last paragraph.',
    ].join('\n');
    const document = MarkdownImporter.parse(source, schema);
    const quote = document.child(0);

    expect(quote.content.map((node) => node.type.name)).toEqual(['paragraph', 'bullet_list', 'blockquote', 'paragraph']);
    expect(quote.child(1).child(0).child(1).type.name).toBe('bullet_list');
    expect(quote.child(2).textContent).toBe('Inner quote');
    expect(MarkdownImporter.parse(MarkdownExporter.export(document), schema).toJSON()).toEqual(document.toJSON());
  });

  it('preserves loose list items containing multiple blocks', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = [
      '- First **paragraph**',
      '',
      '  Second paragraph.',
      '',
      '  > Quoted child',
      '',
      '- Sibling',
    ].join('\n');
    const document = MarkdownImporter.parse(source, schema);
    const firstItem = document.child(0).child(0);

    expect(firstItem.content.map((node) => node.type.name)).toEqual(['paragraph', 'paragraph', 'blockquote']);
    expect(firstItem.child(0).child(1).marks[0]?.type.name).toBe('strong');
    expect(MarkdownImporter.parse(MarkdownExporter.export(document), schema).toJSON()).toEqual(document.toJSON());
  });

  it('reports extension and attribute loss with stable paths without breaking export callbacks', () => {
    const custom = defineExtension({
      name: 'markdown-loss-fixture',
      nodes: {
        callout: { group: 'block', content: 'block+', attrs: { tone: { default: 'info' } }, toDOM: () => ['aside', 0] },
        chip: {
          group: 'inline', inline: true, atom: true,
          attrs: { label: { default: '' } },
          toText: (node) => String(node.attrs.label),
          toDOM: (node) => ['span', String(node.attrs.label)],
        },
      },
      marks: { annotation: { attrs: { id: { default: '' } }, toDOM: () => ['span', 0] } },
    });
    const schema = new Schema(composeExtensions([CoreExtension, custom]).schema);
    const annotation = schema.mark('annotation', { id: 'note-1' });
    const document = schema.node('doc', {}, [schema.node('callout', { tone: 'warning' }, [
      schema.node('paragraph', { align: 'center' }, [
        schema.text('Review', [annotation]), schema.text(' '), schema.node('chip', { label: 'API' }),
      ]),
    ])]);
    const onLoss = vi.fn(() => { throw new Error('consumer failure'); });
    const result = MarkdownExporter.exportWithReport(document, { onLoss });

    expect(result.markdown).toBe('Review API');
    expect(result.losses.map(({ kind, type, path }) => ({ kind, type, path }))).toEqual([
      { kind: 'node', type: 'callout', path: [0] },
      { kind: 'attribute', type: 'paragraph', path: [0, 0] },
      { kind: 'mark', type: 'annotation', path: [0, 0, 0] },
      { kind: 'node', type: 'chip', path: [0, 0, 2] },
    ]);
    expect(onLoss).toHaveBeenCalledTimes(result.losses.length);
    expect(Object.isFrozen(result.losses)).toBe(true);
    expect(result.losses.every((loss) => Object.isFrozen(loss))).toBe(true);
    expect(result.losses.every((loss) => Object.isFrozen(loss.path))).toBe(true);
  });
});
