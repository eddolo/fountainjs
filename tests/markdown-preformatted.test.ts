import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec } from '../src/extensions';
import { MarkdownExporter, MarkdownImporter, Schema } from '../src/headless';
import { ServerHTMLImporter } from '../src/html/server';
import type { MarkdownHTMLInlineSegment } from '../src/core/importers/markdown-importer';

describe('source-aware paragraph preformatted projection', () => {
  const schema = new Schema(CoreSchemaSpec);
  const options = { parseHTMLParagraph: ServerHTMLImporter.parseParagraph };

  it.each([
    ['A <pre>one\ntwo</pre> end', 'one\ntwo'],
    ['A <pre>\none\ntwo</pre> end', 'one\ntwo'],
    ['A <pre><code>\none\ntwo</code></pre> end', '\none\ntwo'],
    ['A <pre>**bold** and *em*</pre> end', 'bold and em'],
    ['A <pre>a &amp; b &#10; c</pre> end', 'a & b \n c'],
    ['A <pre>  one\t two  </pre> end', '  one\t two  '],
    ['A <pre><span>\none</span></pre> end', '\none'],
    ['A <pre>&#13;one&#13;&#10;two</pre> end', 'one\ntwo'],
    ['A <pre>&#10;&#10;one</pre> end', '\none'],
  ])('preserves preformatted text for %s', (source, expected) => {
    for (const ending of ['\n', '\r\n']) {
      const input = source.replaceAll('\n', ending);
      const captured = MarkdownImporter.parseWithSource(input, schema, options);
      expect(captured.document.content.find(node => node.type.name === 'code_block')?.textContent).toBe(expected);
      expect(MarkdownExporter.exportWithSource(captured.document, captured.source).markdown).toBe(input);
      schema.validate(captured.document);
    }
  });

  it('leaves physical soft breaks outside preformatted scopes as normal spaces', () => {
    const doc = MarkdownImporter.parse('Before\nline <pre>code\nline</pre> After\nline', schema, options);
    expect(doc.content.map(node => node.textContent)).toEqual(['Before line ', 'code\nline', ' After line', '']);
  });

  it('restores soft breaks nested in Markdown emphasis and retains text marks', () => {
    const doc = MarkdownImporter.parse('A <pre>**first\nsecond**</pre> end', schema, options);
    const code = doc.child(1);
    expect(code.textContent).toBe('first\nsecond');
    expect(code.content.every(node => node.marks.some(mark => mark.type.name === 'strong'))).toBe(true);
  });

  it('preserves repeated text-node positions, reports code export semantics, and rejects fake soft breaks', () => {
    const text = schema.text('kept', [schema.marks.strong.create()]);
    const html = (value: string): MarkdownHTMLInlineSegment => ({ kind: 'html', html: value, marks: [] });
    const result = new ServerHTMLImporter().parseParagraphWithReport([html('<pre>'), { kind: 'node', node: text }, { kind: 'node', node: text }, html('</pre>')], schema);
    const code = result.nodes.find(node => node.type.name === 'code_block')!;
    expect(code.content).toHaveLength(2);
    expect(code.content.every(node => node.text === 'kept' && node.marks[0].type.name === 'strong')).toBe(true);
    expect(result.issues.some(issue => issue.code === 'preformatted-html-projection')).toBe(true);
    expect(() => ServerHTMLImporter.parseParagraph([{ kind: 'node', node: text, softBreak: true }], schema)).toThrow(/soft-break/);
  });

  it.each(['<script>x</script>', '<textarea>x</textarea>', '<svg>x</svg>', '<pre>![x](image.png)</pre>', '<pre>a  \nb</pre>'])('retains complete fallback for unsupported structure: %s', body => {
    const source = `A ${body} end`;
    const reasons: string[] = [];
    const doc = MarkdownImporter.parse(source, schema, { ...options, onHTMLParagraphFallback: issue => reasons.push(issue.reason) });
    expect(doc.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
    expect(reasons).toEqual(['error']);
  });

  it('keeps the default and inline-only paths inert', () => {
    const source = 'A <pre>one\ntwo</pre> end';
    expect(MarkdownImporter.parse(source, schema, { parseHTMLInline: ServerHTMLImporter.parseInline }).toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
    expect(typeof document).toBe('undefined');
  });

  it('keeps both sides literal when pre crosses a Markdown paragraph boundary', () => {
    const source = 'A <pre>first\n\nsecond</pre> end';
    const reasons: string[] = [];
    const doc = MarkdownImporter.parse(source, schema, { ...options, onHTMLParagraphFallback: issue => reasons.push(issue.message) });
    expect(doc.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
    expect(reasons).toHaveLength(2);
    expect(doc.textContent).toContain('</pre>');
  });

  it('preserves private text attributes when restoring a soft break', () => {
    const node = schema.text(' ').withAttrs({ privatePayload: { stableId: 'line-1', tags: ['keep'] } });
    const result = ServerHTMLImporter.parseParagraph([
      { kind: 'html', html: '<pre>', marks: [] },
      { kind: 'html', html: '<code>', marks: [] },
      { kind: 'node', node, softBreak: true },
      { kind: 'html', html: '</code>', marks: [] },
      { kind: 'html', html: '</pre>', marks: [] },
    ], schema);
    const restored = result.find(node => node.type.name === 'code_block')!.child(0);
    expect(restored.text).toBe('\n');
    expect(restored.attrs).toEqual(node.attrs);
  });
});
