// @vitest-environment node
import { expect, it } from 'vitest';
import { CoreSchemaSpec, HTMLExporter, MarkdownExporter, NodeSelection, Schema,
  createEditor, createHistoryPlugin, setTextDirection, undo } from '../src';
import { ServerHTMLImporter } from '../src/html/server';
import { exportDOCX } from '../src/docx';
import * as Y from 'yjs';
import { composeExtensions, CoreExtension, Plugin, Selection, toggleList } from '../src';
import { createYjsCollaborationExtension } from '../src/yjs';

const schema = new Schema(CoreSchemaSpec);
const sources = [
  '<ul dir="rtl"><li>List text</li></ul>',
  '<ol dir="rtl" start="7"><li>Ordered text</li></ol>',
  '<ul dir="rtl" data-type="task-list"><li>Task text</li></ul>',
  '<blockquote dir="rtl"><p>Quote text</p></blockquote>',
  '<table dir="rtl"><tr><td>First</td><td>Second</td></tr></table>',
  '<dl dir="rtl"><dt>Term</dt><dd>Description</dd></dl>',
];

it.each(sources)('retains a structural direction without freezing child inheritance: %s', source => {
  expect(typeof globalThis.document).toBe('undefined');
  const result = ServerHTMLImporter.parseWithReport(source, schema);
  expect(result.document.child(0).attrs.dir).toBe('rtl');
  const visit = (node: typeof result.document) => {
    expect(node.attrs.dir).toBeUndefined();
    node.content.forEach(visit);
  };
  result.document.child(0).content.forEach(visit);
  expect(result.issues.filter(issue => issue.message.includes('structural container'))).toEqual([]);
  const html = HTMLExporter.export(result.document, { document: false });
  expect(html).toContain('dir="rtl"');
  expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(result.document.toJSON());
});

it('preserves explicit nested contexts, auto and fixed directions on flattened row groups', () => {
  const doc = ServerHTMLImporter.parse('<section dir="rtl"><table><tbody dir="ltr"><tr><td dir="auto"><p dir="rtl">עברית</p><p>English</p></td><td>Other</td></tr></tbody></table></section>', schema);
  const table = doc.child(0), row = table.child(0), cell = row.child(0);
  expect(table.attrs.dir).toBe('rtl');
  expect(row.attrs.dir).toBe('ltr');
  expect(cell.attrs.dir).toBe('auto');
  expect(cell.child(0).attrs.dir).toBe('rtl');
  expect(cell.child(1).attrs.dir).toBeUndefined();
  expect(row.child(1).attrs.dir).toBeUndefined();
  expect(ServerHTMLImporter.parse(HTMLExporter.export(doc, { document: false }), schema).toJSON()).toEqual(doc.toJSON());
});

it('keeps one shared automatic list context rather than guessing each item direction', () => {
  const doc = ServerHTMLImporter.parse('<ul dir="auto"><li>עברית</li><li>English</li></ul>', schema);
  expect(doc.child(0).attrs.dir).toBe('auto');
  expect(doc.child(0).content.map(item => item.child(0).attrs.dir)).toEqual([undefined, undefined]);
});

it.each(sources)('changes only the selected container in an undoable Node-only transaction: %s', source => {
  const doc = ServerHTMLImporter.parse(source, schema);
  const editor = createEditor({ schema: CoreSchemaSpec, content: doc.toJSON(), plugins: [createHistoryPlugin()] });
  try {
    editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [0])));
    const before = editor.getJSON(), content = editor.state.doc.child(0).content.map(node => node.toJSON());
    expect(setTextDirection(editor, 'ltr')).toBe(true);
    expect(editor.state.doc.child(0).attrs.dir).toBe('ltr');
    expect(editor.state.doc.child(0).content.map(node => node.toJSON())).toEqual(content);
    expect(setTextDirection(editor, 'ltr')).toBe(false);
    expect(undo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    const reader = createEditor({ schema: CoreSchemaSpec, content: doc.toJSON(), editable: false });
    reader.dispatch(reader.createTransaction().setSelection(new NodeSelection(reader.state.doc, [0])));
    expect(setTextDirection(reader, 'ltr')).toBe(false);
    reader.destroy();
  } finally { editor.destroy(); }
});

it('reports direction loss for ordinary Markdown and native Word, not HTML-backed glossary/table exports', async () => {
  const doc = ServerHTMLImporter.parse(sources.join(''), schema);
  const markdown = MarkdownExporter.exportWithReport(doc);
  for (const name of ['bullet_list', 'ordered_list', 'task_list', 'blockquote', 'table']) {
    expect(markdown.losses).toContainEqual(expect.objectContaining({ type: name, detail: expect.stringContaining('direction') }));
  }
  const htmlTables = MarkdownExporter.exportWithReport(doc, { tableFormat: 'html' });
  expect(htmlTables.markdown).toContain('<table dir="rtl"');
  expect(htmlTables.losses.filter(loss => loss.type === 'table' && loss.detail.includes('direction'))).toEqual([]);
  const word = await exportDOCX(doc);
  expect(word.report.issues.filter(issue => issue.code === 'text-direction-not-exported')).toHaveLength(6);
});

it('retains list and item overrides during list-type conversion', () => {
  const doc = ServerHTMLImporter.parse('<ul dir="rtl"><li dir="ltr">First</li><li>Second</li></ul>', schema);
  const editor = createEditor({ schema: CoreSchemaSpec, content: doc.toJSON() });
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0, 0, 0], 0, [0, 1, 0, 0], 6)));
    expect(toggleList(editor, 'task')).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe('task_list');
    expect(editor.state.doc.child(0).attrs.dir).toBe('rtl');
    expect(editor.state.doc.child(0).child(0).attrs.dir).toBe('ltr');
    expect(editor.state.doc.child(0).child(1).attrs.dir).toBeUndefined();
  } finally { editor.destroy(); }
});

it('rejects selected structural changes atomically when a schema or transaction filter refuses them', () => {
  const custom = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, bullet_list: {
    ...CoreSchemaSpec.nodes.bullet_list, attrs: { dir: { default: undefined, validate: (value: unknown) => value === undefined || value === 'ltr' } },
  } } };
  const content = ServerHTMLImporter.parse('<ul><li>Text</li></ul>', schema).toJSON();
  for (const config of [{ schema: custom }, { schema: CoreSchemaSpec, plugins: [new Plugin({ filterTransaction: tr => !tr.docChanged })] }]) {
    const editor = createEditor({ ...config, content });
    try {
      editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [0])));
      const before = editor.state;
      expect(setTextDirection(editor, 'rtl')).toBe(false);
      expect(editor.state).toBe(before);
    } finally { editor.destroy(); }
  }
});

it('synchronizes and removes a structural direction through Yjs without freezing child text direction', () => {
  const documents = [new Y.Doc(), new Y.Doc()];
  const make = (document: Y.Doc) => {
    const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document,
      user: { id: String(document.clientID), name: 'Structural direction peer', color: '#6547ff' },
    })]);
    return createEditor({ schema: kit.schema, plugins: kit.plugins, content: ServerHTMLImporter.parse('<ul><li>עברית</li><li>English</li></ul>', schema).toJSON() });
  };
  const left = make(documents[0]); Y.applyUpdate(documents[1], Y.encodeStateAsUpdate(documents[0]), 'initial');
  const right = make(documents[1]);
  try {
    left.dispatch(left.createTransaction().setSelection(new NodeSelection(left.state.doc, [0])));
    expect(setTextDirection(left, 'auto')).toBe(true);
    Y.applyUpdate(documents[1], Y.encodeStateAsUpdate(documents[0]), 'remote');
    expect(right.getJSON()).toEqual(left.getJSON());
    expect(right.state.doc.child(0).attrs.dir).toBe('auto');
    expect(right.state.doc.child(0).child(0).child(0).attrs.dir).toBeUndefined();
    expect(setTextDirection(left, undefined)).toBe(true);
    Y.applyUpdate(documents[1], Y.encodeStateAsUpdate(documents[0]), 'remote');
    expect(right.getJSON()).toEqual(left.getJSON());
    expect(right.state.doc.child(0).attrs).not.toHaveProperty('dir');
  } finally { left.destroy(); right.destroy(); documents.forEach(doc => doc.destroy()); }
});
