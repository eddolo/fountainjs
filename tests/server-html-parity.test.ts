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
