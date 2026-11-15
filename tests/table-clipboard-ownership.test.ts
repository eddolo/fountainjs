// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { CellSelection, EditorView, HTMLExporter, Selection, StarterKit, TableMap,
  composeExtensions, createEditor, undo, redo } from '../src';
import { createPagesExtension, inspectFootnotes } from '../src/pages';

const mime = 'application/x-fountainjs+json';
function clipboard(type: 'copy' | 'paste', values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values)), event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files: [], types: [...data.keys()],
    getData: (key: string) => data.get(key) ?? '', setData: (key: string, value: string) => data.set(key, value) } });
  return { event, data };
}
function setup(merged = false) {
  const kit = composeExtensions([...StarterKit.extensions, createPagesExtension({ footnoteIdFactory: () => 'copied-note' })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins }), { schema } = editor.state;
  const p = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
  const cell = (text: string) => schema.node('table_cell', {}, [p(text)]);
  const first = schema.node('table_header', { background: '#fff0aa', ...(merged ? { rowspan: 2, colspan: 2 } : {}) }, [
    schema.node('paragraph', {}, [schema.text('Source', [schema.mark('strong')]), schema.node('footnote_reference', { id: 'source-note' })]),
  ]);
  const table = schema.node('table', {}, [schema.node('table_row', {}, merged ? [first, cell('Right')] : [first, cell('B')]),
    schema.node('table_row', {}, merged ? [cell('Below right')] : [cell('C'), cell('D')])]);
  const destination = schema.node('table', {}, [schema.node('table_row', {}, [cell('Old A'), cell('Old B')]),
    schema.node('table_row', {}, [cell('Old C'), cell('Old D')])]);
  const definition = schema.node('footnote_definition', { id: 'source-note' }, [p('Owned note body.')]);
  editor.dispatch(editor.createTransaction().replaceDocument(schema.node('doc', {}, [table, destination, p('Outside'), definition])));
  const mount = document.createElement('div'); document.body.append(mount); const view = new EditorView(mount, editor);
  return { editor, view, table, definition, cleanup: () => { view.destroy(); editor.destroy(); mount.remove(); } };
}

it.each([false, true])('copies a complete cell-selection graph, including merged geometry: %s', merged => {
  const { editor, view, cleanup } = setup(merged);
  try {
    editor.dispatch(editor.createTransaction().setSelection(new CellSelection(editor.state.doc, [0, 0, 0], merged ? [0, 0, 0] : [0, 1, 1])));
    const before = editor.getJSON(), copied = clipboard('copy'); view.dom.dispatchEvent(copied.event);
    expect(copied.data.get('text/html')).toContain('Owned note body.');
    expect(copied.data.get('text/plain')).toContain('[^source-note]: Owned note body.');
    expect(copied.data.has(mime)).toBe(true);
    const document = editor.state.schema.nodeFromJSON(JSON.parse(copied.data.get(mime)!).document);
    expect(inspectFootnotes(document).valid).toBe(true);
    expect(inspectFootnotes(document).definitions).toHaveLength(1);
    const map = TableMap.create(document.child(0));
    expect(map.valid).toBe(true); expect(map.width).toBe(2); expect(map.height).toBe(2);
    if (merged) expect(map.cells).toHaveLength(1);
    expect(editor.getJSON()).toEqual(before);
  } finally { cleanup(); }
});

it.each(['native', 'html'] as const)('pastes rich %s cells and their owned notes without nesting or flattening the table', format => {
  const { editor, view, table, definition, cleanup } = setup();
  try {
    const document = editor.state.schema.node('doc', {}, [table, definition]);
    editor.dispatch(editor.createTransaction().setSelection(new CellSelection(editor.state.doc, [1, 0, 0], [1, 1, 1])));
    const before = editor.getJSON(), values = { 'text/plain': 'Source[^source-note]\tB\nC\tD',
      'text/html': HTMLExporter.export(document, { document: false }),
      ...(format === 'native' ? { [mime]: JSON.stringify({ version: 1, document: document.toJSON() }) } : {}) };
    view.dom.dispatchEvent(clipboard('paste', values).event);
    const notes = inspectFootnotes(editor.state.doc);
    expect(notes.definitions).toHaveLength(2); expect(notes.valid).toBe(true);
    const target = editor.state.doc.child(1), first = target.child(0).child(0);
    expect(first.type.name).toBe('table_header'); expect(first.attrs.background).toBe('#fff0aa');
    expect(first.child(0).child(0).marks.map(mark => mark.type.name)).toContain('strong');
    expect(TableMap.create(target).cells.map(cell => cell.node.textContent)).toEqual([
      expect.stringContaining('Source'), 'B', 'C', 'D',
    ]);
    let tables = 0; editor.state.doc.descendants(node => { if (node.type.name === 'table') tables++; }); expect(tables).toBe(2);
    const pasted = editor.getJSON();
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
    expect(redo(editor)).toBe(true); expect(editor.getJSON()).toEqual(pasted);
  } finally { cleanup(); }
});

it('pastes a merged cell slice at a table caret, growing its destination and retaining note ownership', () => {
  const { editor, view, cleanup } = setup(true);
  try {
    editor.dispatch(editor.createTransaction().setSelection(new CellSelection(editor.state.doc, [0, 0, 0])));
    const copied = clipboard('copy'); view.dom.dispatchEvent(copied.event);
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 1, 1, 0, 0], 2)));
    const before = editor.getJSON(); view.dom.dispatchEvent(clipboard('paste', Object.fromEntries(copied.data)).event);
    const map = TableMap.create(editor.state.doc.child(1));
    expect(map.valid).toBe(true); expect(map.height).toBe(3); expect(map.width).toBe(3);
    expect(map.cellAt(1, 1)?.rowspan).toBe(2); expect(map.cellAt(1, 1)?.colspan).toBe(2);
    expect(inspectFootnotes(editor.state.doc).definitions).toHaveLength(2);
    expect(inspectFootnotes(editor.state.doc).valid).toBe(true);
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
  } finally { cleanup(); }
});

it.each(['copy', 'cut'] as const)('refuses %s of invalid cell geometry without falling back to lossy native selection', type => {
  const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [{ type: 'table', content: [
    { type: 'table_row', content: [{ type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
      { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] }] },
    { type: 'table_row', content: [{ type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'C' }] }] }] },
  ] }] } });
  const onError = vi.fn(), mount = document.createElement('div'); document.body.append(mount);
  const view = new EditorView(mount, editor, { onError });
  try {
    editor.dispatch(editor.createTransaction().setSelection(new CellSelection(editor.state.doc, [0, 0, 0])));
    const before = editor.getJSON(), data = new Map<string, string>(), event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { setData: (key: string, value: string) => data.set(key, value) } });
    view.dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); expect(data.size).toBe(0); expect(onError).toHaveBeenCalledOnce();
    expect(editor.getJSON()).toEqual(before);
  } finally { view.destroy(); editor.destroy(); mount.remove(); }
});
