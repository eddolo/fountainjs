// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { CoreSchemaSpec, HTMLExporter, HTMLImporter, MarkdownExporter, MarkdownImporter, Schema } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(CoreSchemaSpec);

it('traverses deeply nested browser pre content without a recursive text walk', () => {
  const html = '<pre>' + '<span>'.repeat(1500) + 'first<br>second' + '</span>'.repeat(1500) + '</pre>';
  expect(HTMLImporter.parse(html, schema).textContent).toBe('first\nsecond');
});
const cases = [
  ['<pre>first<br>second</pre>', 'first\nsecond'],
  ['<pre>first<br>\nsecond</pre>', 'first\n\nsecond'],
  ['<pre><br>second<br></pre>', '\nsecond\n'],
  ['<pre>\nfirst<br><br>second\n</pre>', 'first\n\nsecond\n'],
  ['<pre><code>first<br>second</code></pre>', 'first\nsecond'],
  ['<pre><span>first<br></span><em>second</em></pre>', 'first\nsecond'],
  ['<pre>&lt;br&gt; &amp; \t😀<br>&#13;\nend</pre>', '<br> & \t😀\n\r\nend'],
  ['<pre>first<!-- private-token --><br>second</pre>', 'first\nsecond'],
] as const;

for (const [name, importer] of [['browser', HTMLImporter], ['server', ServerHTMLImporter]] as const) {
  describe(`${name} plain preformatted HTML projection`, () => {
    it.each(cases)('keeps explicit line breaks: %s', (html, expected) => {
      const doc = importer.parse(html, schema);
      expect(doc.child(0).type.name).toBe('code_block');
      expect(doc.child(0).textContent).toBe(expected);
      expect(importer.parse(HTMLExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
    });

    it('keeps actual code literal instead of interpreting encoded HTML', () => {
      const doc = importer.parse('<pre><code>&lt;br&gt;\n&lt;em&gt;literal&lt;/em&gt;</code></pre>', schema);
      expect(doc.textContent).toBe('<br>\n<em>literal</em>');
    });
  });
}

describe('preformatted projection reports and protected Markdown', () => {
  it.each(['<em>important</em>', '<a href="/private-destination">link</a>', '<span style="color:red">colored</span>', '<div>block</div>', '<!-- private-token -->', '<img src="private-resource">'])
    ('reports unsupported child markup without leaking source: %s', child => {
      const result = ServerHTMLImporter.parseWithReport(`<pre>before ${child} after</pre>`, schema);
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'preformatted-html-projection' }));
      expect(JSON.stringify(result.issues)).not.toMatch(/private-token|private-destination|private-resource/);
    });

  it('keeps ordinary canonical code imports free of projection warnings', () => {
    for (const html of ['<pre>plain\ncode</pre>', '<pre><code class="language-js">plain\ncode</code></pre>']) {
      expect(ServerHTMLImporter.parseWithReport(html, schema).issues).toEqual([]);
    }
  });

  it.each(['style="color:red"', 'class="private-class"', 'id="private-id"', 'title="private-title"'])
    ('reports unrepresented pre attributes without disclosing values: %s', attributes => {
      const result = ServerHTMLImporter.parseWithReport(`<pre ${attributes}>plain</pre>`, schema);
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'preformatted-html-projection' }));
      expect(JSON.stringify(result.issues)).not.toMatch(/private-class|private-id|private-title|color:red/);
    });

  it('bounds repeated projection reports', () => {
    const result = ServerHTMLImporter.parseWithReport('<pre>first<br><em>second</em></pre>'.repeat(100), schema);
    expect(result.document.childCount).toBe(100);
    expect(result.issues.filter(issue => issue.code === 'preformatted-html-projection')).toHaveLength(1);
    expect(Object.isFrozen(result.issues[0])).toBe(true);
  });

  it('keeps raw HTML breaks distinct from an adjacent real LF in Markdown flow', () => {
    const source = '<div><pre>\n\none<br>\ntwo\n\n</pre></div>\n';
    const fallback = vi.fn();
    const result = MarkdownImporter.parseWithSource(source, schema, {
      parseHTMLFlow: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: fallback,
    });
    expect(fallback).not.toHaveBeenCalled();
    expect(result.document.child(0).type.name).toBe('code_block');
    expect(result.document.child(0).textContent).toBe('one\n\ntwo\n');
    expect(MarkdownExporter.exportWithSource(result.document, result.source).markdown).toBe(source);
  });
});
