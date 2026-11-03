// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, HistoryExtension, Selection, composeExtensions, createEditor, indentListItem, toggleList, undo, splitBlock } from '../src';
import { createYjsCollaborationExtension } from '../src/yjs';

const layout = { unit: 'pt', indentStart: 18, indentEnd: 0, markerOffset: -18, markerStyle: 'decimal', markerPrefix: 'Step ', markerSuffix: '.' };
const content = { type: 'doc', content: [{ type: 'ordered_list', attrs: { start: 3, layout }, content: [
  { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] },
  { type: 'list_item', attrs: { layout: { ...layout, indentStart: 6 } }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }] },
] }] };

describe('editing portable list geometry', () => {
  it('keeps geometry through Enter and undo without a DOM', () => {
    const kit = composeExtensions([CoreExtension, HistoryExtension]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
    const original = editor.state.doc.toJSON();
    try {
      editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0], 2)));
      expect(splitBlock(editor)).toBe(true);
      expect(editor.state.doc.child(0).attrs.layout).toEqual(layout);
      expect(editor.state.doc.child(0).childCount).toBe(3);
      expect(undo(editor)).toBe(true);
      expect(editor.state.doc.toJSON()).toEqual(original);
    } finally { editor.destroy(); }
  });
  it('changes marker kind while preserving text geometry and item-local offsets', () => {
    const kit = composeExtensions([CoreExtension, HistoryExtension]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
    const original = editor.state.doc.toJSON();
    try {
      editor.dispatch(editor.state.createTransaction().setSelection(new Selection([0, 0, 0, 0], 0, 6, [0, 1, 0, 0])));
      expect(toggleList(editor, 'bullet')).toBe(true);
      expect(editor.state.doc.child(0).attrs.layout).toEqual({ ...layout, markerStyle: 'literal', markerPrefix: '•', markerSuffix: '' });
      expect(editor.state.doc.child(0).child(1).attrs.layout).toEqual({ ...layout, indentStart: 6, markerStyle: 'literal', markerPrefix: '•', markerSuffix: '' });
      expect(undo(editor)).toBe(true);
      expect(editor.state.doc.toJSON()).toEqual(original);
    } finally { editor.destroy(); }
  });
  it('creates an explicitly owned nested offset when indenting an item', () => {
    const kit = composeExtensions([CoreExtension]);
    const editor = createEditor({ schema: kit.schema, content });
    try {
      editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 1, 0, 0], 2)));
      expect(indentListItem(editor)).toBe(true);
      expect(editor.state.doc.child(0).child(0).child(1).attrs.layout).toEqual({ ...layout, indentStart: 36, indentEnd: 0, firstLineIndent: 0 });
    } finally { editor.destroy(); }
  });
  it('synchronizes the same typed list and item data through Yjs in Node', () => {
    const leftDoc = new Y.Doc(); const rightDoc = new Y.Doc();
    const make = (document: Y.Doc, id: string) => {
      const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, user: { id, name: id, color: '#6547ff' } })]);
      return createEditor({ schema: kit.schema, plugins: kit.plugins, content });
    };
    const left = make(leftDoc, 'left');
    Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc));
    const right = make(rightDoc, 'right');
    try {
      expect(right.state.doc.child(0).attrs.layout).toEqual(layout);
      left.dispatch(left.state.createTransaction().setNodeAttrs([0], { ...left.state.doc.child(0).attrs, layout: { ...layout, indentStart: 27 } }));
      Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc));
      expect(right.state.doc.child(0).attrs.layout).toEqual({ ...layout, indentStart: 27 });
      expect(right.state.doc.child(0).child(1).attrs.layout).toEqual({ ...layout, indentStart: 6 });
    } finally { left.destroy(); right.destroy(); leftDoc.destroy(); rightDoc.destroy(); }
  });
});
