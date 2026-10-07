// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { strFromU8, unzipSync } from 'fflate';
import { AllSelection, CellSelection, CoreExtension, CoreSchemaSpec, HTMLExporter, MarkdownExporter,
  NodeSelection, Plugin, Schema, Selection, composeExtensions, createEditor, createHistoryPlugin,
  redo, setBlockType, setTextAlignment, setTextDirection, splitBlock, undo } from '../src';
import { ServerHTMLImporter } from '../src/html/server';
import { exportDOCX } from '../src/docx';
import { createYjsCollaborationExtension } from '../src/yjs';
import { readTextAlignment, readTextDirection } from '../src/core/text-direction';

const schema = new Schema(CoreSchemaSpec);
const p = (text: string, attrs = {}) => schema.node('paragraph', attrs, [schema.text(text)]);
const document = () => schema.node('doc', {}, [schema.node('heading', {}, [schema.text('عنوان')]),
  p('مرحبا world'), schema.node('blockquote', {}, [p('שלום')]),
  schema.node('code_block', {}, [schema.text('keep literal')]), p('Untouched')]);
const make = () => createEditor({ schema: CoreSchemaSpec, content: document().toJSON(), plugins: [createHistoryPlugin()] });
const directions = (node: ReturnType<typeof document>): unknown[] => ['paragraph', 'heading'].includes(node.type.name)
  ? [node.attrs.dir] : node.content.flatMap(directions);

describe('portable block direction', () => {
  it('uses an already-read direction without another ancestor walk, with no cross-element cache', () => {
    const parent = { getAttribute: vi.fn((name: string) => name === 'dir' ? 'rtl' : null) };
    const element = { getAttribute: vi.fn(() => null), parentElement: parent };
    const dir = readTextDirection(element);
    expect(readTextAlignment(element, undefined, dir)).toBe('start');
    expect(parent.getAttribute).toHaveBeenCalledTimes(1);
    expect(element.getAttribute.mock.calls).toEqual([['dir'], ['align']]);
    parent.getAttribute.mockImplementation(() => null);
    expect(readTextAlignment(element, undefined)).toBe('left');
    expect(parent.getAttribute).toHaveBeenCalledTimes(2);
    expect(readTextAlignment(element, 'right', {})).toBe('right');
  });
  it('changes selected nested blocks in one undoable transaction without changing source or selection', () => {
    expect(typeof globalThis.document).toBe('undefined');
    const editor = make();
    const selection = Selection.range([0, 0], 1, [2, 0, 0], 2);
    editor.dispatch(editor.createTransaction().setSelection(selection));
    const before = editor.getJSON();
    expect(setTextDirection(editor, 'rtl')).toBe(true);
    expect(directions(editor.state.doc)).toEqual(['rtl', 'rtl', 'rtl', undefined]);
    expect(editor.state.doc.textContent).toBe(document().textContent);
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(editor.state.doc.child(3).toJSON()).toEqual(document().child(3).toJSON());
    expect(undo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(redo(editor)).toBe(true);
    expect(directions(editor.state.doc)[1]).toBe('rtl');
  });

  it('keeps physical alignment distinct from logical start/end', () => {
    const editor = make();
    expect(setTextDirection(editor, 'rtl')).toBe(true);
    expect(editor.state.doc.child(0).attrs.align).toBe('left');
    expect(HTMLExporter.export(editor.state.doc, { document: false })).toContain('dir="rtl" style="text-align:left"');
    expect(setTextAlignment(editor, 'start')).toBe(true);
    expect(HTMLExporter.export(editor.state.doc, { document: false })).toContain('text-align:start');
    expect(setTextAlignment(editor, 'end')).toBe(true);
    expect(HTMLExporter.export(editor.state.doc, { document: false })).toContain('text-align:end');
    expect(setTextDirection(editor, undefined)).toBe(true);
    expect(editor.state.doc.child(0).attrs).not.toHaveProperty('dir');
    expect(editor.state.doc.child(0).attrs.align).toBe('end');
  });

  it('preserves direction and alignment on heading conversion and paragraph splitting', () => {
    const editor = createEditor({ schema: CoreSchemaSpec, content: schema.node('doc', {}, [p('אבגד', { dir: 'rtl', align: 'start' })]).toJSON() });
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(setBlockType(editor, 'heading', { level: 2 })).toBe(true);
    expect(editor.state.doc.child(0).attrs).toMatchObject({ dir: 'rtl', align: 'start', level: 2 });
    expect(splitBlock(editor)).toBe(true);
    expect(editor.state.doc.content.map(node => ({ dir: node.attrs.dir, align: node.attrs.align })))
      .toEqual([{ dir: 'rtl', align: 'start' }, { dir: 'rtl', align: 'start' }]);
  });

  it('honors selection boundaries, whole containers and selected cells', () => {
    const editor = make();
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0], 1, [1, 0], 0)));
    expect(setTextDirection(editor, 'rtl')).toBe(true);
    expect(directions(editor.state.doc)).toEqual(['rtl', undefined, undefined, undefined]);
    editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [2])));
    expect(setTextDirection(editor, 'ltr')).toBe(true);
    expect(directions(editor.state.doc)[2]).toBe('ltr');
    const cell = (text: string) => schema.node('table_cell', {}, [p(text)]);
    const table = createEditor({ schema: CoreSchemaSpec, content: schema.node('doc', {}, [schema.node('table', {}, [
      schema.node('table_row', {}, [cell('A'), cell('B'), cell('C')]),
    ])]).toJSON() });
    const selected = new CellSelection(table.state.doc, [0, 0, 0], [0, 0, 1]);
    table.dispatch(table.createTransaction().setSelection(selected));
    expect(setTextDirection(table, 'auto')).toBe(true);
    expect(directions(table.state.doc)).toEqual(['auto', 'auto', undefined]);
    expect(table.state.selection.eq(selected)).toBe(true);
  });

  it('rejects invalid values, no-ops, read-only changes and schema/filter rejection atomically', () => {
    const editor = make();
    const before = editor.state;
    expect(setTextDirection(editor, undefined)).toBe(false);
    expect(setTextDirection(editor, 'rtl;display:none' as 'rtl')).toBe(false);
    expect(setTextAlignment(editor, { toString: () => 'right' } as unknown as 'right')).toBe(false);
    expect(editor.state).toBe(before);
    const restricted = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, heading: {
      ...CoreSchemaSpec.nodes.heading!, attrs: { ...CoreSchemaSpec.nodes.heading!.attrs,
        dir: { default: undefined, validate: (value: unknown) => value === undefined || value === 'ltr' },
      },
    } } };
    const custom = createEditor({ schema: restricted, content: document().toJSON() });
    custom.dispatch(custom.createTransaction().setSelection(new AllSelection(custom.state.doc)));
    const unchanged = custom.state;
    expect(setTextDirection(custom, 'rtl')).toBe(false);
    expect(custom.state).toBe(unchanged);
    const readonly = createEditor({ schema: CoreSchemaSpec, content: document().toJSON(), editable: false });
    expect(setTextDirection(readonly, 'rtl')).toBe(false);
    const guarded = createEditor({ schema: CoreSchemaSpec, content: document().toJSON(), plugins: [new Plugin({ filterTransaction: () => false })] });
    expect(setTextDirection(guarded, 'rtl')).toBe(false);
    expect(directions(guarded.state.doc)).toEqual(Array(4).fill(undefined));
    expect(() => p('x', { dir: 'invalid' })).toThrow();
  });

  it.each(['ltr', 'rtl', 'auto'] as const)('round-trips %s through DOM-free HTML including physical left', dir => {
    const original = schema.node('doc', {}, [p('مرحبا Latin שלום', { dir, align: 'left' }),
      schema.node('heading', { dir, align: 'start' }, [schema.text('عنوان')])]);
    const html = HTMLExporter.export(original, { document: false });
    expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(original.toJSON());
  });

  it('imports explicit and inherited fixed HTML direction with natural alignment, honoring overrides', () => {
    const imported = ServerHTMLImporter.parse('<section dir="RTL"><h2>عنوان</h2><p>مرحبا</p><p dir="ltr" style="text-align:left">Latin</p><p dir="auto">שלום</p></section>', schema);
    expect(imported.content.map(node => ({ dir: node.attrs.dir, align: node.attrs.align })))
      .toEqual([{ dir: 'rtl', align: 'start' }, { dir: 'rtl', align: 'start' }, { dir: 'ltr', align: 'left' }, { dir: 'auto', align: 'start' }]);
    expect(ServerHTMLImporter.parse('<p dir="evil" style="text-align:end">Text</p>', schema).child(0).attrs)
      .toMatchObject({ align: 'end' });
    expect(ServerHTMLImporter.parse('<p dir="evil">Text</p>', schema).child(0).attrs).not.toHaveProperty('dir');
  });

  it('reports Markdown and DOCX direction loss instead of claiming retained bidi semantics', () => {
    const source = schema.node('doc', {}, [p('مرحبا', { dir: 'rtl', align: 'start' })]);
    expect(MarkdownExporter.exportWithReport(source).losses).toContainEqual(expect.objectContaining({ kind: 'attribute', detail: expect.stringContaining('direction') }));
    const word = exportDOCX(source);
    expect(word.report.issues).toContainEqual(expect.objectContaining({ code: 'text-direction-not-exported', path: [0] }));
    const xml = strFromU8(unzipSync(word.bytes)['word/document.xml']!);
    expect(xml).not.toContain('w:val="start"');
    expect(xml).toContain('<w:jc w:val="right"/>');
  });

  it('synchronizes direction through Yjs without changing the text or needing a DOM', () => {
    const leftDoc = new Y.Doc(), rightDoc = new Y.Doc();
    const makePeer = (document: Y.Doc, id: string) => {
      const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, user: { id, name: id, color: '#6547ff' } })]);
      return createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content: [p('שלום').toJSON()] } });
    };
    const left = makePeer(leftDoc, 'left');
    Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc), 'initial');
    const right = makePeer(rightDoc, 'right');
    expect(setTextDirection(left, 'rtl')).toBe(true);
    Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc), 'remote');
    expect(right.getJSON()).toEqual(left.getJSON());
    expect(right.state.doc.child(0).attrs.dir).toBe('rtl');
    expect(setTextDirection(left, undefined)).toBe(true);
    expect(left.state.doc.child(0).attrs).not.toHaveProperty('dir');
    Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc), 'remote');
    expect(right.getJSON()).toEqual(left.getJSON());
    expect(right.state.doc.child(0).attrs).not.toHaveProperty('dir');
    left.destroy(); right.destroy(); leftDoc.destroy(); rightDoc.destroy();
  });

  it('reports logical cell alignment even when physical table alignment is represented in Markdown', () => {
    const cell = schema.node('table_header', {}, [p('שלום', { dir: 'rtl', align: 'start' })]);
    const doc = schema.node('doc', {}, [schema.node('table', {}, [schema.node('table_row', {}, [cell])])]);
    const report = MarkdownExporter.exportWithReport(doc);
    expect(report.losses).toContainEqual(expect.objectContaining({ path: [0, 0, 0, 0], detail: expect.stringContaining('alignment') }));
    expect(report.losses).toContainEqual(expect.objectContaining({ path: [0, 0, 0, 0], detail: expect.stringContaining('direction') }));
  });
});
