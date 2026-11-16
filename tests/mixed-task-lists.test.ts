/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { CoreSchemaSpec, Schema, MarkdownImporter, MarkdownExporter, HTMLImporter, HTMLExporter,
  Selection, createEditor, createHistoryPlugin, indentListItem, outdentListItem, splitBlock, joinBackward, toggleList, undo, redo } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(CoreSchemaSpec);
const mixed = '- Plain item\n- [ ] Pending\n- [x] Done\n- Another bullet';
const kinds = (node: ReturnType<typeof MarkdownImporter.parse>) => node.content.map(item => item.type.name);

it.each([
  mixed,
  '- [x] Parent\n  - Plain child\n  - [ ] Task child\n- Plain sibling',
  '3. [ ] First\n4. Plain second\n5. [x] Last',
  '- Plain\n\n  Follow-up.\n\n- [ ] **Task**\n\n  Task follow-up.',
])('retains one mixed list and its item states through Markdown and both HTML importers: %s', source => {
  const doc = MarkdownImporter.parse(source, schema);
  expect(doc.childCount).toBe(1);
  expect(doc.child(0).content.some(item => item.type.name === 'list_item')).toBe(true);
  expect(doc.child(0).content.some(item => item.type.name === 'task_item')).toBe(true);
  schema.validate(doc);
  const exported = MarkdownExporter.export(doc);
  expect(MarkdownImporter.parse(exported, schema).eq(doc)).toBe(true);
  const html = HTMLExporter.export(doc, { document: false });
  expect(HTMLImporter.parse(html, schema).eq(doc)).toBe(true);
  const result = ServerHTMLImporter.parseWithReport(html, schema);
  expect(result.issues).toEqual([]);
  expect(result.document.eq(doc)).toBe(true);
});

it('retains mixed item types and checked state while indenting and lifting a range', () => {
  const doc = MarkdownImporter.parse(mixed, schema);
  const editor = createEditor({ schema: CoreSchemaSpec, plugins: [createHistoryPlugin()], content: doc.toJSON() });
  editor.dispatch(editor.createTransaction().setSelection(new Selection([0, 1, 0, 0], 0, 4, [0, 3, 0, 0])));
  expect(indentListItem(editor)).toBe(true);
  const nested = editor.state.doc.child(0).child(0).child(1);
  expect(kinds(nested)).toEqual(['task_item', 'task_item', 'list_item']);
  expect(nested.child(1).attrs.checked).toBe(true);
  expect(outdentListItem(editor)).toBe(true);
  expect(editor.state.doc.toJSON()).toEqual(doc.toJSON());
  editor.destroy();
});

it.each([['bullet', 0, 'list_item'], ['task', 2, 'task_item']] as const)('splits and joins %s items without changing their neighbours', (_kind, index, type) => {
  const editor = createEditor({ schema: CoreSchemaSpec, plugins: [createHistoryPlugin()], content: MarkdownImporter.parse(mixed, schema).toJSON() });
  const before = editor.state.doc;
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, index, 0, 0], 2)));
  expect(splitBlock(editor)).toBe(true);
  const list = editor.state.doc.child(0);
  expect(list.child(index + 1).type.name).toBe(type);
  if (type === 'task_item') {
    expect(list.child(index).attrs.checked).toBe(true);
    expect(list.child(index + 1).attrs.checked).toBe(false);
  }
  expect(undo(editor)).toBe(true);
  expect(editor.state.doc.toJSON()).toEqual(before.toJSON());
  expect(redo(editor)).toBe(true);
  expect(joinBackward(editor)).toBe(true);
  expect(kinds(editor.state.doc.child(0))).toEqual(kinds(before.child(0)));
  expect(MarkdownExporter.export(editor.state.doc)).toBe(MarkdownExporter.export(before));
  editor.destroy();
});

it('changes only the selected item kind in an existing mixed list', () => {
  const editor = createEditor({ schema: CoreSchemaSpec, plugins: [createHistoryPlugin()], content: MarkdownImporter.parse(mixed, schema).toJSON() });
  const before = editor.state.doc;
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0], 2)));
  expect(toggleList(editor, 'task')).toBe(true);
  expect(editor.state.doc.childCount).toBe(1);
  expect(kinds(editor.state.doc.child(0))).toEqual(['task_item', 'task_item', 'task_item', 'list_item']);
  expect(editor.state.doc.child(0).child(2).attrs.checked).toBe(true);
  expect(undo(editor)).toBe(true);
  expect(editor.state.doc.toJSON()).toEqual(before.toJSON());
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 1, 0, 0], 2)));
  expect(toggleList(editor, 'bullet')).toBe(true);
  expect(kinds(editor.state.doc.child(0))).toEqual(['list_item', 'list_item', 'task_item', 'list_item']);
  editor.destroy();
});
