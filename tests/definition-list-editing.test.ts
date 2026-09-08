// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { CoreExtension, CoreSchemaSpec, HistoryExtension, HTMLExporter, HTMLImporter, Schema, Selection,
  appendDefinitionPair, composeExtensions, createEditor, deleteDefinitionList, insertDefinitionList, insertText,
  splitBlock, joinBackward, undo, redo, NodeSelection, Plugin } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

it.each([
  '<dl><dt>Latency</dt><dd>Time to respond.</dd><dt>Throughput</dt><dd>Work per second.</dd></dl>',
  '<dl><dt>A</dt><dt>B</dt><dd><p>C</p><p>D</p></dd><dd>E</dd></dl>',
  '<dl><div><dt>A</dt><dd><dl><dt>B</dt><dd>C</dd></dl></dd></div></dl>',
  '<dl><dt></dt><dd></dd></dl>', '<dl></dl>',
  '<dl><!-- metadata --><dt>A</dt><script>bad()</script><dd>B</dd></dl>',
  '<dl><p>Unrelated block</p><dt>A</dt><dd>B</dd></dl>',
  '<dt>Orphan</dt><dd>Kept separately</dd>',
])('browser paste and server conversion agree: %s', html => {
  const schema = new Schema(CoreSchemaSpec);
  const browser = HTMLImporter.parse(html, schema);
  expect(browser.toJSON()).toEqual(ServerHTMLImporter.parse(html, schema).toJSON());
  expect(HTMLImporter.parse(HTMLExporter.export(browser, { document: false }), schema).toJSON()).toEqual(browser.toJSON());
});

it('inserts, edits, splits, rejoins, appends, deletes and undoes a real definition list', () => {
  const kit = composeExtensions([CoreExtension, HistoryExtension]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Title' }] }] } });
  expect(insertDefinitionList(editor, 'Latency', 'Time to respond.')).toBe(true);
  expect(editor.state.selection.path).toEqual([1, 0, 0, 0]);
  expect(insertText(editor, 'API ')).toBe(true);
  editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([1, 1, 0, 0], 5)));
  expect(splitBlock(editor)).toBe(true);
  expect(editor.state.doc.child(1).child(1).content.map(node => node.textContent)).toEqual(['Time ', 'to respond.']);
  expect(joinBackward(editor)).toBe(true);
  expect(editor.state.doc.child(1).child(1).textContent).toBe('Time to respond.');
  expect(appendDefinitionPair(editor, 'Throughput', 'Work per second.')).toBe(true);
  expect(editor.state.selection.path).toEqual([1, 2, 0, 0]);
  const beforeDelete = editor.state.doc.toJSON();
  expect(deleteDefinitionList(editor)).toBe(true);
  expect(editor.state.doc.childCount).toBe(1);
  expect(undo(editor)).toBe(true);
  expect(editor.state.doc.toJSON()).toEqual(beforeDelete);
  expect(redo(editor)).toBe(true);
  expect(editor.state.doc.childCount).toBe(1);
  editor.destroy();
});

it('supports node selection and refuses mutations in a read-only editor', () => {
  const kit = composeExtensions([CoreExtension, HistoryExtension]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
  insertDefinitionList(editor, 'Name', 'Description');
  editor.dispatch(editor.state.createTransaction().setSelection(new NodeSelection(editor.state.doc, [1])));
  expect(appendDefinitionPair(editor)).toBe(true);
  const original = editor.state.doc.toJSON();
  const reader = createEditor({ schema: kit.schema, state: editor.state, editable: false });
  expect(insertDefinitionList(reader)).toBe(false);
  expect(appendDefinitionPair(reader)).toBe(false);
  expect(deleteDefinitionList(reader)).toBe(false);
  expect(reader.state.doc.toJSON()).toEqual(original);
  reader.destroy();
  editor.destroy();
});

it('deletes a nested list without leaving an invalid empty description', () => {
  const kit = composeExtensions([CoreExtension, HistoryExtension]);
  const schema = new Schema(kit.schema);
  const content = ServerHTMLImporter.parse('<dl><dt>Outer</dt><dd><dl><dt>Inner</dt><dd>Value</dd></dl></dd></dl>', schema).toJSON();
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 1, 0, 0, 0, 0], 0)));
  expect(deleteDefinitionList(editor)).toBe(true);
  editor.state.schema.validate(editor.state.doc);
  expect(editor.state.doc.child(0).child(1).child(0).type.name).toBe('paragraph');
  expect(undo(editor)).toBe(true);
  expect(editor.state.doc.toJSON()).toEqual(content);
  editor.destroy();
});

it('respects host-registered term attributes through both HTML importers', () => {
  const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
    definition_term: { ...CoreSchemaSpec.nodes.definition_term, attrs: { label: { default: '' } },
      parseHTML: [{ tag: 'dt', getAttrs: element => ({ label: element.getAttribute('data-label') ?? '' }) }],
      toDOM: node => ['dt', { 'data-label': node.attrs.label }, 0],
    },
  } });
  const html = '<dl><dt data-label="api-latency">Latency</dt><dd>Duration</dd></dl>';
  const browser = HTMLImporter.parse(html, schema);
  expect(browser.child(0).child(0).attrs.label).toBe('api-latency');
  expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(browser.toJSON());
  expect(HTMLExporter.export(browser)).toContain('data-label="api-latency"');
});

it('reports rejected host transactions as failures without modifying the document', () => {
  const schema = new Schema(CoreSchemaSpec);
  const content = ServerHTMLImporter.parse('<dl><dt>Term</dt><dd>Description</dd></dl>', schema).toJSON();
  const editor = createEditor({ schema: CoreSchemaSpec, content,
    plugins: [new Plugin({ filterTransaction: transaction => !transaction.docChanged })],
  });
  const before = editor.state.doc;
  expect(insertDefinitionList(editor)).toBe(false);
  expect(appendDefinitionPair(editor)).toBe(false);
  expect(deleteDefinitionList(editor)).toBe(false);
  expect(editor.state.doc).toBe(before);
  editor.destroy();
});
