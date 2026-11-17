import { expect, it } from 'vitest';
import { createEditor, composeExtensions, StarterKit, Selection, insertText, splitBlock, undo, redo } from 'fountainjs-editor';
import captures from '../integrations/gitlab/fixtures/footnote-editing-live-html.json';
import probe from '../integrations/gitlab/fixtures/footnote-probe-live-html.json';
import { GitLabContentEditor } from '../integrations/gitlab/services/content_editor';
import { createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import { gitLabFootnoteBoundary } from '../integrations/gitlab/services/footnote_boundary';

const fixtures = [...captures.fixtures, ...probe.fixtures];
async function setup(name = 'insert') {
  const item = fixtures.find(value => value.name === name)!;
  const bridge = new GitLabContentEditor({ describeLabels: () => '', renderMarkdown: async source => {
    const normal = fixtures.find(value => value.source === source);
    if (normal) return { body: normal.body };
    const hidden = fixtures.find(value => value.probe?.source === source);
    if (hidden) return { body: hidden.probeBody! };
    throw new Error('No actual host fixture for this exact source.');
  } });
  await bridge.setSerializedContent(item.source);
  return { bridge, editor: bridge.editor, source: item.source };
}

it('keeps the public default repair while the private host omits a root paragraph after terminal editable notes', async () => {
  const { bridge, editor, source } = await setup();
  const ordinary = createEditor({ schema: createGitLabSchemaSpec(), plugins: StarterKit.plugins,
    content: editor.state.doc.toJSON() });
  expect(ordinary.state.doc.content.at(-1)!.type.name).toBe('paragraph');
  expect(ordinary.state.doc.childCount).toBe(editor.state.doc.childCount + 1);
  expect(editor.state.doc.content.at(-1)!.type.name).toBe('footnote_definition');
  expect(bridge.getSerializedContent()).toBe(source);
  ordinary.destroy(); bridge.dispose();
});

it.each(['insert', 'empty', 'mixed', 'shared'])('reopens %s notes without manufacturing prose after the endnote boundary', async name => {
  const { bridge, editor, source } = await setup(name);
  expect(editor.state.doc.content.at(-1)!.type.name).toBe('footnote_definition');
  expect(bridge.getSerializedContent()).toBe(source);
  await bridge.setSerializedContent(source);
  expect(editor.state.doc.content.at(-1)!.type.name).toBe('footnote_definition');
  bridge.dispose();
});

it('continues prose with Enter before the notes and preserves typing through undo/redo', async () => {
  const { bridge, editor } = await setup('simple');
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 2], 1)));
  expect(splitBlock(editor)).toBe(true);
  expect(insertText(editor, 'Continue the body.')).toBe(true);
  expect(editor.state.doc.child(1).textContent).toBe('Continue the body.');
  expect(editor.state.doc.content.at(-1)!.type.name).toBe('footnote_definition');
  const source = bridge.getSerializedContent();
  expect(source.indexOf('Continue the body.')).toBeLessThan(source.indexOf('[^alpha]:'));
  expect(undo(editor)).toBe(true); expect(redo(editor)).toBe(true);
  expect(bridge.getSerializedContent()).toBe(source);
  bridge.dispose();
});

it('still supplies an editable paragraph after an atomic block', async () => {
  const { bridge, editor } = await setup();
  const { schema } = editor.state;
  editor.dispatch(editor.createTransaction().replaceDocument(schema.node('doc', {}, [schema.node('horizontal_rule')])));
  expect(editor.state.doc.content.map(node => node.type.name)).toEqual(['horizontal_rule', 'paragraph']);
  expect(editor.state.doc.child(1).textContent).toBe('');
  bridge.dispose();
});

it('keeps the normal repair when the terminal note itself ends in an atomic block', async () => {
  const { bridge, editor } = await setup();
  const note = editor.state.doc.child(1);
  editor.dispatch(editor.createTransaction().replaceNode([1], [note.copy([editor.state.schema.node('horizontal_rule')])]));
  expect(editor.state.doc.child(1).type.name).toBe('footnote_definition');
  expect(editor.state.doc.child(1).child(0).type.name).toBe('horizontal_rule');
  expect(editor.state.doc.content.at(-1)!.type.name).toBe('paragraph');
  bridge.dispose();
});

it('never removes an authored paragraph or an authored empty paragraph after a note', async () => {
  const { bridge, editor } = await setup();
  const { schema } = editor.state;
  const blank = schema.node('paragraph', {}, [schema.text('')]);
  const authored = schema.node('paragraph', {}, [schema.text('Authored content after the definition.')]);
  editor.dispatch(editor.createTransaction().replace(editor.state.doc.childCount, editor.state.doc.childCount, [blank, authored]));
  expect(editor.state.doc.content.at(-2)).toBe(blank);
  expect(editor.state.doc.content.at(-1)).toBe(authored);
  expect(bridge.getSerializedContent()).toContain('Authored content after the definition.');
  bridge.dispose();
});

it('refuses wrapping an unrelated extension', () => {
  expect(() => gitLabFootnoteBoundary({ name: 'other' })).toThrow('GITLAB_FOOTNOTE_BOUNDARY_EXTENSION');
});


it('keeps a terminal direction container editable without manufacturing a root paragraph',()=>{
 const kit=StarterKit.extensions.map(extension=>extension.name==='trailing-editable-block'?gitLabFootnoteBoundary(extension):extension);
 const {plugins}=composeExtensions(kit);
 const editor=createEditor({schema:createGitLabSchemaSpec(),plugins,content:{type:'doc',content:[{type:'direction_scope',attrs:{dir:'auto'},content:[{type:'paragraph',content:[{type:'text',text:'Marker.'}]}]}]}});
 try{
  expect(editor.state.doc.childCount).toBe(1);editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0,0,0],7)));
  expect(insertText(editor,' Typed.')).toBe(true);expect(splitBlock(editor)).toBe(true);expect(insertText(editor,'Next line.')).toBe(true);
  expect(editor.state.doc.childCount).toBe(1);expect(editor.state.doc.child(0).content.map(node=>node.textContent)).toEqual(['Marker. Typed.','Next line.']);
  expect(undo(editor)).toBe(true);expect(redo(editor)).toBe(true);
 }finally{editor.destroy();}
});
it('still repairs an atomic direction-container ending and preserves an authored empty root paragraph',()=>{
 const {plugins}=composeExtensions(StarterKit.extensions.map(extension=>extension.name==='trailing-editable-block'?gitLabFootnoteBoundary(extension):extension));
 const editor=createEditor({schema:createGitLabSchemaSpec(),plugins,content:{type:'doc',content:[{type:'direction_scope',attrs:{dir:'auto'},content:[{type:'horizontal_rule'}]}]}});
 try{
  expect(editor.state.doc.content.map(node=>node.type.name)).toEqual(['direction_scope','paragraph']);
  const {schema}=editor.state;const blank=schema.node('paragraph',{},[schema.text('')]);
  editor.dispatch(editor.createTransaction().replaceDocument(schema.node('doc',{},[schema.node('direction_scope',{dir:'auto'},[schema.node('paragraph',{},[schema.text('Editable')])]),blank])));
  expect(editor.state.doc.child(1)).toBe(blank);
 }finally{editor.destroy();}
});

it.each([
 {type:'bullet_list',content:[{type:'list_item',content:[{type:'paragraph',content:[{type:'text',text:'Item'}]}]}]},
 {type:'table',content:[{type:'table_row',content:[{type:'table_cell',content:[{type:'paragraph',content:[{type:'text',text:'Cell'}]}]}]}]},
])('retains the exit paragraph after a terminal direction-wrapped $type',block=>{
 const {plugins}=composeExtensions(StarterKit.extensions.map(extension=>extension.name==='trailing-editable-block'?gitLabFootnoteBoundary(extension):extension));
 const editor=createEditor({schema:createGitLabSchemaSpec(),plugins,content:{type:'doc',content:[{type:'direction_scope',attrs:{dir:'auto'},content:[block]}]}});
 try{expect(editor.state.doc.content.map(node=>node.type.name)).toEqual(['direction_scope','paragraph']);}finally{editor.destroy();}
});
