import { expect, it, vi } from 'vitest';
import { CoreExtension, NodeSelection, Selection, composeExtensions, createEditor, type Node } from '../src';
import { PagesExtension, createFootnoteClipboardPlugin, inspectFootnotes } from '../src/pages';

function setup() {
  const kit = composeExtensions([CoreExtension, PagesExtension]);
  const editor = createEditor({ schema: kit.schema });
  const { schema } = editor.state;
  const ref = (id: string) => schema.node('footnote_reference', { id });
  const p = (text: string, id?: string) => schema.node('paragraph', {}, [schema.text(text), ...(id ? [ref(id)] : [])]);
  const note = (id: string, text: string, other?: string) => schema.node('footnote_definition', { id }, [p(text, other)]);
  return { editor, schema, p, note, ref };
}

it('copies transitive and cyclic note dependencies once, without unrelated unused bodies', () => {
  const { editor, schema, p, note } = setup();
  const body = p('Selected', 'a');
  editor.dispatch(editor.createTransaction().replaceDocument(schema.node('doc', {}, [body,
    note('a', 'First', 'b'), note('b', 'Second', 'a'), note('unused', 'Do not copy')])));
  editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [0])));
  const plugin = createFootnoteClipboardPlugin();
  const copied = plugin.spec.props!.transformCopiedDocument!(editor, schema.node('doc', {}, [body]));
  expect(inspectFootnotes(copied).definitions.map(item => item.id)).toEqual(['a', 'b']);
  expect(inspectFootnotes(copied).valid).toBe(true);
  expect(copied.textContent).not.toContain('Do not copy');
  editor.destroy();
});

it('copies selected body text as prose rather than creating an unused note', () => {
  const { editor, schema, p, note } = setup();
  editor.dispatch(editor.createTransaction().replaceDocument(schema.node('doc', {}, [p('Reference', 'a'), note('a', 'Body')])));
  editor.dispatch(editor.createTransaction().setSelection(new Selection([1, 0, 0], 0, 4)));
  const fragment = schema.node('doc', {}, [note('a', 'Body')]);
  const copied = createFootnoteClipboardPlugin().spec.props!.transformCopiedDocument!(editor, fragment);
  expect(copied.content.map(node => node.type.name)).toEqual(['paragraph']);
  expect(copied.textContent).toBe('Body'); editor.destroy();
});

it('rekeys a complete pasted graph while preserving shared references and nested definition links', () => {
  const { editor, schema, p, note } = setup();
  const incoming = schema.node('doc', {}, [p('Copied', 'a'), p('Again', 'a'), note('a', 'First', 'b'), note('b', 'Second')]);
  editor.dispatch(editor.createTransaction().replaceDocument(incoming));
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  const plugin = createFootnoteClipboardPlugin({ idFactory: () => 'copy' });
  expect(plugin.spec.props!.handlePasteDocument!(editor, incoming, { source: 'fountain' })).toBe(true);
  const report = inspectFootnotes(editor.state.doc);
  expect(report.definitions.map(note => note.id)).toEqual(['a', 'b', 'copy', 'copy-2']);
  expect(report.references.filter(note => note.id === 'copy')).toHaveLength(2);
  expect(report.references.filter(note => note.id === 'copy-2')).toHaveLength(1);
  expect(report.valid).toBe(true); expect(report.definitions.every(note => note.path.length === 1)).toBe(true);
  editor.destroy();
});

it('keeps definitions at the root when prose is pasted inside a quote', () => {
  const { editor, schema, p, note } = setup();
  editor.dispatch(editor.createTransaction().replaceDocument(schema.node('doc', {}, [schema.node('blockquote', {}, [p('Destination')])])));
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0, 0], 0)));
  const incoming = schema.node('doc', {}, [p('Copied', 'a'), note('a', 'Body')]);
  expect(createFootnoteClipboardPlugin().spec.props!.handlePasteDocument!(editor, incoming, { source: 'html' })).toBe(true);
  const report = inspectFootnotes(editor.state.doc);
  expect(report.valid).toBe(true); expect(report.definitions[0]!.path).toHaveLength(1);
  editor.destroy();
});

it.each(['missing', 'duplicate', 'host'] as const)('refuses %s ownership without publishing a partial insertion', kind => {
  const { editor, schema, p, note } = setup();
  editor.dispatch(editor.createTransaction().replaceDocument(schema.node('doc', {}, [p('Destination')])));
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  const before = editor.state, changed = vi.fn(); const release = editor.subscribe(changed);
  const incoming = schema.node('doc', {}, [p('Copied', 'a'), ...(kind === 'missing' ? [] : [note('a', 'Body')]),
    ...(kind === 'duplicate' ? [note('a', 'Different body')] : [])]);
  const plugin = createFootnoteClipboardPlugin({ validateDocument: () => { throw new Error('Host refusal'); } });
  expect(() => plugin.spec.props!.handlePasteDocument!(editor, incoming, { source: 'fountain' })).toThrow();
  expect(editor.state).toBe(before); expect(changed).not.toHaveBeenCalled();
  release(); editor.destroy();
});
