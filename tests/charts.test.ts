import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { exportDOCX, importDOCX } from '../src/docx';
import { createYjsCollaborationExtension } from '../src/yjs';
import { CoreExtension, HTMLExporter, HistoryExtension, Plugin, composeExtensions, createEditor, redo, undo } from '../src';
import { BarChartExtension, insertBarChart } from '../src/charts';
import { ServerHTMLImporter } from '../src/html/server';

const kit = composeExtensions([CoreExtension, HistoryExtension, BarChartExtension]);

it('keeps chart edits in native cells and reopens the exported data without duplicating plotted labels', () => {
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
  expect(insertBarChart(editor, 'Net change', [['A < B', -4], ['C', 8]])).toBe(true);
  const before = editor.getJSON();
  const chartIndex = editor.state.selection.path[0];
  const path = [chartIndex, 1, 1, 1, 0, 0];
  editor.dispatch(editor.createTransaction().replaceText(path, 0, 2, '-12'));
  const edited = editor.state.doc;
  const html = HTMLExporter.export(edited, { document: false });
  expect(html).toContain('A &lt; B · -12');
  expect(html).toContain('left:0%;width:60%');
  expect(html).toContain('left:60%;width:40%');
  expect(ServerHTMLImporter.parse(html, editor.state.schema).toJSON()).toEqual(edited.toJSON());
  const word = exportDOCX(edited);
  expect(word.report.issues).toContainEqual(expect.objectContaining({ code: 'chart-exported-as-table', path: [chartIndex] }));
  const reopened = importDOCX(word.bytes, editor.state.schema).document;
  expect(reopened.child(chartIndex).textContent).toBe('Net change');
  const wordTable = reopened.child(chartIndex + 1);
  expect(wordTable.type.name).toBe('table');
  expect(wordTable.child(0).content.map(cell => cell.textContent)).toEqual(['Category', 'Value']);
  expect(wordTable.child(1).child(0).textContent).toBe('A < B');
  expect(wordTable.child(1).child(1).textContent).toBe('-12');
  expect(editor.state.schema.nodeFromJSON(edited.toJSON()).eq(edited)).toBe(true);
  expect(undo(editor)).toBe(true);
  expect(editor.getJSON()).toEqual(before);
  expect(redo(editor)).toBe(true);
  expect(editor.state.doc.eq(edited)).toBe(true);
  editor.destroy();
});

it('retains incomplete data cells while showing the row to correct and handles finite extremes', () => {
  const editor = createEditor({ schema: kit.schema });
  expect(insertBarChart(editor, 'Range', [['Low', -Number.MAX_VALUE], ['High', Number.MAX_VALUE]])).toBe(true);
  const render = () => HTMLExporter.export(editor.state.doc, { document: false });
  expect(render()).toContain('left:0%;width:50%');
  expect(render()).toContain('left:50%;width:50%');
  const path = [editor.state.selection.path[0], 1, 2, 1, 0, 0];
  editor.dispatch(editor.createTransaction().replaceText(path, 0, String(Number.MAX_VALUE).length, 'TBD'));
  expect(render()).toContain('Enter a number in row 3');
  expect(render()).toContain('TBD');
  expect(insertBarChart(editor, 'Invalid', [['Error', Infinity]])).toBe(false);
  editor.destroy();
});

it('converges concurrent edits to separate chart cells without copying the derived plot into the document', () => {
  const leftRoom = new Y.Doc(), rightRoom = new Y.Doc();
  function mount(room: Y.Doc, id: string) {
    const extension = createYjsCollaborationExtension({ document: room, user: { id, name: id, color: '#5071a8' } });
    const setup = composeExtensions([CoreExtension, BarChartExtension, extension]);
    return createEditor({ schema: setup.schema, plugins: setup.plugins });
  }
  const left = mount(leftRoom, 'left');
  expect(insertBarChart(left, 'Samples', [['Alpha', 1], ['Beta', 2]])).toBe(true);
  Y.applyUpdate(rightRoom, Y.encodeStateAsUpdate(leftRoom));
  const right = mount(rightRoom, 'right');
  try {
    const index = left.state.selection.path[0];
    left.dispatch(left.createTransaction().replaceText([index, 1, 1, 1, 0, 0], 0, 1, '37'));
    right.dispatch(right.createTransaction().replaceText([index, 1, 2, 0, 0, 0], 0, 4, 'Control'));
    const leftUpdate = Y.encodeStateAsUpdate(leftRoom, Y.encodeStateVector(rightRoom));
    const rightUpdate = Y.encodeStateAsUpdate(rightRoom, Y.encodeStateVector(leftRoom));
    Y.applyUpdate(leftRoom, rightUpdate);
    Y.applyUpdate(rightRoom, leftUpdate);
    expect(right.getJSON()).toEqual(left.getJSON());
    const html = HTMLExporter.export(right.state.doc, { document: false });
    expect(html).toContain('Alpha · 37');
    expect(html).toContain('Control · 2');
    expect(JSON.stringify(right.getJSON())).not.toContain('data-fountain-chart-plot');
  } finally {
    left.destroy();
    right.destroy();
    leftRoom.destroy();
    rightRoom.destroy();
  }
});

it('leaves read-only and filtered documents unchanged when insertion is refused', () => {
  for (const config of [{ editable: false }, { plugins: [new Plugin({ filterTransaction: () => false })] }]) {
    const editor = createEditor({ schema: kit.schema, ...config });
    const before = editor.state.doc;
    expect(insertBarChart(editor, 'Samples', [['A', 1]])).toBe(false);
    expect(editor.state.doc).toBe(before);
    editor.destroy();
  }
});
