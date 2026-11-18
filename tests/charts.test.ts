import { expect, it } from 'vitest';
import { unzipSync, strFromU8, strToU8, zipSync } from 'fflate';
import * as Y from 'yjs';
import { exportDOCX, importDOCX } from '../src/docx';
import { createYjsCollaborationExtension } from '../src/yjs';
import { CellSelection, NodeSelection, RangeSelection, Schema, Selection, nodeRangeAtPath, textPointToPosition, CoreExtension, HTMLExporter, HistoryExtension, Plugin, composeExtensions, createEditor, redo, undo } from '../src';
import { BarChartExtension, exportBarChartSVG, selectedBarChart, insertChartFromCSV, refreshChartFromCSV, insertChart, insertBarChart, setChartType, setChartAxisTitle, setChartValueRange, tableChartAction, toggleTableChart } from '../src/charts';
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
    expect(svg).toContain(kind === 'line' ? '<polyline' : kind === 'column' ? 'height="188" fill="#55409c"' : 'A96 96');
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
  expect(svg).toMatch(/<polyline points="118,[\d.]+ 212,[\d.]+"/);
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
