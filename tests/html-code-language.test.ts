// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, HTMLImporter, Schema } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

describe('HTML code language class tokens', () => {
  const schema = new Schema(CoreSchemaSpec);
  it('does not borrow a nested component language for the surrounding pre', () => {
    for (const parser of [HTMLImporter, ServerHTMLImporter]) {
      const html = '<pre><ul><li>notes<pre><code class="language-python">x</code></pre></li></ul></pre>';
      expect(parser.parse(html, schema).child(0).attrs.language).toBe('text');
      expect(parser.parse(html.replace('<pre>', '<pre data-language="log">'), schema).child(0).attrs.language).toBe('log');
    }
  });
  it.each(['c++', 'c#', 'objective-c', 'my.dsl', 'python', 'rust', 'x'.repeat(100)])('retains the complete %s label in both importers', language => {
    const html = `<pre><code class="highlight language-${language} another">x\n</code></pre>`;
    for (const parser of [HTMLImporter, ServerHTMLImporter]) {
      const block = parser.parse(html, schema).child(0);
      expect(block.attrs.language).toBe(language);
      expect(block.textContent).toBe('x\n');
    }
  });
  it.each(['not-language-python', 'notlanguage-python'])('does not invent a partial language from %s', className => {
    const html = `<pre><code class="${className}">x</code></pre>`;
    for (const parser of [HTMLImporter, ServerHTMLImporter]) {
      expect(parser.parse(html, schema).child(0).attrs.language).toBe('text');
    }
  });
  it.each([['x&amp;y', 'x&y'], ['x&quot;y', 'x"y'], ['&lt;script&gt;', '<script>']])('reads escaped %s as inert label data', (encoded, label) => {
    for (const parser of [HTMLImporter, ServerHTMLImporter]) {
      expect(parser.parse(`<pre><code class="language-${encoded}">x</code></pre>`, schema).child(0).attrs.language).toBe(label);
    }
  });
});
