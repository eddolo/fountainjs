import { describe, expect, it } from 'vitest';
import {
  AllSelection, CellSelection, CoreSchemaSpec, HTMLExporter, MarkdownExporter,
  NodeSelection, Plugin, Schema, Selection, createEditor, createHistoryPlugin,
  redo, setTextAlignment, undo,
} from '../src';
import { ServerHTMLImporter } from '../src/html/server';
import * as Y from 'yjs';
import { CoreExtension, composeExtensions } from '../src';
import { createYjsCollaborationExtension } from '../src/yjs';

const schema = new Schema(CoreSchemaSpec);
const p = (text = '') => schema.node('paragraph', {}, text ? [schema.text(text)] : []);
const document = () => schema.node('doc', {}, [
  schema.node('heading', { level: 2 }, [schema.text('Report')]),
  p('First paragraph'), p(),
  schema.node('blockquote', {}, [p('Quoted paragraph')]),
  schema.node('bullet_list', {}, [schema.node('list_item', {}, [p('List item')])]),
  schema.node('code_block', {}, [schema.text('keep code literal')]),
  p('Last paragraph'),
]);
const editorFor = () => createEditor({ schema: CoreSchemaSpec, content: document().toJSON(), plugins: [createHistoryPlugin()] });
function alignments(node: ReturnType<typeof document>): unknown[] {
  if (['paragraph', 'heading'].includes(node.type.name)) return [node.attrs.align];
  return node.content.flatMap(alignments);
}

describe('selection-wide block alignment', () => {
  it('formats every selected block, including nested and empty blocks, as one undoable transaction', () => {
    const editor = editorFor();
    const selection = Selection.range([0, 0], 2, [4, 0, 0, 0], 4);
    editor.dispatch(editor.createTransaction().setSelection(selection));
    const before = editor.state.doc.toJSON();
    expect(setTextAlignment(editor, 'center')).toBe(true);
    expect(alignments(editor.state.doc)).toEqual(['center', 'center', 'center', 'center', 'center', 'left']);
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(editor.state.doc.child(5).attrs).not.toHaveProperty('align');
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(before);
    expect(redo(editor)).toBe(true);
    expect(alignments(editor.state.doc)[4]).toBe('center');
  });

  it('does not format a block merely touched at its starting boundary', () => {
    const editor = editorFor();
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0], 2, [1, 0], 0)));
    expect(setTextAlignment(editor, 'right')).toBe(true);
    expect(alignments(editor.state.doc)).toEqual(['right', 'left', 'left', 'left', 'left', 'left']);
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 0)));
    expect(setTextAlignment(editor, 'justify')).toBe(true);
    expect(editor.state.doc.child(1).attrs.align).toBe('justify');
  });

  it('supports whole-document and container selections without touching unsupported code', () => {
    const editor = editorFor();
    editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [3])));
    expect(setTextAlignment(editor, 'right')).toBe(true);
    expect(alignments(editor.state.doc)).toEqual(['left', 'left', 'left', 'right', 'left', 'left']);
    editor.dispatch(editor.createTransaction().setSelection(new AllSelection(editor.state.doc)));
    expect(setTextAlignment(editor, 'justify')).toBe(true);
    expect(alignments(editor.state.doc)).toEqual(Array(6).fill('justify'));
    expect(editor.state.doc.child(5).toJSON()).toEqual(document().child(5).toJSON());
    expect(editor.state.selection.kind).toBe('all');
  });

  it('formats only selected table cells and keeps the cell selection', () => {
    const cell = (text: string) => schema.node('table_cell', {}, [p(text), p()]);
    const editor = createEditor({ schema: CoreSchemaSpec, content: schema.node('doc', {}, [
      schema.node('table', {}, [schema.node('table_row', {}, [cell('A'), cell('B'), cell('C')])]),
    ]).toJSON() });
    const selection = new CellSelection(editor.state.doc, [0, 0, 0], [0, 0, 1]);
    editor.dispatch(editor.createTransaction().setSelection(selection));
    expect(setTextAlignment(editor, 'center')).toBe(true);
    expect(alignments(editor.state.doc)).toEqual(['center', 'center', 'center', 'center', 'left', 'left']);
    expect(editor.state.selection.eq(selection)).toBe(true);
  });

  it('round-trips aligned blocks through DOM-free HTML and reports Markdown loss', () => {
    const editor = editorFor();
    editor.dispatch(editor.createTransaction().setSelection(new AllSelection(editor.state.doc)));
    setTextAlignment(editor, 'right');
    const html = new HTMLExporter().export(editor.state, { document: false });
    const reopened = new ServerHTMLImporter().parse(html, schema);
    expect(alignments(reopened)).toEqual(Array(6).fill('right'));
    const report = new MarkdownExporter().exportWithReport(editor.state);
    expect(report.losses.filter(issue => issue.detail.includes('alignment'))).toHaveLength(6);
  });

  it('does not mutate on no-op, invalid input, read-only state, or a rejected transaction', () => {
    const editor = editorFor();
    const before = editor.state;
    expect(setTextAlignment(editor, 'left')).toBe(false);
    expect(setTextAlignment(editor, 'right;display:none' as 'right')).toBe(false);
    expect(editor.state).toBe(before);
    const readonly = createEditor({ schema: CoreSchemaSpec, content: document().toJSON(), editable: false });
    expect(setTextAlignment(readonly, 'center')).toBe(false);
    const guarded = createEditor({ schema: CoreSchemaSpec, content: document().toJSON(), plugins: [new Plugin({ filterTransaction: () => false })] });
    expect(setTextAlignment(guarded, 'center')).toBe(false);
    expect(alignments(guarded.state.doc)).toEqual(Array(6).fill('left'));
  });

  it('rejects a multi-block change atomically when a custom schema disallows one target', () => {
    const restricted = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, heading: {
      ...CoreSchemaSpec.nodes.heading!, attrs: { ...CoreSchemaSpec.nodes.heading!.attrs,
        align: { default: 'left', validate: (value: unknown) => value === 'left' },
      },
    } } };
    const editor = createEditor({ schema: restricted, content: {
      type: 'doc', content: [p('Allowed').toJSON(), { type: 'heading', content: [{ type: 'text', text: 'Restricted' }] }],
    } });
    editor.dispatch(editor.createTransaction().setSelection(new AllSelection(editor.state.doc)));
    const before = editor.state;
    expect(setTextAlignment(editor, 'right')).toBe(false);
    expect(editor.state).toBe(before);
  });

  it('synchronizes all changed paragraph attributes through the Yjs adapter', () => {
    const leftDocument = new Y.Doc();
    const rightDocument = new Y.Doc();
    const make = (document: Y.Doc, id: string) => {
      const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, user: { id, name: id, color: '#6547ff' } })]);
      return createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content: [p('One').toJSON(), p('Two').toJSON()] } });
    };
    const left = make(leftDocument, 'left');
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'initial');
    const right = make(rightDocument, 'right');
    left.dispatch(left.createTransaction().setSelection(new AllSelection(left.state.doc)));
    expect(setTextAlignment(left, 'right')).toBe(true);
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'remote');
    expect(right.getJSON()).toEqual(left.getJSON());
    expect(alignments(right.state.doc)).toEqual(['right', 'right']);
    left.destroy(); right.destroy(); leftDocument.destroy(); rightDocument.destroy();
  });
});
