import { describe, expect, it } from 'vitest';
import {
  AllSelection,
  CellSelection,
  CoreSchemaSpec,
  GapSelection,
  NodeSelection,
  Selection,
  createEditor,
  deleteBackward,
  deleteForward,
  deleteSelection,
  extendCellSelection,
  historyPlugin,
  insertText,
  insertDocument,
  isMarkActive,
  selectAll,
  selectAdjacentNode,
  selectCells,
  selectGap,
  selectNode,
  setBlockType,
  setTextAlignment,
  toggleMark,
  topLevelPosition,
  undo,
} from '../src';
import { getNodeAtPath } from '../src/core/transaction/path';

const paragraph = (value: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

const image = (src = 'https://example.com/image.png') => ({
  type: 'image_super',
  attrs: { src, alt: '', title: '', caption: '', width: '100%' },
});

const table = () => ({
  type: 'table',
  content: [
    {
      type: 'table_row',
      content: ['A', 'B', 'C'].map((value) => ({
        type: 'table_header',
        content: [paragraph(value)],
      })),
    },
    {
      type: 'table_row',
      content: ['D', 'E', 'F'].map((value) => ({
        type: 'table_cell',
        content: [paragraph(value)],
      })),
    },
  ],
});

describe('semantic selections', () => {
  it('constructs explicit text, node, gap, all, and rectangular cell selections', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: { type: 'doc', content: [paragraph('Before'), image(), table(), paragraph('After')] },
    });

    const node = new NodeSelection(editor.state.doc, [1]);
    expect(node.kind).toBe('node');
    expect(node.nodeType).toBe('image_super');
    expect(node.nodePath).toEqual([1]);

    const gap = new GapSelection(editor.state.doc, topLevelPosition(editor.state.doc, 1));
    expect(gap.kind).toBe('gap');
    expect(gap.parentPath).toEqual([]);
    expect(gap.index).toBe(1);
    expect(gap.isCollapsed).toBe(true);

    const all = new AllSelection(editor.state.doc);
    expect(all.kind).toBe('all');
    expect(all.path).toEqual([0, 0]);
    expect(all.endPath).toEqual([3, 0]);

    const cells = new CellSelection(editor.state.doc, [2, 0, 1], [2, 1, 2]);
    expect(cells.kind).toBe('cell');
    expect(cells.cellPaths).toEqual([[2, 0, 1], [2, 0, 2], [2, 1, 1], [2, 1, 2]]);

    expect(() => new NodeSelection(editor.state.doc, [])).toThrow('AllSelection');
    expect(() => new GapSelection(editor.state.doc, 1)).toThrow('not a structural gap');
    expect(() => new CellSelection(editor.state.doc, [0], [2, 0, 0])).toThrow('table_cell');
  });

  it('maps a node selection through insertions and recovers as a gap when deleted', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      plugins: [historyPlugin],
      content: { type: 'doc', content: [paragraph('One'), image(), paragraph('Two')] },
    });
    expect(selectNode(editor, [1])).toBe(true);
    const inserted = editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Earlier')]);
    editor.dispatch(editor.state.createTransaction().replace(0, 0, [inserted]));
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((editor.state.selection as NodeSelection).nodePath).toEqual([2]);

    expect(deleteSelection(editor)).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    expect(editor.state.selection).toBeInstanceOf(GapSelection);
    expect((editor.state.selection as GapSelection).index).toBe(2);

    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.child(2).type.name).toBe('image_super');
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((editor.state.selection as NodeSelection).nodePath).toEqual([2]);
  });

  it('inserts and deletes adjacent blocks from an exact structural gap', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      plugins: [historyPlugin],
      content: { type: 'doc', content: [paragraph('A'), paragraph('B')] },
    });
    const beforeSecond = topLevelPosition(editor.state.doc, 1);
    expect(selectGap(editor, beforeSecond)).toBe(true);
    expect(insertText(editor, 'Between')).toBe(true);
    expect(editor.getText()).toBe('A\nBetween\nB');
    expect(editor.state.selection.eq(Selection.cursor([1, 0], 7))).toBe(true);

    expect(undo(editor)).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(GapSelection);
    expect(deleteBackward(editor)).toBe(true);
    expect(editor.getText()).toBe('B');

    expect(selectGap(editor, 0)).toBe(true);
    expect(deleteForward(editor)).toBe(true);
    expect(editor.getText()).toBe('');
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.child(0).type.name).toBe('paragraph');
  });

  it('formats and replaces the entire document while preserving undo selection semantics', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      plugins: [historyPlugin],
      content: { type: 'doc', content: [paragraph('One'), paragraph('Two')] },
    });
    expect(selectAll(editor)).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(AllSelection);
    expect(toggleMark(editor, 'strong')).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(AllSelection);
    expect(isMarkActive(editor, 'strong')).toBe(true);

    expect(insertText(editor, 'Replacement')).toBe(true);
    expect(editor.getText()).toBe('Replacement');
    expect(editor.state.selection.eq(Selection.cursor([0, 0], 11))).toBe(true);

    expect(undo(editor)).toBe(true);
    expect(editor.getText()).toBe('One\nTwo');
    expect(editor.state.selection).toBeInstanceOf(AllSelection);
    expect(isMarkActive(editor, 'strong')).toBe(true);
  });

  it('formats, clears, replaces, and maps rectangular cell selections without touching other cells', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      plugins: [historyPlugin],
      content: { type: 'doc', content: [table(), paragraph('Tail')] },
    });
    expect(selectCells(editor, [0, 0, 1], [0, 1, 2])).toBe(true);
    expect(toggleMark(editor, 'strong')).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    for (const path of [[0, 0, 1], [0, 0, 2], [0, 1, 1], [0, 1, 2]]) {
      expect(getNodeAtPath(editor.state.doc, [...path, 0, 0]).marks.some((mark) => mark.type.name === 'strong')).toBe(true);
    }
    expect(getNodeAtPath(editor.state.doc, [0, 0, 0, 0, 0]).marks).toHaveLength(0);
    expect(getNodeAtPath(editor.state.doc, [0, 1, 0, 0, 0]).marks).toHaveLength(0);

    expect(deleteSelection(editor)).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect(getNodeAtPath(editor.state.doc, [0, 0, 1]).textContent).toBe('');
    expect(getNodeAtPath(editor.state.doc, [0, 1, 2]).textContent).toBe('');
    expect(getNodeAtPath(editor.state.doc, [0, 0, 0]).textContent).toBe('A');
    expect(getNodeAtPath(editor.state.doc, [0, 1, 0]).textContent).toBe('D');

    expect(undo(editor)).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect(insertText(editor, 'Only here')).toBe(true);
    expect(getNodeAtPath(editor.state.doc, [0, 0, 1]).textContent).toBe('Only here');
    expect(getNodeAtPath(editor.state.doc, [0, 0, 2]).textContent).toBe('');
    expect(getNodeAtPath(editor.state.doc, [0, 1, 1]).textContent).toBe('');
    expect(getNodeAtPath(editor.state.doc, [0, 0, 0]).textContent).toBe('A');

    expect(selectCells(editor, [0, 0, 0], [0, 1, 0])).toBe(true);
    const leading = editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Leading')]);
    editor.dispatch(editor.state.createTransaction().replace(0, 0, [leading]));
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect((editor.state.selection as CellSelection).anchorCellPath).toEqual([1, 0, 0]);
    expect((editor.state.selection as CellSelection).headCellPath).toEqual([1, 1, 0]);
  });

  it('rejects invalid selection commands without changing the current selection', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    const initial = editor.state.selection;
    expect(selectNode(editor, [99])).toBe(false);
    expect(selectGap(editor, 1)).toBe(false);
    expect(selectCells(editor, [0], [0])).toBe(false);
    expect(editor.state.selection.eq(initial)).toBe(true);
  });

  it('provides keyboard-oriented node and rectangular-cell navigation commands', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: { type: 'doc', content: [paragraph('A'), image(), paragraph('B'), table()] },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 1)));
    expect(selectAdjacentNode(editor, 'forward')).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((editor.state.selection as NodeSelection).nodePath).toEqual([1]);
    expect(selectAdjacentNode(editor, 'forward')).toBe(true);
    expect(editor.state.selection.eq(Selection.cursor([2, 0], 0))).toBe(true);
    expect(selectAdjacentNode(editor, 'backward')).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);

    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([3, 0, 0, 0, 0], 0)));
    expect(extendCellSelection(editor, 'right')).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect((editor.state.selection as CellSelection).cellPaths).toEqual([[3, 0, 0], [3, 0, 1]]);
    expect(extendCellSelection(editor, 'down')).toBe(true);
    expect((editor.state.selection as CellSelection).cellPaths).toEqual([
      [3, 0, 0], [3, 0, 1], [3, 1, 0], [3, 1, 1],
    ]);
  });

  it('inserts structured document fragments at semantic selections without using a projected text path', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: { type: 'doc', content: [paragraph('A'), image(), paragraph('B')] },
    });
    const fragment = editor.state.schema.node('doc', {}, [
      editor.state.schema.node('paragraph', {}, [editor.state.schema.text('First')]),
      editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Second')]),
    ]);
    expect(selectNode(editor, [1])).toBe(true);
    expect(insertDocument(editor, fragment)).toBe(true);
    expect(editor.getText()).toBe('A\nFirst\nSecond\nB');
    expect(editor.state.selection.eq(Selection.cursor([2, 0], 6))).toBe(true);

    expect(selectGap(editor, topLevelPosition(editor.state.doc, 1))).toBe(true);
    expect(insertDocument(editor, fragment)).toBe(true);
    expect(editor.getText()).toBe('A\nFirst\nSecond\nFirst\nSecond\nB');

    expect(selectAll(editor)).toBe(true);
    expect(insertDocument(editor, fragment)).toBe(true);
    expect(editor.getText()).toBe('First\nSecond');
  });

  it('formats selected block nodes deliberately and rejects block commands at a gap', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: { type: 'doc', content: [paragraph('A'), paragraph('B')] },
    });
    expect(selectNode(editor, [0])).toBe(true);
    expect(setTextAlignment(editor, 'center')).toBe(true);
    expect(editor.state.doc.child(0).attrs.align).toBe('center');
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(setBlockType(editor, 'heading', { level: 2 })).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe('heading');
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((editor.state.selection as NodeSelection).nodeType).toBe('heading');

    expect(selectGap(editor, topLevelPosition(editor.state.doc, 1))).toBe(true);
    const before = editor.getJSON();
    expect(setTextAlignment(editor, 'right')).toBe(false);
    expect(setBlockType(editor, 'heading', { level: 3 })).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });
});
