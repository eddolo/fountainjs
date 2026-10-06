// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, HistoryExtension, HTMLExporter, HTMLImporter, MarkdownExporter, Schema, Selection, composeExtensions,
  createEditor, insertText, isMarkActive, redo, setBlockType, splitBlock, toggleMark, undo } from '../src';
import { ServerHTMLImporter } from '../src/html/server';
import { createYjsCollaborationExtension } from '../src/yjs';

const kit = composeExtensions([CoreExtension, HistoryExtension]);
const schema = new Schema(kit.schema);
const fixture = () => schema.node('doc', {}, [schema.node('heading', { level: 1, emphasis: 'explicit' }, [
  schema.text('Normal '), schema.text('bold', [schema.mark('strong')]), schema.text(' italic', [schema.mark('em')]),
]), schema.node('blockquote', {}, [schema.node('paragraph', { emphasis: 'explicit' }, [schema.text('Upright quote')])])]);

describe('explicit block emphasis', () => {
  it('renders resets on the block and keeps positive inline marks; ordinary headings keep their default appearance', () => {
    const html = HTMLExporter.export(fixture(), { document: false });
    const root = document.createElement('div'); root.innerHTML = html;
    const heading = root.querySelector('h1')!;
    expect(heading.style.fontWeight).toBe('normal');
    expect(heading.style.fontStyle).toBe('normal');
    expect(heading.querySelector('strong')?.textContent).toBe('bold');
    expect(heading.querySelector('em')?.textContent).toBe(' italic');
    expect(root.querySelector('blockquote p')?.getAttribute('data-fountain-emphasis')).toBe('explicit');
    expect(schema.node('heading', { level: 1 }).type.spec.toDOM!(schema.node('heading', { level: 1 }))).toEqual(['h1', {}, 0]);
  });

  it('preserves the mode and inline marks through browser and DOM-free HTML adapters', () => {
    const source = fixture();
    const html = HTMLExporter.export(source, { document: false });
    expect(HTMLImporter.parse(html, schema).toJSON()).toEqual(source.toJSON());
    expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(source.toJSON());
    expect(HTMLImporter.parse('<h1 data-fountain-emphasis="bogus">Title</h1>', schema).child(0).attrs.emphasis).toBeUndefined();
  });

  it('rejects invalid mode values while preserving normal JSON compatibility', () => {
    expect(() => schema.node('heading', { emphasis: 'false' })).toThrow(/emphasis/);
    expect(() => schema.node('paragraph', { emphasis: '<script>' })).toThrow(/emphasis/);
    expect(Object.hasOwn(schema.node('paragraph').attrs, 'emphasis')).toBe(false);
    expect(Object.hasOwn(schema.node('paragraph', { emphasis: undefined }).attrs, 'emphasis')).toBe(false);
    expect(JSON.parse(JSON.stringify(schema.node('paragraph').toJSON()))).toEqual({ type: 'paragraph', attrs: { align: 'left' } });
  });

  it('uses the existing bold toolbar command for a text selection with undo and redo', () => {
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: fixture().toJSON() });
    try {
      editor.dispatch(editor.state.createTransaction().setSelection(new Selection([0, 0], 0, 6)));
      expect(isMarkActive(editor, 'strong')).toBe(false);
      expect(toggleMark(editor, 'strong')).toBe(true);
      expect(isMarkActive(editor, 'strong')).toBe(true);
      expect(editor.state.doc.child(0).attrs.emphasis).toBe('explicit');
      expect(undo(editor)).toBe(true);
      expect(isMarkActive(editor, 'strong')).toBe(false);
      expect(redo(editor)).toBe(true);
      expect(toggleMark(editor, 'strong')).toBe(true);
      expect(isMarkActive(editor, 'strong')).toBe(false);
      expect(editor.state.doc.child(0).attrs.emphasis).toBe('explicit');
    } finally { editor.destroy(); }
  });

  it('preserves normal emphasis when changing block type, pressing Enter and typing at the new caret', () => {
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins,
      content: schema.node('doc', {}, [schema.node('heading', { level: 1, emphasis: 'explicit' }, [schema.text('AlphaBeta')])]).toJSON() });
    try {
      editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 5)));
      expect(splitBlock(editor)).toBe(true);
      expect(editor.state.doc.content.map(node => [node.type.name, node.attrs.emphasis])).toEqual([['heading', 'explicit'], ['paragraph', 'explicit']]);
      expect(insertText(editor, 'New ')).toBe(true);
      expect(editor.state.doc.child(1).textContent).toBe('New Beta');
      expect(editor.state.doc.child(1).content.every(node => !node.marks.length)).toBe(true);
      expect(setBlockType(editor, 'heading', { level: 2 })).toBe(true);
      expect(editor.state.doc.child(1).attrs).toMatchObject({ level: 2, emphasis: 'explicit' });
      expect(undo(editor)).toBe(true);
      expect(editor.state.doc.child(1).type.name).toBe('paragraph');
    } finally { editor.destroy(); }
  });

  it('reports Markdown appearance limitations rather than silently promising the reset survives', () => {
    const result = MarkdownExporter.exportWithReport(fixture());
    expect(result.losses.some(issue => issue.detail.includes('Explicit normal-weight'))).toBe(true);
  });

  it('synchronizes explicit emphasis and toolbar edits through Yjs as portable attributes and marks', () => {
    const leftDoc = new Y.Doc(); const rightDoc = new Y.Doc();
    const make = (document: Y.Doc, id: string) => {
      const composed = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, user: { id, name: id, color: '#6547ff' } })]);
      return createEditor({ schema: composed.schema, plugins: composed.plugins, content: fixture().toJSON() });
    };
    const left = make(leftDoc, 'left');
    Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc));
    const right = make(rightDoc, 'right');
    try {
      left.dispatch(left.state.createTransaction().setSelection(new Selection([0, 0], 0, 6)));
      expect(toggleMark(left, 'strong')).toBe(true);
      Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc));
      expect(right.getJSON()).toEqual(left.getJSON());
      expect(right.state.doc.child(0).attrs.emphasis).toBe('explicit');
      expect(right.state.doc.child(0).child(0).marks.map(mark => mark.type.name)).toContain('strong');
    } finally { left.destroy(); right.destroy(); leftDoc.destroy(); rightDoc.destroy(); }
  });
});
