import { strToU8, zipSync } from 'fflate';
import { chartLayout } from '../charts/layout';
import type { Node } from '../core/schema';
import { OFFICE_CONTENT_TYPE, OFFICE_REL_NS, relationshipXML, relationshipsXML, xmlEscape } from './opc';

const drawingNS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const chartNS = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const sheetNS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
export const CHART_TYPE = OFFICE_CONTENT_TYPE + 'drawingml.chart+xml';
export const WORKBOOK_TYPE = OFFICE_CONTENT_TYPE + 'spreadsheetml.sheet';

interface DataRow { label: string; source: string; color: string }

interface Series { name: string; rows: readonly DataRow[] }

function excelColumn(index: number): string {
  let value = index + 1, letters = '';
  while (value > 0) {
    letters = String.fromCharCode(65 + (value - 1) % 26) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

function workbook(series: readonly Series[], category: string): Uint8Array {
  // SpreadsheetML reserves literal _xHHHH_ sequences. Labels are inline strings,
  // including labels beginning with "="; only the value column is numeric.
  const stringCell = (ref: string, value: string) =>
    `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value.replace(/_x(?=[0-9a-f]{4}_)/gi, '_x005F_x'))}</t></is></c>`;
  const columns = series.map((_, j) => excelColumn(j + 1));
  const header = `<row r="1">${stringCell('A1', category)}${series.map((item, j) => stringCell(columns[j] + '1', item.name)).join('')}</row>`;
  const data = series[0]!.rows.map((row, i) => {
    const r = i + 2;
    const cells = series.map((item, j) => `<c r="${columns[j]}${r}"><v>${Number(item.rows[i]!.source)}</v></c>`);
    return `<row r="${r}">${stringCell('A' + r, row.label)}${cells.join('')}</row>`;
  }).join('');
  return zipSync({
    '[Content_Types].xml': strToU8(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="${WORKBOOK_TYPE}.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${OFFICE_CONTENT_TYPE}spreadsheetml.worksheet+xml"/></Types>`),
    '_rels/.rels': strToU8(relationshipsXML(relationshipXML('rId1', OFFICE_REL_NS + '/officeDocument', 'xl/workbook.xml'))),
    'xl/workbook.xml': strToU8(`<workbook xmlns="${sheetNS}" xmlns:r="${OFFICE_REL_NS}"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(relationshipsXML(relationshipXML('rId1', OFFICE_REL_NS + '/worksheet', 'worksheets/sheet1.xml'))),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet xmlns="${sheetNS}"><sheetData>${header}${data}</sheetData></worksheet>`),
  }, { level: 6 });
}

function reference(type: 'str' | 'num', range: string, values: string[]) {
  const points = values.map((value, i) => `<c:pt idx="${i}"><c:v>${xmlEscape(value)}</c:v></c:pt>`).join('');
  return `<c:${type}Ref><c:f>Data!${range}</c:f><c:${type}Cache>${type === 'num' ? '<c:formatCode>General</c:formatCode>' : ''}<c:ptCount val="${values.length}"/>${points}</c:${type}Cache></c:${type}Ref>`;
}

export function wordChart(node: Node, index: number, drawingId: number) {
  const layout = chartLayout(node);
  if (typeof layout === 'string') return layout;
  const { rows, kind, series } = layout;
  const table = node.child(node.childCount - 1);
  const header = table.child(0).content.every(cell => cell.type.name === 'table_header') ? table.child(0) : null;
  const category = header?.child(0).textContent || 'Category';
  const title = layout.title || (series.length === 1 ? series[0]!.name : 'Chart');
  const target = layout.target;
  const overlay = target !== null && (kind === 'column' || kind === 'line');
  const targetName = String(node.attrs.targetLabel || 'Target');
  const workbookSeries = overlay ? [...series, { name: targetName, color: '#983f19', rows: rows.map(row => ({ label: row.label, color: row.color, source: String(target.value) })) }] : series;
  if (workbookSeries.length >= 16384 || rows.length >= 1048576 || [category, title, ...workbookSeries.map(item => item.name)].some(value => value.length > 32767)
    || workbookSeries.some(item => item.rows.some(row => row.label.length > 32767 || Math.abs(Number(row.source)) > 9.99999999999999e307
      || (Number(row.source) !== 0 && Math.abs(Number(row.source)) < 2.2250738585072014e-308)))) {
    return 'The chart data exceeds the Excel worksheet limits.';
  }
  const color = (hex: string) => `<a:solidFill><a:srgbClr val="${hex.slice(1)}"/></a:solidFill>`;
  const last = rows.length + 1;
  const marker = kind === 'line' ? '<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>' : '';
  // Some Office readers apply the series default even when the chart disables smoothing.
  const smooth = kind === 'line' ? '<c:smooth val="0"/>' : '';
  const ids = '<c:axId val="1"/><c:axId val="2"/>';
  const categoryRef = reference('str', '$A$2:$A$' + last, rows.map(row => row.label));
  const seriesXML = workbookSeries.map((item, j) => {
    const column = '$' + excelColumn(j + 1);
    const isTarget = j === series.length;
    const primary = color(item.color);
    const line = isTarget ? '<a:ln w="19050">' + primary + '<a:prstDash val="dash"/></a:ln>' : '<a:ln>' + primary + '</a:ln>';
    const paint = kind === 'pie' ? rows.map((row, i) => `<c:dPt><c:idx val="${i}"/><c:spPr>${color(row.color)}</c:spPr></c:dPt>`).join('')
      : `<c:spPr>${kind === 'line' || isTarget ? line : primary}</c:spPr>`;
    const symbol = isTarget ? '<c:marker><c:symbol val="' + (rows.length === 1 ? 'dash' : 'none') + '"/></c:marker>' : marker;
    const values = reference('num', column + '$2:' + column + '$' + last, item.rows.map(row => String(Number(row.source))));
    return `<c:ser><c:idx val="${j}"/><c:order val="${j}"/><c:tx>${reference('str', column + '$1', [item.name])}</c:tx>${paint}${symbol}<c:cat>${categoryRef}</c:cat><c:val>${values}</c:val>${isTarget ? '<c:smooth val="0"/>' : smooth}</c:ser>`;
  });
  const referenceSeries = overlay && kind === 'column' ? seriesXML.pop()! : '';
  const data = seriesXML.join('');
  const additionalPlot = kind === 'column' && overlay ? '<c:lineChart><c:grouping val="standard"/>' + referenceSeries + ids + '</c:lineChart>' : '';
  const targetExtension = node.attrs.targetValue == null ? '' : '<c:extLst><c:ext uri="{CE69F4BE-F8AD-4158-9ED4-6D3E0B80C163}"><f:target xmlns:f="urn:fountainjs:chart" value="' +
    xmlEscape(node.attrs.targetValue) + '"' + (overlay ? ' series="' + series.length + '"' : '') + '>' + xmlEscape(node.attrs.targetLabel ?? '') + '</f:target></c:ext></c:extLst>';
  const displayTitle = kind === 'bar' && target ? title + '\n' + target.caption : title;
  const chartElement = kind === 'column' ? 'bar' : kind;
  const options = chartElement === 'bar' ? `<c:barDir val="${kind === 'column' ? 'col' : 'bar'}"/><c:grouping val="clustered"/>` : kind === 'line' ? '<c:grouping val="standard"/>' : '<c:varyColors val="1"/>';
  const chartTitle = (value: string) => '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/>' +
    value.split(/\r\n?|\n/).map(line => '<a:p><a:r><a:t>' + xmlEscape(line) + '</a:t></a:r></a:p>').join('') + '</c:rich></c:tx></c:title>';
  const bounds = (node.attrs.axisMax == null ? '' : `<c:max val="${xmlEscape(node.attrs.axisMax)}"/>`) +
    (node.attrs.axisMin == null ? '' : `<c:min val="${xmlEscape(node.attrs.axisMin)}"/>`);
  const majorUnit = node.attrs.axisInterval == null ? '' : `<c:majorUnit val="${xmlEscape(node.attrs.axisInterval)}"/>`;
  const gridlines = kind === 'column' || kind === 'line' ? '<c:majorGridlines><c:spPr><a:ln w="9525">' + color('#d4d0df') + '</a:ln></c:spPr></c:majorGridlines>' : '';
  const axis = (type: 'cat' | 'val', id: number, pos: string, label: string) =>
    `<c:${type}Ax><c:axId val="${id}"/><c:scaling><c:orientation val="${type === 'cat' && kind === 'bar' ? 'maxMin' : 'minMax'}"/>${type === 'val' ? bounds : ''}</c:scaling><c:axPos val="${pos}"/>${type === 'val' ? gridlines : ''}${label ? chartTitle(label) : ''}<c:tickLblPos val="low"/><c:crossAx val="${3 - id}"/><c:crosses val="autoZero"/>${type === 'val' ? majorUnit : ''}</c:${type}Ax>`;
  const axes = kind === 'pie' ? '' : axis('cat', 1, kind === 'bar' ? 'l' : 'b', String(node.attrs.categoryAxisTitle ?? '')) + axis('val', 2, kind === 'bar' ? 'b' : 'l', String(node.attrs.valueAxisTitle ?? ''));
  const xml = `<c:chartSpace xmlns:c="${chartNS}" xmlns:a="${drawingNS}" xmlns:r="${OFFICE_REL_NS}"><c:chart>${chartTitle(displayTitle)}<c:plotArea><c:layout/><c:${chartElement}Chart>${options}${data}${smooth}${axes ? ids : ''}</c:${chartElement}Chart>${additionalPlot}${axes}</c:plotArea>${kind === 'pie' || workbookSeries.length > 1 ? '<c:legend><c:legendPos val="b"/></c:legend>' : ''}<c:plotVisOnly val="1"/></c:chart><c:externalData r:id="rIdData"><c:autoUpdate val="0"/></c:externalData>${targetExtension}</c:chartSpace>`;
  const drawing = `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="5029200" cy="2834640"/><wp:docPr id="${drawingId}" name="Chart ${index}" descr="${xmlEscape(title)}"/><a:graphic><a:graphicData uri="${chartNS}"><c:chart xmlns:c="${chartNS}" r:id="rIdChart${index}"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  return { xml, drawing, workbook: workbook(workbookSeries, category) };
}
