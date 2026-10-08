// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Plugin, Selection, canMoveNode, createEditor, createHistoryPlugin, moveNode, redo, undo,
  type Attributes, type NodeJSON, type SchemaSpec } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';

const p = (text: string, attrs: Attributes = {}): NodeJSON => ({ type: 'paragraph', attrs, content: [{ type: 'text', text }] });
const quote = (content: NodeJSON[], dir?: string): NodeJSON => ({ type: 'blockquote', attrs: dir ? { dir } : {}, content });
const make = (content: NodeJSON[], schema: SchemaSpec = CoreSchemaSpec, plugins: Plugin[] = []) => createEditor({
  schema, content: { type: 'doc', attrs: { title: 'Retained root metadata' }, content }, plugins: [createHistoryPlugin(), ...plugins],
});
const move = { fromPath: [0, 1], toParentPath: [1], toIndex: 1 } as const;

describe('platform-neutral direction at generic move boundaries', () => {
  it.each([['rtl', 'ltr'], ['ltr', 'rtl'], ['rtl', undefined]] as const)('retains fixed %s when moving into %s', (source, destination) => {
    expect(typeof globalThis.document).toBe('undefined');
    const editor = make([quote([p('Keep'), p('Move', { nodeId: 'stable-paragraph', note: 'keep source metadata' })], source), quote([p('Target')], destination)]);
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 1, 0], 2)));
    const before = editor.getJSON();
    expect(canMoveNode(editor, move)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(moveNode(editor, move)).toBe(true);
    expect(editor.state.doc.child(1).child(1).attrs).toMatchObject({ dir: source, align: 'start', nodeId: 'stable-paragraph', note: 'keep source metadata' });
    expect(editor.state.selection.path).toEqual([1, 1, 0]);
    expect(editor.state.doc.attrs.title).toBe('Retained root metadata');
    const after = editor.getJSON();
    expect(undo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(redo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(after);
  });

  it.each([{ align: 'left', alignExplicit: true }, { align: 'center' }, { align: 'end' }])('retains explicit alignment %j independently of direction', attrs => {
    const editor = make([quote([p('Keep'), p('Move', attrs)], 'rtl'), quote([p('Target')], 'ltr')]);
    expect(moveNode(editor, move)).toBe(true);
    expect(editor.state.doc.child(1).child(1).attrs).toMatchObject({ ...attrs, dir: 'rtl' });
  });

  it('leaves explicit child direction and a whole automatic scope intact', () => {
    const editor = make([quote([p('Keep'), quote([p('مرحبا'), p('Latin')], 'auto')], 'rtl'), quote([p('Target')], 'ltr')]);
    const automatic = editor.state.doc.child(0).child(1);
    expect(moveNode(editor, move)).toBe(true);
    expect(editor.state.doc.child(1).child(1)).toBe(automatic);
    expect(automatic.child(0).attrs.dir).toBeUndefined();
    const explicit = make([quote([p('Keep'), p('Move', { dir: 'ltr', align: 'left' })], 'rtl'), quote([p('Target')], 'rtl')]);
    const moved = explicit.state.doc.child(0).child(1);
    expect(moveNode(explicit, move)).toBe(true);
    expect(explicit.state.doc.child(1).child(1)).toBe(moved);
  });

  it('does not freeze matching inherited direction or reorder an automatic scope into fixed children', () => {
    for (const dir of ['rtl', 'auto']) {
      const editor = make([quote([p('Keep'), p('Move')], dir)]);
      const moved = editor.state.doc.child(0).child(1);
      expect(moveNode(editor, { fromPath: [0, 1], toParentPath: [0], toIndex: 0 })).toBe(true);
      expect(editor.state.doc.child(0).child(0)).toBe(moved);
      expect(moved.attrs.dir).toBeUndefined();
    }
  });

  it('makes canMoveNode reject a boundary the paragraph schema cannot represent', () => {
    const schema = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, paragraph: { ...CoreSchemaSpec.nodes.paragraph!,
      attrs: { ...CoreSchemaSpec.nodes.paragraph!.attrs, dir: { default: undefined, validate: (value: unknown) => value === undefined || value === 'ltr' } },
    } } };
    const editor = make([quote([p('Keep'), p('Move')], 'rtl'), quote([p('Target')], 'ltr')], schema);
    const before = editor.state;
    expect(canMoveNode(editor, move)).toBe(false);
    expect(moveNode(editor, move)).toBe(false);
    expect(editor.state).toBe(before);
  });

  it('retains fixed direction at capable descendants without inventing custom-container attributes', () => {
    const schema = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      custom_container: { group: 'block', content: 'block+' },
    } };
    const container: NodeJSON = { type: 'custom_container', attrs: { nodeId: 'portable-custom' }, content: [
      p('Inherited'), p('Independent', { dir: 'ltr' }),
    ] };
    const editor = make([quote([p('Keep'), container], 'rtl'), quote([p('Target')], 'ltr')], schema);
    const before = editor.getJSON();
    expect(moveNode(editor, move)).toBe(true);
    const moved = editor.state.doc.child(1).child(1);
    expect(moved.type.name).toBe('custom_container');
    expect(moved.attrs.nodeId).toBe('portable-custom');
    expect(moved.attrs.dir).toBeUndefined();
    expect(moved.child(0).attrs.dir).toBe('rtl');
    expect(moved.child(1).attrs.dir).toBe('ltr');
    expect(undo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  });

  it('rejects host-filtered moves atomically without changing stored source or selection', () => {
    const editor = make([quote([p('Keep'), p('Move')], 'rtl'), quote([p('Target')], 'ltr')], CoreSchemaSpec,
      [new Plugin({ filterTransaction: tr => !tr.docChanged })]);
    const before = editor.state;
    expect(canMoveNode(editor, move)).toBe(true);
    expect(moveNode(editor, move)).toBe(false);
    expect(editor.state).toBe(before);
  });
});
