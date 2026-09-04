// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  AllSelection,
  CellSelection,
  CoreExtension,
  HTMLExporter,
  HTMLImporter,
  HistoryExtension,
  MarkdownExporter,
  MarkdownImporter,
  NodeSelection,
  Schema,
  Selection,
  composeExtensions,
  createEditor,
  insertText,
  setMark,
  undo,
} from '../src';
import {
  TextStyleExtension,
  fontFamilyCSS,
  getActiveTextStyle,
  normalizeFontFamily,
  normalizeFontSize,
  normalizeLineHeight,
  normalizeTextStyleColor,
  setBackgroundColor,
  setFontFamily,
  setFontSize,
  setLineHeight,
  setTextColor,
  unsetFontFamily,
} from '../src/text-style';
import { createYjsCollaborationExtension } from '../src/yjs';

function kit() { return composeExtensions([CoreExtension, HistoryExtension]); }

function markValues(document: ReturnType<Schema['nodeFromJSON']>): Record<string, unknown> {
  return Object.fromEntries(document.child(0).child(0).marks.map((mark) => [mark.type.name, mark.attrs]));
}

describe('complete text style suite', () => {
  it('normalizes portable values and rejects CSS injection or unbounded measurements', () => {
    expect(normalizeFontFamily(' "IBM Plex Sans" , system-ui ')).toBe('IBM Plex Sans, system-ui');
    expect(fontFamilyCSS('IBM Plex Sans, system-ui')).toBe('"IBM Plex Sans",system-ui');
    expect(normalizeFontFamily('Inter;position:fixed')).toBeNull();
    expect(normalizeFontFamily('url(evil)')).toBeNull();
    expect(normalizeFontSize(' 12.000pt ')).toBe('12pt');
    expect(normalizeFontSize('calc(1rem + 2px)')).toBeNull();
    expect(normalizeFontSize('900%')).toBeNull();
    expect(normalizeLineHeight(1.6)).toBe('1.6');
    expect(normalizeLineHeight('0.1')).toBeNull();
    expect(normalizeLineHeight('var(--line-height)')).toBeNull();
    expect(normalizeTextStyleColor('#AbC')).toBe('#aabbcc');
    expect(normalizeTextStyleColor('rgb(255, 0, 16)')).toBe('#ff0010');
    expect(normalizeTextStyleColor('red;background:url(evil)')).toBeNull();
  });

  it('ships all five style marks in CoreExtension and as a reusable custom-kit extension', () => {
    const core = new Schema(composeExtensions([CoreExtension]).schema);
    expect(Object.keys(core.marks)).toEqual(expect.arrayContaining([
      'text_color', 'highlight', 'font_family', 'font_size', 'line_height',
    ]));
    expect(Object.keys(TextStyleExtension.marks ?? {})).toEqual([
      'text_color', 'highlight', 'font_family', 'font_size', 'line_height',
    ]);
    expect(Object.keys(TextStyleExtension.commands ?? {})).toEqual(expect.arrayContaining([
      'setTextColor', 'setBackgroundColor', 'setFontFamily', 'setFontSize', 'setLineHeight',
    ]));
  });

  it('applies, replaces, reads, removes, and undoes styles across block boundaries', () => {
    const composed = kit();
    const editor = createEditor({
      schema: composed.schema,
      plugins: composed.plugins,
      content: { type: 'doc', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Beta' }] },
      ] },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0], 0, [1, 0], 4)));
    expect(setFontFamily(editor, 'IBM Plex Sans, system-ui')).toBe(true);
    expect(setFontSize(editor, '12pt')).toBe(true);
    expect(setLineHeight(editor, 1.6)).toBe(true);
    expect(setTextColor(editor, '#06c')).toBe(true);
    expect(setBackgroundColor(editor, 'rgb(255, 243, 163)')).toBe(true);
    expect(getActiveTextStyle(editor)).toEqual({
      color: '#0066cc',
      backgroundColor: '#fff3a3',
      fontFamily: 'IBM Plex Sans, system-ui',
      fontSize: '12pt',
      lineHeight: '1.6',
      mixed: [],
    });
    expect(setFontSize(editor, '18px')).toBe(true);
    expect(getActiveTextStyle(editor).fontSize).toBe('18px');
    expect(undo(editor)).toBe(true);
    expect(getActiveTextStyle(editor).fontSize).toBe('12pt');

    editor.dispatch(editor.state.createTransaction().setSelection(new Selection([0, 0], 0, 5)));
    expect(unsetFontFamily(editor)).toBe(true);
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0], 0, [1, 0], 4)));
    const mixed = getActiveTextStyle(editor);
    expect(mixed.fontFamily).toBeUndefined();
    expect(mixed.mixed).toContain('fontFamily');
  });

  it('uses the same style commands for caret, node, cell, and all-document selections', () => {
    const composed = kit();
    const editor = createEditor({
      schema: composed.schema,
      plugins: composed.plugins,
      content: { type: 'doc', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Beta' }] },
      ] },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(setFontSize(editor, '20px')).toBe(true);
    expect(insertText(editor, 'X')).toBe(true);
    expect(editor.state.doc.child(0).content.find((node) => node.text === 'X')?.marks
      .find((mark) => mark.type.name === 'font_size')?.attrs.size).toBe('20px');

    editor.dispatch(editor.state.createTransaction().setSelection(new NodeSelection(editor.state.doc, [1])));
    expect(setLineHeight(editor, 1.8)).toBe(true);
    expect(editor.state.doc.child(1).child(0).marks.find((mark) => mark.type.name === 'line_height')?.attrs.lineHeight).toBe('1.8');
    editor.dispatch(editor.state.createTransaction().setSelection(new AllSelection(editor.state.doc)));
    expect(setTextColor(editor, '#123')).toBe(true);
    expect(editor.state.doc.content.every((block) => block.content.every((node) => (
      !node.isText || node.marks.some((mark) => mark.type.name === 'text_color')
    )))).toBe(true);

    const tableEditor = createEditor({
      schema: composed.schema,
      plugins: composed.plugins,
      content: { type: 'doc', content: [{ type: 'table', content: [{ type: 'table_row', content: [
        { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
        { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
      ] }] }] },
    });
    tableEditor.dispatch(tableEditor.state.createTransaction().setSelection(
      new CellSelection(tableEditor.state.doc, [0, 0, 0], [0, 0, 1]),
    ));
    expect(setBackgroundColor(tableEditor, '#def')).toBe(true);
    expect(getActiveTextStyle(tableEditor)).toMatchObject({ backgroundColor: '#ddeeff', mixed: [] });
  });

  it('round-trips every style through safe HTML and rejects hostile document JSON', () => {
    const schema = new Schema(kit().schema);
    const document = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Styled', [
      schema.mark('strong'),
      schema.mark('text_color', { color: '#123456' }),
      schema.mark('highlight', { color: '#fedcba' }),
      schema.mark('font_family', { family: 'Noto Sans JP, sans-serif' }),
      schema.mark('font_size', { size: '18px' }),
      schema.mark('line_height', { lineHeight: '1.75' }),
    ])])]);
    const html = HTMLExporter.export(document, { document: false });
    expect(html).toContain('font-family:&quot;Noto Sans JP&quot;,sans-serif');
    expect(html).toContain('font-size:18px');
    expect(html).toContain('line-height:1.75');
    const restored = HTMLImporter.parse(html, schema);
    expect(markValues(restored)).toMatchObject({
      text_color: { color: '#123456' },
      highlight: { color: '#fedcba' },
      font_family: { family: 'Noto Sans JP, sans-serif' },
      font_size: { size: '18px' },
      line_height: { lineHeight: '1.75' },
    });
    expect(restored.child(0).child(0).marks.some((mark) => mark.type.name === 'strong')).toBe(true);
    expect(() => schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph', content: [{
      type: 'text', text: 'Unsafe', marks: [{ type: 'font_family', attrs: { family: 'Inter;position:fixed' } }],
    }] }] })).toThrow('family');
  });

  it('uses lossless inline HTML when ordinary Markdown cannot represent the styles', () => {
    const schema = new Schema(kit().schema);
    const document = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Portable', [
      schema.mark('em'),
      schema.mark('text_color', { color: '#6547ff' }),
      schema.mark('highlight', { color: '#e1dafe' }),
      schema.mark('font_family', { family: 'Atkinson Hyperlegible, sans-serif' }),
      schema.mark('font_size', { size: '1.25rem' }),
      schema.mark('line_height', { lineHeight: '1.8' }),
    ])])]);
    const exported = MarkdownExporter.exportWithReport(document);
    expect(exported.losses).toEqual([]);
    expect(exported.markdown).toContain('data-fountain-text-style="true"');
    const restored = MarkdownImporter.parse(exported.markdown, schema);
    expect(restored.textContent).toBe('Portable');
    expect(markValues(restored)).toMatchObject({
      text_color: { color: '#6547ff' },
      highlight: { color: '#e1dafe' },
      font_family: { family: 'Atkinson Hyperlegible, sans-serif' },
      font_size: { size: '1.25rem' },
      line_height: { lineHeight: '1.8' },
    });
    expect(restored.child(0).child(0).marks.some((mark) => mark.type.name === 'em')).toBe(true);
  });

  it('keeps invalid commands inert and honours read-only editors', () => {
    const composed = kit();
    const editor = createEditor({ schema: composed.schema, plugins: composed.plugins });
    expect(setFontFamily(editor, 'Inter;display:none')).toBe(false);
    expect(setFontSize(editor, '0px')).toBe(false);
    expect(setLineHeight(editor, 'expression(alert(1))')).toBe(false);
    expect(setTextColor(editor, 'transparent')).toBe(false);
    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks).toBeUndefined();

    const reader = createEditor({ schema: composed.schema, plugins: composed.plugins, editable: false });
    expect(setFontFamily(reader, 'Inter')).toBe(false);
    expect(setMark(reader, 'font_size', { size: '18px' })).toBe(false);
  });

  it('synchronizes style marks through the generic Yjs document adapter', () => {
    const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shared style' }] }] } as const;
    const leftDocument = new Y.Doc();
    const leftCollaboration = createYjsCollaborationExtension({
      document: leftDocument,
      user: { id: 'left-style', name: 'Left', color: '#6547ff' },
    });
    const leftKit = composeExtensions([CoreExtension, leftCollaboration]);
    const left = createEditor({ schema: leftKit.schema, plugins: leftKit.plugins, content });
    const rightDocument = new Y.Doc();
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'initial-style-sync');
    const rightCollaboration = createYjsCollaborationExtension({
      document: rightDocument,
      user: { id: 'right-style', name: 'Right', color: '#1f9d66' },
    });
    const rightKit = composeExtensions([CoreExtension, rightCollaboration]);
    const right = createEditor({ schema: rightKit.schema, plugins: rightKit.plugins, content });

    left.dispatch(left.state.createTransaction().setSelection(new Selection([0, 0], 0, 12)));
    expect(setFontFamily(left, 'Noto Sans JP, sans-serif')).toBe(true);
    expect(setFontSize(left, '18px')).toBe(true);
    expect(setLineHeight(left, '1.75')).toBe(true);
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'style-update');
    expect(right.getJSON()).toEqual(left.getJSON());

    left.destroy();
    right.destroy();
    leftDocument.destroy();
    rightDocument.destroy();
  });
});
