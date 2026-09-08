// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, HTMLImporter, Schema } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

describe('HTML code language class tokens', () => {
  const schema = new Schema(CoreSchemaSpec);
  it.each(['c++', 'c#', 'objective-c', 'my.dsl', 'python', 'rust'])('retains the complete %s label in both importers', language => {
    const html = `<pre><code class="highlight language-${language} another">x\n</code></pre>`;
    for (const parser of [HTMLImporter, ServerHTMLImporter]) {
      const block = parser.parse(html, schema).child(0);
      expect(block.attrs.language).toBe(language);
      expect(block.textContent).toBe('x\n');
    }
  });
  it.each(['not-language-python', `language-${'x'.repeat(51)}`, 'language-x&amp;y'])('does not invent a partial language from %s', className => {
    const html = `<pre><code class="${className}">x</code></pre>`;
    for (const parser of [HTMLImporter, ServerHTMLImporter]) {
      expect(parser.parse(html, schema).child(0).attrs.language).toBe('text');
    }
  });
});
