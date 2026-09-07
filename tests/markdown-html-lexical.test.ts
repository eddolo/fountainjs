import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, HTMLExporter, MarkdownExporter, MarkdownImporter, Schema } from '../src';
import { markdownHTMLBlock, markdownHTMLTokenEnd } from '../src/core/markdown-html';

describe('shared CommonMark raw HTML token grammar', () => {
  it.each([
    '<custom-tag>', '</custom-tag\t>', '<a disabled _name zoop:33=value />',
    '<a x="one > two" y=\'three < four\'>', '<a\nx =\n"value">',
    '<a x=\u00a0>', '<a x=\f>', '<a\r\nx="line\n\ncontent">',
    '<!-->', '<!--->', '<!-- a -- b -->', '<?target value?>',
    '<!element value>', '<![CDATA[<a> & *text*]]>',
  ])('recognizes exactly one valid token: %j', token => {
    expect(markdownHTMLTokenEnd(`prefix ${token} suffix`, 7)).toBe(7 + token.length);
  });

  it.each([
    '<a x=="value">', '</a x="value">', '<a x="value"y="next">',
    '<a x=>', '<a / >', '<a\u00a0x="value">', '<a\fx="value">',
    '<a\n\nx="value">', '<a x\n\n="value">', '<a x=\n\nvalue>',
    '<a x="unterminated>', '<3tag>', '<a x=`value`>', '</a/>',
  ])('does not hide Markdown behind malformed HTML: %j', token => {
    expect(markdownHTMLTokenEnd(token, 0)).toBe(-1);
  });

  it('shares the complete-tag grammar with type-7 block boundaries', () => {
    expect(markdownHTMLBlock('<custom x=\u00a0>')?.kind).toBe(7);
    expect(markdownHTMLBlock('<custom x=="value">')).toBeNull();
    expect(markdownHTMLBlock('<custom> trailing')).toBeNull();
    expect(markdownHTMLBlock('<custom>', true)).toBeNull();
    // Type 6 deliberately needs only a known block-tag prefix, not a valid
    // complete tag. Do not accidentally tighten the different block contract.
    expect(markdownHTMLBlock('<div x=="value">')?.kind).toBe(6);
  });

  it('scans long attribute sequences without regex backtracking or recursive descent', () => {
    const prefix = `<custom${' data-value="safe > text"'.repeat(10_000)}`;
    expect(markdownHTMLTokenEnd(`${prefix}>`, 0)).toBe(prefix.length + 1);
    expect(markdownHTMLTokenEnd(`${prefix} broken=`, 0)).toBe(-1);
  });

  const schema = new Schema(CoreSchemaSpec);
  it.each(['<a x=="*emphasis*">', '</a x="*emphasis*">', '<a x="one"y="*emphasis*">'])('parses emphasis inside ordinary malformed-tag text: %s', token => {
    const source = `Before ${token} after`;
    const doc = MarkdownImporter.parse(source, schema);
    const emphasis = doc.child(0).content.filter(node => node.marks.some(mark => mark.type.name === 'em'));
    expect(emphasis.map(node => node.textContent)).toEqual(['emphasis']);
    expect(HTMLExporter.export(doc, { document: false })).not.toContain('<a ');
    expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
    const captured = MarkdownImporter.parseWithSource(source, schema);
    expect(MarkdownExporter.exportWithSource(captured.document, captured.source).markdown).toBe(source);
  });

  it.each(['<!-->', '<!--->', '<!element *opaque*>', '<a x="*opaque*">'])('ends an opaque token before following emphasis: %s', token => {
    const doc = MarkdownImporter.parse(`Before ${token} *visible* after`, schema);
    expect(doc.child(0).content.filter(node => node.marks.some(mark => mark.type.name === 'em')).map(node => node.textContent)).toEqual(['visible']);
    expect(doc.textContent).toBe(`Before ${token} visible after`);
  });
});
