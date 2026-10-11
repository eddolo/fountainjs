// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEditor, createHistoryPlugin, indentListItem, outdentListItem, moveNode, canMoveNode,
  Selection, NodeSelection, setTextDirection, setNodeAttributes, setBlockType, splitBlock, undo, redo, type Attributes, type Node, type NodeJSON, type SchemaSpec } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { containedTextDirection, sharedTextDirections } from '../src/core/first-strong-direction';
import { sharedDirectionGroup } from '../src/core/shared-direction';
import { composeExtensions, CoreExtension } from '../src/extensions';
import { createYjsCollaborationExtension } from '../src/yjs';
import * as Y from 'yjs';
import { HTMLExporter, Schema } from '../src/headless';
import { ServerHTMLImporter } from '../src/html/server';

const p = (text: string, attrs: Attributes = {}): NodeJSON => ({ type: 'paragraph', attrs, content: [{ type: 'text', text }] });
const item = (content: NodeJSON[], attrs: Attributes = {}): NodeJSON => ({ type: 'list_item', attrs, content });
const list = (content: NodeJSON[], attrs: Attributes = {}): NodeJSON => ({ type: 'ordered_list', attrs: { start: 0, ...attrs }, content });
const make = (content: NodeJSON[], path: number[], schema: SchemaSpec = CoreSchemaSpec) => {
  const editor = createEditor({ schema, content: { type: 'doc', attrs: { title: 'Keep metadata' }, content }, plugins: [createHistoryPlugin()] });
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor(path, 0)));
  return editor;
};
// Pure model oracle. NOT a DOM, exporter, native input or reader assertion.
function modelDirections(document: Node): Record<string, string> {
  const shared = sharedTextDirections(document, sharedDirectionGroup);
  const result: Record<string, string> = {};
  const walk = (node: Node, inherited: string) => {
    const group = sharedDirectionGroup(node);
    const direction = node.attrs.dir === 'auto' ? (group ? shared.get(group) : containedTextDirection(node)) ?? 'ltr'
      : node.attrs.dir === 'ltr' || node.attrs.dir === 'rtl' ? node.attrs.dir : inherited;
    if (node.type.name === 'paragraph') result[node.textContent] = direction;
    node.content.forEach(child => walk(child, direction));
  };
  walk(document, 'ltr');
  return result;
}

const nested = (extra: Attributes = {}): NodeJSON[] => [{ type: 'bullet_list', attrs: { dir: 'ltr', nodeId: 'outer' }, content: [
  item([p('Outer parent'), list([item([p('שלום anchor')]), item([p('English selected')]), item([p('English tail')])],
    { dir: 'auto', nodeId: 'inner', ...extra })], { nodeId: 'parent' }), item([p('Outer after')]),
] }];

describe('portable shared direction ownership and HTML projection', () => {
  it('retains an automatic nested list across lifted items and the unselected suffix, atomically', () => {
    expect(typeof globalThis.document).toBe('undefined');
    const editor = make(nested(), [0, 0, 1, 1, 0, 0]);
    const before = editor.getJSON(), initial = modelDirections(editor.state.doc);
    expect(outdentListItem(editor)).toBe(true);
    const outer = editor.state.doc.child(0), prefix = outer.child(0).child(1), lifted = outer.child(1), suffix = lifted.child(1);
    const group = prefix.attrs.directionGroup;
    expect(group).toMatch(/^[A-Za-z0-9_-]{1,96}$/);
    expect(lifted.attrs).toMatchObject({ dir: 'auto', directionGroup: group });
    expect(suffix.attrs).toMatchObject({ dir: 'auto', directionGroup: group, start: 2 });
    expect(prefix.attrs).toMatchObject({ nodeId: 'inner', start: 0 });
    expect(outer.attrs).toMatchObject({ nodeId: 'outer', dir: 'ltr' });
    expect(outer.child(0).attrs.nodeId).toBe('parent');
    expect(editor.state.doc.attrs.title).toBe('Keep metadata');
    expect(editor.state.selection.path).toEqual([0, 1, 0, 0]);
    expect(modelDirections(editor.state.doc)).toEqual(initial);
    const after = editor.getJSON();
    expect(editor.state.schema.nodeFromJSON(JSON.parse(JSON.stringify(after))).eq(editor.state.doc)).toBe(true);
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
    expect(redo(editor)).toBe(true); expect(editor.getJSON()).toEqual(after);
  });

  it('recomputes from live anchor editing and deletion, rather than persisting RTL', () => {
    const editor = make(nested(), [0, 0, 1, 1, 0, 0]);
    expect(outdentListItem(editor)).toBe(true);
    const prefixPath = [0, 0, 1], prefix = editor.state.doc.child(0).child(0).child(1);
    const edited = prefix.child(0).child(0).copy([editor.state.schema.text('English שלום anchor')]);
    editor.dispatch(editor.createTransaction().replaceNode([...prefixPath, 0, 0], [edited]));
    expect(modelDirections(editor.state.doc)['English selected']).toBe('ltr');
    expect(modelDirections(editor.state.doc)['English tail']).toBe('ltr');
    expect(undo(editor)).toBe(true);
    expect(modelDirections(editor.state.doc)['English selected']).toBe('rtl');
    editor.dispatch(editor.createTransaction().replaceNode(prefixPath, []));
    expect(modelDirections(editor.state.doc)['English selected']).toBe('ltr');
    expect(modelDirections(editor.state.doc)['English tail']).toBe('ltr');
  });

  it('retains membership through heading conversion and Enter splitting', () => {
    const editor = make([{ type: 'blockquote', attrs: { dir: 'auto' }, content: [p('שלום anchor'), p('English selected')] },
      { type: 'blockquote', attrs: { dir: 'ltr' }, content: [p('Destination')] }], [0, 1, 0]);
    expect(moveNode(editor, { fromPath: [0, 1], toParentPath: [1], toIndex: 1 })).toBe(true);
    const group = editor.state.doc.child(1).child(1).attrs.directionGroup;
    expect(setBlockType(editor, 'heading', { level: 2 })).toBe(true);
    expect(editor.state.doc.child(1).child(1).attrs.directionGroup).toBe(group);
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 1, 0], 7)));
    expect(splitBlock(editor)).toBe(true);
    expect(editor.state.doc.child(1).child(2).type.name).toBe('paragraph');
    expect(editor.state.doc.child(1).child(2).attrs.directionGroup).toBe(group);
    expect(modelDirections(editor.state.doc)[' selected']).toBe('rtl');
  });

  it.each(['ltr', 'rtl', 'auto', undefined] as const)('explicitly choosing %s detaches a shared fragment, with exact undo', dir => {
    const editor = make(nested(), [0, 0, 1, 1, 0, 0]);
    expect(outdentListItem(editor)).toBe(true);
    editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [0, 1])));
    const before = editor.getJSON();
    expect(setTextDirection(editor, dir)).toBe(true);
    expect(editor.state.doc.child(0).child(1).attrs.directionGroup).toBeUndefined();
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
  });

  it.each([false, true])('links an indented range across a fixed parent (existing nested list: %s)', existing => {
    const editor = make([list([item([p('שלום anchor')]), item([p('Parent paragraph'),
      ...(existing ? [list([item([p('Existing')])], { dir: 'ltr' })] : [])], { dir: 'ltr' }),
      item([p('English selected')]), item([p('English tail')])], { dir: 'auto' })], [0, 2, 0, 0]);
    const initial = modelDirections(editor.state.doc), before = editor.getJSON();
    expect(indentListItem(editor)).toBe(true);
    const root = editor.state.doc.child(0), moved = root.child(1).child(1).child(existing ? 1 : 0);
    expect(moved.attrs).toMatchObject({ dir: 'auto', directionGroup: root.attrs.directionGroup });
    expect(modelDirections(editor.state.doc)).toEqual(initial);
    expect(editor.state.selection.path).toEqual([0, 1, 1, existing ? 1 : 0, 0, 0]);
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
  });

  it('adds no context identity when indentation stays inside the same automatic owner', () => {
    const editor = make([list([item([p('שלום anchor')]), item([p('English selected')])], { dir: 'auto' })], [0, 1, 0, 0]);
    expect(indentListItem(editor)).toBe(true);
    expect(sharedTextDirections(editor.state.doc, sharedDirectionGroup).size).toBe(0);
    expect(modelDirections(editor.state.doc)['English selected']).toBe('rtl');
  });

  it('keeps independently authored child auto/fixed contexts independent', () => {
    const editor = make(nested(), [0, 0, 1, 1, 0, 0]);
    const selected = editor.state.doc.child(0).child(0).child(1).child(1);
    editor.dispatch(editor.createTransaction().setNodeAttrs([0, 0, 1, 1], { ...selected.attrs, dir: 'auto' }));
    const before = modelDirections(editor.state.doc);
    expect(outdentListItem(editor)).toBe(true);
    expect(editor.state.doc.child(0).child(1).attrs.directionGroup).toBeUndefined();
    expect(modelDirections(editor.state.doc)).toEqual(before);
  });

  it('preserves a generic block move, including source metadata, without changing the canMove probe', () => {
    const editor = make([{ type: 'blockquote', attrs: { dir: 'auto', nodeId: 'quote' }, content: [p('שלום anchor'), p('English selected')] },
      { type: 'blockquote', attrs: { dir: 'ltr' }, content: [p('Destination')] }], [0, 1, 0]);
    const before = editor.getJSON(), move = { fromPath: [0, 1], toParentPath: [1], toIndex: 1 };
    expect(canMoveNode(editor, move)).toBe(true); expect(editor.getJSON()).toEqual(before);
    expect(moveNode(editor, move)).toBe(true);
    const group = editor.state.doc.child(0).attrs.directionGroup;
    expect(editor.state.doc.child(1).child(1).attrs).toMatchObject({ dir: 'auto', directionGroup: group, align: 'start' });
    expect(modelDirections(editor.state.doc)['English selected']).toBe('rtl');
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
  });

  it('does not bind a complete independently owned subtree to an unrelated destination', () => {
    const editor = make([{ type: 'blockquote', attrs: { dir: 'auto' }, content: [p('שלום anchor'), p('English selected')] },
      { type: 'blockquote', attrs: { dir: 'ltr' }, content: [p('Destination')] }], [0, 0, 0]);
    expect(moveNode(editor, { fromPath: [0], toParentPath: [1], toIndex: 1 })).toBe(true);
    expect(editor.state.doc.child(0).child(1).attrs.directionGroup).toBeUndefined();
    expect(modelDirections(editor.state.doc)['English selected']).toBe('rtl');
  });

  it('retains existing shared membership through a second root-level lift', () => {
    const editor = make(nested(), [0, 0, 1, 1, 0, 0]);
    expect(outdentListItem(editor)).toBe(true);
    const group = editor.state.doc.child(0).child(1).attrs.directionGroup;
    expect(outdentListItem(editor)).toBe(true);
    const scope = editor.state.doc.child(1);
    expect(scope.type.name).toBe('direction_scope');
    expect(scope.attrs).toMatchObject({ dir: 'auto', directionGroup: group });
    expect(modelDirections(editor.state.doc)['English selected']).toBe('rtl');
  });

  it('uses capable descendants in a restricted item schema without inventing undeclared attributes', () => {
    const { directionGroup: _, ...attrs } = CoreSchemaSpec.nodes.list_item.attrs!;
    const schema = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, list_item: { ...CoreSchemaSpec.nodes.list_item, attrs } } };
    const editor = make(nested(), [0, 0, 1, 1, 0, 0], schema);
    expect(outdentListItem(editor)).toBe(true);
    const moved = editor.state.doc.child(0).child(1);
    expect(moved.attrs.directionGroup).toBeUndefined();
    expect(moved.child(0).attrs.directionGroup).toBeTypeOf('string');
    expect(modelDirections(editor.state.doc)['English selected']).toBe('rtl');
  });

  it('refuses an incapable source schema atomically instead of guessing a fixed direction', () => {
    const { directionGroup: _, ...attrs } = CoreSchemaSpec.nodes.ordered_list.attrs!;
    const schema = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ordered_list: { ...CoreSchemaSpec.nodes.ordered_list, attrs } } };
    const editor = make(nested(), [0, 0, 1, 1, 0, 0], schema), before = editor.getJSON();
    expect(outdentListItem(editor)).toBe(false); expect(editor.getJSON()).toEqual(before);
  });

  it.each([true, false])('does not silently lose an empty editable fragment context (capable=%s)', capable => {
    const { directionGroup: _, ...attrs } = CoreSchemaSpec.nodes.paragraph.attrs!;
    const schema = capable ? CoreSchemaSpec : { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      paragraph: { ...CoreSchemaSpec.nodes.paragraph, attrs },
    } };
    const editor = make([
      { type: 'blockquote', attrs: { dir: 'auto' }, content: [p('שלום anchor'), { type: 'paragraph' }] },
      { type: 'blockquote', attrs: { dir: 'ltr' }, content: [p('Destination')] },
    ], [0, 0, 0], schema);
    const before = editor.getJSON();
    expect(moveNode(editor, { fromPath: [0, 1], toParentPath: [1], toIndex: 1 })).toBe(capable);
    if (capable) {
      const member = editor.state.doc.child(1).child(1);
      expect(member.attrs.directionGroup).toBe(editor.state.doc.child(0).attrs.directionGroup);
      editor.dispatch(editor.createTransaction().replaceNode([1, 1], [member.copy([editor.state.schema.text('English typed later')])]));
      expect(modelDirections(editor.state.doc)['English typed later']).toBe('rtl');
    } else expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it.each(['auto', 'ltr', 'rtl', undefined])('detaches grouping for an explicit generic direction patch %s', dir => {
    const editor = make([p('English', { dir: 'auto', directionGroup: 'shared' })], [0, 0]);
    const before = editor.getJSON();
    expect(setNodeAttributes(editor, [0], { dir })).toBe(true);
    expect(editor.state.doc.child(0).attrs.directionGroup).toBeUndefined();
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
    expect(setNodeAttributes(editor, [0], { dir: 'auto', directionGroup: 'intentional' })).toBe(true);
    expect(editor.state.doc.child(0).attrs.directionGroup).toBe('intentional');
    editor.destroy();
  });

  it.each(['', 'bad key', 'x'.repeat(97), 42, {}, null])('rejects invalid declared context reference %j', value => {
    const editor = make([p('Text')], [0, 0]);
    expect(() => editor.state.schema.node('paragraph', { dir: 'auto', directionGroup: value })).toThrow();
  });

  it('serializes established shared ownership and live anchor changes through Yjs without a DOM', () => {
    const leftDoc = new Y.Doc(), rightDoc = new Y.Doc();
    const peer = (document: Y.Doc, id: string, content: NodeJSON) => {
      const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, user: { id, name: id, color: '#123456' } })]);
      return createEditor({ schema: kit.schema, plugins: kit.plugins, content });
    };
    const left = peer(leftDoc, 'ada', { type: 'doc', content: nested({ directionGroup: 'established-context' }) });
    Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc));
    const right = peer(rightDoc, 'grace', left.getJSON());
    left.dispatch(left.createTransaction().setSelection(Selection.cursor([0, 0, 1, 1, 0, 0], 0)));
    expect(outdentListItem(left)).toBe(true);
    Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc));
    expect(right.getJSON()).toEqual(left.getJSON());
    expect(modelDirections(right.state.doc)['English selected']).toBe('rtl');
    const p = right.state.doc.child(0).child(0).child(1).child(0).child(0);
    right.dispatch(right.createTransaction().replaceNode([0, 0, 1, 0, 0], [p.copy([right.state.schema.text('English שלום anchor')])]));
    Y.applyUpdate(leftDoc, Y.encodeStateAsUpdate(rightDoc));
    expect(left.getJSON()).toEqual(right.getJSON());
    expect(modelDirections(left.state.doc)['English selected']).toBe('ltr');
    left.destroy(); right.destroy(); leftDoc.destroy(); rightDoc.destroy();
  });

  it('converges simultaneous first fragmentation of an initially unmarked shared Yjs context', () => {
    const leftDoc = new Y.Doc(), rightDoc = new Y.Doc();
    const content: NodeJSON = { type: 'doc', content: [list([
      item([p('שלום anchor')]), item([p('First fixed parent')], { dir: 'ltr' }), item([p('English first')]),
      item([p('Second fixed parent')], { dir: 'ltr' }), item([p('English second')]),
    ], { dir: 'auto' })] };
    const peer = (document: Y.Doc, id: string, content: NodeJSON) => {
      const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, user: { id, name: id, color: '#123456' } })]);
      return createEditor({ schema: kit.schema, plugins: kit.plugins, content });
    };
    const left = peer(leftDoc, 'ada', content);
    Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc));
    const right = peer(rightDoc, 'grace', left.getJSON());
    try {
      left.dispatch(left.createTransaction().setSelection(Selection.cursor([0, 2, 0, 0], 0)));
      right.dispatch(right.createTransaction().setSelection(Selection.cursor([0, 4, 0, 0], 0)));
      expect(indentListItem(left)).toBe(true); expect(indentListItem(right)).toBe(true);
      const leftUpdate = Y.encodeStateAsUpdate(leftDoc), rightUpdate = Y.encodeStateAsUpdate(rightDoc);
      Y.applyUpdate(leftDoc, rightUpdate); Y.applyUpdate(rightDoc, leftUpdate);
      expect(left.getJSON()).toEqual(right.getJSON());
      const directions = modelDirections(left.state.doc);
      expect({ first: directions['English first'], second: directions['English second'] }).toEqual({ first: 'rtl', second: 'rtl' });
      expect(sharedTextDirections(left.state.doc, sharedDirectionGroup).size).toBe(1);
    } finally { left.destroy(); right.destroy(); leftDoc.destroy(); rightDoc.destroy(); }
  });

  it('exports a derived snapshot and reopens shared declarations, not frozen RTL', () => {
    const source = '<ul dir="ltr"><li><p>Outer parent</p><ol dir="auto" start="0"><li><p>שלום anchor</p></li><li><p>English selected</p></li><li><p>English tail</p></li></ol></li><li><p>Outer after</p></li></ul>';
    const editor = make([p('Initial')], [0, 0]);
    const original = ServerHTMLImporter.parse(source, editor.state.schema);
    editor.dispatch(editor.createTransaction().replace(0, editor.state.doc.childCount, original.content)
      .setSelection(Selection.cursor([0, 0, 1, 1, 0, 0], 0)));
    expect(outdentListItem(editor)).toBe(true);
    const before = editor.getJSON(), html = HTMLExporter.export(editor.state.doc, { document: false });
    expect(html.match(/data-fountain-direction-origin="auto"/g)).toHaveLength(3);
    expect(html.match(/dir="rtl"/g)).toHaveLength(3);
    const reopened = ServerHTMLImporter.parseWithReport(html, editor.state.schema);
    expect(reopened.issues.filter(issue => /direction ownership/.test(issue.message))).toEqual([]);
    expect(reopened.document.toJSON().content).toEqual(before.content);
    expect(modelDirections(reopened.document)).toEqual(modelDirections(editor.state.doc));
    expect(editor.getJSON()).toEqual(before);
  });

  it('reports receiving structural schemas that cannot implement the grouping marker', () => {
    const editor = make(nested(), [0, 0, 1, 1, 0, 0]);
    expect(outdentListItem(editor)).toBe(true);
    const html = HTMLExporter.export(editor.state.doc, { document: false });
    const { directionGroup: _, ...attrs } = CoreSchemaSpec.nodes.ordered_list.attrs!;
    const schema = new Schema({ ...CoreSchemaSpec, nodes: {
      ...CoreSchemaSpec.nodes, ordered_list: { ...CoreSchemaSpec.nodes.ordered_list, attrs },
    } });
    expect(ServerHTMLImporter.parseWithReport(html, schema).issues.some(issue => /direction ownership/.test(issue.message))).toBe(true);
  });
});
