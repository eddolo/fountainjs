// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { HTMLExporter, Plugin, Selection, createEditor, createHistoryPlugin, indentListItem,
  joinBackward, outdentListItem, redo, splitBlock, undo, type Attributes, type NodeJSON,
  type SchemaSpec } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';

const p = (text: string, attrs: Attributes = {}): NodeJSON => ({ type: 'paragraph', attrs, content: [{ type: 'text', text }] });
const item = (content: NodeJSON[], attrs: Attributes = {}): NodeJSON => ({ type: 'list_item', attrs, content });
const list = (content: NodeJSON[], attrs: Attributes = {}): NodeJSON => ({ type: 'ordered_list', attrs: { start: 0, ...attrs }, content });
const make = (content: NodeJSON[], path: number[], spec: SchemaSpec = CoreSchemaSpec, plugins: Plugin[] = []) => {
  const editor = createEditor({ schema: spec, content: { type: 'doc', content }, plugins: [createHistoryPlugin(), ...plugins] });
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor(path, 0)));
  return editor;
};

describe('platform-neutral direction through list transformations', () => {
  it.each(['ltr', 'rtl'] as const)('retains inherited %s and implicit start alignment when unwrapping a middle item', dir => {
    expect(typeof globalThis.document).toBe('undefined');
    const editor = make([list([item([p('Before')]), item([p('Selected')]), item([p('After')])], { dir })], [0, 1, 0, 0]);
    const before = editor.getJSON();
    expect(outdentListItem(editor)).toBe(true);
    expect(editor.state.doc.child(1).attrs).toMatchObject({ dir, align: 'start' });
    expect(editor.state.doc.child(0).attrs).toMatchObject({ dir, start: 0 });
    expect(editor.state.doc.child(2).attrs).toMatchObject({ dir, start: 2 });
    expect(editor.state.selection.path).toEqual([1, 0]);
    expect(HTMLExporter.export(editor.state.doc, { document: false })).toContain(`dir="${dir}" style="text-align:start"`);
    const after = editor.getJSON();
    expect(undo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(redo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(after);
  });

  it('preserves item overrides, explicitly physical alignment and independent child direction', () => {
    const editor = make([list([item([p('Physical', { align: 'left', alignExplicit: true }),
      p('Centered', { align: 'center' }), p('Override', { dir: 'rtl', align: 'end' })], { dir: 'ltr' })], { dir: 'rtl' })], [0, 0, 0, 0]);
    const independent = editor.state.doc.child(0).child(0).child(2);
    expect(outdentListItem(editor)).toBe(true);
    expect(editor.state.doc.child(0).attrs).toMatchObject({ dir: 'ltr', align: 'left', alignExplicit: true });
    expect(editor.state.doc.child(1).attrs).toMatchObject({ dir: 'ltr', align: 'center' });
    expect(editor.state.doc.child(2)).toBe(independent);
  });

  it.each([false, true])('retains source direction when indenting under an opposite parent (existing nested list: %s)', existing => {
    const parent = item([p('Parent'), ...(existing ? [list([item([p('Existing')])], { dir: 'ltr' })] : [])], { dir: 'ltr' });
    const editor = make([list([parent, item([p('Moved')])], { dir: 'rtl' })], [0, 1, 0, 0]);
    const originalText = editor.state.doc.textContent;
    expect(indentListItem(editor)).toBe(true);
    const nested = editor.state.doc.child(0).child(0).child(1);
    expect(nested.child(existing ? 1 : 0).attrs.dir).toBe('rtl');
    expect(nested.child(existing ? 1 : 0).child(0).attrs.dir).toBeUndefined();
    expect(editor.state.doc.textContent).toBe(originalText);
    expect(editor.state.selection.path).toEqual([0, 0, 1, existing ? 1 : 0, 0, 0]);
  });

  it('lifts inherited nested direction and retains the trailing list context independently', () => {
    const editor = make([list([item([p('Parent'), list([item([p('Prefix')]), item([p('Lifted')], { dir: 'ltr' }),
      item([p('Suffix')])])], { dir: 'rtl' })], { dir: 'ltr' })], [0, 0, 1, 1, 0, 0]);
    expect(outdentListItem(editor)).toBe(true);
    const lifted = editor.state.doc.child(0).child(1);
    expect(lifted.attrs.dir).toBe('ltr');
    expect(lifted.child(1).attrs).toMatchObject({ dir: 'rtl', start: 2 });
    expect(editor.state.doc.child(0).child(0).child(1).attrs.start).toBe(0);
  });

  it('lifts multiple nested items with their own overrides and keeps a range selection', () => {
    const editor = make([list([item([p('Parent'), list([item([p('A')]), item([p('B')], { dir: 'auto' })], { dir: 'rtl' })])], { dir: 'ltr' })], [0, 0, 1, 0, 0, 0]);
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0, 1, 0, 0, 0], 0, [0, 0, 1, 1, 0, 0], 1)));
    expect(outdentListItem(editor)).toBe(true);
    const outer = editor.state.doc.child(0);
    expect(outer.content.map(node => node.attrs.dir)).toEqual([undefined, 'rtl', 'auto']);
    expect(editor.state.selection.eq(Selection.range([0, 1, 0, 0], 0, [0, 2, 0, 0], 1))).toBe(true);
  });

  it.each(['blockquote', 'table_cell'])('unwraps a list inside %s rather than refusing to lift', parentName => {
    const inner = list([item([p('Lifted')])], { dir: 'rtl' });
    const parent: NodeJSON = { type: parentName, attrs: { dir: 'ltr' }, content: [inner] };
    const content = parentName === 'table_cell'
      ? [{ type: 'table', content: [{ type: 'table_row', content: [parent] }] }]
      : [parent];
    const prefix = parentName === 'table_cell' ? [0, 0, 0] : [0];
    const editor = make(content, [...prefix, 0, 0, 0, 0]);
    expect(outdentListItem(editor)).toBe(true);
    let parentNode = editor.state.doc;
    for (const part of prefix) parentNode = parentNode.child(part);
    expect(parentNode.child(0).type.name).toBe('paragraph');
    expect(parentNode.child(0).attrs).toMatchObject({ dir: 'rtl', align: 'start' });
    expect(editor.state.selection.path).toEqual([...prefix, 0, 0]);
  });

  it.each(['backspace', 'empty-enter'])('retains direction on the actual %s list exit', action => {
    const editor = make([list([item([p(action === 'backspace' ? 'Literal' : '')])], { dir: 'rtl' })], [0, 0, 0, 0]);
    expect(action === 'backspace' ? joinBackward(editor) : splitBlock(editor)).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe('paragraph');
    expect(editor.state.doc.child(0).attrs).toMatchObject({ dir: 'rtl', align: 'start' });
  });

  it('retains custom item attributes and identity when indenting within the same type/context', () => {
    const spec = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, list_item: { ...CoreSchemaSpec.nodes.list_item!,
      attrs: { ...CoreSchemaSpec.nodes.list_item!.attrs, nodeId: { default: undefined }, note: { default: undefined } },
    } } };
    const editor = make([list([item([p('Parent')]), item([p('Moved')], { nodeId: 'stable-item', note: 'keep' })], { dir: 'rtl' })], [0, 1, 0, 0], spec);
    const moved = editor.state.doc.child(0).child(1);
    expect(indentListItem(editor)).toBe(true);
    expect(editor.state.doc.child(0).child(0).child(1).child(0)).toBe(moved);
  });

  it.each(['indent', 'outdent'])('returns false when a host filter rejects %s without changing state', action => {
    const editor = make([list([item([p('Parent')]), item([p('Selected')])], { dir: 'rtl' })], [0, 1, 0, 0], CoreSchemaSpec,
      [new Plugin({ filterTransaction: tr => !tr.docChanged })]);
    const before = editor.state;
    expect(action === 'indent' ? indentListItem(editor) : outdentListItem(editor)).toBe(false);
    expect(editor.state).toBe(before);
  });

  it('rejects an unrepresentable lift in a restricted schema atomically', () => {
    const spec = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, paragraph: { ...CoreSchemaSpec.nodes.paragraph!,
      attrs: { ...CoreSchemaSpec.nodes.paragraph!.attrs, dir: { default: undefined, validate: (value: unknown) => value === undefined || value === 'ltr' } },
    } } };
    const editor = make([list([item([p('Keep')])], { dir: 'rtl' })], [0, 0, 0, 0], spec);
    const before = editor.state;
    expect(() => outdentListItem(editor)).not.toThrow();
    expect(outdentListItem(editor)).toBe(false);
    expect(editor.state).toBe(before);
  });

  it('rejects lifting into a parent whose content expression allows only lists', () => {
    const spec = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      lists_only: { group: 'block', content: 'ordered_list+' },
    } };
    const editor = make([{ type: 'lists_only', content: [list([item([p('Keep')])], { dir: 'rtl' })] }], [0, 0, 0, 0, 0], spec);
    const before = editor.state;
    expect(() => outdentListItem(editor)).not.toThrow();
    expect(outdentListItem(editor)).toBe(false);
    expect(editor.state).toBe(before);
  });

  it('rejects indenting when custom items cannot contain a nested list', () => {
    const spec = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      list_item: { ...CoreSchemaSpec.nodes.list_item!, content: 'paragraph+' },
    } };
    const editor = make([list([item([p('Parent')]), item([p('Keep')])], { dir: 'rtl' })], [0, 1, 0, 0], spec);
    const before = editor.state;
    expect(() => indentListItem(editor)).not.toThrow();
    expect(indentListItem(editor)).toBe(false);
    expect(editor.state).toBe(before);
  });

  it('does not freeze matching direction or materialize an automatic scope independently on children', () => {
    for (const dir of ['rtl', 'auto'] as const) {
      const editor = make([list([item([p('Parent')]), item([p('Moved')])], { dir })], [0, 1, 0, 0]);
      const moved = editor.state.doc.child(0).child(1);
      expect(indentListItem(editor)).toBe(true);
      expect(editor.state.doc.child(0).child(0).child(1).child(0)).toBe(moved);
      expect(moved.attrs.dir).toBeUndefined();
    }
  });

  it('keeps a checked task and stable attributes when changing nested list kind', () => {
    const spec = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      task_item: { ...CoreSchemaSpec.nodes.task_item!, attrs: { ...CoreSchemaSpec.nodes.task_item!.attrs, nodeId: { default: undefined } } },
      list_item: { ...CoreSchemaSpec.nodes.list_item!, attrs: { ...CoreSchemaSpec.nodes.list_item!.attrs, nodeId: { default: undefined } } },
    } };
    const editor = make([{ type: 'task_list', attrs: { dir: 'rtl' }, content: [
      { type: 'task_item', attrs: { checked: true, dir: 'ltr' }, content: [p('Parent')] },
      { type: 'task_item', attrs: { checked: true, nodeId: 'task-identity' }, content: [p('Moved')] },
    ] }], [0, 1, 0, 0], spec);
    expect(indentListItem(editor, 'bullet')).toBe(true);
    const moved = editor.state.doc.child(0).child(0).child(1).child(0);
    expect(moved.type.name).toBe('list_item');
    expect(moved.attrs).toMatchObject({ dir: 'rtl', nodeId: 'task-identity' });
    expect(moved.attrs).not.toHaveProperty('checked');
    expect(editor.state.doc.child(0).child(0).attrs.checked).toBe(true);
  });
});
