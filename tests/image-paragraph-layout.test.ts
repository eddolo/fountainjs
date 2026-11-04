// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { createEditor, createImageNode, Schema, type ParagraphLayout } from '../src/core';
import { HTMLExporter, MarkdownExporter, createHistoryPlugin, undo } from '../src';
import { StarterKit } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';
import { exportDOCX, importDOCX } from '../src/docx';

const schema = new Schema(StarterKit.schema);
const fixture = readFileSync('tests/fixtures/native-docx/cooling-report.docx');
const sourceParts = unzipSync(fixture);
const asset = Object.keys(sourceParts).find(path => /^word\/media\/.*\.png$/.test(path))!;
const src = `data:image/png;base64,${Buffer.from(sourceParts[asset]!).toString('base64')}`;
const imageLayout: ParagraphLayout = { unit: 'pt', fontFamily: 'Georgia', fontSize: 13, spacingBefore: 2, spacingAfter: 9,
  lineHeight: 1.15, lineHeightUnit: 'multiple', lineHeightRule: 'auto', keepWithNext: true };
const captionLayout: ParagraphLayout = { unit: 'pt', fontFamily: 'Arial', fontSize: 10, spacingBefore: 3, spacingAfter: 14 };
const image = (attrs: Record<string, unknown> = {}) => schema.node('image_super', { src, ...attrs });
const doc = (attrs: Record<string, unknown> = {}) => schema.node('doc', {}, [image(attrs)]);

describe('portable image-paragraph layout', () => {
  it('retains the actual Word image paragraph separately from its caption', () => {
    expect(typeof globalThis.document).toBe('undefined');
    const document = importDOCX(fixture, schema).document;
    const images = document.content.filter(node => node.type.name === 'image_super');
    expect(images).toHaveLength(2);
    for (const node of images) {
      expect(node.attrs.imageLayout).toMatchObject({ unit: 'pt', fontFamily: 'Arial', fontSize: 11, spacingBefore: 0, spacingAfter: 7,
        lineHeight: 1.15, lineHeightUnit: 'multiple', lineHeightRule: 'auto' });
      expect(node.attrs.captionLayout).toMatchObject({ spacingAfter: 7, lineHeight: 1 });
    }
  });

  it('preserves independent image/caption geometry through safe HTML without a browser', () => {
    const source = doc({ imageLayout, captionLayout, caption: 'Actual scientific figure' });
    const before = source.toJSON();
    const html = HTMLExporter.export(source, { document: false });
    expect(/<img [^>]*data-fountain-paragraph-layout=/.test(html)).toBe(true);
    expect(html).toContain('margin-block-end:9pt');
    expect(html).toContain('margin-block-end:14pt');
    expect(ServerHTMLImporter.parse(html, schema).eq(source)).toBe(true);
    expect(source.toJSON()).toEqual(before);
  });

  it('writes the image paragraph declarations natively instead of fixed export spacing', () => {
    const source = doc({ imageLayout, captionLayout, caption: 'Two different paragraph contexts' });
    const before = source.toJSON();
    const exported = exportDOCX(source);
    const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']!);
    expect(xml).toContain('<w:spacing w:before="40" w:after="180" w:line="276" w:lineRule="auto"/>');
    expect(xml).toContain('<w:spacing w:before="60" w:after="280"/>');
    const reopened = importDOCX(exported.bytes, schema).document.child(0);
    expect(reopened.attrs.imageLayout).toMatchObject(imageLayout);
    expect(reopened.attrs.captionLayout).toMatchObject(captionLayout);
    expect(reopened.attrs.src).toBe(src);
    expect(reopened.content.map(node => node.textContent).join('') || reopened.attrs.caption).toBe('Two different paragraph contexts');
    expect(source.toJSON()).toEqual(before);
  });

  it('retains fractional native figure dimensions instead of quantizing to CSS pixels', () => {
    const source = doc({ width: '566.4px', height: '181.247979px', imageLayout });
    const exported = exportDOCX(source);
    const parts = unzipSync(exported.bytes);
    const xml = strFromU8(parts['word/document.xml']!);
    expect(strFromU8(sourceParts['word/document.xml']!).includes('<wp:extent cx="5394960" cy="1726387"/>')).toBe(true);
    expect(xml).toContain('<wp:extent cx="5394960" cy="1726387"/>');
    const reopened = importDOCX(exported.bytes, schema).document.child(0);
    expect(reopened.attrs).toMatchObject({ width: '566.4px', height: '181.247979px' });
    const second = strFromU8(unzipSync(exportDOCX(schema.node('doc', {}, [reopened])).bytes)['word/document.xml']!);
    expect(second).toContain('<wp:extent cx="5394960" cy="1726387"/>');
  });

  it('retains an opaque image group natively while reporting the unimplemented browser flow projection', () => {
    const layout = { ...imageLayout, spacingGroup: 'Image body', contextualSpacing: true };
    const exported = exportDOCX(doc({ imageLayout: layout }));
    const reopened = importDOCX(exported.bytes, schema);
    expect(reopened.document.child(0).attrs.imageLayout).toMatchObject(layout);
    expect(reopened.report.issues.filter(issue => issue.code === 'paragraph-contextual-spacing-not-imported')).toContainEqual(
      expect.objectContaining({ path: [0], message: expect.stringMatching(/image/i) }));
    expect(strFromU8(unzipSync(exported.bytes)['word/document.xml']!)).toContain('<w:contextualSpacing w:val="1"/>');
  });

  it('reports image paragraph formatting when the receiving schema cannot retain it', () => {
    const definition = StarterKit.schema.nodes.image_super!;
    const { imageLayout: ignored, ...attrs } = definition.attrs!;
    const legacy = new Schema({ ...StarterKit.schema, nodes: { ...StarterKit.schema.nodes, image_super: { ...definition, attrs } } });
    const result = importDOCX(fixture, legacy);
    expect(result.document.content.filter(node => node.type.name === 'image_super')).toHaveLength(2);
    expect(result.report.issues.filter(issue => issue.code === 'image-paragraph-layout-not-imported')).toHaveLength(2);
  });

  it.each([{ unit: 'px' }, { unit: 'pt', spacingAfter: -1 }, { unit: 'pt', contextualSpacing: true }, { unit: 'pt', fontFamily: 'x; color:red' }])('rejects invalid image paragraph geometry %j', layout => {
    expect(() => doc({ imageLayout: layout })).toThrow();
  });

  it('keeps legacy documents unchanged when image layout is omitted and restores layout edits through history', () => {
    const source = doc();
    const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: source.toJSON() });
    try {
      editor.dispatch(editor.createTransaction().setNodeAttrs([0], { ...editor.state.doc.child(0).attrs, imageLayout }));
      expect(editor.state.doc.child(0).attrs.imageLayout).toEqual(imageLayout);
      expect(undo(editor)).toBe(true);
      expect(editor.state.doc.toJSON()).toEqual(source.toJSON());
      expect(source.child(0).attrs.imageLayout).toBeUndefined();
    } finally { editor.destroy(); }
  });

  it('explicitly reports the image paragraph geometry omitted by ordinary Markdown', () => {
    const result = MarkdownExporter.exportWithReport(doc({ imageLayout }));
    expect(result.losses).toContainEqual(expect.objectContaining({ path: [0], detail: expect.stringMatching(/image paragraph/i) }));
  });

  it('exposes image/caption paragraph contexts through the supplied block-image factory', () => {
    const editor = createEditor({ schema: StarterKit.schema });
    try {
      const created = createImageNode(editor, { src, imageLayout, captionLayout, captionAlign: 'right' });
      expect(created?.attrs).toMatchObject({ imageLayout, captionLayout, captionAlign: 'right' });
      expect(createImageNode(editor, { src, imageLayout }, true)).toBeNull();
      expect(createImageNode(editor, { src, imageLayout: { unit: 'pt', spacingAfter: -1 } })).toBeNull();
    } finally { editor.destroy(); }
  });
});
