// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, HistoryExtension, HTMLExporter, HTMLImporter, MarkdownExporter, Schema, Selection,
  composeExtensions, createEditor, setBlockType, splitBlock, undo } from '../src';
import { ServerHTMLImporter } from '../src/html/server';
import { createYjsCollaborationExtension } from '../src/yjs';

const kit = composeExtensions([CoreExtension, HistoryExtension]);
const schema = new Schema(kit.schema);
const layout = Object.freeze({
  unit: 'pt' as const,
  fontFamily: 'Times New Roman',
  fontSize: 14,
  spacingBefore: 18,
  spacingAfter: 8,
  lineHeight: 1.15,
  lineHeightUnit: 'multiple' as const,
  lineHeightRule: 'auto' as const,
  indentStart: 24,
  hangingIndent: 12,
  keepWithNext: true,
  keepLinesTogether: false,
  pageBreakBefore: false,
  background: '#f2eff8',
  borders: Object.freeze({ left: Object.freeze({ style: 'solid' as const, color: '#7047ff', width: 2.25, space: 12 }) }),
});

describe('portable paragraph layout', () => {
  it('renders a generic typed value and round-trips it through browser and DOM-free HTML', () => {
    const source = schema.node('doc', {}, [schema.node('paragraph', { layout }, [schema.text('Layout')])]);
    const html = HTMLExporter.export(source, { document: false });
    expect(html).toContain('data-fountain-paragraph-layout=');
    expect(html).toContain('margin-block-start:18pt');
    expect(html).toContain('font-family:&quot;Times New Roman&quot;;font-size:14pt');
    expect(html).toContain('border-left:2.25pt solid #7047ff');
    expect(html).toContain('break-after:avoid;page-break-after:avoid');
    expect(HTMLImporter.parse(html, schema).toJSON()).toEqual(source.toJSON());
    expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(source.toJSON());
  });

  it('rejects invalid values and ignores malformed or hostile HTML metadata', () => {
    expect(() => schema.node('paragraph', { layout: { unit: 'px' } })).toThrow(/layout/);
    expect(() => schema.node('paragraph', { layout: { unit: 'pt', firstLineIndent: 4, hangingIndent: 4 } })).toThrow(/layout/);
    for (const fontFamily of ['Arial; color:red', '"Arial"', 'Arial,serif', 'url(example.com)']) {
      expect(() => schema.node('paragraph', { layout: { unit: 'pt', fontFamily } })).toThrow(/layout/);
    }
    for (const fontSize of [0, 385, NaN, Infinity, '12pt']) {
      expect(() => schema.node('paragraph', { layout: { unit: 'pt', fontSize } })).toThrow(/layout/);
    }
    expect(() => schema.node('paragraph', { layout: { unit: 'pt', borders: { left: { style: 'dashed', color: '#000000', width: 1 } } } })).toThrow(/layout/);
    const imported = HTMLImporter.parse('<p data-fountain-paragraph-layout="{&quot;unit&quot;:&quot;pt&quot;,&quot;background&quot;:&quot;javascript:alert(1)&quot;}">Safe</p>', schema);
    expect(imported.child(0).attrs.layout).toBeUndefined();
  });

  it('preserves layout through heading Enter, block conversion and undo', () => {
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins,
      content: schema.node('doc', {}, [schema.node('heading', { level: 1, layout }, [schema.text('AlphaBeta')])]).toJSON() });
    try {
      editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 5)));
      expect(splitBlock(editor)).toBe(true);
      expect(editor.state.doc.child(1).attrs.layout).toEqual(layout);
      expect(setBlockType(editor, 'heading', { level: 2 })).toBe(true);
      expect(editor.state.doc.child(1).attrs.layout).toEqual(layout);
      expect(undo(editor)).toBe(true);
      expect(editor.state.doc.child(1).attrs.layout).toEqual(layout);
    } finally { editor.destroy(); }
  });

  it('reports the ordinary Markdown loss and synchronizes the value through Yjs', () => {
    const source = schema.node('doc', {}, [schema.node('paragraph', { layout }, [schema.text('Shared')])]);
    expect(MarkdownExporter.exportWithReport(source).losses.some(item => item.detail.includes('Paragraph spacing'))).toBe(true);
    const leftDoc = new Y.Doc(); const rightDoc = new Y.Doc();
    const make = (document: Y.Doc, id: string) => {
      const composed = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, user: { id, name: id, color: '#6547ff' } })]);
      return createEditor({ schema: composed.schema, plugins: composed.plugins, content: source.toJSON() });
    };
    const left = make(leftDoc, 'left');
    Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc));
    const right = make(rightDoc, 'right');
    try {
      expect(right.state.doc.child(0).attrs.layout).toEqual(layout);
      left.dispatch(left.state.createTransaction().setNodeAttrs([0], { ...left.state.doc.child(0).attrs, layout: { ...layout, spacingAfter: 20 } }));
      Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc));
      expect(right.state.doc.child(0).attrs.layout).toEqual({ ...layout, spacingAfter: 20 });
    } finally { left.destroy(); right.destroy(); leftDoc.destroy(); rightDoc.destroy(); }
  });
});
