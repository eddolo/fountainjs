import type { Node, Schema } from '../core/schema';
import { chartLayout } from '../charts/layout';
import { expandedXMLName } from './xml-names';
import type { XMLElement } from './xml-types';

export const CHART_NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
export const CHART_GROUP = 'urn:fountainjs:docx:chart:v1';

function children(node: XMLElement | undefined, name: string, namespace = CHART_NS): XMLElement[] {
  return node?.children.filter((entry): entry is XMLElement =>
    typeof entry !== 'string' && expandedXMLName(entry) === namespace + '|' + name) ?? [];
}

function one(node: XMLElement | undefined, name: string, namespace = CHART_NS) {
  const matches = children(node, name, namespace);
  return matches.length === 1 ? matches[0] : undefined;
}

function text(node?: XMLElement) {
  return node?.children.every(part => typeof part === 'string') ? node.children.join('') : undefined;
}

// Indexes can arrive out of order. Missing points are gaps in the series.
function values(cache?: XMLElement): string[] | undefined {
  const points = children(cache, 'pt');
  if (!points.length || one(cache, 'ptCount')?.attrs.val !== String(points.length)) return;
  const values = new Map<number, string>();
  for (const point of points) {
    const index = Number(point.attrs.idx);
    const value = text(one(point, 'v'));
    if (!Number.isInteger(index) || String(index) !== point.attrs.idx || index < 0 || index >= points.length ||
      values.has(index) || value === undefined) return;
    values.set(index, value);
  }
  return Array.from({ length: points.length }, (_, index) => values.get(index)!);
}

export function readNativeChart(root: XMLElement, schema: Schema): Node | undefined {
  const chart = one(one(root, 'chartSpace'), 'chart');
  const area = one(chart, 'plotArea');
  const plots = area?.children.filter((part): part is XMLElement => typeof part !== 'string' && /Chart$/.test(part.name));
  if (plots?.length !== 1) return;
  const family = (['bar', 'line', 'pie'] as const).find(kind => one(area, kind + 'Chart') === plots[0]);
  if (!family) return;
  const plot = plots[0]!;
  const direction = one(plot, 'barDir')?.attrs.val;
  if (family === 'bar' && direction !== 'bar' && direction !== 'col') return;
  const kind = family === 'bar' && direction === 'col' ? 'column' : family;
  const grouping = one(plot, 'grouping')?.attrs.val;
  if (grouping && grouping !== 'standard' && grouping !== 'clustered') return;
  const series = one(plot, 'ser');
  const cat = one(series, 'cat'), val = one(series, 'val');
  const labels = values(one(one(cat, 'strRef'), 'strCache') ?? one(cat, 'strLit'));
  const numbers = values(one(one(val, 'numRef'), 'numCache') ?? one(val, 'numLit'));
  if (!labels || !numbers || labels.length !== numbers.length) return;

  const tx = one(series, 'tx');
  const seriesName = text(one(tx, 'v')) ?? values(one(one(tx, 'strRef'), 'strCache'))?.[0] ?? 'Value';
  const titleTx = one(one(chart, 'title'), 'tx');
  const title = children(one(titleTx, 'rich'), 'p', DRAWING_NS).map(p =>
    children(p, 'r', DRAWING_NS).map(run => text(one(run, 't', DRAWING_NS)) ?? '').join('')).join('\n')
    || values(one(one(titleTx, 'strRef'), 'strCache'))?.[0];
  const paragraph = (value: string) => schema.node('paragraph', {}, value ? [schema.text(value)] : []);
  const row = (type: string, label: string, value: string) => schema.node('table_row', {},
    [label, value].map(cell => schema.node(type, {}, [paragraph(cell)])));
  const table = schema.node('table', {}, [row('table_header', 'Category', seriesName),
    ...labels.map((label, i) => row('table_cell', label, numbers[i]!))]);
  const result = schema.node('bar_chart', { kind }, title ? [paragraph(title), table] : [table]);
  return typeof chartLayout(result) === 'string' ? undefined : result;
}

/** Only coalesce a tagged table and chart with equivalent data. Keep independent edits. */
export function reconcileChartGroup(blocks: Node[], schema: Schema): Node[] {
  const chart = blocks.at(-1), table = blocks.at(-2);
  if (chart?.type.name !== 'bar_chart' || table?.type.name !== 'table' ||
      !(blocks.length === 2 || (blocks.length === 3 && blocks[0]!.type.name === 'paragraph'))) return blocks;
  const title = blocks.length === 3 ? blocks[0]! : undefined;
  const candidate = schema.node('bar_chart', chart.attrs, title ? [title, table] : [table]);
  const native = chartLayout(chart), source = chartLayout(candidate);
  if (typeof native === 'string' || typeof source === 'string' || native.rows.length !== source.rows.length) return blocks;
  const header = table.child(0);
  const series = header.content.every(cell => cell.type.name === 'table_header') ? header.child(1).textContent || 'Value' : 'Value';
  const nativeTable = chart.child(chart.childCount - 1);
  if ((source.title || series) !== native.title || nativeTable.child(0).child(1).textContent !== series ||
    !native.rows.every((row, i) => row.label === source.rows[i]!.label && Number(row.source) === Number(source.rows[i]!.source))) return blocks;
  return [candidate];
}
