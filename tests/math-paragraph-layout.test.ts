// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { Schema, createEditor, type ParagraphLayout } from '../src/core';
import { StarterKit, composeExtensions, createMathExtension, createHistoryPlugin, setMathSource, undo } from '../src/extensions';
import { HTMLExporter, MarkdownExporter } from '../src';
import { ServerHTMLImporter } from '../src/html/server';
import { importDOCX, exportDOCX } from '../src/docx';

const kit = composeExtensions([...StarterKit.extensions, createMathExtension()]);
const schema = new Schema(kit.schema);
const layout: ParagraphLayout = { unit: 'pt', spacingBefore: 3, spacingAfter: 17, fontFamily: 'Georgia', fontSize: 13,
  lineHeight: 1.2, lineHeightUnit: 'multiple', lineHeightRule: 'auto', keepWithNext: true };
const equation = '<m:oMathPara><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></m:oMathPara>';
const source = (content = equation) => zipSync({ 'word/document.xml': strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body><w:p><w:pPr><w:spacing w:before="60" w:after="340" w:line="288" w:lineRule="auto"/><w:keepNext/><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="26"/></w:rPr></w:pPr>${content}</w:p></w:body></w:document>`) });

describe('display-equation paragraph context', () => {
  it('retains the real scientific source Normal-style spacing on both equation-only paragraphs', () => {
    expect(typeof globalThis.document).toBe('undefined');
    const result = importDOCX(readFileSync('tests/fixtures/native-docx/cooling-report.docx'), schema);
    const math = result.document.content.filter(node => node.type.name === 'math_block');
    expect(math).toHaveLength(2);
    for (const node of math) expect(node.attrs.layout).toMatchObject({ unit: 'pt', spacingBefore: 0, spacingAfter: 7,
      fontFamily: 'Arial', fontSize: 11, lineHeight: 1.15 });
  });

  it('retains direct equation paragraph declarations through JSON, safe HTML and native Word', () => {
    const imported = importDOCX(source(), schema).document;
    const before = imported.toJSON();
    expect(imported.child(0).attrs.layout).toMatchObject(layout);
    expect(ServerHTMLImporter.parse(HTMLExporter.export(imported), schema).toJSON()).toEqual(before);
    const exported = exportDOCX(imported);
    const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']!);
    expect(xml).toContain('<w:spacing w:before="60" w:after="340" w:line="288" w:lineRule="auto"/>');
    expect(importDOCX(exported.bytes, schema).document.child(0).attrs.layout).toMatchObject(layout);
    expect(imported.toJSON()).toEqual(before);
  });

  it('reports layout loss for a receiving math schema without the owning attribute', () => {
    const spec = kit.schema.nodes.math_block!;
    const { layout: omitted, ...attrs } = spec.attrs!;
    const receiving = new Schema({ ...kit.schema, nodes: { ...kit.schema.nodes, math_block: { ...spec, attrs } } });
    const result = importDOCX(source(), receiving);
    expect(result.document.child(0).type.name).toBe('math_block');
    expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'display-math-paragraph-layout-not-imported', path: [0] }));
  });

  it('does not duplicate one mixed paragraph layout onto every equation fragment', () => {
    const result = importDOCX(source(`<w:r><w:t>Before</w:t></w:r>${equation}<w:r><w:t>After</w:t></w:r>`), schema);
    expect(result.document.content.map(node => node.type.name)).toEqual(['paragraph', 'math_block', 'paragraph']);
    expect(result.document.child(1).attrs.layout).toBeUndefined();
    expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'display-math-paragraph-layout-not-imported', path: [0] }));
  });

  it.each([['ListNumber', 'ordered_list'], ['Quote', 'blockquote']])('retains the enclosing %s structure around an equation paragraph', (style, outer) => {
    const parts = unzipSync(source());
    parts['word/document.xml'] = strToU8(strFromU8(parts['word/document.xml']!).replace('<w:pPr>', `<w:pPr><w:pStyle w:val="${style}"/>`));
    const result = importDOCX(zipSync(parts), schema).document;
    expect(result.child(0).type.name).toBe(outer);
    const equationNode = outer === 'ordered_list' ? result.child(0).child(0).child(0) : result.child(0).child(0);
    expect(equationNode.type.name).toBe('math_block');
    expect(equationNode.attrs.layout).toMatchObject(layout);
  });

  it('retains native spacing identity while exposing the unsupported contextual math flow', () => {
    const equationNode = importDOCX(source(), schema).document.child(0);
    const nativeLayout = { ...equationNode.attrs.layout as ParagraphLayout, spacingGroup: 'Equation context', contextualSpacing: true };
    const doc = schema.node('doc', {}, [schema.node('math_block', { ...equationNode.attrs, layout: nativeLayout })]);
    const exported = exportDOCX(doc);
    const reopened = importDOCX(exported.bytes, schema);
    expect(reopened.document.child(0).attrs.layout).toMatchObject(nativeLayout);
    expect(reopened.report.issues).toContainEqual(expect.objectContaining({ code: 'paragraph-contextual-spacing-not-imported', path: [0] }));
  });

  it('keeps equation layout through source edits and restores the entire document on undo', () => {
    const doc = importDOCX(source(), schema).document;
    const editor = createEditor({ schema: kit.schema, content: doc.toJSON(), plugins: [createHistoryPlugin()] });
    try {
      const before = editor.state.doc.toJSON();
      expect(setMathSource(editor, 'y^2', undefined, [0])).toBe(true);
      expect(editor.state.doc.child(0).attrs.layout).toMatchObject(layout);
      expect(undo(editor)).toBe(true);
      expect(editor.state.doc.toJSON()).toEqual(before);
    } finally { editor.destroy(); }
  });

  it('reports ordinary Markdown layout loss while retaining equation source', () => {
    const doc = importDOCX(source(), schema).document;
    const exported = MarkdownExporter.exportWithReport(doc);
    expect(exported.markdown).toContain('x');
    expect(exported.losses).toContainEqual(expect.objectContaining({ path: [0], detail: expect.stringMatching(/math.*paragraph|equation.*paragraph/i) }));
  });

  it('rejects invalid layout while preserving the legacy shape when omitted', () => {
    expect(() => schema.node('math_block', { latex: 'x', layout: { unit: 'pt', spacingAfter: -1 } })).toThrow();
    expect(schema.node('math_block', { latex: 'x' }).attrs.layout).toBeUndefined();
    expect(schema.nodes.inline_math!.spec.attrs?.layout).toBeUndefined();
  });
});
