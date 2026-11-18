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

function chartTitle(parent?: XMLElement): string {
  const titleTx = one(one(parent, 'title'), 'tx');
  return children(one(titleTx, 'rich'), 'p', DRAWING_NS).map(p => p.children.map(part => {
    if (typeof part === 'string') return '';
    const type = expandedXMLName(part);
    if (type === DRAWING_NS + '|br') return '\n';
    return type === DRAWING_NS + '|r' || type === DRAWING_NS + '|fld' ? text(one(part, 't', DRAWING_NS)) ?? '' : '';
  }).join('')).join('\n')
    || values(one(one(titleTx, 'strRef'), 'strCache'))?.[0] || '';
}

export function readNativeChart(root: XMLElement, schema: Schema): Node | undefined {
  const space = one(root, 'chartSpace');
  const chart = one(space, 'chart');
  const extension = children(one(space, 'extLst'), 'ext').find(ext => ext.attrs.uri === '{CE69F4BE-F8AD-4158-9ED4-6D3E0B80C163}');
  const target = one(extension, 'target', 'urn:fountainjs:chart');
  let targetValue = target?.attrs.value?.trim() ? Number(target.attrs.value) : null;
  if (targetValue !== null && !Number.isFinite(targetValue)) targetValue = null;
  let targetLabel = targetValue === null ? '' : text(target) ?? '';
  const area = one(chart, 'plotArea');
  const plots = area?.children.filter((part): part is XMLElement => typeof part !== 'string' && /Chart$/.test(part.name));
  const combo = targetValue !== null && plots?.length === 2 && plots[0] === one(area, 'barChart') &&
    plots[1] === one(area, 'lineChart') && one(plots[0], 'barDir')?.attrs.val === 'col';
  if (!plots?.length || (plots.length !== 1 && !combo)) return;
  const family = (['bar', 'line', 'pie'] as const).find(kind => one(area, kind + 'Chart') === plots[0]);
  if (!family) return;
  const plot = plots[0]!;
  const direction = one(plot, 'barDir')?.attrs.val;
  if (family === 'bar' && direction !== 'bar' && direction !== 'col') return;
  const kind = family === 'bar' && direction === 'col' ? 'column' : family;
  const grouping = one(plot, 'grouping')?.attrs.val;
  if (grouping && grouping !== 'standard' && grouping !== 'clustered') return;
  const seriesNodes = children(plot, 'ser');
  const targetId = target?.attrs.series;
  const hasTargetId = (item: XMLElement) => targetId !== undefined && one(item, 'idx')?.attrs.val === targetId;
  if (combo) {
    const extra = children(plots[1], 'ser');
    if (extra.length !== 1 || !hasTargetId(extra[0]!)) return;
    seriesNodes.push(extra[0]!);
  }
  const targetSeries = targetValue !== null && (kind === 'line' || combo) ? seriesNodes.find(hasTargetId) : undefined;
  if ((kind === 'line' || kind === 'column') && !targetSeries) { targetValue = null; targetLabel = ''; }
  if (!seriesNodes.length || (kind === 'pie' && seriesNodes.length !== 1)) return;
  const series: { name: string; numbers: string[]; order: number }[] = [];
  const orders = new Set<number>();
  let categories: string[] | undefined;
  for (const [index, item] of seriesNodes.entries()) {
    const cat = one(item, 'cat'), val = one(item, 'val');
    const labels = values(one(one(cat, 'strRef'), 'strCache') ?? one(cat, 'strLit'));
    const numbers = values(one(one(val, 'numRef'), 'numCache') ?? one(val, 'numLit'));
    if (!labels || !numbers || labels.length !== numbers.length) return;
    if (categories && (labels.length !== categories.length || labels.some((label, i) => label !== categories![i]))) return;
    categories ??= labels;
    const tx = one(item, 'tx');
    const name = text(one(tx, 'v')) ?? values(one(one(tx, 'strRef'), 'strCache'))?.[0]
      ?? (seriesNodes.length === 1 ? 'Value' : 'Series ' + (index + 1));
    const order = Number(one(item, 'order')?.attrs.val ?? index);
    if (!Number.isSafeInteger(order) || order < 0 || orders.has(order)) return;
    orders.add(order);
    if (item === targetSeries) {
      const first = Number(numbers[0]);
      if (Number.isFinite(first) && numbers.every(value => value.trim() && Number(value) === first)) {
        targetValue = first;
        if (name !== (targetLabel || 'Target')) targetLabel = name;
        continue;
      }
      // A changed target can become an ordinary line series. A mixed column/line
      // plot with independently varying series requires combo-chart support.
      if (combo) return;
      targetValue = null;
      targetLabel = '';
    }
    series.push({ name, numbers, order });
  }
  series.sort((a, b) => a.order - b.order);
  let title = chartTitle(chart);
  if (!series.length) return;
  if (kind === 'bar' && targetValue !== null) {
    const suffix = '\n' + (targetLabel || 'Target') + ' · ' + targetValue;
    if (title.endsWith(suffix)) title = title.slice(0, -suffix.length);
  }
  const paragraph = (value: string) => schema.node('paragraph', {}, value ? [schema.text(value)] : []);
  const row = (type: string, cells: string[]) => schema.node('table_row', {},
    cells.map(cell => schema.node(type, {}, [paragraph(cell)])));
  const table = schema.node('table', {}, [row('table_header', ['Category', ...series.map(item => item.name)]),
    ...categories!.map((label, i) => row('table_cell', [label, ...series.map(item => item.numbers[i]!)]))]);
  const valueAxis = one(area, 'valAx');
  const scaling = one(valueAxis, 'scaling');
  // Logarithmic and reversed value scales need a different projection.
  if (one(scaling, 'logBase') || one(scaling, 'orientation')?.attrs.val === 'maxMin') return;
  const bound = (name: string, parent = scaling) => {
    const raw = one(parent, name)?.attrs.val;
    return raw === undefined ? null : raw.trim() ? Number(raw) : NaN;
  };
  const axisMin = bound('min'), axisMax = bound('max'), axisInterval = bound('majorUnit', valueAxis);
  if (axisInterval !== null && (!Number.isFinite(axisInterval) || axisInterval <= 0)) return;
  if ([axisMin, axisMax].some(value => value !== null && !Number.isFinite(value))) return;
  const result = schema.node('bar_chart', { kind, targetValue, targetLabel, axisMin, axisMax, axisInterval, categoryAxisTitle: chartTitle(one(area, 'catAx')),
    valueAxisTitle: chartTitle(one(area, 'valAx')) }, title ? [paragraph(title), table] : [table]);
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
  const titleText = source.title || (source.series.length === 1 ? source.series[0]!.name : 'Chart');
  if (native.title !== titleText || native.series.length !== source.series.length) return blocks;
  for (const [j, item] of native.series.entries()) {
    const original = source.series[j]!;
    if (item.name !== original.name || !item.rows.every((point, i) =>
      point.label === original.rows[i]!.label && Number(point.source) === Number(original.rows[i]!.source))) return blocks;
  }
  return [candidate];
}
