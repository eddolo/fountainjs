// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { CoreSchemaSpec, EditorView, GapSelection, NodeSelection, Selection, createEditor, createHistoryPlugin,
  insertText, undo, redo, type NodeJSON, type SchemaSpec } from '../src';

const mounted: { view: EditorView; editor: ReturnType<typeof createEditor> }[] = [];
afterEach(() => { mounted.splice(0).forEach(({ view, editor }) => { view.destroy(); editor.destroy(); }); document.body.replaceChildren(); });
function setup(content: readonly NodeJSON[], schema: SchemaSpec = CoreSchemaSpec) {
  const editor = createEditor({ schema, plugins: [createHistoryPlugin()], content: { type: 'doc', content } });
  const mount = document.createElement('div'); document.body.append(mount);
  const view = new EditorView(mount, editor); mounted.push({ view, editor });
  return { editor, view };
}
const text = (value: string): NodeJSON => ({ type: 'paragraph', content: [{ type: 'text', text: value }] });

describe('explicit view focus targets', () => {
  it('preserves an intentional gap when focusing the current selection', () => {
    const { editor, view } = setup([text('First'), { type: 'paragraph' }]);
    const gap = new GapSelection(editor.state.doc, editor.state.doc.child(0).nodeSize);
    editor.dispatch(editor.createTransaction().setSelection(gap));
    const before = editor.getJSON(); view.focus('current');
    expect(editor.state.selection.eq(gap)).toBe(true); expect(editor.getJSON()).toEqual(before);
  });
  it('leaves an atom-only document and its current semantic selection intact', () => {
    const { editor, view } = setup([{ type: 'horizontal_rule' }, { type: 'horizontal_rule' }]);
    const selection = editor.state.selection, before = editor.getJSON();
    view.focus('start'); view.focus('end');
    expect(editor.state.selection.eq(selection)).toBe(true); expect(editor.getJSON()).toEqual(before);
  });
  for (const edge of ['start', 'end'] as const) for (const type of ['paragraph', 'heading', 'code_block']) {
    it(`fills the childless ${type} at the ${edge} without changing its identity or surrounding content`, () => {
      const empty: NodeJSON = { type, attrs: { id: 'empty-source', ...(type === 'heading' ? { level: 3 }
        : type === 'code_block' ? { language: 'python', lineNumbers: false } : { align: 'right' }) } };
      const content = edge === 'start' ? [empty, text('Keep')] : [text('Keep'), empty];
      const { editor, view } = setup(content), before = editor.getJSON();
      const index = edge === 'start' ? 0 : 1;
      view.focus(edge);
      expect(editor.getJSON()).toEqual(before);
      expect(editor.state.selection).toBeInstanceOf(NodeSelection);
      expect((editor.state.selection as NodeSelection).nodePath).toEqual([index]);
      expect(insertText(editor, 'Filled')).toBe(true);
      expect(editor.state.doc.childCount).toBe(2);
      expect(editor.state.doc.child(index).type.name).toBe(type);
      expect(editor.state.doc.child(index).attrs).toEqual(before.content![index]!.attrs);
      expect(editor.state.doc.child(index).textContent).toBe('Filled');
      expect(editor.state.doc.child(1 - index).textContent).toBe('Keep');
      const filled = editor.getJSON(); expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
      expect(redo(editor)).toBe(true); expect(editor.getJSON()).toEqual(filled);
    });
  }
  it('finds a nested childless table-cell paragraph before later prose', () => {
    const { editor, view } = setup([{ type: 'table', content: [{ type: 'table_row', content: [
      { type: 'table_cell', content: [{ type: 'paragraph' }] },
    ] }] }, text('Later')]);
    view.focus('start');
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((editor.state.selection as NodeSelection).nodePath).toEqual([0, 0, 0, 0]);
    expect(insertText(editor, 'Cell')).toBe(true);
    expect(editor.state.doc.child(0).child(0).child(0).child(0).textContent).toBe('Cell');
    expect(editor.state.doc.child(1).textContent).toBe('Later');
  });
  it('uses extension-defined empty text blocks and inline code without hard-coded type names', () => {
    const schema: SchemaSpec = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      source: { group: 'block', content: 'text*', toDOM: () => ['pre', 0] },
      formula_source: { inline: true, group: 'inline', content: 'text*', code: true, toDOM: () => ['code', 0] },
    } };
    for (const content of [[{ type: 'source' }, text('Keep')],
      [{ type: 'paragraph', content: [{ type: 'formula_source' }, { type: 'text', text: 'Keep' }] }]]) {
      const { editor, view } = setup(content, schema);
      view.focus('start'); expect(insertText(editor, 'Source')).toBe(true);
      expect(editor.state.doc.child(0).type.name).toBe(content[0]!.type);
      expect(editor.state.doc.textContent).toBe('SourceKeep');
      if (content[0]!.type === 'source') {
        expect(editor.state.doc.child(0).textContent).toBe('Source');
        expect(editor.state.doc.child(1).textContent).toBe('Keep');
      } else {
        expect(editor.state.doc.child(0).child(0).type.name).toBe('formula_source');
        expect(editor.state.doc.child(0).child(0).textContent).toBe('Source');
        expect(editor.state.doc.child(0).child(1).textContent).toBe('Keep');
      }
    }
  });
  for (const edge of ['start', 'end'] as const) it(`passes over an atom at the ${edge} without replacing it`, () => {
    const atom: NodeJSON = { type: 'horizontal_rule', attrs: { id: 'keep-atom' } };
    const { editor, view } = setup(edge === 'start' ? [atom, text('Edit')] : [text('Edit'), atom]);
    view.focus(edge); expect(insertText(editor, '!')).toBe(true);
    expect(editor.state.doc.child(edge === 'start' ? 0 : 1).toJSON()).toEqual(atom);
    expect(editor.state.doc.child(edge === 'start' ? 1 : 0).textContent).toBe(edge === 'start' ? '!Edit' : 'Edit!');
  });
  it('keeps current selection intact and dry-run focus does not focus or mutate the real editor', () => {
    const { editor, view } = setup([text('First'), { type: 'paragraph' }]);
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    view.focus('current'); expect(editor.state.selection).toEqual(Selection.cursor([0, 0], 2));
    const button = document.createElement('button'); document.body.append(button); button.focus();
    const before = editor.getJSON(), selection = editor.state.selection;
    const manager = view.commandManager({ insertText });
    expect(manager.can().chain().focus('end').insertText('Preview').run()).toBe(true);
    expect(editor.getJSON()).toEqual(before); expect(editor.state.selection.eq(selection)).toBe(true);
    expect(document.activeElement).toBe(button);
    expect(manager.chain().focus('end').insertText('Committed').run()).toBe(true);
    expect(editor.state.doc.child(0).textContent).toBe('First');
    expect(editor.state.doc.child(1).textContent).toBe('Committed');
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
  });
});
