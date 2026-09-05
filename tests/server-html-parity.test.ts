// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import {
  CoreExtension,
  HTMLImporter,
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
];

describe('browser and server HTML semantic parity', () => {
  it.each(fixtures)('produces identical validated Fountain JSON for %s', (html) => {
    const browser = HTMLImporter.parse(html, schema);
    const server = ServerHTMLImporter.parseWithReport(html, schema);
    expect(server.issues).toEqual([]);
    expect(server.document.toJSON()).toEqual(browser.toJSON());
  });
});
