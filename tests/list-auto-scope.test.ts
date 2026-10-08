// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { HTMLExporter, MarkdownExporter, Plugin, Selection, TextExporter, createEditor,
  createHistoryPlugin, outdentListItem, redo, toggleList, undo, type NodeJSON, type SchemaSpec } from '../src/headless';
import { CoreSchemaSpec, CoreExtension, composeExtensions } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';
import { createStableNodeIdsExtension, inspectStableNodeIds } from '../src/node-ids';
import * as Y from 'yjs';
import { createYjsCollaborationExtension } from '../src/yjs';
import { exportDOCX, importDOCX } from '../src/docx';

const p = (text: string): NodeJSON => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const item = (text: string): NodeJSON => ({ type: 'list_item', content: [p(text)] });
const source: NodeJSON = { type: 'ordered_list', attrs: { dir: 'auto', start: 0 }, content: [item('שלום'), item('English selected'), item('English tail')] };
const make = (schema: SchemaSpec = CoreSchemaSpec, content: NodeJSON = source, plugins: Plugin[] = []) => {
  const editor = createEditor({ schema, content: { type: 'doc', attrs: { title: 'Keep root' }, content: [content] }, plugins: [createHistoryPlugin(), ...plugins] });
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 1, 0, 0], 3)));
  return editor;
};

describe('shared automatic list scopes', () => {
  it('transports the shared group and subsequent anchor edits through Yjs in pure Node', () => {
    const left = new Y.Doc(), right = new Y.Doc();
    const createPeer = (document: Y.Doc, id: string) => {
      const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document,
        user: { id, name: id, color: '#8800aa' } })]);
      return createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content: [source] } });
    };
    const first = createPeer(left, 'Ada');
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left), 'seed');
    const second = createPeer(right, 'Grace');
    try {
      first.dispatch(first.createTransaction().setSelection(Selection.cursor([0, 1, 0, 0], 2)));
      expect(toggleList(first, 'bullet')).toBe(true);
      Y.applyUpdate(right, Y.encodeStateAsUpdate(left), 'remote');
      expect(second.getJSON()).toEqual(first.getJSON());
      second.dispatch(second.createTransaction().insertText([0, 0, 0, 0, 0], 0, 'English '));
      Y.applyUpdate(left, Y.encodeStateAsUpdate(right), 'remote');
      expect(first.getJSON()).toEqual(second.getJSON());
      expect(first.state.doc.child(0).attrs.dir).toBe('auto');
      expect(first.state.doc.child(0).child(0).textContent).toBe('English שלום');
    } finally { first.destroy(); second.destroy(); left.destroy(); right.destroy(); }
  });

  it('reports DOCX scope loss while preserving distinct paragraphs and numbering', () => {
    const editor = make(); expect(outdentListItem(editor)).toBe(true);
    const exported = exportDOCX(editor.state.doc);
    expect(exported.report.issues).toContainEqual(expect.objectContaining({ code: 'direction-scope-omitted', path: [0] }));
    expect(exported.report.issues).toContainEqual(expect.objectContaining({ code: 'text-direction-not-exported', path: [0] }));
    const reopened = importDOCX(exported.bytes, editor.state.schema).document;
    expect(reopened.content.map(node => node.type.name)).toEqual(['ordered_list', 'paragraph', 'ordered_list']);
    expect(reopened.content.map(node => node.textContent)).toEqual(['שלום', 'English selected', 'English tail']);
    expect(reopened.child(0).attrs.start).toBe(0); expect(reopened.child(2).attrs.start).toBe(2);
  });

  it('can rewrap a lifted paragraph without leaving or duplicating its shared context', () => {
    const editor = make(); expect(outdentListItem(editor)).toBe(true);
    const lifted = editor.getJSON();
    expect(toggleList(editor, 'bullet')).toBe(true);
    const scope = editor.state.doc.child(0);
    expect(scope.type.name).toBe('direction_scope');
    expect(scope.content.map(node => node.type.name)).toEqual(['ordered_list', 'bullet_list', 'ordered_list']);
    expect(scope.content.every(node => node.attrs.dir === undefined)).toBe(true);
    expect(editor.state.selection.path).toEqual([0, 1, 0, 0, 0]);
    expect(editor.state.selection.from).toBe(3);
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(lifted);
  });

  it.each(['blockquote', 'direction_scope'] as const)('wraps sibling paragraphs inside %s, retaining range endpoints', type => {
    const editor = make(CoreSchemaSpec, { type, attrs: { dir: 'auto' }, content: [p('שלום'), p('English'), p('Tail')] });
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0, 0], 2, [0, 1, 0], 4)));
    expect(toggleList(editor, 'task')).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe(type);
    expect(editor.state.doc.child(0).child(0).type.name).toBe('task_list');
    expect(editor.state.doc.child(0).child(1).textContent).toBe('Tail');
    expect(editor.state.selection.path).toEqual([0, 0, 0, 0, 0]);
    expect(editor.state.selection.endPath).toEqual([0, 0, 1, 0, 0]);
    expect([editor.state.selection.from, editor.state.selection.to]).toEqual([2, 4]);
  });

  it('keeps default stable group identity and does not duplicate fragment IDs', () => {
    const kit = composeExtensions([CoreExtension, createStableNodeIdsExtension()]);
    const editor = createEditor({ schema: kit.schema, plugins: [createHistoryPlugin(), ...kit.plugins],
      content: { type: 'doc', content: [{ ...source, attrs: { ...source.attrs, nodeId: 'original-group' } }] } });
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 1, 0, 0], 3)));
    const original = editor.getJSON();
    const itemId = editor.state.doc.child(0).child(1).attrs.nodeId;
    expect(toggleList(editor, 'bullet')).toBe(true);
    expect(editor.state.doc.child(0).attrs.nodeId).toBe('original-group');
    expect(editor.state.doc.child(0).child(1).child(0).attrs.nodeId).toBe(itemId);
    expect(inspectStableNodeIds(editor.state.doc)).toEqual([]);
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(original);
  });

  it('refuses wrapping across different container parents', () => {
    const editor = make(CoreSchemaSpec, { type: 'direction_scope', attrs: { dir: 'auto' },
      content: [{ type: 'blockquote', content: [p('שלום')] }, p('English')] });
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0, 0, 0], 0, [0, 1, 0], 4)));
    const original = editor.state;
    expect(toggleList(editor, 'bullet')).toBe(false); expect(editor.state).toBe(original);
  });

  it.each(['bullet', 'task'] as const)('keeps one shared automatic group when converting the middle item to %s', kind => {
    expect(typeof globalThis.document).toBe('undefined');
    const editor = make();
    const original = editor.getJSON();
    expect(toggleList(editor, kind)).toBe(true);
    const group = editor.state.doc.child(0);
    expect(group.type.name).toBe('direction_scope');
    expect(group.attrs.dir).toBe('auto');
    expect(group.content.map(node => node.type.name)).toEqual(['ordered_list', kind === 'task' ? 'task_list' : 'bullet_list', 'ordered_list']);
    for (const child of group.content) expect(child.attrs.dir).toBeUndefined();
    expect(group.child(0).attrs.start).toBe(0);
    expect(group.child(2).attrs.start).toBe(2);
    expect(editor.state.selection.path).toEqual([0, 1, 0, 0, 0]);
    expect(editor.state.selection.from).toBe(3);
    expect(editor.state.doc.attrs.title).toBe('Keep root');
    const after = editor.getJSON();
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(original);
    expect(redo(editor)).toBe(true); expect(editor.getJSON()).toEqual(after);
  });

  it.each(['middle', 'all'] as const)('retains one group while lifting %s items out of an automatic list', amount => {
    const editor = make();
    if (amount === 'all') editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0, 0, 0], 1, [0, 2, 0, 0], 4)));
    const original = editor.getJSON();
    expect(outdentListItem(editor)).toBe(true);
    const group = editor.state.doc.child(0);
    expect(group.type.name).toBe('direction_scope'); expect(group.attrs.dir).toBe('auto');
    expect(group.content.map(node => node.type.name)).toEqual(amount === 'middle' ? ['ordered_list', 'paragraph', 'ordered_list'] : ['paragraph', 'paragraph', 'paragraph']);
    expect(group.content.every(node => node.attrs.dir === undefined)).toBe(true);
    expect(editor.state.selection.path).toEqual(amount === 'middle' ? [0, 1, 0] : [0, 0, 0]);
    expect(editor.state.selection.endPath).toEqual(amount === 'middle' ? [0, 1, 0] : [0, 2, 0]);
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(original);
  });

  it('keeps an independent automatic item context when removing its list-item wrapper', () => {
    const editor = make(CoreSchemaSpec, { ...source, attrs: { dir: 'rtl', start: 0 }, content: [item('Keep'),
      { type: 'list_item', attrs: { dir: 'auto', nodeId: 'auto-item' }, content: [p('שלום'), p('English')] }, item('After')] });
    expect(outdentListItem(editor)).toBe(true);
    const scope = editor.state.doc.child(1);
    expect(scope.type.name).toBe('direction_scope'); expect(scope.attrs.dir).toBe('auto');
    expect(scope.attrs.nodeId).toBe('auto-item');
    expect(scope.content.map(node => node.textContent)).toEqual(['שלום', 'English']);
    expect(scope.content.every(node => node.attrs.dir === undefined)).toBe(true);
    expect(editor.state.selection.path).toEqual([1, 0, 0]);
  });

  it('preserves scope declarations through JSON, server HTML and explicit Markdown HTML projection', () => {
    const editor = make(); expect(toggleList(editor, 'bullet')).toBe(true);
    const html = HTMLExporter.export(editor.state.doc, { document: false });
    expect(html).toContain('data-fountain-direction-scope');
    expect(html.match(/dir="auto"/g)).toHaveLength(1);
    expect(ServerHTMLImporter.parseWithReport(html, editor.state.schema).issues).toEqual([]);
    // Fragment HTML does not carry the root document title. Require the exact
    // typed scope/content tree; JSON separately retains the whole document.
    expect(ServerHTMLImporter.parse(html, editor.state.schema).content.map(node => node.toJSON()))
      .toEqual(editor.state.doc.content.map(node => node.toJSON()));
    expect(editor.state.schema.nodeFromJSON(editor.getJSON()).toJSON()).toEqual(editor.getJSON());
    const markdown = MarkdownExporter.exportWithReport(editor.state.doc);
    expect(markdown.markdown).toContain('data-fountain-direction-scope');
    expect(markdown.losses).toContainEqual(expect.objectContaining({ kind: 'node', type: 'direction_scope' }));
    expect(TextExporter.export(editor.state.doc)).toBe('שלום\nEnglish selected\nEnglish tail');
  });

  it.each(['convert', 'lift'] as const)('refuses %s atomically when the schema has no direction-scope capability', action => {
    const schema = { ...CoreSchemaSpec, nodes: Object.fromEntries(Object.entries(CoreSchemaSpec.nodes).filter(([name]) => name !== 'direction_scope')) };
    const editor = make(schema); const original = editor.state;
    expect(action === 'convert' ? toggleList(editor, 'bullet') : outdentListItem(editor)).toBe(false);
    expect(editor.state).toBe(original);
  });

  it('uses final destination capabilities and refuses a whole-list validator without throwing', () => {
    const schema = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, bullet_list: {
      ...CoreSchemaSpec.nodes.bullet_list, attrs: { ...CoreSchemaSpec.nodes.bullet_list.attrs,
        dir: { default: undefined, validate: (value: unknown) => value === undefined || value === 'ltr' || value === 'rtl' },
      },
    } } };
    const editor = make(schema);
    expect(toggleList(editor, 'bullet')).toBe(true);
    expect(editor.state.doc.child(0).attrs.dir).toBe('auto');
    expect(undo(editor)).toBe(true);
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0, 0, 0], 0, [0, 2, 0, 0], 3)));
    const original = editor.state;
    expect(toggleList(editor, 'bullet')).toBe(false); expect(editor.state).toBe(original);
  });

  it.each(['convert', 'lift'] as const)('returns false for a host-filtered %s with exact state retention', action => {
    const editor = make(CoreSchemaSpec, source, [new Plugin({ filterTransaction: tr => !tr.docChanged })]);
    const original = editor.state;
    expect(action === 'convert' ? toggleList(editor, 'bullet') : outdentListItem(editor)).toBe(false);
    expect(editor.state).toBe(original);
  });

  it.each(['convert', 'lift'] as const)('refuses %s when a host disallows the required suffix numbering', action => {
    const schema = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ordered_list: {
      ...CoreSchemaSpec.nodes.ordered_list, attrs: { ...CoreSchemaSpec.nodes.ordered_list.attrs,
        start: { default: 0, validate: (value: unknown) => value === 0 },
      },
    } } };
    const editor = make(schema); const original = editor.state;
    expect(action === 'convert' ? toggleList(editor, 'bullet') : outdentListItem(editor)).toBe(false);
    expect(editor.state).toBe(original);
  });

  it('does not add a group when a whole list conversion retains the original scope', () => {
    const editor = make(); editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0, 0, 0], 0, [0, 2, 0, 0], 3)));
    expect(toggleList(editor, 'bullet')).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe('bullet_list'); expect(editor.state.doc.child(0).attrs.dir).toBe('auto');
  });

  it('retains a whole automatic context when the destination list has no direction capability', () => {
    const { dir: _dir, ...attrs } = CoreSchemaSpec.nodes.bullet_list.attrs!;
    const schema = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      bullet_list: { ...CoreSchemaSpec.nodes.bullet_list, attrs },
    } };
    const editor = make(schema);
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0, 0, 0], 0, [0, 2, 0, 0], 3)));
    expect(toggleList(editor, 'bullet')).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe('direction_scope');
    expect(editor.state.doc.child(0).attrs.dir).toBe('auto');
    expect(editor.state.doc.child(0).child(0).type.name).toBe('bullet_list');
    expect(editor.state.selection.path).toEqual([0, 0, 0, 0, 0]);
    expect(editor.state.selection.endPath).toEqual([0, 0, 2, 0, 0]);
  });
});
