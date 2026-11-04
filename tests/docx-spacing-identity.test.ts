// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { createEditor, isParagraphLayout, type Node, paragraphSpacingAt, resolveParagraphGap, Schema } from '../src/core';
import { HTMLExporter } from '../src/core/exporters/html-exporter';
import { StarterKit } from '../src/extensions';
import { importDOCX, exportDOCX } from '../src/docx';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const schema = new Schema(StarterKit.schema);
function layoutOf(node: Node) {
  const value = node.attrs.layout;
  if (!isParagraphLayout(value)) throw new Error('Expected a valid retained paragraph layout.');
  return value;
}
const paragraph = (text: string, style?: string, properties = '') => `<w:p><w:pPr>${style === undefined ? '' : `<w:pStyle w:val="${style}"/>`}${properties}</w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const style = (id: string, properties = '', extra = '') => `<w:style w:type="paragraph" w:styleId="${id}"${extra}><w:pPr>${properties}</w:pPr></w:style>`;
const spacing = '<w:spacing w:before="240" w:after="200"/>';
function source(body: string, styles?: string) {
  return zipSync({
    'word/document.xml': strToU8(`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`),
    ...(styles === undefined ? {} : {
      'word/styles.xml': strToU8(`<w:styles xmlns:w="${W}">${styles}</w:styles>`),
      'word/_rels/document.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    }),
  });
}
const contextualLoss = (result: ReturnType<typeof importDOCX>) => result.report.issues.filter(issue => issue.code === 'paragraph-contextual-spacing-not-imported');

describe('native Word paragraph identity joins the portable spacing model', () => {
  it.each([
    ['<w:contextualSpacing/>', '<w:contextualSpacing w:val="0"/>', 2],
    ['<w:contextualSpacing/>', '', 2],
    ['<w:contextualSpacing/>', '<w:contextualSpacing/>', 0],
    ['<w:contextualSpacing w:val="0"/>', '<w:contextualSpacing w:val="0"/>', 12],
  ])('retains declarations and resolves actual same-style gap (%s / %s)', (a, b, gap) => {
    expect(typeof document).toBe('undefined');
    const result = importDOCX(source(paragraph('One', 'Body', a) + paragraph('Two', 'Body', b), style('Body', spacing)), schema);
    const first = layoutOf(result.document.child(0)), second = layoutOf(result.document.child(1));
    expect(first.spacingGroup).toBeTruthy();
    expect(second.spacingGroup).toBe(first.spacingGroup);
    expect(second.spacingBefore).toBe(12);
    expect(first.spacingAfter).toBe(10);
    expect(paragraphSpacingAt(result.document, [1])?.spacingBefore).toBe(gap);
    expect(contextualLoss(result)).toEqual([]);
  });

  it.each(['Alias', 'body'])('does not conflate identical appearance or ancestry with identity: %s', other => {
    const shared = `${spacing}<w:contextualSpacing/>`;
    const definitions = style('Body', shared) + `<w:style w:type="paragraph" w:styleId="${other}"><w:basedOn w:val="Body"/></w:style>`;
    const result = importDOCX(source(paragraph('One', 'Body') + paragraph('Two', other), definitions), schema);
    expect(layoutOf(result.document.child(0)).spacingGroup).not.toBe(layoutOf(result.document.child(1)).spacingGroup);
    expect(paragraphSpacingAt(result.document, [1])?.spacingBefore).toBe(12);
  });

  it('joins an omitted pStyle with the actual declared default, not its parent', () => {
    const definitions = style('Base', spacing) + `<w:style w:type="paragraph" w:styleId="DefaultBody" w:default="1"><w:basedOn w:val="Base"/><w:pPr><w:contextualSpacing/></w:pPr></w:style>`;
    const result = importDOCX(source(paragraph('One') + paragraph('Two', 'DefaultBody') + paragraph('Three', 'Base'), definitions), schema);
    expect(layoutOf(result.document.child(0)).spacingGroup).toBe(layoutOf(result.document.child(1)).spacingGroup);
    expect(layoutOf(result.document.child(1)).spacingGroup).not.toBe(layoutOf(result.document.child(2)).spacingGroup);
    expect(paragraphSpacingAt(result.document, [1])?.spacingBefore).toBe(0);
    expect(resolveParagraphGap(layoutOf(result.document.child(1)), layoutOf(result.document.child(2)))).toBe(12);
  });

  it('keeps the unnamed default flow distinct from a real style when no default is declared', () => {
    const body = paragraph('One', undefined, spacing + '<w:contextualSpacing/>') + paragraph('Two', undefined, spacing) + paragraph('Three', 'Body');
    const result = importDOCX(source(body, style('Body', spacing)), schema);
    expect(paragraphSpacingAt(result.document, [1])?.spacingBefore).toBe(2);
    expect(resolveParagraphGap(layoutOf(result.document.child(1)), layoutOf(result.document.child(2)))).toBe(12);
    expect(layoutOf(result.document.child(0)).spacingGroup).not.toBe(layoutOf(result.document.child(2)).spacingGroup);
  });

  it('resolves direct rules even without a styles part', () => {
    const result = importDOCX(source(paragraph('One', undefined, spacing + '<w:contextualSpacing/>') + paragraph('Two', undefined, spacing)), schema);
    expect(paragraphSpacingAt(result.document, [1])?.spacingBefore).toBe(2);
    expect(contextualLoss(result)).toEqual([]);
  });

  it('does not introduce a spacing group when no member of that style has a declaration', () => {
    const result = importDOCX(source(paragraph('One', 'Body') + paragraph('Two', 'Body'), style('Body', spacing)), schema);
    expect(result.document.content.map(node => layoutOf(node).spacingGroup)).toEqual([undefined, undefined]);
    expect(result.document.content.map(node => layoutOf(node).spacingAfter)).toEqual([10, 10]);
    expect(contextualLoss(result)).toEqual([]);
  });

  it('keeps table-cell flows isolated while resolving same-style neighbours inside a cell', () => {
    const cells = `<w:tbl><w:tr><w:tc>${paragraph('Cell one', 'Body')}${paragraph('Cell two', 'Body')}</w:tc></w:tr></w:tbl>`;
    const result = importDOCX(source(paragraph('Before', 'Body') + cells + paragraph('After', 'Body'), style('Body', spacing + '<w:contextualSpacing/>')), schema);
    expect(paragraphSpacingAt(result.document, [0])?.spacingAfter).toBe(10);
    expect(paragraphSpacingAt(result.document, [1, 0, 0, 0])?.spacingBefore).toBe(12);
    expect(paragraphSpacingAt(result.document, [1, 0, 0, 1])?.spacingBefore).toBe(0);
    expect(paragraphSpacingAt(result.document, [2])?.spacingBefore).toBe(12);
  });

  it('reports a host carrier without the paragraph-flow contract while retaining its rule data', () => {
    const custom = new Schema({ ...StarterKit.schema, nodes: { ...StarterKit.schema.nodes,
      paragraph: { ...StarterKit.schema.nodes.paragraph!, paragraphFlow: 'isolated' } } });
    const result = importDOCX(source(paragraph('One', 'Body') + paragraph('Two', 'Body'), style('Body', spacing + '<w:contextualSpacing/>')), custom);
    expect(result.document.child(0).attrs.layout).toMatchObject({ contextualSpacing: true, spacingGroup: 'word:style:Body' });
    expect(contextualLoss(result).map(issue => issue.path)).toEqual([[0], [1]]);
  });

  it('reports Word quote adjacency across separate isolated quote containers as unfinished', () => {
    const result = importDOCX(source(paragraph('One', 'Quote') + paragraph('Two', 'Quote'), style('Quote', spacing + '<w:contextualSpacing/>')), schema);
    expect(result.document.content.map(node => node.type.name)).toEqual(['blockquote', 'blockquote']);
    expect(layoutOf(result.document.child(0).child(0)).contextualSpacing).toBe(true);
    expect(contextualLoss(result).map(issue => issue.path)).toEqual([[0], [1]]);
  });

  it('reports an image-only paragraph rule lost when the image becomes a block', () => {
    const image = schema.node('image_super', { src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==' });
    const archive = unzipSync(exportDOCX(schema.node('doc', {}, [image])).bytes);
    const xml = strFromU8(archive['word/document.xml']!);
    expect(xml).toContain('<w:pPr>');
    archive['word/document.xml'] = strToU8(xml.replace('<w:pPr>', '<w:pPr><w:contextualSpacing/>'));
    const result = importDOCX(zipSync(archive), schema);
    expect(result.document.child(0).type.name).toBe('image_super');
    expect(result.document.child(0).attrs.src).toBe(image.attrs.src);
    expect(contextualLoss(result).map(issue => issue.path)).toEqual([[0]]);
  });

  it('reports a contextual paragraph split by a page break instead of claiming shared identity is preserved', () => {
    const splitSchema = new Schema({ ...StarterKit.schema, nodes: { ...StarterKit.schema.nodes, page_break: { group: 'block', atom: true } } });
    const body = `<w:p><w:pPr>${spacing}<w:contextualSpacing/></w:pPr><w:r><w:t>One</w:t><w:br w:type="page"/><w:t>Two</w:t></w:r></w:p>`;
    const result = importDOCX(source(body), splitSchema);
    expect(result.document.content.map(node => node.type.name)).toEqual(['paragraph', 'page_break', 'paragraph']);
    expect(contextualLoss(result).map(issue => issue.path)).toEqual([[0]]);
  });

  it.each(['研究 🧪', '__proto__', 'constructor'])('retains a valid opaque identity %s', id => {
    const result = importDOCX(source(paragraph('One', id) + paragraph('Two', id), style(id, spacing + '<w:contextualSpacing/>')), schema);
    expect(layoutOf(result.document.child(0)).spacingGroup).toBeTruthy();
    expect(paragraphSpacingAt(result.document, [1])?.spacingBefore).toBe(0);
  });

  it.each([undefined, style('Known', spacing)])('reports unresolved explicit style identity rather than inventing a group', definitions => {
    const result = importDOCX(source(paragraph('One', 'Missing', spacing + '<w:contextualSpacing/>'), definitions), schema);
    expect(layoutOf(result.document.child(0)).spacingGroup).toBeUndefined();
    expect(contextualLoss(result).map(issue => issue.path)).toEqual([[0]]);
  });

  it('also reports an explicit off declaration when its unresolved style identity cannot be retained', () => {
    const result = importDOCX(source(paragraph('One', 'Missing', spacing + '<w:contextualSpacing w:val="0"/>')), schema);
    expect(layoutOf(result.document.child(0)).spacingGroup).toBeUndefined();
    expect(contextualLoss(result).map(issue => issue.path)).toEqual([[0]]);
  });

  it('preserves a native same-style relationship through editing, JSON, HTML and native export/reopen', () => {
    const result = importDOCX(source(paragraph('One', 'Body', '<w:contextualSpacing/>') + paragraph('Two', 'Body'), style('Body', spacing)), schema);
    const editor = createEditor({ schema: StarterKit.schema, content: result.document.toJSON() });
    try {
      const before = editor.state.doc.toJSON();
      expect(paragraphSpacingAt(editor.state.doc, [1])?.spacingBefore).toBe(2);
      editor.dispatch(editor.createTransaction().setNodeAttrs([0], { ...editor.state.doc.child(0).attrs,
        layout: { ...layoutOf(editor.state.doc.child(0)), contextualSpacing: false } }));
      expect(paragraphSpacingAt(editor.state.doc, [1])?.spacingBefore).toBe(12);
      expect(before.content?.[1]?.attrs?.layout).toEqual(editor.state.doc.child(1).attrs.layout);
      expect(editor.state.schema.nodeFromJSON(editor.state.doc.toJSON()).eq(editor.state.doc)).toBe(true);
      expect(new HTMLExporter().export(editor.state.doc)).toContain('margin-block-start:12pt');
      const word = exportDOCX(editor.state.doc);
      expect(word.report.issues.filter(issue => issue.code === 'paragraph-contextual-spacing-not-exported')).toEqual([]);
      expect(paragraphSpacingAt(importDOCX(word.bytes, schema).document, [1])?.spacingBefore).toBe(12);
    } finally { editor.destroy(); }
  });

  it('represents the retained paper list rule without rewriting its 7 pt declarations', () => {
    const result = importDOCX(readFileSync('tests/fixtures/native-docx/cooling-report.docx'), schema);
    const index = result.document.content.findIndex(node => node.type.name === 'ordered_list');
    const list = result.document.child(index);
    expect(list.childCount).toBe(3);
    const group = layoutOf(list.child(0).child(0)).spacingGroup;
    expect(group).toBeTruthy();
    for (let item = 0; item < 3; item++) {
      expect(list.child(item).child(0).attrs.layout).toMatchObject({ spacingAfter: 7, spacingGroup: group, contextualSpacing: true });
      if (item) expect(paragraphSpacingAt(result.document, [index, item, 0])?.spacingBefore).toBe(0);
    }
    expect(contextualLoss(result)).toEqual([]);
  });
});
