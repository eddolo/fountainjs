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
import compatibilityCorpus from './fixtures/markdown/compatibility-v1.json';

function compatibilitySnapshot(document: ReturnType<typeof MarkdownImporter.parse>) {
  const headings: Array<{ level: number; text: string }> = [];
  const codeBlocks: Array<{ language: string; text: string }> = [];
  const links: string[] = [];
  const marks: string[] = [];
  let hardBreaks = 0;
  document.descendants((node) => {
    if (node.type.name === 'heading') headings.push({ level: Number(node.attrs.level), text: node.textContent });
    if (node.type.name === 'code_block') codeBlocks.push({ language: String(node.attrs.language), text: node.textContent });
    if (node.type.name === 'hard_break') hardBreaks += 1;
    if (node.isText) node.marks.forEach((mark) => {
      marks.push(mark.type.name);
      if (mark.type.name === 'link') links.push(String(mark.attrs.href));
    });
  });
  return {
    topLevelTypes: document.content.map((node) => node.type.name),
    text: document.textContent,
    headings,
    codeBlocks,
    links,
    marks,
    hardBreaks,
  };
}

describe('Markdown interchange', () => {
  it.each(compatibilityCorpus.cases)('covers compatibility corpus case $id', ({ source, expected }) => {
    const schema = new Schema(CoreSchemaSpec);
    const document = MarkdownImporter.parse(source, schema);

    expect(compatibilitySnapshot(document)).toEqual(expected);
  });

  it('chooses a safe variable-length code fence around fence text', () => {
    const schema = new Schema(CoreSchemaSpec);
    const document = schema.node('doc', {}, [schema.node('code_block', {
      language: 'markdown', lineNumbers: true,
    }, [schema.text('before\n```\nafter')])]);
    const markdown = MarkdownExporter.export(document);

    expect(markdown).toBe('````markdown\nbefore\n```\nafter\n````');
    expect(MarkdownImporter.parse(markdown, schema).toJSON()).toEqual(document.toJSON());
  });

  it('round-trips code spans with delimiter collisions and significant edge spaces', () => {
    const schema = new Schema(CoreSchemaSpec);
    const code = schema.marks.code.create();
    const cases = [
      { value: 'inside ` tick', markdown: '``inside ` tick``' },
      { value: '`wrapped`', markdown: '`` `wrapped` ``' },
      { value: ' padded ', markdown: '`  padded  `' },
      { value: '   ', markdown: '`   `' },
    ];

    cases.forEach(({ value, markdown }) => {
      const document = schema.node('doc', {}, [
        schema.node('paragraph', {}, [schema.text(value, [code])]),
      ]);
      expect(MarkdownExporter.export(document)).toBe(markdown);
      expect(MarkdownImporter.parse(markdown, schema).toJSON()).toEqual(document.toJSON());
    });
  });

  it('decodes strict character references before validating Markdown links', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '[Safe](https://example.com/?a=1&amp;b=2 "Title &copy;") and [blocked](jav&#x61;script:alert(1))';
    const document = MarkdownImporter.parse(source, schema);
    const links = document.content[0].content.flatMap((node) => (
      node.marks.filter((mark) => mark.type.name === 'link')
    ));

    expect(links).toHaveLength(1);
    expect(links[0].attrs).toMatchObject({
      href: 'https://example.com/?a=1&b=2',
      title: 'Title ©',
    });
    expect(document.textContent).toBe('Safe and [blocked](javascript:alert(1))');
    expect(MarkdownImporter.parse('Bad &#99999999; / &#xD800; / &unknown;', schema).textContent)
      .toBe('Bad &#99999999; / � / &unknown;');
  });

  it('escapes literal character-reference text during canonical export', () => {
    const schema = new Schema(CoreSchemaSpec);
    const link = schema.marks.link.create({
      href: 'https://example.com/?literal=&copy;',
      title: 'Keep &copy;',
    });
    const document = schema.node('doc', {}, [schema.node('paragraph', {}, [
      schema.text('See &copy;', [link]),
      schema.text(' and &#35;.'),
    ])]);
    const markdown = MarkdownExporter.export(document);

    expect(markdown).toBe('[See \\&copy;](https://example.com/?literal=\\&copy; "Keep \\&copy;") and \\&#35;.');
    expect(MarkdownImporter.parse(markdown, schema).toJSON()).toEqual(document.toJSON());
  });

  it('parses safe relative and balanced Markdown link destinations with strict titles', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = [
      '[angle](<docs/guide)v1>)',
      '[nested](docs/(stable))',
      '[relative](guide.md "Guide")',
      '[invalid](guide.md "one "two" three")',
    ].join(' ');
    const document = MarkdownImporter.parse(source, schema);
    const links = document.content[0].content.flatMap((node) => node.marks
      .filter((mark) => mark.type.name === 'link')
      .map((mark) => ({ text: node.textContent, href: mark.attrs.href, title: mark.attrs.title })));

    expect(links).toEqual([
      { text: 'angle', href: 'docs/guide)v1', title: '' },
      { text: 'nested', href: 'docs/(stable)', title: '' },
      { text: 'relative', href: 'guide.md', title: 'Guide' },
    ]);
    expect(document.textContent).toContain('[invalid](guide.md "one "two" three")');
  });

  it('does not extract reference definitions from code or paragraph continuations', () => {
    const schema = new Schema(CoreSchemaSpec);
    const document = MarkdownImporter.parse([
      '```md',
      '[inside]: docs/code.md',
      '```',
      '',
      'Paragraph',
      '[continuation]: docs/wrong.md',
      '',
      '[inside] [continuation] [real]',
      '',
      '[real]: docs/real.md',
    ].join('\n'), schema);
    const links = document.content.flatMap((block) => block.content).flatMap((node) => node.marks
      .filter((mark) => mark.type.name === 'link'));

    expect(document.child(0).type.name).toBe('code_block');
    expect(document.child(0).textContent).toBe('[inside]: docs/code.md');
    expect(document.textContent).toContain('Paragraph [continuation]: docs/wrong.md');
    expect(document.textContent).toContain('[inside] [continuation] real');
    expect(links).toHaveLength(1);
    expect(links[0].attrs.href).toBe('docs/real.md');
  });

  it('returns untouched Markdown source exactly while its parsed document is unchanged', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = [
      '\uFEFF---',
      'title: "Source fidelity"',
      'tags: [editor, portable]',
      '---',
      '# Heading',
      '',
      'A paragraph with  deliberate spacing and an :unknown[directive].',
    ].join('\r\n');
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const result = MarkdownExporter.exportWithSource(imported.document, imported.source);

    expect(imported.document.textContent).toContain('Heading');
    expect(imported.document.textContent).not.toContain('title:');
    expect(imported.source.frontmatter).toMatchObject({
      openingDelimiter: '---',
      closingDelimiter: '---',
      content: 'title: "Source fidelity"\r\ntags: [editor, portable]\r\n',
    });
    expect(imported.source.lineEnding).toBe('\r\n');
    expect(result).toEqual({ markdown: source, losses: [], preservation: 'exact' });
    expect(Object.isFrozen(imported)).toBe(true);
    expect(Object.isFrozen(imported.source)).toBe(true);
    expect(Object.isFrozen(imported.source.frontmatter)).toBe(true);
  });

  it('keeps inert frontmatter exactly and canonicalizes only the body after a visual edit', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '---\ntitle: Keep me\n...\n# Original\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Changed')])]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);

    expect(result.markdown).toBe('---\ntitle: Keep me\n...\nChanged');
    expect(result.preservation).toBe('frontmatter');
    expect(result.losses).toEqual([]);
    expect(imported.source.frontmatter?.content).toBe('title: Keep me\n');
  });

  it('preserves unchanged top-level source blocks around an aligned visual edit', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '\r\n# Keep this heading ###\r\n\r\nA :custom[raw directive] value.\r\n\r\nLast  spaced block.\r\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, [
      imported.document.content[0],
      schema.node('paragraph', {}, [schema.text('Changed block')]),
      imported.document.content[2],
    ]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);

    expect(imported.source.leading).toBe('\r\n');
    expect(imported.source.blocks).toHaveLength(3);
    expect(Object.isFrozen(imported.source.blocks)).toBe(true);
    expect(Object.isFrozen(imported.source.blocks[0])).toBe(true);
    expect(imported.source.blocks[0].source).toBe('# Keep this heading ###');
    expect(imported.source.blocks[0].separatorAfter).toBe('\r\n\r\n');
    expect(result).toEqual({
      markdown: '\r\n# Keep this heading ###\r\n\r\nChanged block\r\n\r\nLast  spaced block.\r\n',
      losses: [],
      preservation: 'blocks',
    });
  });

  it('keeps frontmatter and aligned source blocks together after an edit', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '---\ntitle: Blocks\n---\n\nSetext source\n=============\n\nOriginal';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, [
      imported.document.content[0],
      schema.node('paragraph', {}, [schema.text('Changed')]),
    ]);

    expect(MarkdownExporter.exportWithSource(changed, imported.source)).toEqual({
      markdown: '---\ntitle: Blocks\n---\n\nSetext source\n=============\n\nChanged',
      losses: [],
      preservation: 'blocks',
    });
  });

  it('fails closed to canonical output when source blocks cannot align safely', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('# Heading ###\r\nParagraph without a blank line', schema);
    const changed = schema.node('doc', {}, [
      imported.document.content[0],
      schema.node('paragraph', {}, [schema.text('Changed')]),
    ]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);

    expect(imported.source.blocks).toEqual([]);
    expect(result).toEqual({
      markdown: '# Heading\r\n\r\nChanged',
      losses: [],
      preservation: 'canonical',
    });
  });

  it('preserves uniquely mapped source blocks through insertion', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('# Keep ###\r\n\r\nOriginal  spacing', schema);
    const changed = schema.node('doc', {}, [
      schema.node('paragraph', {}, [schema.text('Inserted')]),
      ...imported.document.content,
    ]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);

    expect(imported.source.blocks).toHaveLength(2);
    expect(result.preservation).toBe('mapped-blocks');
    expect(result.markdown).toBe('Inserted\r\n\r\n# Keep ###\r\n\r\nOriginal  spacing');
  });

  it('preserves uniquely mapped source blocks through deletion', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('# First ###\n\nMiddle\n\nLast\n----', schema);
    const changed = schema.node('doc', {}, [
      imported.document.content[0],
      imported.document.content[2],
    ]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);

    expect(result).toEqual({
      markdown: '# First ###\n\nLast\n----',
      losses: [],
      preservation: 'mapped-blocks',
    });
  });

  it('preserves uniquely mapped source blocks through movement', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('Setext\n======\n\n\nA  spaced.\n\n\n\n# Tail ###', schema);
    const changed = schema.node('doc', {}, [
      imported.document.content[2],
      imported.document.content[0],
      imported.document.content[1],
    ]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);

    expect(result).toEqual({
      markdown: '# Tail ###\n\nSetext\n======\n\nA  spaced.',
      losses: [],
      preservation: 'mapped-blocks',
    });
  });

  it('canonicalizes ambiguous duplicate blocks instead of guessing their source', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('# Same #\n\nSame\n====\n\nTail  spacing', schema);
    const changed = schema.node('doc', {}, [
      imported.document.content[0],
      imported.document.content[2],
    ]);
    const mapped = imported.source.mapBlocks(changed);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);

    expect(mapped?.[0]).toBeNull();
    expect(Object.isFrozen(mapped)).toBe(true);
    expect(mapped?.[1]?.source).toBe('Tail  spacing');
    expect(result).toEqual({
      markdown: '# Same\n\nTail  spacing',
      losses: [],
      preservation: 'mapped-blocks',
    });

    const uniqueImported = MarkdownImporter.parseWithSource('# Original ###\n\nTail  spacing', schema);
    const cloned = schema.node('doc', {}, [
      uniqueImported.document.content[0],
      uniqueImported.document.content[0],
      uniqueImported.document.content[1],
    ]);
    const clonedMap = uniqueImported.source.mapBlocks(cloned);

    expect(clonedMap?.slice(0, 2)).toEqual([null, null]);
    expect(MarkdownExporter.exportWithSource(cloned, uniqueImported.source)).toEqual({
      markdown: '# Original\n\n# Original\n\nTail  spacing',
      losses: [],
      preservation: 'mapped-blocks',
    });
  });

  it('falls back when reference-style output needs document-level definitions', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('# Keep ###\n\nOriginal', schema);
    const changed = schema.node('doc', {}, [
      imported.document.content[0],
      schema.node('paragraph', {}, [schema.text('Linked', [
        schema.marks.link.create({ href: 'https://example.com', title: '' }),
      ])]),
    ]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source, { linkStyle: 'reference' });

    expect(result.preservation).toBe('canonical');
    expect(result.markdown).toBe('# Keep\n\n[Linked][ref-1]\n\n[ref-1]: https://example.com');
  });

  it('bounds per-block provenance while retaining whole-source exactness', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = Array.from({ length: 10_001 }, (_, index) => `Block ${index}`).join('\n\n');
    const imported = MarkdownImporter.parseWithSource(source, schema);

    expect(imported.document.content).toHaveLength(10_001);
    expect(imported.source.blocks).toEqual([]);
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source)).toEqual({
      markdown: source,
      losses: [],
      preservation: 'exact',
    });
  });

  it('does not mistake an unclosed delimiter for frontmatter', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '---\ntitle: Not closed\nBody';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const changed = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Changed')])]);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);

    expect(imported.source.frontmatter).toBeUndefined();
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(source);
    expect(result).toEqual({ markdown: 'Changed', losses: [], preservation: 'canonical' });
  });

  it('requires frontmatter delimiters at the start of their lines', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('  ---\ntitle: Indented\n  ---\nBody', schema);

    expect(imported.source.frontmatter).toBeUndefined();
  });

  it('rejects source provenance that was not captured by the importer', () => {
    const schema = new Schema(CoreSchemaSpec);
    const document = MarkdownImporter.parse('Document', schema);

    expect(() => MarkdownExporter.exportWithSource(document, {} as never))
      .toThrow('Markdown source must come from MarkdownImporter.parseWithSource().');
  });

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
