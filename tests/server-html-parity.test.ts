// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import {
  CoreExtension,
  HTMLExporter,
  HTMLImporter,
  MarkdownImporter,
  MarkdownExporter,
  MathExtension,
  MediaExtension,
  Schema,
  composeExtensions,
  defineExtension,
} from '../src';
import { DetailsExtension } from '../src/details';
import { ServerHTMLImporter } from '../src/html/server';
import { PagesExtension } from '../src/pages';
import { RubyExtension } from '../src/ruby';

const schema = new Schema(composeExtensions([
  CoreExtension,
  MediaExtension,
  MathExtension,
  DetailsExtension,
  RubyExtension,
  PagesExtension,
]).schema);

const fixtures = [
  '<h2 style="text-align:center">Title</h2><p><strong>Bold</strong> <em>italic</em> <a href="https://example.com" target="_self">link</a></p>',
  '<blockquote><p>Before <ruby>東京<rt>とうきょう</rt></ruby>.</p><ol start="3"><li>One<ul><li>Nested</li></ul></li></ol></blockquote>',
  '<table><thead><tr><th colspan="2" data-colwidth="100,140">Head</th></tr></thead><tbody><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></tbody></table>',
  '<p><span style="font-weight:700;font-style:italic;text-decoration:underline line-through;color:rgb(2, 4, 8);background-color:#abc;font-family:Georgia;font-size:18px;line-height:1.75">Styled</span></p>',
  '<p><a href="">Empty link</a> <a>Anchor without href</a></p>',
  '<p><span data-fountain-math="inline" data-latex="x^2" data-math-aria-label="x squared">x squared</span></p><div data-fountain-math="block" data-latex="\\int_0^1 x dx">integral</div>',
  '<hr data-fountain-page-break="true"><details open><summary>Summary</summary><p>Body</p></details>',
  '<figure data-fountain-media="audio"><audio src="https://example.com/audio.mp3" controls><track src="https://example.com/en.vtt" kind="captions" srclang="en"></audio><figcaption>Audio</figcaption></figure>',
  '<figure data-align="left" style="width:75%"><img src="https://example.com/image.png" alt="Diagram" width="640"><figcaption>Caption</figcaption></figure>',
  '<p><a href="/details" title="Details" target="_self"><img src="/status.png" alt="Status"></a></p>',
];

describe('HTML fallback wrapper structure', () => {
  it.each(['hbf', 'hfb', 'bhf', 'bfh', 'fhb', 'fbh'])('imports table rows in native section order for %s markup', order => {
    const sections: Record<string, string> = {
      h: '<thead><tr><th scope="col">Heading</th></tr></thead>',
      b: '<tbody><tr><td>Body one</td></tr><tr><td>Body two</td></tr></tbody>',
      f: '<tfoot><tr><td>Total</td></tr></tfoot>',
    };
    const source = `<table>${Array.from(order, key => sections[key]).join('')}</table>`;
    const reference = document.createElement('div');
    reference.innerHTML = source;
    const expected = Array.from(reference.querySelector('table')!.rows, row => row.textContent);
    expect(expected).toEqual(['Heading', 'Body one', 'Body two', 'Total']);
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const parsed = importer.parse(source, schema);
      expect(parsed.content[0].content.map(row => row.textContent)).toEqual(expected);
      expect(importer.parse(HTMLExporter.export(parsed, { document: false }), schema).toJSON()).toEqual(parsed.toJSON());
    }
  });

  it.each(['tbody', 'thead', 'tfoot'])('resolves zero rowspan within its own %s group in browser and server', group => {
    const source = `<table><${group}><tr><td rowspan="0">Group A</td><td>A1</td></tr><tr><td>A2</td></tr></${group}><tbody><tr><td rowspan="0">Group B</td><td>B1</td></tr><tr><td>B2</td></tr><tr><td>B3</td></tr></tbody></table>`;
    const server = ServerHTMLImporter.parseWithReport(source, schema);
    const browser = HTMLImporter.parse(source, schema);
    expect(server.document.toJSON()).toEqual(browser.toJSON());
    expect(browser.content[0].content.find(row => row.content[0].textContent === 'Group A')!.content[0].attrs.rowspan).toBe(2);
    expect(browser.content[0].content.find(row => row.content[0].textContent === 'Group B')!.content[0].attrs.rowspan).toBe(3);
    expect(server.issues).toContainEqual(expect.objectContaining({ message: expect.stringContaining('Zero rowspan') }));
    expect(HTMLImporter.parse(HTMLExporter.export(browser, { document: false }), schema).toJSON()).toEqual(browser.toJSON());
  });

  it('does not count nested-table rows in a zero rowspan', () => {
    const source = '<table><tr><td rowspan="0">Outer<table><tr><td rowspan="0">Inner</td><td>1</td></tr><tr><td>2</td></tr><tr><td>3</td></tr></table></td><td>A</td></tr><tr><td>B</td></tr></table>';
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const table = importer.parse(source, schema).content[0];
      const cell = table.content[0].content[0];
      expect(cell.attrs.rowspan).toBe(2);
      expect(cell.content.find(node => node.type.name === 'table')?.content[0].content[0].attrs.rowspan).toBe(3);
    }
  });

  it.each([
    [null, 1], ['', 1], [' ', 1], ['-2', 1], ['NaN', 1], ['1.5', 1],
    ['2x', 2], ['  +2', 2], ['0', 3], ['00', 3], ['0x10', 3], ['999999999999999999999', 100],
  ])('uses HTML span integer rules for %s', (value, expected) => {
    const source = `<table><tr><td${value === null ? '' : ` rowspan="${value}"`}>A</td></tr><tr><td>B</td></tr><tr><td>C</td></tr></table>`;
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      expect(importer.parse(source, schema).content[0].content[0].content[0].attrs.rowspan).toBe(expected);
    }
  });

  const inner = 'Before<h2>Nested heading</h2><p>First</p><p>Second</p><ul><li>Task</li></ul>After';
  it.each(['custom-panel', 'form', 'span'])('preserves block boundaries through an unmapped %s wrapper', tag => {
    const source = `<${tag}>${inner}</${tag}>`;
    const expected = HTMLImporter.parse(inner, schema).toJSON();
    expect(ServerHTMLImporter.parse(source, schema).toJSON()).toEqual(expected);
    expect(HTMLImporter.parse(source, schema).toJSON()).toEqual(expected);
  });

  it.each(['<ul><li>', '<table><tr><td>', '<blockquote>', '<outer-wrap>'])('preserves nested wrappers within %s', parent => {
    const close = ({ '<ul><li>': '</li></ul>', '<table><tr><td>': '</td></tr></table>', '<blockquote>': '</blockquote>', '<outer-wrap>': '</outer-wrap>' })[parent];
    const source = `${parent}<unknown-wrap><another-wrap>${inner}</another-wrap></unknown-wrap>${close}`;
    const expected = HTMLImporter.parse(`${parent}${inner}${close}`, schema).toJSON();
    const server = ServerHTMLImporter.parseWithReport(source, schema);
    expect(server.document.toJSON()).toEqual(expected);
    expect(HTMLImporter.parse(source, schema).toJSON()).toEqual(expected);
    expect(server.issues).toEqual([expect.objectContaining({ code: 'unmapped-block-wrapper' })]);
  });

  it('does not turn an inline-only unknown wrapper into a new paragraph', () => {
    const html = 'Before <unknown-wrap><strong>inline</strong></unknown-wrap> after';
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const document = importer.parse(html, schema);
      expect(document.childCount).toBe(1);
      expect(document.textContent).toBe('Before inline after');
      expect(document.child(0).child(1).marks[0].type.name).toBe('strong');
    }
  });

  it('keeps explicit inline and block node rules authoritative over their subtrees', () => {
    const customSchema = new Schema(composeExtensions([CoreExtension, defineExtension({
      name: 'opaque-html-nodes',
      nodes: {
        preview: { inline: true, group: 'inline', atom: true, parseHTML: [{ tag: 'inline-preview' }] },
        card: { group: 'block', atom: true, parseHTML: [{ tag: 'block-preview' }] },
      },
    })]).schema);
    const source = '<inline-preview><p>Private rendered UI</p></inline-preview><block-preview><p>Other UI</p></block-preview>';
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const document = importer.parse(source, customSchema);
      expect(document.childCount).toBe(2);
      expect(document.child(0).child(0).type.name).toBe('preview');
      expect(document.child(1).type.name).toBe('card');
      expect(document.textContent).toBe('');
    }
    expect(ServerHTMLImporter.parseWithReport(source, customSchema).issues).toEqual([]);
  });
});

describe('structured table-cell HTML fidelity', () => {
  it.each(['\u00a0', '\u202f', '\ufeff'])('does not discard significant Unicode spacing %j between blocks', spacing => {
    const body = `<p>Before</p>${spacing}<p>After</p>`;
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const root = importer.parse(body, schema);
      expect(root.content.map(node => node.textContent)).toEqual(['Before', spacing, 'After']);
      const cell = importer.parse(`<table><tr><td>${body}</td></tr></table>`, schema).child(0).child(0).child(0);
      expect(cell.content.map(node => node.textContent)).toEqual(['Before', spacing, 'After']);
      const item = importer.parse(`<ul><li>${body}</li></ul>`, schema).child(0).child(0);
      expect(item.content.map(node => node.textContent)).toEqual(['Before', spacing, 'After']);
    }
  });

  it('keeps media, math, and portable custom blocks inside their cell', () => {
    const extended = new Schema({ ...schema.spec, nodes: { ...schema.spec.nodes, status_card: {
      group: 'block', atom: true,
      attrs: { label: { default: '', validate: value => typeof value === 'string' } },
      parseHTML: [{ tag: 'aside[data-status-card]', getAttrs: element => ({ label: element.getAttribute('data-label') ?? '' }) }],
      toDOM: node => ['aside', { 'data-status-card': '', 'data-label': node.attrs.label }, String(node.attrs.label)],
    } } });
    const doc = extended.node('doc', {}, [extended.node('table', {}, [extended.node('table_row', {}, [extended.node('table_cell', {}, [
      extended.node('image_super', { src: 'https://example.com/evidence.png', alt: 'Evidence', caption: 'Screenshot' }),
      extended.node('math_block', { latex: 'x^2', ariaLabel: 'Squared' }),
      extended.node('status_card', { label: 'Resolved' }),
    ])])])]);
    const html = HTMLExporter.export(doc, { document: false });
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      expect(importer.parse(html, extended).toJSON()).toEqual(doc.toJSON());
    }
  });

  it.each(['table_cell', 'table_header'])('preserves multiple blocks and nested tables in %s', cellType => {
    const p = (value: string) => schema.node('paragraph', {}, [schema.text(value)]);
    const nested = schema.node('table', {}, [schema.node('table_row', {}, [schema.node('table_cell', {}, [p('Nested cell')])])]);
    const content = [
      p('First paragraph'), p(''),
      schema.node('heading', { level: 3, align: 'right' }, [schema.text('Cell heading')]),
      schema.node('bullet_list', {}, [schema.node('list_item', {}, [p('List item'), p('Continuation')])]),
      schema.node('blockquote', {}, [p('Quoted note'), p('Second quoted paragraph')]),
      schema.node('code_block', { language: 'js', lineNumbers: true }, [schema.text('one()\n\ntwo()')]),
      nested,
    ];
    const doc = schema.node('doc', {}, [schema.node('table', {}, [schema.node('table_row', {}, [schema.node(cellType, { colspan: 2, colwidth: [100, 140] }, content)])])]);
    const html = HTMLExporter.export(doc, { document: false });
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      expect(importer.parse(html, schema).toJSON()).toEqual(doc.toJSON());
    }
  });

  it('retains footer rows, mixed inline/block cell content, alignment, and empty cells', () => {
    const html = '<table><thead><tr><th>Heading</th></tr></thead><tbody><tr><td style="text-align:center">Before<p style="text-align:right">Middle</p>After</td></tr><tr><td></td></tr></tbody><tfoot><tr><td>Footer</td></tr></tfoot></table>';
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const doc = importer.parse(html, schema);
      const table = doc.child(0);
      expect(table.childCount).toBe(4);
      const mixed = table.child(1).child(0);
      expect(mixed.content.map(node => node.textContent)).toEqual(['Before', 'Middle', 'After']);
      expect(mixed.content.map(node => node.attrs.align)).toEqual(['center', 'right', 'center']);
      expect(table.child(2).child(0).child(0).child(0).text).toBe('');
      expect(table.child(3).textContent).toBe('Footer');
    }
  });
});

describe('browser and server HTML semantic parity', () => {
  it.each(['strong', 'em', 'strike', 'code', 'underline', 'subscript', 'superscript', 'highlight'])('preserves empty %s formatting across HTML and Markdown', name => {
    const document = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('', [schema.marks[name].create()])])]);
    const html = HTMLExporter.export(document, { document: false });
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const imported = importer.parse(html, schema);
      expect(imported.toJSON()).toEqual(document.toJSON());
      expect(MarkdownImporter.parse(MarkdownExporter.export(imported), schema).toJSON()).toEqual(document.toJSON());
    }
  });

  it.each([
    ['<pre><code>literal</code></pre>', 'code_block'],
    ['<h2>Heading</h2>', 'heading'],
    ['<ul><li>Nested</li></ul>', 'bullet_list'],
  ])('does not invent a paragraph before a list-first %s block', (body, type) => {
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const document = importer.parse(`<ul><li>${body}</li></ul>`, schema);
      expect(document.child(0).child(0).childCount).toBe(1);
      expect(document.child(0).child(0).child(0).type.name).toBe(type);
      expect(MarkdownImporter.parse(MarkdownExporter.export(document), schema).toJSON()).toEqual(document.toJSON());
    }
  });

  it('preserves explicit blank list paragraphs and supplies a caret host only for empty items', () => {
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const document = importer.parse('<ul><li></li><li><p></p><pre><code>literal</code></pre></li></ul>', schema);
      expect(document.child(0).child(0).content.map(node => node.type.name)).toEqual(['paragraph']);
      expect(document.child(0).child(1).content.map(node => node.type.name)).toEqual(['paragraph', 'code_block']);
    }
  });

  it('keeps top-level text around inline markup and structural blocks', () => {
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const document = importer.parse('Before <strong>bold</strong> and <a href="/target">link</a>.<p>Middle</p>After', schema);
      expect(document.content.map(node => node.textContent)).toEqual(['Before bold and link.', 'Middle', 'After']);
      expect(document.child(0).content.find(node => node.text === 'bold')?.marks[0].type.name).toBe('strong');
      expect(document.child(0).content.find(node => node.text === 'link')?.marks[0].attrs.href).toBe('/target');
      expect(importer.parse(HTMLExporter.export(document, { document: false }), schema).toJSON()).toEqual(document.toJSON());
    }
  });

  it('retains unwrapped empty formatting as structural paragraphs', () => {
    for (const importer of [HTMLImporter, ServerHTMLImporter]) {
      const document = importer.parse('<strong></strong><p>After</p><em></em>', schema);
      expect(document.childCount).toBe(3);
      expect(document.child(0).child(0).marks[0].type.name).toBe('strong');
      expect(document.child(2).child(0).marks[0].type.name).toBe('em');
      expect(document.textContent).toBe('After');
      expect(MarkdownImporter.parse(MarkdownExporter.export(document), schema).toJSON()).toEqual(document.toJSON());
    }
  });

  it('preserves zero-length safe anchors without inventing links for missing or unsafe hrefs', () => {
    const sources = [
      '<a href="/target" title="Details"></a>',
      '<p>before <a href=""><em></em></a> after</p>',
      '<blockquote><a href="/target"></a></blockquote>',
    ];
    for (const html of sources) {
      for (const importer of [HTMLImporter, ServerHTMLImporter]) {
        const document = importer.parse(html, schema);
        const output = HTMLExporter.export(document, { document: false });
        expect(output).toContain('<a href=');
        expect(importer.parse(output, schema).toJSON()).toEqual(document.toJSON());
      }
      expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(HTMLImporter.parse(html, schema).toJSON());
    }
    for (const html of ['<a></a>', '<a href="javascript:alert(1)"></a>']) {
      for (const importer of [HTMLImporter, ServerHTMLImporter]) {
        expect(HTMLExporter.export(importer.parse(html, schema), { document: false })).not.toContain('<a ');
      }
    }
  });

  it.each(fixtures)('produces identical validated Fountain JSON for %s', (html) => {
    const browser = HTMLImporter.parse(html, schema);
    const server = ServerHTMLImporter.parseWithReport(html, schema);
    expect(server.issues).toEqual([]);
    expect(server.document.toJSON()).toEqual(browser.toJSON());
  });
});
