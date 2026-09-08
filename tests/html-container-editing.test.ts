import { expect, it } from 'vitest';
import { Schema, Selection, NodeSelection, Plugin, createEditor, createHistoryPlugin, undo, redo,
  insertHTMLContainer, appendHTMLContainerParagraph, unwrapHTMLContainer, HTMLContainerExtension, setNodeAttributes } from '../src/headless';
import { ServerHTMLImporter } from '../src/html/server';
import { CoreSchemaSpec } from '../src/extensions';

const spec = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...HTMLContainerExtension.nodes } };
function setup(html = '<p>Before</p><section id="keep"><p>First</p><p>Second</p></section><p>After</p>', editable = true, reject = false) {
  return createEditor({ schema: spec, editable,
    content: ServerHTMLImporter.parse(html, new Schema(spec)).toJSON(),
    plugins: [createHistoryPlugin(), ...(reject ? [new Plugin({ filterTransaction: transaction => !transaction.docChanged })] : [])],
  });
}

it('registers optional commands without changing the core schema', () => {
  expect(CoreSchemaSpec.nodes.html_container).toBeUndefined();
  expect(HTMLContainerExtension.commands?.insertHTMLContainer).toBe(insertHTMLContainer);
  expect(typeof document).toBe('undefined');
});

it('inserts after the selected block without deleting selection, and supports undo/redo', () => {
  const editor = setup();
  const before = editor.state.doc.toJSON();
  editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [1])));
  expect(insertHTMLContainer(editor, { tag: 'aside', title: 'Notes' })).toBe(true);
  expect(editor.state.doc.child(1).attrs.id).toBe('keep');
  expect(editor.state.doc.child(2).attrs.tag).toBe('aside');
  expect(editor.state.selection.path).toEqual([2, 0, 0]);
  expect(undo(editor)).toBe(true);
  expect(editor.state.doc.toJSON()).toEqual(before);
  expect(redo(editor)).toBe(true);
  expect(editor.state.doc.child(2).attrs.title).toBe('Notes');
  editor.destroy();
});

it('makes an empty imported container editable only on request, retaining attributes', () => {
  const editor = setup('<section id="empty" lang="fr" dir="rtl"></section>');
  expect(editor.state.doc.child(0).childCount).toBe(0);
  expect(appendHTMLContainerParagraph(editor, [0])).toBe(true);
  expect(editor.state.selection.path).toEqual([0, 0, 0]);
  expect(editor.state.doc.child(0).attrs).toMatchObject({ id: 'empty', lang: 'fr', dir: 'rtl' });
  expect(undo(editor)).toBe(true);
  expect(editor.state.doc.child(0).childCount).toBe(0);
  editor.destroy();
});

it('uses the existing attribute command without losing content or other properties', () => {
  const editor = setup();
  expect(setNodeAttributes(editor, [1], { tag: 'article', title: 'Status' })).toBe(true);
  expect(editor.state.doc.child(1).attrs).toMatchObject({ id: 'keep', tag: 'article', title: 'Status' });
  expect(editor.state.doc.child(1).textContent).toBe('FirstSecond');
  expect(setNodeAttributes(editor, [1], { tag: 'script' })).toBe(false);
  editor.destroy();
});

it('unwraps a nested section while keeping rich children, metadata and selected text', () => {
  const editor = setup('<article id="outer"><p>Before</p><section id="inner"><p>First</p><p><strong>Second</strong></p></section><p>After</p></article>');
  const before = editor.state.doc.toJSON();
  editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 1, 0, 0], 1, [0, 1, 1, 0], 3)));
  expect(unwrapHTMLContainer(editor, [0, 1])).toBe(true);
  expect(editor.state.doc.child(0).attrs.id).toBe('outer');
  expect(editor.state.doc.child(0).child(2).child(0).marks[0]?.type.name).toBe('strong');
  expect(editor.state.selection.eq(Selection.range([0, 1, 0], 1, [0, 2, 0], 3))).toBe(true);
  expect(undo(editor)).toBe(true);
  expect(editor.state.doc.toJSON()).toEqual(before);
  editor.destroy();
});

it('keeps a selected atom when unwrapping a container', () => {
  const editor = setup('<section><hr></section>');
  editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [0, 0])));
  expect(unwrapHTMLContainer(editor, [0])).toBe(true);
  expect(editor.state.selection).toBeInstanceOf(NodeSelection);
  expect((editor.state.selection as NodeSelection).nodePath).toEqual([0]);
  editor.destroy();
});

it('replaces an empty wrapper with a caret-bearing paragraph and undoes exactly', () => {
  const editor = setup('<section id="empty"></section>');
  expect(unwrapHTMLContainer(editor, [0])).toBe(true);
  expect(editor.state.doc.child(0).type.name).toBe('paragraph');
  expect(editor.state.selection.path).toEqual([0, 0]);
  undo(editor);
  expect(editor.state.doc.child(0).attrs.id).toBe('empty');
  expect(editor.state.doc.child(0).childCount).toBe(0);
  editor.destroy();
});

it.each([[], [-1], [0.5], [99], [0]].map(path => ({ path })))('declines invalid or non-container target $path', ({ path }) => {
  const editor = setup();
  const before = editor.state.doc;
  expect(appendHTMLContainerParagraph(editor, path)).toBe(false);
  expect(unwrapHTMLContainer(editor, path)).toBe(false);
  expect(editor.state.doc).toBe(before);
  editor.destroy();
});

it.each(['reader', 'filter'] as const)('respects %s rejection without changing the document', mode => {
  const editor = setup(undefined, mode !== 'reader', mode === 'filter');
  const before = editor.state.doc;
  expect(insertHTMLContainer(editor)).toBe(false);
  expect(appendHTMLContainerParagraph(editor, [1])).toBe(false);
  expect(unwrapHTMLContainer(editor, [1])).toBe(false);
  expect(editor.state.doc).toBe(before);
  editor.destroy();
});

it('declines insertion without the module or with invalid attributes', () => {
  const editor = setup();
  expect(insertHTMLContainer(editor, { tag: 'script' })).toBe(false);
  const basic = createEditor({ schema: CoreSchemaSpec });
  expect(insertHTMLContainer(basic)).toBe(false);
  basic.destroy(); editor.destroy();
});

it('does not unwrap into a parent that requires section children', () => {
  const strict = { ...spec, nodes: { ...spec.nodes,
    section_group: { group: 'block', content: 'html_container+' },
  } };
  const editor = createEditor({ schema: strict, content: { type: 'doc', content: [
    { type: 'section_group', content: [{ type: 'html_container', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Keep this' }] },
    ] }] },
  ] } });
  const before = editor.state.doc;
  expect(unwrapHTMLContainer(editor, [0, 0])).toBe(false);
  expect(editor.state.doc).toBe(before);
  editor.state.schema.validate(editor.state.doc);
  editor.destroy();
});
