// @vitest-environment node
import { expect, it } from 'vitest';
import { Schema, HTMLContainerExtension, HTMLExporter, composeExtensions } from '../src/headless';
import { StarterKit } from '../src/extensions';
import { createEditor, createHistoryPlugin, undo, redo } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const kit = composeExtensions([...StarterKit.extensions, HTMLContainerExtension]);
const schema = new Schema(kit.schema);
const source = '<section dir="auto"><h2>שלום</h2><p>English inherits the section.</p><p style="text-align:left">Explicit left</p><section dir="ltr"><p>Fixed context</p></section></section>';

it('keeps automatic direction on its original shared container rather than guessing per paragraph', () => {
  expect(typeof globalThis.document).toBe('undefined');
  const imported = ServerHTMLImporter.parseWithReport(source, schema);
  expect(imported.issues).toEqual([]);
  const group = imported.document.child(0);
  expect(group.type.name).toBe('html_container');
  expect(group.attrs.dir).toBe('auto');
  for (const block of group.content.slice(0, 3)) expect(block.attrs).not.toHaveProperty('dir');
  expect(group.child(2).attrs.alignExplicit).toBe(true);
  expect(group.child(3).attrs.dir).toBe('ltr');
  expect(group.child(3).child(0).attrs.dir).toBe('ltr');
  expect(schema.nodeFromJSON(imported.document.toJSON()).toJSON()).toEqual(imported.document.toJSON());
  const html = HTMLExporter.export(imported.document, { document: false });
  expect(html).toContain('<section dir="auto"><h2>שלום</h2><p>English inherits the section.</p>');
  expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(imported.document.toJSON());
});

it('keeps the shared automatic context through first-strong-text edits and history without resolving bidi in core', () => {
  const original = ServerHTMLImporter.parse(source, schema);
  const editor = createEditor({ schema: kit.schema, content: original.toJSON(), plugins: [createHistoryPlugin()] });
  try {
    const currentSchema = editor.state.schema;
    const heading = currentSchema.node('heading', { level: 2 }, [currentSchema.text('English title')]);
    expect(editor.dispatch(editor.createTransaction().replaceNode([0, 0], [heading]))).toBe(true);
    expect(editor.state.doc.child(0).attrs.dir).toBe('auto');
    expect(editor.state.doc.child(0).child(1).attrs).not.toHaveProperty('dir');
    expect(undo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(original.toJSON());
    expect(redo(editor)).toBe(true);
    expect(editor.state.doc.child(0).child(0).textContent).toBe('English title');
    expect(editor.state.doc.child(0).attrs.dir).toBe('auto');
  } finally { editor.destroy(); }
});

it('reports flattening without the optional container instead of inventing independent automatic children', () => {
  const flat = ServerHTMLImporter.parseWithReport(source, new Schema(StarterKit.schema));
  expect(flat.issues).toContainEqual(expect.objectContaining({ code: 'unmapped-block-wrapper' }));
  expect(flat.document.child(0).type.name).toBe('heading');
  expect(flat.document.child(0).attrs).not.toHaveProperty('dir');
  expect(flat.document.child(1).attrs).not.toHaveProperty('dir');
});
