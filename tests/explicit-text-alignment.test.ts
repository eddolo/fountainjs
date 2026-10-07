// @vitest-environment node
import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { AllSelection, CoreExtension, CoreSchemaSpec, HTMLExporter, MarkdownExporter, Plugin, Schema,
  Selection, composeExtensions, createEditor, createHistoryPlugin, setBlockType, setTextAlignment,
  setTextDirection, splitBlock, undo } from '../src';
import { ServerHTMLImporter } from '../src/html/server';
import { exportDOCX, importDOCX } from '../src/docx';
import { createYjsCollaborationExtension } from '../src/yjs';

const schema = new Schema(CoreSchemaSpec);
const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'אבגד' }] }] };

it('distinguishes an explicit left command from the legacy default with one undo step', () => {
  const editor = createEditor({ schema: CoreSchemaSpec, content, plugins: [createHistoryPlugin()] });
  try {
    expect(typeof globalThis.document).toBe('undefined');
    const before = editor.getJSON();
    expect(before.content![0]!.attrs).not.toHaveProperty('alignExplicit');
    expect(HTMLExporter.export(editor.state.doc, { document: false })).not.toContain('text-align:left');
    expect(setTextAlignment(editor, 'left')).toBe(true);
    expect(editor.state.doc.child(0).attrs).toMatchObject({ align: 'left', alignExplicit: true });
    expect(editor.state.doc.child(0).attrs).not.toHaveProperty('dir');
    const html = HTMLExporter.export(editor.state.doc, { document: false });
    expect(html).toContain('text-align:left');
    expect(html).toContain('data-fountain-align-explicit="true"');
    expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(editor.getJSON());
    expect(setTextAlignment(editor, 'left')).toBe(false);
    expect(undo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  } finally { editor.destroy(); }
});

it('preserves explicit alignment through direction changes, conversion, Enter and JSON reopening', () => {
  const editor = createEditor({ schema: CoreSchemaSpec, content });
  try {
    setTextAlignment(editor, 'left'); setTextDirection(editor, 'rtl'); setTextDirection(editor, undefined);
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(setBlockType(editor, 'heading', { level: 2 })).toBe(true);
    expect(splitBlock(editor)).toBe(true);
    expect(editor.state.doc.content.map(node => node.attrs.alignExplicit)).toEqual([true, true]);
    expect(editor.state.doc.content.map(node => node.attrs.dir)).toEqual([undefined, undefined]);
    expect(schema.nodeFromJSON(editor.getJSON()).toJSON()).toEqual(editor.getJSON());
    editor.dispatch(editor.createTransaction().setSelection(new AllSelection(editor.state.doc)));
    expect(setTextAlignment(editor, 'start')).toBe(true);
    expect(editor.state.doc.content.every(node => !Object.hasOwn(node.attrs, 'alignExplicit'))).toBe(true);
  } finally { editor.destroy(); }
});

it('retains inherited-auto physical-left HTML, anonymous list/cell content and natural defaults', () => {
  const parsed = ServerHTMLImporter.parse('<section dir="auto"><p>שלום</p><p style="text-align:left">Left</p><h2 align="left">Heading</h2><ul><li style="text-align:left">Item</li></ul><table><tr><td style="text-align:left">Cell</td></tr></table></section>', schema);
  expect(parsed.child(0).attrs).not.toHaveProperty('alignExplicit');
  for (const node of [parsed.child(1), parsed.child(2), parsed.child(3).child(0).child(0), parsed.child(4).child(0).child(0).child(0)]) {
    expect(node.attrs).toMatchObject({ align: 'left', alignExplicit: true });
    expect(node.attrs).not.toHaveProperty('dir');
  }
  expect(ServerHTMLImporter.parse(HTMLExporter.export(parsed, { document: false }), schema).toJSON()).toEqual(parsed.toJSON());
  expect(ServerHTMLImporter.parse('<p data-fountain-align-explicit="false">Default</p>', schema).child(0).attrs).not.toHaveProperty('alignExplicit');
});

it('keeps read-only/filter rejection atomic and validates the marker', () => {
  for (const options of [{ editable: false }, { plugins: [new Plugin({ filterTransaction: () => false })] }]) {
    const editor = createEditor({ schema: CoreSchemaSpec, content, ...options });
    try { const before = editor.state; expect(setTextAlignment(editor, 'left')).toBe(false); expect(editor.state).toBe(before); }
    finally { editor.destroy(); }
  }
  expect(() => schema.node('paragraph', { alignExplicit: 'true' })).toThrow();
  const restricted = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, heading: { ...CoreSchemaSpec.nodes.heading!,
    attrs: { ...CoreSchemaSpec.nodes.heading!.attrs, alignExplicit: { default: undefined, validate: (value: unknown) => value === undefined } },
  } } };
  const editor = createEditor({ schema: restricted, content: { type: 'doc', content: [content.content[0]!, { type: 'heading', content: [{ type: 'text', text: 'restricted' }] }] } });
  try {
    editor.dispatch(editor.createTransaction().setSelection(new AllSelection(editor.state.doc)));
    const before = editor.state; expect(setTextAlignment(editor, 'left')).toBe(false); expect(editor.state).toBe(before);
  } finally { editor.destroy(); }
});

it('exports physical left in Word and reports its Markdown loss, including cells', () => {
  const paragraph = schema.node('paragraph', { align: 'left', alignExplicit: true }, [schema.text('שלום')]);
  const doc = schema.node('doc', {}, [paragraph]);
  const exported = exportDOCX(doc);
  expect(strFromU8(unzipSync(exported.bytes)['word/document.xml']!)).toContain('<w:jc w:val="left"/>');
  const reopened = importDOCX(exported.bytes, schema).document;
  expect(reopened.child(0).attrs).toMatchObject({ align: 'left', alignExplicit: true });
  expect(HTMLExporter.export(reopened, { document: false })).toContain('text-align:left');
  const table = schema.node('doc', {}, [schema.node('table', {}, [schema.node('table_row', {}, [schema.node('table_header', {}, [paragraph])])])]);
  for (const document of [doc, table]) expect(MarkdownExporter.exportWithReport(document).losses)
    .toContainEqual(expect.objectContaining({ detail: expect.stringContaining('physical-left alignment') }));
});

it('synchronizes and clears the marker field through Yjs without a DOM', () => {
  const leftDoc = new Y.Doc(), rightDoc = new Y.Doc();
  const make = (document: Y.Doc, id: string) => {
    const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, user: { id, name: id, color: '#6547ff' } })]);
    return createEditor({ schema: kit.schema, plugins: kit.plugins, content });
  };
  const left = make(leftDoc, 'left'); Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc));
  const right = make(rightDoc, 'right');
  try {
    expect(setTextAlignment(left, 'left')).toBe(true);
    Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc));
    expect(right.getJSON()).toEqual(left.getJSON());
    expect(right.state.doc.child(0).attrs.alignExplicit).toBe(true);
    expect(setTextAlignment(left, 'right')).toBe(true);
    Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc));
    expect(right.getJSON()).toEqual(left.getJSON());
    expect(right.state.doc.child(0).attrs).not.toHaveProperty('alignExplicit');
  } finally { left.destroy(); right.destroy(); leftDoc.destroy(); rightDoc.destroy(); }
});

it('retains explicit Word left alignment when rich code-styled content falls back to a paragraph', () => {
  const bytes = zipSync({ 'word/document.xml': strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Code"/><w:jc w:val="left"/></w:pPr><w:r><w:t>Before</w:t><w:br/><w:t>After</w:t></w:r></w:p></w:body></w:document>') });
  const result = importDOCX(bytes, schema);
  expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'code-style-not-applied' }));
  expect(result.document.child(0).type.name).toBe('paragraph');
  expect(result.document.child(0).attrs).toMatchObject({ align: 'left', alignExplicit: true });
  expect(HTMLExporter.export(result.document, { document: false })).toContain('text-align:left');
});

it('keeps legacy custom schemas without the marker on their original command contract', () => {
  const { alignExplicit: _marker, ...attrs } = CoreSchemaSpec.nodes.paragraph!.attrs!;
  const legacy = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
    paragraph: { ...CoreSchemaSpec.nodes.paragraph!, attrs },
  } };
  const editor = createEditor({ schema: legacy, content });
  try {
    expect(setTextAlignment(editor, 'left')).toBe(false);
    expect(setTextAlignment(editor, 'right')).toBe(true);
    expect(setTextAlignment(editor, 'left')).toBe(true);
    expect(editor.state.doc.child(0).attrs).not.toHaveProperty('alignExplicit');
  } finally { editor.destroy(); }
});
