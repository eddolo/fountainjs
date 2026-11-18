import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { exportDOCX, importDOCX } from '../src/docx';
import { createYjsCollaborationExtension } from '../src/yjs';
import { CellSelection, NodeSelection, RangeSelection, Schema, Selection, nodeRangeAtPath, textPointToPosition, CoreExtension, HTMLExporter, HistoryExtension, Plugin, composeExtensions, createEditor, redo, undo } from '../src';
import { BarChartExtension, exportBarChartSVG, selectedBarChart, insertBarChart, setChartType, tableChartAction, toggleTableChart } from '../src/charts';
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
    expect(setChartType(left, 'line')).toBe(true);
    right.dispatch(right.createTransaction().replaceText([index, 1, 2, 0, 0, 0], 0, 4, 'Control'));
    const leftUpdate = Y.encodeStateAsUpdate(leftRoom, Y.encodeStateVector(rightRoom));
    const rightUpdate = Y.encodeStateAsUpdate(rightRoom, Y.encodeStateVector(leftRoom));
    Y.applyUpdate(leftRoom, rightUpdate);
    Y.applyUpdate(rightRoom, leftUpdate);
    expect(right.getJSON()).toEqual(left.getJSON());
    const html = HTMLExporter.export(right.state.doc, { document: false });
    expect(html).toContain('data-fountain-chart="line"');
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

it('wraps an existing headerless table without copying its formatted cells and reverses the change', () => {
  const schema = new Schema(kit.schema);
  const paragraph = (text: string) => schema.node('paragraph', {}, [schema.text(text, [schema.mark('strong')])]);
  const row = (category: string, value: string) => schema.node('table_row', {}, [
    schema.node('table_header', {}, [paragraph(category)]), schema.node('table_cell', {}, [paragraph(value)]),
  ]);
  const table = schema.node('table', {}, [row('North', '-4'), row('South', '8')]);
  const content = schema.node('doc', {}, [paragraph('Before'), table, paragraph('After')]);
  for (const selection of [new NodeSelection(content, [1]), new CellSelection(content, [1, 1, 1], [1, 0, 0]),
    Selection.cursor([1, 0, 0, 0, 0], 2), new RangeSelection(content,
      textPointToPosition(content, [1, 1, 1, 0, 0], 1), textPointToPosition(content, [1, 0, 0, 0, 0], 1))]) {
    const editor = createEditor({ schema: kit.schema, content: content.toJSON(), plugins: kit.plugins });
    const original = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(selection));
    expect(tableChartAction(editor)).toBe('wrap');
    expect(toggleTableChart(editor)).toBe(true);
    const wrapped = editor.state.doc;
    expect(wrapped.child(1).child(0)).toBe(original.child(1));
    const html = HTMLExporter.export(wrapped, { document: false });
    expect(html).toContain('North · -4');
    expect(html).toContain('South · 8');
    expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(wrapped.toJSON());
    expect(tableChartAction(editor)).toBe('unwrap');
    expect(toggleTableChart(editor)).toBe(true);
    expect(editor.state.doc.eq(original)).toBe(true);
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.eq(wrapped)).toBe(true);
    expect(redo(editor)).toBe(true);
    expect(editor.state.doc.eq(original)).toBe(true);
    editor.destroy();
  }
  const editor = createEditor({ schema: kit.schema, content: content.toJSON() });
  const range = nodeRangeAtPath(content, [1]);
  editor.dispatch(editor.createTransaction().setSelection(new RangeSelection(content, range.from - 1, range.to)));
  expect(tableChartAction(editor)).toBeNull();
  expect(toggleTableChart(editor)).toBe(false);
  editor.destroy();
});

it('keeps an authored chart title as a paragraph and selects the table when the whole chart is lifted', () => {
  const editor = createEditor({ schema: kit.schema });
  insertBarChart(editor, 'Sales', [['North', 8]]);
  const i = editor.state.selection.path[0];
  const chart = editor.state.doc.child(i);
  editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [i])));
  expect(toggleTableChart(editor)).toBe(true);
  expect(editor.state.doc.child(i)).toBe(chart.child(0));
  expect(editor.state.doc.child(i + 1)).toBe(chart.child(1));
  expect(editor.state.selection.eq(new NodeSelection(editor.state.doc, [i + 1]))).toBe(true);
  editor.destroy();
});

it('exports current data as a standalone SVG in Node and explains incomplete rows', () => {
  const editor = createEditor({ schema: kit.schema });
  insertBarChart(editor, 'A & B', [['<North>', -1], ['South', 3]]);
  const chart = selectedBarChart(editor)!;
  const svg = exportBarChartSVG(chart);
  expect(svg).toContain('<title id="chart-title">A &amp; B</title>');
  expect(svg).toContain('&lt;North&gt; · -1');
  expect(svg).toContain('width="188" height="12" fill="#55409c"');
  expect(svg).toContain('width="564" height="12" fill="#55409c"');
  const path = [editor.state.selection.path[0], 1, 1, 1, 0, 0];
  editor.dispatch(editor.createTransaction().replaceText(path, 0, 2, 'TBD'));
  expect(() => exportBarChartSVG(selectedBarChart(editor)!)).toThrow('Enter a number in row 2');
  editor.destroy();
});

it('changes chart type in place and retains it across HTML, JSON and undo', () => {
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
  insertBarChart(editor, 'Revenue', [['A', Number.MAX_VALUE], ['B', Number.MAX_VALUE], ['C', 0]]);
  const table = selectedBarChart(editor)!.child(1), selection = editor.state.selection;
  for (const kind of ['line', 'pie'] as const) {
    expect(setChartType(editor, kind)).toBe(true);
    expect(selectedBarChart(editor)!.child(1)).toBe(table);
    expect(editor.state.selection.eq(selection)).toBe(true);
    const doc = editor.state.doc;
    const html = HTMLExporter.export(doc, { document: false });
    expect(ServerHTMLImporter.parse(html, editor.state.schema).toJSON()).toEqual(doc.toJSON());
    expect(editor.state.schema.nodeFromJSON(doc.toJSON()).eq(doc)).toBe(true);
    const svg = exportBarChartSVG(selectedBarChart(editor)!);
    expect(svg).toContain(kind === 'line' ? '<polyline' : 'A96 96');
    expect(svg).not.toMatch(/NaN|Infinity/);
  }
  expect(undo(editor)).toBe(true);
  expect(selectedBarChart(editor)!.attrs.kind).toBe('line');
  expect(redo(editor)).toBe(true);
  expect(selectedBarChart(editor)!.attrs.kind).toBe('pie');
  const old = selectedBarChart(editor)!.toJSON();
  expect(editor.state.schema.nodeFromJSON({ ...old, attrs: {} }).attrs.kind).toBe('bar');
  editor.destroy();
});

it('explains unsuitable pie values and draws a single positive share as a whole circle', () => {
  const editor = createEditor({ schema: kit.schema });
  insertBarChart(editor, 'Share', [['A', 0], ['B', 0]]);
  setChartType(editor, 'pie');
  const svg = () => exportBarChartSVG(selectedBarChart(editor)!);
  expect(svg).toThrow('at least one positive value');
  const path = [editor.state.selection.path[0], 1, 1, 1, 0, 0];
  editor.dispatch(editor.createTransaction().replaceText(path, 0, 1, '-2'));
  expect(svg).toThrow('nonnegative');
  editor.dispatch(editor.createTransaction().replaceText(path, 0, 2, '2'));
  expect(svg()).toContain('r="96" fill="#55409c"');
  editor.destroy();
});
