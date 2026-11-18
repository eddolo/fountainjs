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

function workbook(rows: readonly DataRow[], category: string, series: string): Uint8Array {
  // SpreadsheetML reserves literal _xHHHH_ sequences. Labels are inline strings,
  // including labels beginning with "="; only the value column is numeric.
  const stringCell = (ref: string, value: string) =>
    `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value.replace(/_x(?=[0-9a-f]{4}_)/gi, '_x005F_x'))}</t></is></c>`;
  const header = `<row r="1">${stringCell('A1', category)}${stringCell('B1', series)}</row>`;
  const data = rows.map((row, i) => `<row r="${i + 2}">${stringCell('A' + (i + 2), row.label)}<c r="B${i + 2}"><v>${Number(row.source)}</v></c></row>`).join('');
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
  const { rows, kind } = layout;
  const table = node.child(node.childCount - 1);
  const header = table.child(0).content.every(cell => cell.type.name === 'table_header') ? table.child(0) : null;
  const category = header?.child(0).textContent || 'Category', series = header?.child(1).textContent || 'Value';
  const title = layout.title || series;
  if (rows.length >= 1048576 || [category, series, title].some(value => value.length > 32767)
    || rows.some(row => row.label.length > 32767 || Math.abs(Number(row.source)) > 9.99999999999999e307
      || (Number(row.source) !== 0 && Math.abs(Number(row.source)) < 2.2250738585072014e-308))) {
    return 'The chart data exceeds the Excel worksheet limits.';
  }
  const color = (hex: string) => `<a:solidFill><a:srgbClr val="${hex.slice(1)}"/></a:solidFill>`;
  const primary = color(rows[0].color);
  const paint = kind === 'pie' ? rows.map((row, i) => `<c:dPt><c:idx val="${i}"/><c:spPr>${color(row.color)}</c:spPr></c:dPt>`).join('')
    : `<c:spPr>${kind === 'line' ? '<a:ln>' + primary + '</a:ln>' : primary}</c:spPr>`;
  const last = rows.length + 1;
  const marker = kind === 'line' ? '<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>' : '';
  // Some Office readers apply the series default even when the chart disables smoothing.
  const smooth = kind === 'line' ? '<c:smooth val="0"/>' : '';
  const data = `<c:ser><c:idx val="0"/><c:order val="0"/><c:tx>${reference('str', '$B$1', [series])}</c:tx>${paint}${marker}<c:cat>${reference('str', '$A$2:$A$' + last, rows.map(row => row.label))}</c:cat><c:val>${reference('num', '$B$2:$B$' + last, rows.map(row => String(Number(row.source))))}</c:val>${smooth}</c:ser>`;
  const options = kind === 'bar' ? '<c:barDir val="bar"/><c:grouping val="clustered"/>' : kind === 'line' ? '<c:grouping val="standard"/>' : '<c:varyColors val="1"/>';
  const axis = (type: 'cat' | 'val', id: number, pos: string) =>
    `<c:${type}Ax><c:axId val="${id}"/><c:scaling><c:orientation val="${type === 'cat' && kind === 'bar' ? 'maxMin' : 'minMax'}"/></c:scaling><c:axPos val="${pos}"/><c:tickLblPos val="low"/><c:crossAx val="${3 - id}"/><c:crosses val="autoZero"/></c:${type}Ax>`;
  const axes = kind === 'pie' ? '' : axis('cat', 1, kind === 'bar' ? 'l' : 'b') + axis('val', 2, kind === 'bar' ? 'b' : 'l');
  const chartTitle = `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${xmlEscape(title)}</a:t></a:r></a:p></c:rich></c:tx></c:title>`;
  const xml = `<c:chartSpace xmlns:c="${chartNS}" xmlns:a="${drawingNS}" xmlns:r="${OFFICE_REL_NS}"><c:chart>${chartTitle}<c:plotArea><c:layout/><c:${kind}Chart>${options}${data}${smooth}${axes ? '<c:axId val="1"/><c:axId val="2"/>' : ''}</c:${kind}Chart>${axes}</c:plotArea>${kind === 'pie' ? '<c:legend><c:legendPos val="b"/></c:legend>' : ''}<c:plotVisOnly val="1"/></c:chart><c:externalData r:id="rIdData"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`;
  const drawing = `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="5029200" cy="2834640"/><wp:docPr id="${drawingId}" name="Chart ${index}" descr="${xmlEscape(title)}"/><a:graphic><a:graphicData uri="${chartNS}"><c:chart xmlns:c="${chartNS}" r:id="rIdChart${index}"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  return { xml, drawing, workbook: workbook(rows, category, series) };
}
