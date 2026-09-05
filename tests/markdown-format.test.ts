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

  it('imports GFM extended web autolinks with path and boundary validation', () => {
    const schema = new Schema(CoreSchemaSpec);
    const cases = [
      {
        source: 'www.docs.example/help',
        links: [{ text: 'www.docs.example/help', href: 'http://www.docs.example/help' }],
      },
      {
        source: 'Visit https://docs.example/search?q=Markup+(work)).',
        links: [{
          text: 'https://docs.example/search?q=Markup+(work)',
          href: 'https://docs.example/search?q=Markup+(work)',
        }],
      },
      {
        source: 'Visit www.docs.example/a.b.',
        links: [{ text: 'www.docs.example/a.b', href: 'http://www.docs.example/a.b' }],
      },
      {
        source: 'Visit www.docs.example/search?q=guide&zz;',
        links: [{
          text: 'www.docs.example/search?q=guide',
          href: 'http://www.docs.example/search?q=guide',
        }],
      },
      {
        source: 'www.docs.example/he<lp',
        links: [{ text: 'www.docs.example/he', href: 'http://www.docs.example/he' }],
      },
      {
        source: '(https://docs.example/path)',
        links: [{ text: 'https://docs.example/path', href: 'https://docs.example/path' }],
      },
      {
        source: 'prefixwww.docs.example and www.bad_domain.example',
        links: [],
      },
    ];

    for (const example of cases) {
      const document = MarkdownImporter.parse(example.source, schema);
      const links: Array<{ text: string; href: unknown }> = [];
      document.descendants((node) => {
        const mark = node.marks.find((candidate) => candidate.type.name === 'link');
        if (node.isText && mark) links.push({ text: node.textContent, href: mark.attrs.href });
      });
      expect(document.textContent, example.source).toBe(example.source);
      expect(links, example.source).toEqual(example.links);
      expect(MarkdownImporter.parse(MarkdownExporter.export(document), schema).toJSON(), example.source)
        .toEqual(document.toJSON());
    }
  });

  it('imports GFM extended email autolinks without accepting invalid domain tails', () => {
    const schema = new Schema(CoreSchemaSpec);
    const cases = [
      {
        source: 'Write to author+docs@mail.example.',
        links: [{ text: 'author+docs@mail.example', href: 'mailto:author+docs@mail.example' }],
      },
      {
        source: "hello@mail+team.example is invalid, but hello+team@mail.example works.",
        links: [{ text: 'hello+team@mail.example', href: 'mailto:hello+team@mail.example' }],
      },
      {
        source: 'a.b-c_d@a.b / a.b-c_d@a.b.',
        links: [
          { text: 'a.b-c_d@a.b', href: 'mailto:a.b-c_d@a.b' },
          { text: 'a.b-c_d@a.b', href: 'mailto:a.b-c_d@a.b' },
        ],
      },
      { source: 'a.b-c_d@a.b- / a.b-c_d@a.b_', links: [] },
    ];

    for (const example of cases) {
      const document = MarkdownImporter.parse(example.source, schema);
      const links: Array<{ text: string; href: unknown }> = [];
      document.descendants((node) => {
        const mark = node.marks.find((candidate) => candidate.type.name === 'link');
        if (node.isText && mark) links.push({ text: node.textContent, href: mark.attrs.href });
      });
      expect(document.textContent, example.source).toBe(example.source);
      expect(links, example.source).toEqual(example.links);
      expect(MarkdownImporter.parse(MarkdownExporter.export(document), schema).toJSON(), example.source)
        .toEqual(document.toJSON());
    }
  });

  it('imports safe CommonMark protocol autolinks while keeping blocked schemes literal', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = [
      '<MAILTO:FOO@BAR.BAZ>',
      '<xmpp:writer@chat.example/mobile>',
      '<javascript:alert(1)>',
      '<made-up-scheme://host>',
      '<m:abc>',
    ].join(' / ');
    const document = MarkdownImporter.parse(source, schema);
    const links: Array<{ text: string; href: unknown }> = [];
    document.descendants((node) => {
      const mark = node.marks.find((candidate) => candidate.type.name === 'link');
      if (node.isText && mark) links.push({ text: node.textContent, href: mark.attrs.href });
    });

    expect(document.textContent).toBe([
      'MAILTO:FOO@BAR.BAZ',
      'xmpp:writer@chat.example/mobile',
      '<javascript:alert(1)>',
      '<made-up-scheme://host>',
      '<m:abc>',
    ].join(' / '));
    expect(links).toEqual([
      { text: 'MAILTO:FOO@BAR.BAZ', href: 'MAILTO:FOO@BAR.BAZ' },
      { text: 'xmpp:writer@chat.example/mobile', href: 'xmpp:writer@chat.example/mobile' },
    ]);
    expect(MarkdownImporter.parse(MarkdownExporter.export(document), schema).toJSON())
      .toEqual(document.toJSON());
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

  it('applies CommonMark link precedence for malformed inline syntax and nested links', () => {
    const schema = new Schema(CoreSchemaSpec);
    const document = MarkdownImporter.parse([
      '[foo](not a link) / [foo]()',
      '',
      '[outer [inner](docs/inner.md)](docs/outer.md)',
      '',
      '[outer `[inner](docs/code.md)`](docs/outer.md)',
      '',
      '[foo]: docs/reference.md',
    ].join('\n'), schema);
    const links: Array<{ text: string; href: unknown; code: boolean }> = [];
    document.descendants((node) => {
      const link = node.marks.find((mark) => mark.type.name === 'link');
      if (node.isText && link) links.push({
        text: node.textContent,
        href: link.attrs.href,
        code: node.marks.some((mark) => mark.type.name === 'code'),
      });
    });

    expect(document.child(0).textContent).toBe('foo(not a link) / foo');
    expect(document.child(1).textContent).toBe('[outer inner](docs/outer.md)');
    expect(document.child(2).textContent).toBe('outer [inner](docs/code.md)');
    expect(links).toEqual([
      { text: 'foo', href: 'docs/reference.md', code: false },
      { text: 'foo', href: '', code: false },
      { text: 'inner', href: 'docs/inner.md', code: false },
      { text: 'outer ', href: 'docs/outer.md', code: false },
      { text: '[inner](docs/code.md)', href: 'docs/outer.md', code: true },
    ]);
  });

  it('round-trips an empty Markdown link without treating a missing destination as unsafe', () => {
    const schema = new Schema(CoreSchemaSpec);
    const document = MarkdownImporter.parse('[Same page]()', schema);
    const link = document.child(0).child(0).marks.find((mark) => mark.type.name === 'link');

    expect(link?.attrs.href).toBe('');
    expect(MarkdownExporter.export(document)).toBe('[Same page]()');
    expect(MarkdownExporter.export(document, { linkStyle: 'reference' })).toBe('[Same page]()');
    expect(MarkdownImporter.parse(MarkdownExporter.export(document), schema).toJSON())
      .toEqual(document.toJSON());
  });

  it('keeps brackets inside code, autolinks, and inline HTML opaque to link labels', () => {
    const schema = new Schema(CoreSchemaSpec);
    const document = MarkdownImporter.parse([
      '[foo <bar attr="][ref]">',
      '',
      '[foo`][ref]`',
      '',
      '[foo<https://example.com/?search=][ref]>',
      '',
      '[ref]: docs/reference.md',
    ].join('\n'), schema);
    const links: Array<{ text: string; href: unknown }> = [];
    document.descendants((node) => {
      const link = node.marks.find((mark) => mark.type.name === 'link');
      if (node.isText && link) links.push({ text: node.textContent, href: link.attrs.href });
    });

    expect(document.child(0).textContent).toBe('[foo <bar attr="][ref]">');
    expect(document.child(1).textContent).toBe('[foo][ref]');
    expect(document.child(1).content.some((node) => node.marks.some((mark) => mark.type.name === 'code'))).toBe(true);
    expect(links).toEqual([{
      text: 'https://example.com/?search=][ref]',
      href: 'https://example.com/?search=][ref]',
    }]);
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

  it('resolves multiline reference definitions and escaped label brackets', () => {
    const schema = new Schema(CoreSchemaSpec);
    const document = MarkdownImporter.parse([
      '[Guide], [Release], and [A\\]].',
      '',
      '[guide]:',
      '      <docs/user guide.md>',
      '      "User guide"',
      '[release]: releases/v2.md',
      "  'Version two",
      "  notes'",
      '[A\\]]: docs/brackets.md "Bracket label"',
    ].join('\n'), schema);
    const links = document.child(0).content.flatMap((node) => node.marks
      .filter((mark) => mark.type.name === 'link')
      .map((mark) => ({ text: node.textContent, href: mark.attrs.href, title: mark.attrs.title })));

    expect(links).toEqual([
      { text: 'Guide', href: 'docs/user guide.md', title: 'User guide' },
      { text: 'Release', href: 'releases/v2.md', title: 'Version two\nnotes' },
      { text: 'A]', href: 'docs/brackets.md', title: 'Bracket label' },
    ]);
    expect(document.childCount).toBe(1);
  });

  it('normalizes multiline definition labels and rejects unescaped nested brackets', () => {
    const schema = new Schema(CoreSchemaSpec);
    const document = MarkdownImporter.parse([
      '[Baz][Foo bar] and [Escaped][ref\\[].',
      '',
      '[Foo',
      '  bar]: docs/multiline-label.md "Multiline label"',
      '[ref\\[]: docs/escaped-opening.md',
      '',
      '[bad][ref[]',
      '',
      '[ref[]: docs/not-a-definition.md',
    ].join('\n'), schema);
    const links: Array<{ text: string; href: unknown }> = [];
    document.descendants((node) => {
      const link = node.marks.find((mark) => mark.type.name === 'link');
      if (node.isText && link) links.push({ text: node.textContent, href: link.attrs.href });
    });

    expect(links).toEqual([
      { text: 'Baz', href: 'docs/multiline-label.md' },
      { text: 'Escaped', href: 'docs/escaped-opening.md' },
    ]);
    expect(document.textContent).toContain('[bad][ref[]');
    expect(document.textContent).toContain('[ref[]: docs/not-a-definition.md');
  });

  it('matches normalized reference source rather than equivalent parsed inline text', () => {
    const schema = new Schema(CoreSchemaSpec);
    const document = MarkdownImporter.parse([
      '[escaped mismatch][foo\\!] / [entity mismatch][foo&amp;] / [escaped match][foo\\[]',
      '',
      '[foo!]: docs/not-escaped.md',
      '[foo&]: docs/not-entity.md',
      '[foo\\[]: docs/escaped.md',
    ].join('\n'), schema);
    const links: Array<{ text: string; href: unknown }> = [];
    document.descendants((node) => {
      const link = node.marks.find((mark) => mark.type.name === 'link');
      if (node.isText && link) links.push({ text: node.textContent, href: link.attrs.href });
    });

    expect(links).toEqual([{ text: 'escaped match', href: 'docs/escaped.md' }]);
    expect(document.textContent).toContain('[escaped mismatch][foo!]');
    expect(document.textContent).toContain('[entity mismatch][foo&]');
  });

  it('normalizes only CommonMark label whitespace and counts Unicode code points', () => {
    const schema = new Schema(CoreSchemaSpec);
    const astralLabel = '💧'.repeat(500);
    const document = MarkdownImporter.parse([
      '[plain][foo bar] / [nbsp][foo\u00a0bar] / [only nbsp][\u00a0] / [astral][' + astralLabel + ']',
      '',
      '[foo\t\n bar]: docs/plain.md',
      '[foo\u00a0bar]: docs/nbsp.md',
      '[\u00a0]: docs/only-nbsp.md',
      '[' + astralLabel + ']: docs/astral.md',
    ].join('\n'), schema);
    const links: Array<{ text: string; href: unknown }> = [];
    document.descendants((node) => {
      const link = node.marks.find((mark) => mark.type.name === 'link');
      if (node.isText && link) links.push({ text: node.textContent, href: link.attrs.href });
    });

    expect(links).toEqual([
      { text: 'plain', href: 'docs/plain.md' },
      { text: 'nbsp', href: 'docs/nbsp.md' },
      { text: 'only nbsp', href: 'docs/only-nbsp.md' },
      { text: 'astral', href: 'docs/astral.md' },
    ]);
  });

  it('resolves adjacent reference links with CommonMark precedence', () => {
    const schema = new Schema(CoreSchemaSpec);
    const cases = [
      {
        source: '[foo][bar][baz]\n\n[baz]: /url',
        text: '[foo]bar',
        links: [{ text: 'bar', href: '/url' }],
      },
      {
        source: '[foo][bar][baz]\n\n[baz]: /url1\n[bar]: /url2',
        text: 'foobaz',
        links: [{ text: 'foo', href: '/url2' }, { text: 'baz', href: '/url1' }],
      },
      {
        source: '[foo][bar][baz]\n\n[baz]: /url1\n[foo]: /url2',
        text: '[foo]bar',
        links: [{ text: 'bar', href: '/url1' }],
      },
    ];

    for (const example of cases) {
      const document = MarkdownImporter.parse(example.source, schema);
      const links: Array<{ text: string; href: unknown }> = [];
      document.descendants((node) => {
        const link = node.marks.find((mark) => mark.type.name === 'link');
        if (node.isText && link) links.push({ text: node.textContent, href: link.attrs.href });
      });
      expect(document.textContent).toBe(example.text);
      expect(links).toEqual(example.links);
    }
  });

  it('projects nested image descriptions to plain alt text', () => {
    const schema = new Schema(CoreSchemaSpec);
    const description = 'photo *with emphasis*, [a link](https://example.com), and ![an icon](icon.png)';
    const block = MarkdownImporter.parse(`![${description}](hero.png "Hero")`, schema);
    const inlineDocument = MarkdownImporter.parse(`Before ![${description}](hero.png "Hero") after`, schema);
    const inlineImage = inlineDocument.child(0).content.find((node) => node.type.name === 'inline_image');
    const expectedAlt = 'photo with emphasis, a link, and an icon';

    expect(block.child(0).type.name).toBe('image_super');
    expect(block.child(0).attrs).toMatchObject({ src: 'hero.png', alt: expectedAlt, title: 'Hero' });
    expect(inlineImage?.attrs).toMatchObject({ src: 'hero.png', alt: expectedAlt, title: 'Hero' });
    expect(MarkdownExporter.export(block)).toBe(`![${expectedAlt}](hero.png "Hero")`);
    expect(MarkdownImporter.parse(MarkdownExporter.export(block), schema).toJSON()).toEqual(block.toJSON());
  });

  it('uses flanking rules for emphasis and supports combined delimiter runs', () => {
    const schema = new Schema(CoreSchemaSpec);
    const document = MarkdownImporter.parse([
      'snake_case_value and * open* and _ open_',
      '',
      '***combined*** / ___also combined___ / __strong__ / a*b*c',
    ].join('\n'), schema);
    const marked = document.child(1).content
      .filter((node) => node.marks.length)
      .map((node) => ({ text: node.textContent, marks: node.marks.map((mark) => mark.type.name) }));

    expect(document.child(0).textContent).toBe('snake_case_value and * open* and _ open_');
    expect(marked).toEqual([
      { text: 'combined', marks: ['em', 'strong'] },
      { text: 'also combined', marks: ['em', 'strong'] },
      { text: 'strong', marks: ['strong'] },
      { text: 'b', marks: ['em'] },
    ]);
    expect(MarkdownImporter.parse(MarkdownExporter.export(document), schema).toJSON())
      .toEqual(document.toJSON());
  });

  it('keeps nested emphasis and links tighter than surrounding emphasis', () => {
    const schema = new Schema(CoreSchemaSpec);
    const document = MarkdownImporter.parse([
      '*outer **inner** outer* / **strong *inside* strong**',
      '',
      '*[linked text](https://example.com)* / *[link with a literal *](https://example.com)',
    ].join('\n'), schema);
    const marked = document.content.map((paragraph) => paragraph.content
      .filter((node) => node.marks.length)
      .map((node) => ({ text: node.textContent, marks: node.marks.map((mark) => mark.type.name) })));

    expect(marked).toEqual([
      [
        { text: 'outer ', marks: ['em'] },
        { text: 'inner', marks: ['em', 'strong'] },
        { text: ' outer', marks: ['em'] },
        { text: 'strong ', marks: ['strong'] },
        { text: 'inside', marks: ['strong', 'em'] },
        { text: ' strong', marks: ['strong'] },
      ],
      [
        { text: 'linked text', marks: ['em', 'link'] },
        { text: 'link with a literal *', marks: ['link'] },
      ],
    ]);
    expect(MarkdownImporter.parse(MarkdownExporter.export(document), schema).toJSON())
      .toEqual(document.toJSON());
  });

  it('applies CommonMark delimiter-run arithmetic to ambiguous emphasis', () => {
    const schema = new Schema(CoreSchemaSpec);
    const cases = [
      {
        source: '*foo**bar**baz*',
        nodes: [
          { text: 'foo', marks: ['em'] },
          { text: 'bar', marks: ['em', 'strong'] },
          { text: 'baz', marks: ['em'] },
        ],
      },
      {
        source: '*foo**bar*',
        nodes: [{ text: 'foo**bar', marks: ['em'] }],
      },
      {
        source: '***foo** bar*',
        nodes: [
          { text: 'foo', marks: ['em', 'strong'] },
          { text: ' bar', marks: ['em'] },
        ],
      },
      {
        source: '*foo **bar***',
        nodes: [
          { text: 'foo ', marks: ['em'] },
          { text: 'bar', marks: ['em', 'strong'] },
        ],
      },
      {
        source: '*foo**bar***',
        nodes: [
          { text: 'foo', marks: ['em'] },
          { text: 'bar', marks: ['em', 'strong'] },
        ],
      },
      {
        source: 'foo***bar***baz',
        nodes: [
          { text: 'foo', marks: [] },
          { text: 'bar', marks: ['em', 'strong'] },
          { text: 'baz', marks: [] },
        ],
      },
      {
        source: '__foo_ bar_',
        nodes: [
          { text: 'foo', marks: ['em', 'em'] },
          { text: ' bar', marks: ['em'] },
        ],
      },
      {
        source: '*foo *bar**',
        nodes: [
          { text: 'foo ', marks: ['em'] },
          { text: 'bar', marks: ['em', 'em'] },
        ],
      },
      {
        source: '***foo* bar**',
        nodes: [
          { text: 'foo', marks: ['strong', 'em'] },
          { text: ' bar', marks: ['strong'] },
        ],
      },
      {
        source: '**foo *bar***',
        nodes: [
          { text: 'foo ', marks: ['strong'] },
          { text: 'bar', marks: ['strong', 'em'] },
        ],
      },
      {
        source: 'foo******bar*********baz',
        nodes: [
          { text: 'foo', marks: [] },
          { text: 'bar', marks: ['strong', 'strong', 'strong'] },
          { text: '***baz', marks: [] },
        ],
      },
      {
        source: '*foo _bar* baz_',
        nodes: [
          { text: 'foo _bar', marks: ['em'] },
          { text: ' baz_', marks: [] },
        ],
      },
      {
        source: '*foo __bar *baz bim__ bam*',
        nodes: [
          { text: 'foo ', marks: ['em'] },
          { text: 'bar *baz bim', marks: ['em', 'strong'] },
          { text: ' bam', marks: ['em'] },
        ],
      },
    ];

    for (const example of cases) {
      const document = MarkdownImporter.parse(example.source, schema);
      expect(document.child(0).content.map((node) => ({
        text: node.textContent,
        marks: node.marks.map((mark) => mark.type.name),
      })), example.source).toEqual(example.nodes);
      expect(MarkdownImporter.parse(MarkdownExporter.export(document), schema).toJSON(), example.source)
        .toEqual(document.toJSON());
    }
  });

  it('keeps unmatched emphasis delimiters outside the formatted span', () => {
    const schema = new Schema(CoreSchemaSpec);
    const cases = [
      { source: '**foo*', text: '*foo', nodes: [{ text: '*', marks: [] }, { text: 'foo', marks: ['em'] }] },
      { source: '*foo**', text: 'foo*', nodes: [{ text: 'foo', marks: ['em'] }, { text: '*', marks: [] }] },
      { source: '***foo**', text: '*foo', nodes: [{ text: '*', marks: [] }, { text: 'foo', marks: ['strong'] }] },
      { source: '****foo*', text: '***foo', nodes: [{ text: '***', marks: [] }, { text: 'foo', marks: ['em'] }] },
      { source: '**foo***', text: 'foo*', nodes: [{ text: 'foo', marks: ['strong'] }, { text: '*', marks: [] }] },
      { source: '*foo****', text: 'foo***', nodes: [{ text: 'foo', marks: ['em'] }, { text: '***', marks: [] }] },
      { source: 'foo *\\**', text: 'foo *', nodes: [{ text: 'foo ', marks: [] }, { text: '*', marks: ['em'] }] },
      { source: 'foo **\\***', text: 'foo *', nodes: [{ text: 'foo ', marks: [] }, { text: '*', marks: ['strong'] }] },
      { source: 'foo *_*', text: 'foo _', nodes: [{ text: 'foo ', marks: [] }, { text: '_', marks: ['em'] }] },
      { source: 'foo **_**', text: 'foo _', nodes: [{ text: 'foo ', marks: [] }, { text: '_', marks: ['strong'] }] },
    ];

    for (const example of cases) {
      const document = MarkdownImporter.parse(example.source, schema);
      expect(document.textContent, example.source).toBe(example.text);
      expect(document.child(0).content.map((node) => ({
        text: node.textContent,
        marks: node.marks.map((mark) => mark.type.name),
      })), example.source).toEqual(example.nodes);
      expect(MarkdownImporter.parse(MarkdownExporter.export(document), schema).toJSON(), example.source)
        .toEqual(document.toJSON());
    }
  });

  it('keeps indefinite emphasis nesting through links and soft line breaks', () => {
    const schema = new Schema(CoreSchemaSpec);
    const cases = [
      {
        source: '*foo **bar *baz* bim** bop*',
        nodes: [
          { text: 'foo ', marks: ['em'] },
          { text: 'bar ', marks: ['em', 'strong'] },
          { text: 'baz', marks: ['em', 'strong', 'em'] },
          { text: ' bim', marks: ['em', 'strong'] },
          { text: ' bop', marks: ['em'] },
        ],
      },
      {
        source: '*foo [*bar*](/url)*',
        nodes: [
          { text: 'foo ', marks: ['em'] },
          { text: 'bar', marks: ['em', 'link', 'em'] },
        ],
      },
      {
        source: '**foo *bar **baz**\nbim* bop**',
        nodes: [
          { text: 'foo ', marks: ['strong'] },
          { text: 'bar ', marks: ['strong', 'em'] },
          { text: 'baz', marks: ['strong', 'em', 'strong'] },
          { text: ' bim', marks: ['strong', 'em'] },
          { text: ' bop', marks: ['strong'] },
        ],
      },
      {
        source: '**foo [*bar*](/url)**',
        nodes: [
          { text: 'foo ', marks: ['strong'] },
          { text: 'bar', marks: ['strong', 'link', 'em'] },
        ],
      },
    ];

    for (const example of cases) {
      const document = MarkdownImporter.parse(example.source, schema);
      expect(document.child(0).content.map((node) => ({
        text: node.textContent,
        marks: node.marks.map((mark) => mark.type.name),
      })), example.source).toEqual(example.nodes);
      expect(MarkdownImporter.parse(MarkdownExporter.export(document), schema).toJSON(), example.source)
        .toEqual(document.toJSON());
    }
  });

  it('covers underscore surplus, repeated nesting, and competing spans', () => {
    const schema = new Schema(CoreSchemaSpec);
    const cases = [
      { source: '__alpha_', nodes: [{ text: '_', marks: [] }, { text: 'alpha', marks: ['em'] }] },
      { source: '_alpha__', nodes: [{ text: 'alpha', marks: ['em'] }, { text: '_', marks: [] }] },
      { source: '___alpha__', nodes: [{ text: '_', marks: [] }, { text: 'alpha', marks: ['strong'] }] },
      { source: '____alpha_', nodes: [{ text: '___', marks: [] }, { text: 'alpha', marks: ['em'] }] },
      { source: '__alpha___', nodes: [{ text: 'alpha', marks: ['strong'] }, { text: '_', marks: [] }] },
      { source: '_alpha____', nodes: [{ text: 'alpha', marks: ['em'] }, { text: '___', marks: [] }] },
      { source: '*_alpha_*', nodes: [{ text: 'alpha', marks: ['em', 'em'] }] },
      { source: '_*alpha*_', nodes: [{ text: 'alpha', marks: ['em', 'em'] }] },
      { source: '****alpha****', nodes: [{ text: 'alpha', marks: ['strong', 'strong'] }] },
      { source: '____alpha____', nodes: [{ text: 'alpha', marks: ['strong', 'strong'] }] },
      { source: '******alpha******', nodes: [{ text: 'alpha', marks: ['strong', 'strong', 'strong'] }] },
      { source: '_____alpha_____', nodes: [{ text: 'alpha', marks: ['em', 'strong', 'strong'] }] },
      {
        source: '**alpha **beta gamma**',
        nodes: [
          { text: '**alpha ', marks: [] },
          { text: 'beta gamma', marks: ['strong'] },
        ],
      },
    ];

    for (const example of cases) {
      const document = MarkdownImporter.parse(example.source, schema);
      expect(document.child(0).content.map((node) => ({
        text: node.textContent,
        marks: node.marks.map((mark) => mark.type.name),
      })), example.source).toEqual(example.nodes);
      expect(MarkdownImporter.parse(MarkdownExporter.export(document), schema).toJSON(), example.source)
        .toEqual(document.toJSON());
    }
  });

  it('follows GFM one- and two-tilde strikethrough boundaries', () => {
    const schema = new Schema(CoreSchemaSpec);
    const document = MarkdownImporter.parse([
      '~~Removed~~ and ~also removed~.',
      '',
      'Three ~~~stays literal~~~ here.',
      '',
      'This ~~does not',
      '',
      'cross paragraphs~~.',
    ].join('\n'), schema);

    expect(document.content.map((block) => block.content.map((node) => ({
      text: node.textContent,
      marks: node.marks.map((mark) => mark.type.name),
    })))).toEqual([
      [
        { text: 'Removed', marks: ['strike'] },
        { text: ' and ', marks: [] },
        { text: 'also removed', marks: ['strike'] },
        { text: '.', marks: [] },
      ],
      [{ text: 'Three ~~~stays literal~~~ here.', marks: [] }],
      [{ text: 'This ~~does not', marks: [] }],
      [{ text: 'cross paragraphs~~.', marks: [] }],
    ]);
    expect(MarkdownImporter.parse(MarkdownExporter.export(document), schema).toJSON())
      .toEqual(document.toJSON());
  });

  it('keeps code and links tighter than surrounding strikethrough', () => {
    const schema = new Schema(CoreSchemaSpec);
    const cases = [
      {
        source: '~~before `~~` after~~',
        nodes: [
          { text: 'before ', marks: ['strike'] },
          { text: '~~', marks: ['strike', 'code'] },
          { text: ' after', marks: ['strike'] },
        ],
      },
      {
        source: '~~before [label~~](docs.md) after~~',
        nodes: [
          { text: 'before ', marks: ['strike'] },
          { text: 'label~~', marks: ['strike', 'link'] },
          { text: ' after', marks: ['strike'] },
        ],
      },
      {
        source: '~~[linked](docs.md)~~ / [~~inside~~](docs.md)',
        nodes: [
          { text: 'linked', marks: ['strike', 'link'] },
          { text: ' / ', marks: [] },
          { text: 'inside', marks: ['link', 'strike'] },
        ],
      },
    ];

    for (const example of cases) {
      const document = MarkdownImporter.parse(example.source, schema);
      expect(document.child(0).content.map((node) => ({
        text: node.textContent,
        marks: node.marks.map((mark) => mark.type.name),
      })), example.source).toEqual(example.nodes);
      expect(MarkdownImporter.parse(MarkdownExporter.export(document), schema).toJSON(), example.source)
        .toEqual(document.toJSON());
    }
  });

  it('does not join a reference title across a blank line', () => {
    const schema = new Schema(CoreSchemaSpec);
    const document = MarkdownImporter.parse([
      '[Guide]',
      '',
      '[guide]: docs/guide.md',
      '',
      '"Not the title"',
    ].join('\n'), schema);
    const link = document.child(0).child(0).marks.find((mark) => mark.type.name === 'link');

    expect(link?.attrs).toMatchObject({ href: 'docs/guide.md', title: '' });
    expect(document.child(1).textContent).toBe('"Not the title"');
  });

  it('extracts global multiline reference definitions from blockquotes', () => {
    const schema = new Schema(CoreSchemaSpec);
    const document = MarkdownImporter.parse([
      '[Outside][quoted]',
      '',
      '> [quoted]:',
      '>   docs/quoted.md',
      '>   "Quoted title"',
      '>',
      '> [Inside][quoted]',
    ].join('\n'), schema);
    const links: Array<{ text: string; href: unknown; title: unknown }> = [];
    document.descendants((node) => node.marks
      .filter((mark) => mark.type.name === 'link')
      .forEach((mark) => links.push({ text: node.textContent, href: mark.attrs.href, title: mark.attrs.title })));

    expect(links).toEqual([
      { text: 'Outside', href: 'docs/quoted.md', title: 'Quoted title' },
      { text: 'Inside', href: 'docs/quoted.md', title: 'Quoted title' },
    ]);
    expect(document.child(1).type.name).toBe('blockquote');
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

  it('uses immutable identity for duplicate source blocks and rejects ambiguous clones', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource('# Same #\n\nSame\n====\n\nTail  spacing', schema);
    const changed = schema.node('doc', {}, [
      imported.document.content[0],
      imported.document.content[2],
    ]);
    const mapped = imported.source.mapBlocks(changed);
    const result = MarkdownExporter.exportWithSource(changed, imported.source);

    expect(mapped?.[0]?.source).toBe('# Same #');
    expect(Object.isFrozen(mapped)).toBe(true);
    expect(mapped?.[1]?.source).toBe('Tail  spacing');
    expect(result).toEqual({
      markdown: '# Same #\n\nTail  spacing',
      losses: [],
      preservation: 'mapped-blocks',
    });

    const movedDuplicates = schema.node('doc', {}, [
      imported.document.content[1],
      imported.document.content[0],
      schema.node('paragraph', {}, [schema.text('Changed tail')]),
    ]);
    const movedMap = imported.source.mapBlocks(movedDuplicates);

    expect(movedMap?.map((block) => block?.source)).toEqual([
      'Same\n====',
      '# Same #',
      undefined,
    ]);
    expect(MarkdownExporter.exportWithSource(movedDuplicates, imported.source)).toEqual({
      markdown: 'Same\n====\n\n# Same #\n\nChanged tail',
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

    expect(markdown).toContain('[<span data-fountain-text-style="true" style=""><strong>bold </strong></span>][ref-1]');
    expect(markdown).toContain('[<span data-fountain-text-style="true" style=""><strong><em>and italic</em></strong></span>][ref-1]');
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
