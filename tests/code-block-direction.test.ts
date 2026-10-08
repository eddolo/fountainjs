// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { HTMLExporter, MarkdownExporter, NodeSelection, Plugin,
  Schema, Selection, canMoveNode, createEditor, createHistoryPlugin,
  moveNode, redo, setBlockType, setTextAlignment, setTextDirection, undo } from '../src/headless';
import { CoreExtension, CoreSchemaSpec, composeExtensions } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';
import { createYjsCollaborationExtension } from '../src/yjs';
import { exportDOCX } from '../src/docx';

const schema = new Schema(CoreSchemaSpec);
const raw = '# שלום comment\nvalue = "مرحبا"\nprint(value)';
const code = (dir?: string) => schema.node('code_block', { language: 'python', ...(dir ? { dir } : {}) }, [schema.text(raw)]);
const make = () => createEditor({ schema: CoreSchemaSpec, content: schema.node('doc', {}, [code()]).toJSON(), plugins: [createHistoryPlugin()] });

describe('portable code-block reading direction', () => {
  it('retains disabled code line numbers through the standard HTML clipboard fallback', () => {
    const before = schema.node('doc', {}, [schema.node('code_block', { language: 'python', lineNumbers: false, dir: 'rtl' }, [schema.text(raw)])]);
    const html = HTMLExporter.export(before, { document: false });
    expect(html).toContain('data-line-numbers="false"');
    const result = ServerHTMLImporter.parseWithReport(html, schema);
    expect(result.document.toJSON()).toEqual(before.toJSON());
    expect(result.issues).toEqual([]);
  });
  it.each(['ltr', 'rtl', 'auto'] as const)('imports and reopens an owned %s declaration without changing the buffer', dir => {
    expect(typeof globalThis.document).toBe('undefined');
    const imported = ServerHTMLImporter.parse(`<pre dir="${dir.toUpperCase()}" data-language="python"><code>${raw}</code></pre>`, schema);
    expect(imported.child(0).attrs.dir).toBe(dir);
    expect(imported.child(0).textContent).toBe(raw);
    const html = HTMLExporter.export(imported, { document: false });
    expect(html).toContain(`dir="${dir}"`);
    expect(ServerHTMLImporter.parseWithReport(html, schema).issues).toEqual([]);
    expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(imported.toJSON());
  });

  it('authors direction from a text caret or node selection with exact selection/history and no code alignment API', () => {
    const editor = make();
    const selection = Selection.range([0, 0], 2, [0, 0], 7);
    editor.dispatch(editor.createTransaction().setSelection(selection));
    const original = editor.getJSON();
    expect(setTextDirection(editor, 'rtl')).toBe(true);
    expect(editor.state.doc.child(0).attrs.dir).toBe('rtl');
    expect(editor.state.doc.child(0).textContent).toBe(raw);
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(setTextAlignment(editor, 'center')).toBe(false);
    const after = editor.getJSON();
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(original);
    expect(redo(editor)).toBe(true); expect(editor.getJSON()).toEqual(after);
    editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [0])));
    expect(setTextDirection(editor, 'auto')).toBe(true);
    expect(setTextDirection(editor, undefined)).toBe(true);
    expect(editor.state.doc.child(0).attrs.dir).toBeUndefined();
  });

  it.each([['rtl', 'ltr'], ['ltr', 'rtl']] as const)('retains inherited %s when code moves into %s, with exact buffer and undo', (source, destination) => {
    const editor = createEditor({ schema: CoreSchemaSpec, plugins: [createHistoryPlugin()], content: schema.node('doc', {}, [
      schema.node('blockquote', { dir: source }, [code(), schema.node('paragraph', {}, [schema.text('Keep source container valid')])]),
      schema.node('blockquote', { dir: destination }, [schema.node('paragraph', {}, [schema.text('Destination')])]),
    ]).toJSON() });
    const original = editor.getJSON();
    const move = { fromPath: [0, 0], toParentPath: [1], toIndex: 1 };
    expect(canMoveNode(editor, move)).toBe(true); expect(moveNode(editor, move)).toBe(true);
    const moved = editor.state.doc.child(1).child(1);
    expect(moved.attrs.dir).toBe(source); expect(moved.textContent).toBe(raw);
    const html = HTMLExporter.export(editor.state.doc, { document: false });
    expect(ServerHTMLImporter.parse(html, editor.state.schema).toJSON()).toEqual(editor.getJSON());
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(original);
  });

  it('materializes only fixed flattened inheritance, preserving retained and automatic contexts', () => {
    expect(ServerHTMLImporter.parse(`<section dir="rtl"><pre><code>${raw}</code></pre></section>`, schema).child(0).attrs.dir).toBe('rtl');
    const retained = ServerHTMLImporter.parse(`<blockquote dir="rtl"><pre><code>${raw}</code></pre></blockquote>`, schema);
    expect(retained.child(0).attrs.dir).toBe('rtl'); expect(retained.child(0).child(0).attrs.dir).toBeUndefined();
    const shared = ServerHTMLImporter.parse(`<div data-fountain-direction-scope="" dir="auto"><p>שלום</p><pre><code>English</code></pre></div>`, schema);
    expect(shared.child(0).attrs.dir).toBe('auto'); expect(shared.child(0).child(1).attrs.dir).toBeUndefined();
    expect(ServerHTMLImporter.parse(`<section dir="auto"><pre><code>${raw}</code></pre></section>`, schema).child(0).attrs.dir).toBeUndefined();
    expect(ServerHTMLImporter.parse('<pre dir="invalid"><code>Keep</code></pre>', schema).child(0).attrs.dir).toBeUndefined();
  });

  it('reports an incapable receiving schema instead of hiding a lost declaration', () => {
    const { dir: _dir, ...attrs } = CoreSchemaSpec.nodes.code_block.attrs!;
    const restricted = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, code_block: { ...CoreSchemaSpec.nodes.code_block, attrs } } });
    const result = ServerHTMLImporter.parseWithReport('<pre dir="rtl"><code>שלום</code></pre>', restricted);
    expect(result.document.child(0).attrs.dir).toBeUndefined();
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'block-html-projection', message: expect.stringContaining('reading direction (rtl)') }));
  });

  it('respects no-op, read-only, invalid direction and host-filter rejection', () => {
    const editor = make(); const original = editor.state;
    expect(setTextDirection(editor, undefined)).toBe(false);
    expect(setTextDirection(editor, 'sideways' as 'rtl')).toBe(false); expect(editor.state).toBe(original);
    const readonly = createEditor({ schema: CoreSchemaSpec, content: editor.getJSON(), editable: false });
    expect(setTextDirection(readonly, 'rtl')).toBe(false);
    const guarded = createEditor({ schema: CoreSchemaSpec, content: editor.getJSON(), plugins: [new Plugin({ filterTransaction: tr => !tr.docChanged })] });
    const guardedBefore = guarded.state;
    expect(setTextDirection(guarded, 'rtl')).toBe(false); expect(guarded.state).toBe(guardedBefore);
    expect(() => code('invalid')).toThrow();
  });

  it('retains paragraph direction when converted to code and reports ordinary Markdown/Word loss', () => {
    const editor = createEditor({ schema: CoreSchemaSpec, content: schema.node('doc', {}, [schema.node('paragraph', { dir: 'rtl' }, [schema.text(raw)])]).toJSON() });
    expect(setBlockType(editor, 'code_block', { language: 'python' })).toBe(true);
    expect(editor.state.doc.child(0).attrs.dir).toBe('rtl'); expect(editor.state.doc.child(0).textContent).toBe(raw);
    expect(MarkdownExporter.exportWithReport(editor.state.doc).losses).toContainEqual(expect.objectContaining({ kind: 'attribute', type: 'code_block', detail: expect.stringContaining('direction') }));
    expect(exportDOCX(editor.state.doc).report.issues).toContainEqual(expect.objectContaining({ code: 'text-direction-not-exported', path: [0] }));
  });

  it('synchronizes owned code direction through Yjs in pure Node', () => {
    const left = new Y.Doc(), right = new Y.Doc();
    const peer = (document: Y.Doc, id: string) => {
      const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, user: { id, name: id, color: '#8844aa' } })]);
      return createEditor({ schema: kit.schema, plugins: kit.plugins, content: schema.node('doc', {}, [code()]).toJSON() });
    };
    const first = peer(left, 'Ada'); Y.applyUpdate(right, Y.encodeStateAsUpdate(left), 'seed'); const second = peer(right, 'Grace');
    try {
      expect(setTextDirection(first, 'rtl')).toBe(true); Y.applyUpdate(right, Y.encodeStateAsUpdate(left), 'remote');
      expect(second.getJSON()).toEqual(first.getJSON()); expect(second.state.doc.child(0).textContent).toBe(raw);
      expect(setTextDirection(second, undefined)).toBe(true); Y.applyUpdate(left, Y.encodeStateAsUpdate(right), 'remote');
      expect(first.getJSON()).toEqual(second.getJSON());
    } finally { first.destroy(); second.destroy(); left.destroy(); right.destroy(); }
  });
});
