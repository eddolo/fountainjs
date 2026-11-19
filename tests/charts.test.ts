import { expect, it } from 'vitest';
import { unzipSync, strFromU8, strToU8, zipSync } from 'fflate';
import * as Y from 'yjs';
import { exportDOCX, importDOCX } from '../src/docx';
import { createYjsCollaborationExtension } from '../src/yjs';
import { CellSelection, NodeSelection, RangeSelection, Schema, Selection, nodeRangeAtPath, textPointToPosition, CoreExtension, HTMLExporter, HistoryExtension, Plugin, composeExtensions, createEditor, redo, undo } from '../src';
import { detachChartSource, reconnectChartSource, insertChartFromJSON, refreshChartFromSource, refreshChartSnapshotFromSource, chartInputPlugin, chartInputStatus, drawChartInput, isChartInput, BarChartExtension, chartFromText, chartToText, previewChartText, updateChartFromText, insertChartFromText, exportBarChartSVG, selectedBarChart, insertChartFromCSV, refreshChartFromCSV, refreshChartSnapshotFromCSV, insertChart, insertBarChart, setChartType, setChartAxisTitle, setChartTarget, setChartValueRange, tableChartAction, toggleTableChart } from '../src/charts';
import { PagesExtension } from '../src/pages';
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
  expect(word.report.issues).toContainEqual(expect.objectContaining({ code: 'chart-workbook-projection', path: [chartIndex] }));
  const reopened = importDOCX(word.bytes, editor.state.schema).document;
  expect(reopened.childCount).toBe(edited.childCount);
  expect(reopened.child(chartIndex).child(0).textContent).toBe('Net change');
  const wordTable = reopened.child(chartIndex).child(1);
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
    expect(setChartAxisTitle(left, 'category', 'Test group')).toBe(true);
    right.dispatch(right.createTransaction().setSelection(Selection.cursor([index, 0, 0], 0)));
    expect(setChartAxisTitle(right, 'value', 'Responses')).toBe(true);
    right.dispatch(right.createTransaction().replaceText([index, 1, 2, 0, 0, 0], 0, 4, 'Control'));
    const leftUpdate = Y.encodeStateAsUpdate(leftRoom, Y.encodeStateVector(rightRoom));
    const rightUpdate = Y.encodeStateAsUpdate(rightRoom, Y.encodeStateVector(leftRoom));
    Y.applyUpdate(leftRoom, rightUpdate);
    Y.applyUpdate(rightRoom, leftUpdate);
    expect(right.getJSON()).toEqual(left.getJSON());
    const html = HTMLExporter.export(right.state.doc, { document: false });
    expect(html).toContain('data-fountain-chart="line"');
    expect(html).toContain('data-category-axis-title="Test group"');
    expect(html).toContain('data-value-axis-title="Responses"');
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
  for (const kind of ['column', 'line', 'pie'] as const) {
    expect(setChartType(editor, kind)).toBe(true);
    expect(selectedBarChart(editor)!.child(1)).toBe(table);
    expect(editor.state.selection.eq(selection)).toBe(true);
    const doc = editor.state.doc;
    const html = HTMLExporter.export(doc, { document: false });
    expect(ServerHTMLImporter.parse(html, editor.state.schema).toJSON()).toEqual(doc.toJSON());
    expect(editor.state.schema.nodeFromJSON(doc.toJSON()).eq(doc)).toBe(true);
    const svg = exportBarChartSVG(selectedBarChart(editor)!);
    expect(svg).toContain(kind === 'line' ? '<polyline' : kind === 'column' ? 'fill="#55409c"' : 'A96 96');
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

it.each(['bar', 'column', 'line', 'pie'] as const)('embeds a native %s chart with Excel data and XML-safe category text', kind => {
  const editor = createEditor({ schema: kit.schema });
  insertBarChart(editor, 'Production & sales', [['=SUM(1,2)', 3], ['Low < High', 4]]);
  setChartType(editor, kind);
  const output = exportDOCX(editor.state.doc);
  const parts = unzipSync(output.bytes);
  const chart = strFromU8(parts['word/charts/chart1.xml']);
  expect(chart).toContain('<c:' + (kind === 'column' ? 'bar' : kind) + 'Chart>');
  expect(chart).toContain('<c:f>Data!$B$2:$B$3</c:f>');
  expect(chart).toContain('Low &lt; High');
  if (kind === 'line') expect(chart).toContain('<c:smooth val="0"/></c:ser><c:smooth val="0"/>');
  if (kind === 'column') expect(chart).toContain('<c:barDir val="col"/>');
  if (kind === 'bar') {
    expect(chart).toContain('<c:catAx><c:axId val="1"/><c:scaling><c:orientation val="maxMin"/>');
    expect(chart).toContain('<c:axPos val="l"/><c:tickLblPos val="low"/>');
  }
  expect(strFromU8(parts['word/charts/_rels/chart1.xml.rels'])).toContain('../embeddings/chart1.xlsx');
  const sheet = strFromU8(unzipSync(parts['word/embeddings/chart1.xlsx'])['xl/worksheets/sheet1.xml']);
  expect(sheet).toContain('>=SUM(1,2)</t>');
  expect(sheet).not.toContain('<f>');
  expect(sheet).toContain('<c r="B3"><v>4</v></c>');
  const imported = importDOCX(output.bytes, editor.state.schema);
  expect(imported.report.issues.some(issue => issue.code === 'native-chart-data-projection')).toBe(true);
  const reopened = imported.document.content.find(node => node.type.name === 'bar_chart')!;
  expect(reopened.attrs.kind).toBe(kind);
  expect(reopened.child(1).child(1).child(0).textContent).toBe('=SUM(1,2)');
  const twice = importDOCX(exportDOCX(imported.document).bytes, editor.state.schema).document;
  expect(twice.content.map(node => node.type.name)).toEqual(imported.document.content.map(node => node.type.name));
  editor.destroy();
});

it('links each chart to its own worksheet from the document, footnote or header that owns it', () => {
  const kit = composeExtensions([CoreExtension, BarChartExtension, PagesExtension]);
  const editor = createEditor({ schema: kit.schema });
  const schema = editor.state.schema;
  const charts = (['bar', 'line', 'pie'] as const).map((kind, i) => {
    insertBarChart(editor, kind, [['Category ' + i, i + 1]]);
    setChartType(editor, kind);
    return selectedBarChart(editor)!;
  });
  const doc = schema.node('doc', {}, [
    charts[0],
    schema.node('paragraph', {}, [schema.node('footnote_reference', { id: '7' })]),
    schema.node('footnote_definition', { id: '7' }, [charts[1]]),
    schema.node('page_header', { variant: 'default' }, [charts[2]]),
  ]);
  const parts = unzipSync(exportDOCX(doc).bytes);
  for (const [i, story] of ['document', 'footnotes', 'header1'].entries()) {
    const number = i + 1;
    const relationships = strFromU8(parts['word/_rels/' + story + '.xml.rels']);
    expect(relationships.match(/Id="rIdChart\d+"/g)).toEqual(['Id="rIdChart' + number + '"']);
    expect(relationships).toContain('Target="charts/chart' + number + '.xml"');
    expect(strFromU8(parts['word/' + story + '.xml'])).toContain('r:id="rIdChart' + number + '"');
    const workbook = 'chart' + number + '.xlsx';
    expect(strFromU8(parts['word/charts/_rels/chart' + number + '.xml.rels'])).toContain('../embeddings/' + workbook);
    const sheet = unzipSync(parts['word/embeddings/' + workbook]);
    expect(strFromU8(sheet['xl/worksheets/sheet1.xml'])).toContain('Category ' + i);
  }
  editor.destroy();
});

it('retains the original table when the data cannot become an Excel numeric series', () => {
  const editor = createEditor({ schema: kit.schema });
  insertBarChart(editor, 'Large', [['Peak', Number.MAX_VALUE]]);
  const output = exportDOCX(editor.state.doc);
  expect(output.report.issues.some(issue => issue.code === 'chart-exported-as-table')).toBe(true);
  expect(unzipSync(output.bytes)['word/charts/chart1.xml']).toBeUndefined();
  expect(importDOCX(output.bytes, editor.state.schema).document.textContent).toContain(String(Number.MAX_VALUE));
  editor.destroy();
});


it('keeps independently edited companion content and plotted data through two DOCX imports', () => {
  const editor = createEditor({ schema: kit.schema });
  insertBarChart(editor, 'Change', [['Tuesday', -16]]);
  const parts = unzipSync(exportDOCX(editor.state.doc).bytes);
  const part = 'word/charts/chart1.xml';
  parts[part] = strToU8(strFromU8(parts[part]).replace('<c:v>-16</c:v>', '<c:v>24</c:v>'));
  const imported = importDOCX(zipSync(parts), editor.state.schema);
  expect(imported.report.issues.some(issue => issue.code === 'chart-companion-kept-separate')).toBe(true);
  for (const doc of [imported.document, importDOCX(exportDOCX(imported.document).bytes, editor.state.schema).document]) {
    expect(doc.content.filter(node => node.type.name === 'table').map(node => node.child(1).child(1).textContent)).toEqual(['-16']);
    expect(doc.content.filter(node => node.type.name === 'bar_chart').map(node => node.child(1).child(1).child(1).textContent)).toEqual(['24']);
  }
  editor.destroy();
});

it('recovers the original workbook independently of the chart schema and plotted values', () => {
  const editor = createEditor({ schema: kit.schema });
  insertBarChart(editor, 'Change', [['Tuesday', -16]]);
  const parts = unzipSync(exportDOCX(editor.state.doc).bytes);
  const chartPart = 'word/charts/chart1.xml', workbookPart = 'word/embeddings/chart1.xlsx';
  parts[chartPart] = strToU8(strFromU8(parts[chartPart]).replace('<c:v>-16</c:v>', '<c:v>24</c:v>'));
  const source = zipSync(parts);
  expect(importDOCX(source, editor.state.schema).chartWorkbooks).toBeUndefined();
  for (const schema of [editor.state.schema, new Schema(composeExtensions([CoreExtension]).schema)]) {
    const result = importDOCX(source, schema, { includeChartWorkbooks: true });
    expect(result.chartWorkbooks).toEqual([{ chartPart, workbookPart, bytes: parts[workbookPart] }]);
    expect(result.packageParts.find(part => part.path === workbookPart)?.handling).toBe('adapter-input');
  }
  const relPart = 'word/charts/_rels/chart1.xml.rels';
  const rel = strFromU8(parts[relPart]);
  const typesPart = '[Content_Types].xml';
  const types = strFromU8(parts[typesPart]);
  for (const [part, content] of [
    [relPart, rel.replace('Target=', 'TargetMode="External" Target=')],
    [relPart, rel.replace('</Relationships>', '<Relationship Id="rIdData" Target="other"/></Relationships>')],
    [relPart, rel.replace('/package"', '/image"')],
    [typesPart, types.replace('spreadsheetml.sheet"', 'other"')],
    [workbookPart, 'invalid'],
  ] as const) {
    const broken = zipSync({ ...parts, [part]: strToU8(content) });
    const result = importDOCX(broken, editor.state.schema, { includeChartWorkbooks: true });
    expect(result.chartWorkbooks, part).toHaveLength(0);
    expect(result.report.issues.some(issue => issue.code === 'chart-workbook-unavailable')).toBe(true);
    expect(result.document.content.some(node => node.type.name === 'bar_chart')).toBe(true);
  }
  expect(() => importDOCX(source, editor.state.schema, { includeChartWorkbooks: true, maxMediaBytes: 1 })).toThrow(/media exceeds/);
  editor.destroy();
});

it('keeps the table and reports unsupported native series, absent chart schema and external targets', () => {
  const editor = createEditor({ schema: kit.schema });
  insertBarChart(editor, 'Data', [['A', 2]]);
  const original = exportDOCX(editor.state.doc).bytes;
  const base = new Schema(composeExtensions([CoreExtension]).schema);
  for (const change of ['external', 'second series', 'missing point', 'foreign cache', 'malformed XML', 'custom schema', 'log scale', 'reversed value scale', 'invalid range']) {
    const parts = unzipSync(original);
    const name = 'word/charts/chart1.xml', rel = 'word/_rels/document.xml.rels';
    let chart = strFromU8(parts[name]);
    if (change === 'external') parts[rel] = strToU8(strFromU8(parts[rel]).replace('Target="charts/chart1.xml"', 'TargetMode="External" Target="https://example.test/chart1.xml"'));
    if (change === 'second series') chart = chart.replace('</c:ser>', '</c:ser><c:ser/>');
    if (change === 'log scale') chart = chart.replace('<c:valAx><c:axId val="2"/><c:scaling>', '<c:valAx><c:axId val="2"/><c:scaling><c:logBase val="10"/>');
    if (change === 'reversed value scale') chart = chart.replace('<c:orientation val="minMax"/>', '<c:orientation val="maxMin"/>');
    if (change === 'invalid range') chart = chart.replace('<c:orientation val="minMax"/>', '<c:orientation val="minMax"/><c:max val="1"/><c:min val="2"/>');
    if (change === 'missing point') chart = chart.replace('<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="1"/>', '<c:numCache><c:ptCount val="2"/>');
    if (change === 'malformed XML') chart = chart.slice(0, -12);
    if (change === 'foreign cache') chart = chart.replace('<c:numCache>', '<c:numCache xmlns:c="urn:foreign">');
    parts[name] = strToU8(chart);
    const imported = importDOCX(zipSync(parts), change === 'custom schema' ? base : editor.state.schema);
    expect(imported.document.content.some(node => node.type.name === 'bar_chart'), change).toBe(false);
    expect(imported.document.content.find(node => node.type.name === 'table')?.child(1).textContent, change).toBe('A2');
    expect(imported.report.issues.some(issue => issue.code === 'native-chart-not-imported'), change).toBe(true);
  }
  editor.destroy();
});


it('recovers the authored cell spelling and rich marks when the Office plot still agrees', () => {
  const schema = new Schema(kit.schema);
  const plain = (s: string) => schema.node('paragraph', {}, [schema.text(s)]);
  const first = schema.node('table_cell', {}, [plain('Region')]);
  const value = schema.node('table_cell', {}, [schema.node('paragraph', {}, [schema.text('04.00', [schema.mark('strong')])])]);
  const table = schema.node('table', {}, [schema.node('table_row', {}, [first, value])]);
  const chart = schema.node('bar_chart', { kind: 'line' }, [table]);
  const doc = schema.node('doc', {}, [chart]);
  const restored = importDOCX(exportDOCX(doc).bytes, schema).document.child(0);
  expect(restored.type.name).toBe('bar_chart');
  expect(restored.childCount).toBe(1);
  const cell = restored.child(0).child(0).child(1);
  expect(cell.textContent).toBe('04.00');
  expect(cell.child(0).child(0).marks.map(mark => mark.type.name)).toContain('strong');
});

it.each(['bar', 'column', 'line'] as const)('keeps both named series across %s editing, image and Office interchange', kind => {
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
  expect(insertChart(editor, { kind, title: 'Orders', series: ['Plan', 'Actual'],
    rows: [['Monday', 12, -4], ['Tuesday', 8, 6]] })).toBe(true);
  const doc = editor.state.doc;
  const node = selectedBarChart(editor)!;
  const html = HTMLExporter.export(doc, { document: false });
  expect(ServerHTMLImporter.parse(html, editor.state.schema).eq(doc)).toBe(true);
  const svg = exportBarChartSVG(node);
  expect(svg).toContain('Monday · Plan 12, Actual -4');
  expect(svg).toContain('#007768');
  const parts = unzipSync(exportDOCX(doc).bytes);
  const path = 'word/charts/chart1.xml';
  const xml = strFromU8(parts[path]);
  expect(xml.match(/<c:ser>/g)).toHaveLength(2);
  expect(xml).toContain('Data!$C$2:$C$3');
  const workbook = unzipSync(parts['word/embeddings/chart1.xlsx']);
  expect(strFromU8(workbook['xl/worksheets/sheet1.xml'])).toContain('<c r="C2"><v>-4</v></c>');
  const read = (chartXML: string) => importDOCX(zipSync({ ...parts, [path]: strToU8(chartXML) }), editor.state.schema).document;
  const reopened = read(xml);
  const seriesTable = reopened.content.find(child => child.type.name === 'bar_chart')!.child(1);
  expect(seriesTable.content.map(row => row.content.map(cell => cell.textContent))).toEqual([
    ['Category', 'Plan', 'Actual'], ['Monday', '12', '-4'], ['Tuesday', '8', '6']]);
  expect(reopened.content.some(child => child.type.name === 'table')).toBe(false);
  const changed = read(xml.replace('<c:v>-4</c:v>', '<c:v>5</c:v>'));
  expect(changed.content.find(child => child.type.name === 'table')!.child(1).child(2).textContent).toBe('-4');
  expect(changed.content.find(child => child.type.name === 'bar_chart')!.child(1).child(1).child(2).textContent).toBe('5');
  const second = xml.lastIndexOf('<c:ser>');
  const mismatch = read(xml.slice(0, second) + xml.slice(second).replace('<c:v>Monday</c:v>', '<c:v>Sunday</c:v>'));
  expect(mismatch.content.some(child => child.type.name === 'bar_chart')).toBe(false);
  expect(mismatch.content.find(child => child.type.name === 'table')!.child(0).childCount).toBe(3);
  setChartType(editor, 'pie');
  expect(() => exportBarChartSVG(selectedBarChart(editor)!)).toThrow('one value column');
  expect(undo(editor)).toBe(true);
  expect(selectedBarChart(editor)!.attrs.kind).toBe(kind);
  editor.destroy();
});

it('imports quoted CSV into portable cells and refreshes by category and series in one undoable edit', async () => {
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
  const sourceURL = 'https://example.org/orders.csv';
  const csv = '\uFEFFRegion,Plan,Actual\r\n"North, ""Q1""",0012.00,-4\r\n"South\nQ1",+1e2,3\r\n';
  expect(insertChartFromCSV(editor, csv, { title: 'Orders', sourceURL })).toBe(true);
  const chartIndex = editor.state.selection.path[0]!;
  const markedNumber = [chartIndex, 1, 1, 2, 0, 0];
  editor.dispatch(editor.createTransaction().addMark(markedNumber, 0, 2, editor.state.schema.mark('strong')));
  const original = selectedBarChart(editor)!;
  const table = original.child(1);
  expect(table.child(2).child(0).textContent).toBe('South\nQ1');
  const html = HTMLExporter.export(editor.state.doc, { document: false });
  expect(ServerHTMLImporter.parse(html, editor.state.schema).toJSON()).toEqual(editor.getJSON());
  expect(exportDOCX(editor.state.doc).report.issues.some(issue => issue.code === 'chart-csv-link-omitted')).toBe(true);
  const before = editor.state.doc;
  expect(await refreshChartFromCSV(editor, async url => { expect(url).toBe(sourceURL); return csv; })).toBe(true);
  expect(editor.state.doc).toBe(before);
  expect(await refreshChartFromCSV(editor, async () => 'Region,Actual,Plan\n"South\nQ1",3,+1e2\n"North, ""Q1""",-5,0012.00')).toBe(true);
  const changed = selectedBarChart(editor)!.child(1);
  expect(changed.child(1).child(2)).toBe(table.child(2).child(1));
  expect(changed.child(2).child(2).textContent).toBe('0012.00');
  expect(changed.child(2).child(1).child(0).child(0).marks.map(mark => mark.type.name)).toEqual(['strong']);
  expect(changed.child(2).child(1).textContent).toBe('-5');
  expect(undo(editor)).toBe(true);
  expect(editor.state.doc.eq(before)).toBe(true);
  editor.destroy();
});

it('leaves charts intact on invalid data, superseded loads and rejected sources', async () => {
  const editor = createEditor({ schema: kit.schema });
  const sourceURL = 'https://example.org/orders.csv';
  const csv = 'Region,Orders\nNorth,3';
  const before = editor.state.doc;
  for (const value of ['A,B\nx', 'A,B\n"North,3', 'A,B\nx,=1+1', 'A,B\nx,3,', 'A,B\nx,']) {
    expect(() => insertChartFromCSV(editor, value, { title: 'Orders' })).toThrow();
    expect(editor.state.doc).toBe(before);
  }
  expect(() => insertChartFromCSV(editor, csv, { title: '', sourceURL: 'file:///orders.csv' })).toThrow();
  insertChartFromCSV(editor, csv, { title: 'Orders', sourceURL });
  const category = Selection.cursor([editor.state.selection.path[0]!, 1, 1, 0, 0, 0], 2);
  editor.dispatch(editor.createTransaction().setSelection(category));
  let finish!: (value: string) => void;
  const stale = refreshChartFromCSV(editor, () => new Promise(resolve => { finish = resolve; }));
  expect(await refreshChartFromCSV(editor, async () => 'Region,Orders\nNorth,7')).toBe(true);
  finish(csv);
  expect(await stale).toBe(false);
  expect(editor.state.selection.eq(category)).toBe(true);
  const latest = editor.state.doc;
  await expect(refreshChartFromCSV(editor, async () => 'Region,Orders\nNorth,broken')).rejects.toThrow('Enter a number');
  await expect(refreshChartFromCSV(editor, async () => { throw new Error('Offline'); })).rejects.toThrow('Offline');
  expect(editor.state.doc).toBe(latest);
  const changed = refreshChartFromCSV(editor, () => new Promise(resolve => { finish = resolve; }));
  setChartType(editor, 'column');
  finish(csv);
  expect(await changed).toBe(false);
  expect(selectedBarChart(editor)!.child(1).child(1).child(1).textContent).toBe('7');
  editor.destroy();
});

it('keeps editable category and value axis titles through rotation, undo, HTML, SVG and native Word', () => {
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
  insertBarChart(editor, 'Weekly output', [['Monday', 12], ['Tuesday', 4]]);
  const category = 'Production day', value = 'Units <planned> & shipped';
  expect(setChartAxisTitle(editor, 'category', category)).toBe(true);
  expect(setChartAxisTitle(editor, 'value', value)).toBe(true);
  const selected = () => selectedBarChart(editor)!;
  const snapshot = editor.getJSON();
  expect(setChartAxisTitle(editor, 'value', value)).toBe(false);
  expect(setChartAxisTitle(editor, 'value', '')).toBe(true);
  expect(selected().attrs.valueAxisTitle).toBe('');
  expect(undo(editor)).toBe(true);
  expect(editor.getJSON()).toEqual(snapshot);
  const escaped = 'Units &lt;planned&gt; &amp; shipped';
  for (const kind of ['bar', 'column', 'line'] as const) {
    setChartType(editor, kind);
    const svg = exportBarChartSVG(selected());
    expect(svg.indexOf(category) < svg.indexOf(escaped)).toBe(kind === 'bar');
    expect(svg).toContain(escaped);
    expect(svg).toContain(category);
    const html = HTMLExporter.export(editor.state.doc, { document: false });
    expect(ServerHTMLImporter.parse(html, editor.state.schema).toJSON()).toEqual(editor.getJSON());
    const parts = unzipSync(exportDOCX(editor.state.doc).bytes);
    const xml = strFromU8(parts['word/charts/chart1.xml']);
    expect(xml.match(/<c:catAx>.*?<\/c:catAx>/)?.[0]).toContain('<a:t>' + category + '</a:t>');
    expect(xml.match(/<c:valAx>.*?<\/c:valAx>/)?.[0]).toContain(escaped);
    parts['word/charts/chart1.xml'] = strToU8(xml.replace('<a:r><a:t>' + escaped + '</a:t></a:r>',
      '<a:r><a:t>Units</a:t></a:r><a:br/><a:fld id="{C30231F7-4143-436F-8458-067B86DF71C7}"><a:t>sold</a:t></a:fld>'));
    const changed = importDOCX(zipSync(parts), editor.state.schema).document.content.find(n => n.type.name === 'bar_chart')!;
    expect(changed.attrs).toMatchObject({ kind, categoryAxisTitle: category, valueAxisTitle: 'Units\nsold' });
  }
  setChartType(editor, 'pie');
  expect(exportBarChartSVG(selected())).not.toContain(category);
  expect(setChartAxisTitle(editor, 'category', 'Hidden')).toBe(false);
  expect(exportDOCX(editor.state.doc).report.issues.some(issue => issue.code === 'chart-axis-titles-omitted')).toBe(true);
  setChartType(editor, 'column');
  expect(selected().attrs.categoryAxisTitle).toBe(category);
  editor.destroy();
});

it('shares a fixed numeric range across series and restores automatic bounds with undo', () => {
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
  insertChart(editor, { title: 'Orders', kind: 'column', series: ['Base', 'Adjusted'], rows: [['A', 8, -5], ['B', 15, 4]] });
  const before = editor.state.doc;
  for (const [min, max] of [[10, 10], [12, 4], [NaN, 3], [-2, Infinity]]) {
    expect(setChartValueRange(editor, min, max)).toBe(false);
    expect(editor.state.doc).toBe(before);
  }
  expect(setChartValueRange(editor, -10, 10)).toBe(true);
  const chart = selectedBarChart(editor)!;
  const svg = exportBarChartSVG(chart);
  expect(svg).toContain('Value range: -10 to 10');
  expect(svg).toContain('Base 15');
  const html = HTMLExporter.export(editor.state.doc, { document: false });
  expect(ServerHTMLImporter.parse(html, editor.state.schema).toJSON()).toEqual(editor.getJSON());
  const bytes = exportDOCX(editor.state.doc).bytes;
  const parts = unzipSync(bytes);
  const xml = strFromU8(parts['word/charts/chart1.xml']);
  expect(xml).toContain('<c:max val="10"/><c:min val="-10"/>');
  expect(strFromU8(unzipSync(parts['word/embeddings/chart1.xlsx'])['xl/worksheets/sheet1.xml'])).toContain('<v>15</v>');
  const reopen = (bytes: Uint8Array) => importDOCX(bytes, editor.state.schema).document.content.find(n => n.type.name === 'bar_chart');
  expect(reopen(bytes)?.attrs).toMatchObject({ axisMin: -10, axisMax: 10 });
  parts['word/charts/chart1.xml'] = strToU8(xml.replace('<c:max val="10"/><c:min val="-10"/>', '<c:min val="0"/>'));
  expect(reopen(zipSync(parts))?.attrs).toMatchObject({ axisMin: 0, axisMax: null });
  expect(setChartValueRange(editor, null, null)).toBe(true);
  expect(exportBarChartSVG(selectedBarChart(editor)!)).not.toContain('Value range:');
  expect(undo(editor)).toBe(true);
  expect(selectedBarChart(editor)!.attrs).toMatchObject({ axisMin: -10, axisMax: 10 });
  editor.destroy();
});

it('gives equal values the same bar length across documents with different data', () => {
  for (const other of [1, 160]) {
    const editor = createEditor({ schema: kit.schema });
    insertBarChart(editor, 'Orders', [['Monday', 12], ['Tuesday', other]]);
    setChartValueRange(editor, 0, 20);
    const html = HTMLExporter.export(editor.state.doc, { document: false });
    expect(html).toContain('left:0%;width:60%');
    const reopened = ServerHTMLImporter.parse(html, editor.state.schema);
    expect(reopened.content.find(node => node.type.name === 'bar_chart')?.attrs.axisMin).toBe(0);
    setChartValueRange(editor, 10, 20);
    expect(HTMLExporter.export(editor.state.doc, { document: false })).toContain('left:0%;width:20%');
    editor.destroy();
  }
});

it('clips crossing line segments at their intersections without inventing points on the axis', () => {
  const editor = createEditor({ schema: kit.schema });
  insertChart(editor, { title: 'Response', kind: 'line', series: ['Value'], rows: [['A', -10], ['B', 30], ['C', 25]] });
  setChartValueRange(editor, 0, 10);
  let svg = exportBarChartSVG(selectedBarChart(editor)!);
  expect(svg.match(/<polyline/g)).toHaveLength(1);
  expect(svg).not.toContain('<circle');
  // The first segment enters one quarter and leaves one half of the way from A to B.
  const segment = /<polyline points="([\d.]+),[\d.]+ ([\d.]+),[\d.]+"/.exec(svg)!;
  const axis = /<path d="M([\d.]+) [\d.]+h([\d.]+)" stroke="#aaa"/.exec(svg)!;
  expect((Number(segment[1]) - Number(axis[1])) / Number(axis[2])).toBeCloseTo(0.125, 4);
  expect((Number(segment[2]) - Number(axis[1])) / Number(axis[2])).toBeCloseTo(0.25, 4);
  const html = HTMLExporter.export(editor.state.doc, { document: false });
  expect(html).toContain('left:12.5%;top:100%');
  setChartValueRange(editor, null, 0);
  svg = exportBarChartSVG(selectedBarChart(editor)!);
  expect(svg).toContain('Value range: -10 to 0');
  setChartValueRange(editor, -Number.MAX_VALUE, Number.MAX_VALUE);
  svg = exportBarChartSVG(selectedBarChart(editor)!);
  expect(svg).not.toMatch(/NaN|Infinity/);
  setChartType(editor, 'pie');
  expect(exportDOCX(editor.state.doc).report.issues.some(issue => issue.code === 'chart-axis-range-omitted')).toBe(true);
  editor.destroy();
});

it('retains editable major tick intervals across HTML, SVG, native Word and history', () => {
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
  insertBarChart(editor, 'Sales', [['First', 1], ['Next', 3]]);
  const selected = () => selectedBarChart(editor)!;
  for (const interval of [0, -1, NaN, Infinity]) expect(setChartValueRange(editor, 0, 4, interval)).toBe(false);
  setChartValueRange(editor, -0.3, 0.3, 0.1);
  for (const kind of ['bar', 'column', 'line'] as const) {
    setChartType(editor, kind);
    const html = HTMLExporter.export(editor.state.doc, { document: false });
    expect([...html.matchAll(/data-axis-tick="([^"]+)"/g)].map(match => match[1]))
      .toEqual(['-0.3', '-0.2', '-0.1', '0', '0.1', '0.2', '0.3']);
    expect(ServerHTMLImporter.parse(html, editor.state.schema).toJSON()).toEqual(editor.getJSON());
    expect(exportBarChartSVG(selected())).toContain('>-0.3</text>');
  }
  setChartValueRange(editor, 1, 4);
  expect(selected().attrs.axisInterval).toBe(0.1);
  const parts = unzipSync(exportDOCX(editor.state.doc).bytes);
  const xml = strFromU8(parts['word/charts/chart1.xml']);
  expect(xml.match(/<c:majorUnit val="0.1"\/>/g)).toHaveLength(1);
  parts['word/charts/chart1.xml'] = strToU8(xml.replace('<c:majorUnit val="0.1"/>', '<c:majorUnit val="0.5"/>'));
  expect(importDOCX(zipSync(parts), editor.state.schema).document.content.find(n => n.type.name === 'bar_chart')?.attrs.axisInterval).toBe(0.5);
  setChartValueRange(editor, 1, 4, null);
  expect(selected().attrs.axisInterval).toBeNull();
  expect(undo(editor)).toBe(true);
  expect(selected().attrs.axisInterval).toBe(0.1);
  setChartType(editor, 'pie');
  expect(exportBarChartSVG(selected())).not.toContain('>-0.3</text>');
  editor.destroy();
});

it('bounds the number of tick marks for dense intervals and opposite finite extremes', () => {
  const editor = createEditor({ schema: kit.schema });
  insertBarChart(editor, 'Values', [['A', 1]]);
  for (const interval of [Number.MIN_VALUE, Number.MAX_VALUE]) {
    setChartValueRange(editor, -Number.MAX_VALUE, Number.MAX_VALUE, interval);
    const html = HTMLExporter.export(editor.state.doc, { document: false });
    const ticks = [...html.matchAll(/data-axis-tick="([^"]+)"/g)].map(match => Number(match[1]));
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.length).toBeLessThanOrEqual(25);
    expect(ticks.every(Number.isFinite)).toBe(true);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(exportBarChartSVG(selectedBarChart(editor)!)).not.toMatch(/Infinity|NaN/);
  }
  editor.destroy();
});

it('shows horizontal gridlines on new column and line charts with automatic axes', () => {
  const editor = createEditor({ schema: kit.schema });
  insertBarChart(editor, 'Change in weekly orders', [['Monday', 12], ['Tuesday', -4], ['Wednesday', 8]]);
  const bars = selectedBarChart(editor)!;
  expect(exportBarChartSVG(bars)).toContain('>5</text>');
  expect(bars.attrs.axisInterval).toBeNull();
  for (const kind of ['column', 'line'] as const) {
    setChartType(editor, kind);
    expect(HTMLExporter.export(editor.state.doc, { document: false })).toContain('data-axis-tick="5"');
    const chart = strFromU8(unzipSync(exportDOCX(editor.state.doc).bytes)['word/charts/chart1.xml']);
    expect(chart.match(/<c:valAx>.*?<\/c:valAx>/)?.[0]).toContain('<c:majorGridlines>');
    expect(chart).not.toContain('<c:majorUnit');
    expect(exportBarChartSVG(selectedBarChart(editor)!)).toContain('stroke="#d4d0df"');
  }
  editor.destroy();
});

it('keeps a signed weekly target separate from source data through chart types, history, HTML, SVG and Word', () => {
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
  insertBarChart(editor, 'Orders', [['Monday', 12], ['Tuesday', -4]]);
  const chart = () => selectedBarChart(editor)!;
  const table = chart().child(1);
  expect(setChartTarget(editor, Infinity)).toBe(false);
  expect(setChartTarget(editor, 20, ' Target <Q1> ')).toBe(true);
  expect(undo(editor)).toBe(true);
  expect(chart().attrs.targetValue).toBeNull();
  expect(redo(editor)).toBe(true);
  for (const kind of ['bar', 'column', 'line', 'pie'] as const) {
    setChartType(editor, kind);
    if (kind === 'pie') {
      // Use positive values for the pie export.
      const i = editor.state.selection.path[0];
      editor.dispatch(editor.createTransaction().replaceText([i, 1, 2, 1, 0, 0], 0, 2, '4'));
    } else expect(chart().child(1)).toBe(table);
    const html = HTMLExporter.export(editor.state.doc, { document: false });
    expect(ServerHTMLImporter.parse(html, editor.state.schema).toJSON()).toEqual(editor.getJSON());
    const svg = exportBarChartSVG(chart());
    expect(svg.includes('stroke-dasharray')).toBe(kind !== 'pie');
    const output = exportDOCX(editor.state.doc);
    const reopened = importDOCX(output.bytes, editor.state.schema).document;
    const restored = reopened.child(editor.state.selection.path[0]);
    expect(restored.attrs).toEqual(chart().attrs);
    expect(restored.childCount).toBe(2);
    expect(restored.child(0).textContent).toBe('Orders');
    const cellText = (row: typeof table) => row.content.map(cell => cell.textContent);
    expect(restored.child(1).content.map(cellText)).toEqual(chart().child(1).content.map(cellText));
    const xml = strFromU8(unzipSync(output.bytes)['word/charts/chart1.xml']!);
    if (kind === 'column' || kind === 'line') {
      expect(xml).toContain('<a:prstDash val="dash"/>');
      expect(xml).toContain('Data!$C$2:$C$3');
    }
  }
  setChartType(editor, 'column');
  setChartValueRange(editor, -4, 12);
  expect(exportBarChartSVG(chart())).toContain('outside axis range');
  expect(exportBarChartSVG(chart())).not.toContain('stroke-dasharray');
  expect(setChartTarget(editor, 0)).toBe(true);
  expect(exportBarChartSVG(chart())).toContain('stroke-dasharray');
  expect(setChartTarget(editor, null)).toBe(true);
  expect(chart().attrs.targetLabel).toBe('');
  expect(exportBarChartSVG(chart())).not.toContain('stroke-dasharray');
  editor.destroy();
});

it('reads a changed Word target by series identity and honors its deletion', () => {
  const editor = createEditor({ schema: kit.schema });
  insertBarChart(editor, 'Orders', [['Monday', 12], ['Tuesday', -4]]);
  setChartType(editor, 'line');
  setChartTarget(editor, 8, 'Weekly goal');
  const parts = unzipSync(exportDOCX(editor.state.doc).bytes);
  const file = 'word/charts/chart1.xml';
  const original = strFromU8(parts[file]!);
  const series = original.match(/<c:ser>[\s\S]*?<\/c:ser>/g)!;
  const rewrite = (xml: string) => {
    parts[file] = strToU8(xml);
    return importDOCX(zipSync(parts), editor.state.schema).document.content.find(node => node.type.name === 'bar_chart')!;
  };
  const targetFirst = original.replace(series.join(''), series[1]! + series[0]!);
  const renamed = rewrite(targetFirst.replaceAll('Weekly goal</c:v>', 'Stretch</c:v>').replaceAll('<c:v>8</c:v>', '<c:v>10</c:v>'));
  expect(renamed.attrs).toMatchObject({ targetLabel: 'Stretch', targetValue: 10 });
  expect(renamed.child(1).child(0).childCount).toBe(2);
  const removed = rewrite(original.replace(series[1]!, ''));
  expect(removed.attrs.targetValue).toBeNull();
  expect(removed.child(1).child(1).child(1).textContent).toBe('12');
  const varying = rewrite(original.replace(series[1]!, series[1]!.replace('<c:v>8</c:v>', '<c:v>7</c:v>')));
  expect(varying.attrs.targetValue).toBeNull();
  expect(varying.child(1).child(0).content.map(cell => cell.textContent)).toEqual(['Category', 'Value', 'Weekly goal']);
  editor.destroy();
});

it('previews delimited text in Node and inserts the same chart with one undo', () => {
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
  const before = editor.state.doc;
  const options = { title: 'Weekly revenue', decimalSeparator: ',' as const };
  const input = '\uFEFF Column \r\nRegion | {H}2025 | {H}2026\r\n "North | West" | +01,50 | -3\r\nSouth | 6 | 4e2\r\n';
  const preview = chartFromText(editor.state.schema, input, options);
  expect(preview.attrs.kind).toBe('column');
  const values = preview.child(1).content.map(row => row.content.map(cell => cell.textContent));
  expect(values).toEqual([['Region', '2025', '2026'], ['North | West', '+01.50', '-3'], ['South', '6', '4e2']]);
  expect(editor.state.doc).toBe(before);
  expect(insertChartFromText(editor, input, options)).toBe(true);
  expect(selectedBarChart(editor)!.eq(preview)).toBe(true);
  expect(undo(editor)).toBe(true);
  expect(editor.state.doc.eq(before)).toBe(true);
  expect(redo(editor)).toBe(true);
  editor.destroy();
});

it.each([
  ['North\t2\nSouth\t-4', [['Category', 'Value'], ['North', '2'], ['South', '-4']]],
  ['"A;B",3\nC,4', [['Category', 'Value'], ['A;B', '3'], ['C', '4']]],
  ['Group;Sales\n"A ""B""";8', [['Group', 'Sales'], ['A "B"', '8']]],
  ['Orders\n2\n-4', [['Category', 'Orders'], ['1', '2'], ['2', '-4']]],
  ['3.2\r4e1', [['Category', 'Value'], ['1', '3.2'], ['2', '4e1']]],
])('reads headerless, quoted and single-series text: %s', (input, expected) => {
  const table = chartFromText(new Schema(kit.schema), input as string, { title: '' }).child(1);
  expect(table.content.map(row => row.content.map(cell => cell.textContent))).toEqual(expected);
});

it('lets authors override header inference and refuses malformed or unplottable data before inserting', () => {
  const editor = createEditor({ schema: kit.schema });
  const before = editor.state.doc;
  const withHeader = chartFromText(editor.state.schema, 'Area|2025\nSouth|3', { title: '', header: true });
  expect(withHeader.child(1).child(0).child(1).textContent).toBe('2025');
  const single = chartFromText(editor.state.schema, '1,5\n-2,5', { title: '', delimiter: null, decimalSeparator: ',' });
  expect(single.child(1).content.slice(1).map(row => row.child(1).textContent)).toEqual(['1.5', '-2.5']);
  const quoted = chartFromText(editor.state.schema, '"  East  "|1\nWest|2', { title: '' });
  expect(quoted.child(1).child(1).child(0).textContent).toBe('  East  ');
  for (const [input, reason] of [
    ['A,2\nB,3,4', 'Row 2 has 3 cells'], ['A,2\n"B,3', 'quotation marks in row 2'],
    ['Day|Net\nM|1,5', 'Enter a number'], ['pie\nDay|Net\nM|-3', 'nonnegative'],
    ['0\n'.repeat(5001), '10,000 cells'],
  ] as const) {
    expect(() => insertChartFromText(editor, input, { title: 'Chart' })).toThrow(reason);
    expect(editor.state.doc).toBe(before);
  }
  const reader = createEditor({ schema: kit.schema, editable: false });
  expect(insertChartFromText(reader, 'A,3', { title: '' })).toBe(false);
  reader.destroy();
  editor.destroy();
});

it('reopens a chart as CSV and keeps format runs, table cells, source and axes through a bulk edit and undo', () => {
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
  const originalCSV = 'Region,Actual,Plan\n"South, Q1",012.30,5\nNorth,-4,8';
  insertChartFromCSV(editor, originalCSV, { title: 'Orders', sourceURL: 'https://example.org/orders.csv' });
  setChartAxisTitle(editor, 'value', 'Units');
  setChartValueRange(editor, -10, 20, 5);
  setChartTarget(editor, 8, 'Weekly goal');
  const path = [editor.state.selection.path[0], 1, 1, 1, 0, 0];
  editor.dispatch(editor.createTransaction().addMark(path, 4, 5, editor.state.schema.mark('strong')));
  const original = selectedBarChart(editor)!;
  expect(chartToText(original)).toBe('bar\n' + originalCSV);
  expect(previewChartText(original, chartToText(original))).toBe(original);
  const before = editor.state.doc;
  const change = 'column\nRegion,Plan,Actual\nNorth,8,-7\n"South, Q1",5,012.40';
  const preview = previewChartText(original, change);
  expect(editor.state.doc).toBe(before);
  expect(preview.attrs).toEqual({ ...original.attrs, kind: 'column' });
  expect(preview.child(0)).toBe(original.child(0));
  const data = preview.child(1);
  expect(data.child(1).child(1)).toBe(original.child(1).child(2).child(2));
  expect(data.child(2).child(2).child(0).content.map(run => [run.text, run.marks.map(mark => mark.type.name)]))
    .toEqual([['012.', []], ['4', ['strong']], ['0', []]]);
  expect(updateChartFromText(editor, change, original)).toBe(true);
  expect(selectedBarChart(editor)!.eq(preview)).toBe(true);
  expect(undo(editor)).toBe(true);
  expect(editor.state.doc.eq(before)).toBe(true);
  expect(redo(editor)).toBe(true);
  expect(chartToText(selectedBarChart(editor)!)).toBe(change);
  editor.destroy();
});

it('keeps headerless chart cell roles, quoted labels and renamed row formatting', () => {
  const schema = new Schema(kit.schema);
  const cell = (name: string, value: string) => schema.node(name, {}, [schema.node('paragraph', {}, [schema.text(value, [schema.mark('strong')])])]);
  const row = (label: string, value: string) => schema.node('table_row', {}, [cell('table_header', label), cell('table_cell', value)]);
  const chart = schema.node('bar_chart', {}, [schema.node('table', {}, [row('East\r\n"Q1"', '+003'), row('West', '-2')])]);
  const source = chartToText(chart);
  expect(source).toBe('bar\n"East\r\n""Q1""",+003\nWest,-2');
  expect(previewChartText(chart, source)).toBe(chart);
  const updated = previewChartText(chart, source.replace(/\r\n/g, '\n').replace('West,-2', 'South,-4'));
  expect(updated.childCount).toBe(1);
  expect(updated.child(0).child(0)).toBe(chart.child(0).child(0));
  const renamed = updated.child(0).child(1).child(0);
  expect(renamed.type.name).toBe('table_header');
  expect(renamed.child(0).child(0).marks[0]!.type.name).toBe('strong');
  expect(chartToText(updated)).toContain('South,-4');
});

it('rejects stale text drafts, filtered edits and invalid data without changing the selected document', () => {
  const editor = createEditor({ schema: kit.schema });
  insertBarChart(editor, 'Orders', [['Monday', 12]]);
  const original = selectedBarChart(editor)!;
  const source = chartToText(original);
  expect(() => updateChartFromText(editor, source.replace('12', 'TBD'), original)).toThrow('Enter a number');
  expect(selectedBarChart(editor)).toBe(original);
  setChartTarget(editor, 10);
  const latest = editor.state.doc;
  expect(updateChartFromText(editor, source.replace('12', '14'), original)).toBe(false);
  expect(editor.state.doc).toBe(latest);
  for (const config of [{ editable: false }, { plugins: [new Plugin({ filterTransaction: tr => !tr.docChanged })] }]) {
    const other = createEditor({ schema: kit.schema, content: latest.toJSON(), ...config });
    other.dispatch(other.createTransaction().setSelection(new NodeSelection(other.state.doc, [editor.state.selection.path[0]])));
    const captured = other.state.doc;
    expect(updateChartFromText(other, source.replace('12', '14'))).toBe(false);
    expect(other.state.doc).toBe(captured);
    other.destroy();
  }
  editor.destroy();
});

it('merges a bulk chart edit with a concurrent cell edit and rejects an already superseded draft', async () => {
  const a = new Y.Doc(), b = new Y.Doc();
  function mount(room: Y.Doc, id: string) {
    const setup = composeExtensions([CoreExtension, BarChartExtension, createYjsCollaborationExtension({
      document: room, user: { id, name: id, color: '#5071a8' },
    })]);
    return createEditor({ schema: setup.schema, plugins: setup.plugins });
  }
  const left = mount(a, 'left');
  insertChartFromCSV(left, 'Region,Actual,Plan\nNorth,5,9\nSouth,1,3', { title: 'Orders', sourceURL: 'https://example.org/feed' });
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const right = mount(b, 'right');
  try {
    const index = left.state.selection.path[0];
    right.dispatch(right.createTransaction().setSelection(new NodeSelection(right.state.doc, [index])));
    const draft = selectedBarChart(right)!;
    const source = chartToText(selectedBarChart(left)!);
    expect(updateChartFromText(left, source.replace(/^bar/, 'column').replace('North,5,9', 'North,7,9'))).toBe(true);
    right.dispatch(right.createTransaction().replaceText([index, 1, 1, 2, 0, 0], 0, 1, '12'));
    const fromLeft = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
    const fromRight = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
    Y.applyUpdate(a, fromRight);
    Y.applyUpdate(b, fromLeft);
    expect(left.getJSON()).toEqual(right.getJSON());
    expect(chartToText(left.state.doc.child(index))).toContain('North,7,12');
    expect(left.state.doc.child(index).attrs.kind).toBe('column');
    expect(updateChartFromText(right, source, draft)).toBe(false);
    // A collaborator detaching while the other replica is reading the feed
    // keeps the shared hand edits, even if the older request finishes later.
    const watched = right.state.doc.child(index);
    let finish!: (csv: string) => void;
    const pending = refreshChartSnapshotFromSource(right, watched, () => new Promise(resolve => { finish = resolve; }));
    left.dispatch(left.createTransaction().setSelection(new NodeSelection(left.state.doc, [index])));
    expect(detachChartSource(left)).toBe(true);
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    finish('Region,Actual,Plan\nNorth,999,9\nSouth,1,3');
    expect(await pending).toBeNull();
    expect(right.state.doc.child(index).attrs.feedDetached).toBe(true);
    expect(left.getJSON()).toEqual(right.getJSON());
    expect(chartToText(right.state.doc.child(index))).toContain('North,7,12');
  } finally { left.destroy(); right.destroy(); a.destroy(); b.destroy(); }
});

it('refreshes a moved chart off-selection without stealing the caret or recording identical snapshots', async () => {
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
  insertChartFromCSV(editor, 'Day,Actual\nMonday,5', { title: 'Orders', sourceURL: 'https://example.org/orders.csv' });
  const original = selectedBarChart(editor)!;
  const schema = editor.state.schema;
  const note = schema.node('paragraph', {}, [schema.text('Editing a note')]);
  let finish!: (csv: string) => void;
  const pending = refreshChartSnapshotFromCSV(editor, original, () => new Promise(resolve => { finish = resolve; }));
  editor.dispatch(editor.createTransaction().replaceDocument(schema.node('doc', {}, [note, original])).setSelection(Selection.cursor([0, 0], 7)));
  const before = editor.state.doc;
  finish('Day,Actual\nMonday,-12');
  const updated = await pending;
  expect(updated).toBe(editor.state.doc.child(1));
  expect(chartToText(updated!)).toContain('Monday,-12');
  expect(editor.state.selection.eq(Selection.cursor([0, 0], 7))).toBe(true);
  const stable = editor.state.doc;
  expect(await refreshChartSnapshotFromCSV(editor, updated!, async () => 'Day,Actual\nMonday,-12')).toBe(updated);
  expect(editor.state.doc).toBe(stable);
  expect(undo(editor)).toBe(true);
  expect(editor.state.doc.eq(before)).toBe(true);
  editor.destroy();
});

it('discards aborted, removed, ambiguous and superseded feed results, with independent requests per chart', async () => {
  const editor = createEditor({ schema: kit.schema });
  const schema = editor.state.schema;
  const sourceURL = 'https://example.org/orders.csv';
  insertChartFromCSV(editor, 'Day,Actual\nMonday,5', { title: 'A', sourceURL });
  const first = selectedBarChart(editor)!;
  const second = first.copy([schema.node('paragraph', {}, [schema.text('B')]), first.child(1)]);
  const replace = (...charts: typeof first[]) => editor.dispatch(editor.createTransaction().replaceDocument(schema.node('doc', {}, charts)));
  replace(first, second);
  let finish!: (csv: string) => void;
  const delay = () => new Promise<string>(resolve => { finish = resolve; });
  const csv = 'Day,Actual\nMonday,8';
  const one = refreshChartSnapshotFromCSV(editor, first, delay);
  expect(await refreshChartSnapshotFromCSV(editor, second, async () => csv)).toBe(editor.state.doc.child(1));
  finish(csv);
  expect(await one).toBe(editor.state.doc.child(0));
  const changed = editor.state.doc.child(0);
  const stale = refreshChartSnapshotFromCSV(editor, changed, delay);
  expect(await refreshChartSnapshotFromCSV(editor, changed, async () => csv)).toBe(changed);
  finish('Day,Actual\nMonday,1');
  expect(await stale).toBeNull();
  const controller = new AbortController();
  const cancelled = refreshChartSnapshotFromCSV(editor, changed, delay, controller.signal);
  controller.abort();
  finish('Day,Actual\nMonday,2');
  expect(await cancelled).toBeNull();
  const deleted = refreshChartSnapshotFromCSV(editor, changed, delay);
  replace(second);
  finish(csv);
  expect(await deleted).toBeNull();
  replace(first, first);
  let reads = 0;
  expect(await refreshChartSnapshotFromCSV(editor, first, async () => { reads++; return csv; })).toBeNull();
  expect(reads).toBe(0);
  editor.destroy();
});

it('only opens inline chart input in an empty paragraph and restores the source on undo', () => {
  const schema = new Schema(kit.schema);
  const paragraph = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
  const editor = createEditor({ schema: kit.schema, plugins: [...kit.plugins, chartInputPlugin],
    content: schema.node('doc', {}, [paragraph('keep'), paragraph('::tail')]).toJSON() });
  const type = chartInputPlugin.spec.props!.handleTextInput!;
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 2)));
  expect(type(editor, 2, 2, ':')).toBe(false);
  editor.dispatch(editor.createTransaction().replaceText([1, 0], 2, 6, '').setSelection(Selection.cursor([1, 0], 2)));
  expect(type(editor, 2, 2, ':')).toBe(true);
  expect(isChartInput(editor)).toBe(true);
  expect(drawChartInput(editor)).toBe(false);
  expect(chartInputStatus.get(editor.state)).toBe('Paste the rows to chart.');
  editor.dispatch(editor.createTransaction().replaceText([1, 0], 0, 0, 'Day|Orders\nMonday|12'));
  const draft = editor.state.doc;
  expect(drawChartInput(editor)).toBe(true);
  expect(selectedBarChart(editor)?.child(1).child(1).textContent).toBe('Monday12');
  expect(undo(editor)).toBe(true);
  expect(editor.state.doc.eq(draft)).toBe(true);
  expect(editor.state.doc.child(0).textContent).toBe('keep');
  editor.destroy();
});

it('confirms diagrams in place, preserves exact source on undo, and keeps numeric chart headers unambiguous', () => {
  const schema = new Schema(kit.schema);
  for (const [text, explicit, language] of [
    ['%% review\r\nflowchart LR\r\n  A --> B', false, 'mermaid'],
    ['sequenceDiagram\n  Ada->>Grace: Ready?', false, 'mermaid'],
    ['sequenceDiagram\n12\n8', false, 'chart'],
    ['---\ntitle: Review\n---\nflowchart LR\n  A --> B', true, 'mermaid'],
  ] as const) {
    const draft = schema.node('code_block', { language: 'chart-data', lineNumbers: true }, [schema.text(text)]);
    const editor = createEditor({ schema: kit.schema, plugins: [...kit.plugins, chartInputPlugin], content: schema.node('doc', {}, [draft]).toJSON() });
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 3)));
    const before = editor.state.doc;
    expect(drawChartInput(editor, explicit ? 'mermaid' : 'auto')).toBe(true);
    const result = editor.state.doc.child(0);
    if (language === 'mermaid') {
      expect(result.attrs).toEqual({ ...draft.attrs, language });
      expect(result.textContent).toBe(text);
      expect(editor.state.selection.from).toBe(3);
    } else expect(result.type.name).toBe('bar_chart');
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.eq(before)).toBe(true);
    editor.destroy();
  }
});

it('imports JSON row matrices, records and explicit columns with the same editable table', async () => {
  const url = 'https://example.org/orders';
  const headers = ['Day', 'Plan', 'Actual'];
  const rows = [['Monday', '0012.00', -4], ['Tuesday', '8', 3]];
  for (const source of [
    [headers, ...rows],
    { data: [{ Plan: '0012.00', Day: 'Monday', Actual: -4 }, { Actual: 3, Day: 'Tuesday', Plan: '8' }] },
    { columns: headers.map(label => ({ label })), rows },
  ]) {
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    expect(insertChartFromJSON(editor, '\uFEFF' + JSON.stringify(source), { title: 'Forecast', sourceURL: url })).toBe(true);
    const original = selectedBarChart(editor)!;
    expect(original.child(1).content.map(row => row.content.map(cell => cell.textContent)))
      .toEqual([headers, ...rows.map(row => row.map(String))]);
    const html = HTMLExporter.export(editor.state.doc, { document: false });
    expect(ServerHTMLImporter.parse(html, editor.state.schema).eq(editor.state.doc)).toBe(true);
    const word = exportDOCX(editor.state.doc);
    expect(word.report.issues.some(issue => issue.code === 'chart-json-link-omitted')).toBe(true);
    const reopened = importDOCX(word.bytes, editor.state.schema).document.content.find(node => node.type.name === 'bar_chart')!;
    expect(reopened.attrs.jsonURL).toBeNull();
    expect(reopened.child(1).child(1).child(2).textContent).toBe('-4');
    const unexpected = async () => { throw new Error('CSV loader was called for JSON'); };
    expect(await refreshChartFromCSV(editor, unexpected)).toBe(false);
    expect(await refreshChartSnapshotFromCSV(editor, original, unexpected)).toBeNull();
    const changed = await refreshChartSnapshotFromSource(editor, original, async address => {
      expect(address).toBe(url);
      return JSON.stringify([headers, ['Monday', '13', -5], rows[1]]);
    });
    expect(changed?.child(1).child(1).child(2).textContent).toBe('-5');
    expect(undo(editor)).toBe(true);
    expect(selectedBarChart(editor)?.eq(original)).toBe(true);
    editor.destroy();
  }
});

it('rejects invalid JSON refreshes without losing the previous chart or undo history', async () => {
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
  const before = editor.state.doc;
  insertChartFromJSON(editor, '[{"Week":"A","Orders":2}]', { title: 'Orders', sourceURL: 'https://example.org/orders' });
  const saved = editor.state.doc;
  for (const source of ['[', '[]', '[["A","B"],["M",null]]',
    '[{"Day":"M","Orders":1},{"Day":"T","Other":2}]', '[["A","B"],["M",9007199254740993]]',
    '[["Day","Orders"],["Monday","missing"]]']) {
    await expect(refreshChartFromSource(editor, async () => source)).rejects.toThrow();
    expect(editor.state.doc).toBe(saved);
  }
  expect(undo(editor)).toBe(true);
  expect(editor.state.doc.eq(before)).toBe(true);
  editor.destroy();
});

it.each(['csv', 'json'] as const)('keeps a detached %s snapshot editable and reconnects it in one undoable change', async format => {
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
  const feed = (value: number) => format === 'csv' ? 'Day,Orders\nMonday,' + value : JSON.stringify([{ Day: 'Monday', Orders: value }]);
  const url = 'https://example.org/weekly';
  const insert = format === 'csv' ? insertChartFromCSV : insertChartFromJSON;
  expect(insert(editor, feed(12), { title: 'Weekly', sourceURL: url })).toBe(true);
  const before = selectedBarChart(editor)!;
  expect(detachChartSource(editor)).toBe(true);
  const detached = selectedBarChart(editor)!;
  expect(detached.child(1)).toBe(before.child(1));
  expect(detached.attrs[format + 'URL']).toBe(url);
  expect(detachChartSource(editor)).toBe(false);
  const untouched = async () => { throw new Error('A detached chart requested data'); };
  expect(await refreshChartFromSource(editor, untouched)).toBe(false);
  expect(await refreshChartSnapshotFromSource(editor, detached, untouched)).toBeNull();
  expect(updateChartFromText(editor, chartToText(detached).replace('12', '15'), detached)).toBe(true);
  const local = editor.state.doc;
  expect(ServerHTMLImporter.parse(HTMLExporter.export(local, { document: false }), editor.state.schema).eq(local)).toBe(true);
  expect(editor.state.schema.nodeFromJSON(local.toJSON()).eq(local)).toBe(true);
  for (const bad of [async () => 'bad', async () => { throw new Error('Offline'); }]) {
    await expect(reconnectChartSource(editor, bad)).rejects.toThrow();
    expect(editor.state.doc).toBe(local);
  }
  expect(await reconnectChartSource(editor, async address => { expect(address).toBe(url); return feed(22); })).toBe(true);
  expect(selectedBarChart(editor)?.attrs.feedDetached).toBe(false);
  expect(chartToText(selectedBarChart(editor)!)).toContain('Monday,22');
  expect(undo(editor)).toBe(true);
  expect(editor.state.doc.eq(local)).toBe(true);
  expect(await reconnectChartSource(editor, async () => feed(15))).toBe(true);
  expect(selectedBarChart(editor)?.attrs.feedDetached).toBe(false);
  expect(undo(editor)).toBe(true);
  expect(editor.state.doc.eq(local)).toBe(true);
  editor.destroy();
});

it('discards late reads across detach/undo and edits during reconnection', async () => {
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
  insertChartFromCSV(editor, 'Day,Orders\nMonday,12', { title: 'Weekly', sourceURL: 'https://example.org/weekly' });
  const chart = selectedBarChart(editor)!;
  let finish!: (source: string) => void;
  const delayed = () => new Promise<string>(resolve => { finish = resolve; });
  const refresh = refreshChartFromSource(editor, delayed);
  expect(detachChartSource(editor)).toBe(true);
  expect(undo(editor)).toBe(true);
  finish('Day,Orders\nMonday,999');
  expect(await refresh).toBe(false);
  expect(chartToText(selectedBarChart(editor)!)).toBe(chartToText(chart));
  expect(detachChartSource(editor)).toBe(true);
  const reconnect = reconnectChartSource(editor, delayed);
  expect(updateChartFromText(editor, chartToText(chart).replace('12', '15'))).toBe(true);
  finish('Day,Orders\nMonday,999');
  expect(await reconnect).toBe(false);
  expect(selectedBarChart(editor)?.attrs.feedDetached).toBe(true);
  expect(chartToText(selectedBarChart(editor)!)).toContain('Monday,15');
  editor.destroy();
});
