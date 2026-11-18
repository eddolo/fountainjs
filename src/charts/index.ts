import { readDelimitedRows } from '../core/delimited-text';
import { insertNode, nodeRangeAtPath, NodeSelection, type DOMOutputSpec, type Editor, type Node, type NodeSpec } from '../core';
import { RestructureChildrenStep } from '../core/transaction/restructure-children-step';
import { defineExtension } from '../extensions/extension';
import { chartLayout, columnBounds, chartTypes, type ChartType } from './layout';
export type { ChartType } from './layout';
export { exportChartSVG, exportChartImage, exportChartSVG as exportBarChartSVG, exportChartImage as exportBarChartImage, type ChartImageFormat } from './image';

function percent(value: number): string {
  return Number(value.toFixed(5)) + '%';
}

function plot(node: Node): DOMOutputSpec {
  const layout = chartLayout(node);
  if (typeof layout === 'string') return ['p', layout];
  const { title, zero, kind, series } = layout;
  const multiple = series.length > 1;
  const legend: DOMOutputSpec[] = multiple ? [['div', { style: 'display:flex;gap:1em;flex-wrap:wrap' },
    ...series.map((item): DOMOutputSpec => ['span', ['span', { style: 'color:' + item.color }, '■ '], item.name])]] : [];
  const label = (index: number) => layout.rows[index]!.label + (multiple ? '' : ' · ' + layout.rows[index]!.source);
  const graphic = (children: DOMOutputSpec[]): DOMOutputSpec => ['div', {
    role: 'img', style: 'display:flow-root', 'aria-label': (title || kind + ' chart') + '. Values are in the accompanying table.',
  }, ...children];
  if (kind !== 'bar') {
    const markers: DOMOutputSpec[] = [];
    let style: string;
    if (kind === 'pie') {
      const stops = layout.rows.map(row => row.color + ' ' + percent(row.start) + ' ' + percent(row.end));
      style = 'width:min(100%,16em);aspect-ratio:1;border-radius:50%;margin:auto;background:conic-gradient(' + stops.join(',') + ')';
    } else {
      style = 'position:relative;aspect-ratio:4;margin:12px 6px;background:#f5f3fa';
      markers.push(['span', { style: `position:absolute;top:${percent(100 - zero)};width:100%;border-top:1px solid #aaa` }]);
      const position = (point: { x: number; y: number }) => `position:absolute;left:${percent(point.x)};top:${percent(point.y)}`;
      for (const [j, item] of series.entries()) {
        item.rows.forEach((row, index) => {
          if (kind === 'column') {
            const bounds = columnBounds(index, layout.rows.length, row.y, zero, j, series.length);
            markers.push(['span', { style: `position:absolute;left:${percent(bounds.left)};top:${percent(bounds.top)};width:${percent(bounds.width)};height:${percent(bounds.height)};background:${item.color}` }]);
            return;
          }
          const previous = item.rows[index - 1];
          if (previous) {
            const dx = row.x - previous.x, dy = (row.y - previous.y) / 4;
            markers.push(['span', { style: `${position(previous)};width:${percent(Math.hypot(dx, dy))};height:2px;background:${item.color};transform-origin:0 0;transform:rotate(${Math.atan2(dy, dx)}rad)` }]);
          }
          markers.push(['span', { style: `${position(row)};background:${item.color};border-radius:50%;width:6px;height:6px;transform:translate(-50%,-50%)` }]);
        });
      }
    }
    if (kind === 'column' && layout.rows.length <= 6) {
      return graphic([
        ...legend,
        ['div', { dir: 'ltr', style }, ...markers],
        ['div', { dir: 'ltr', style: `display:grid;grid-template-columns:repeat(${layout.rows.length},minmax(0,1fr));margin:0 6px;text-align:center;overflow-wrap:anywhere` },
          ...layout.rows.map((_, i): DOMOutputSpec => ['span', { dir: 'auto' }, label(i)])],
      ]);
    }
    return graphic([
      ...legend,
      ['div', { dir: 'ltr', style }, ...markers],
      ...layout.rows.map((row, i): DOMOutputSpec => ['div',
        ['span', { style: kind === 'pie' ? `color:${row.color}` : '' }, kind === 'pie' ? '■ ' : (i + 1) + '. '],
        label(i)]),
    ]);
  }
  const rows = layout.rows.map((_, i): DOMOutputSpec => ['div', { style: 'margin:.45em 0' },
    ['span', label(i)],
    ...series.map((item): DOMOutputSpec => {
      const row = item.rows[i]!;
      return ['div', { dir: 'ltr', title: item.name + ' · ' + row.source, style: 'position:relative;height:.8em;background:#edeaf6' },
        ['span', { style: `position:absolute;left:${percent(row.left)};width:${percent(row.width)};height:100%;background:${item.color}` }],
        ['span', { style: `position:absolute;left:${percent(zero)};height:100%;border-left:1px solid #564e62` }],
      ];
    }),
  ]);
  return graphic([...legend, ...rows]);
}

function csvURL(value: unknown): value is string {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value) || /[\s\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    return !!url.hostname && !url.username && !url.password && !url.hash;
  } catch { return false; }
}

const parseRules = chartTypes.map(kind => ({
  tag: `figure[data-fountain-chart="${kind}"]`, getAttrs: (element: { getAttribute(name: string): string | null }) => {
    const source = element.getAttribute('data-fountain-csv-url');
    return { kind, csvURL: csvURL(source) ? source : null };
  }, contentElement: '[data-fountain-chart-source]',
}));

const barChartNode: NodeSpec = {
  group: 'block',
  attrs: { kind: { default: 'bar', validate: value => chartTypes.includes(value as ChartType) }, csvURL: { default: null, validate: value => value === null || csvURL(value) } },
  content: 'paragraph? table',
  selectable: true,
  parseHTML: parseRules,
  parseDOM: parseRules,
  markdown: 'html',
  toDOM: node => ['figure', { 'data-fountain-chart': node.attrs.kind, ...(node.attrs.csvURL ? { 'data-fountain-csv-url': node.attrs.csvURL } : {}), style: 'margin:1em 0' },
    ['div', { 'data-fountain-chart-source': 'true' }, 0],
    ['div', { contenteditable: 'false', 'data-fountain-chart-plot': 'true' }, plot(node)],
  ],
};

export interface ChartData {
  readonly title: string;
  readonly kind?: ChartType;
  readonly categoryLabel?: string;
  readonly series: readonly string[];
  readonly rows: readonly (readonly [string, ...number[]])[];
}

function chartTable(editor: Editor, cells: readonly (readonly (string | number)[])[]) {
  const { schema } = editor.state;
  return schema.node('table', {}, cells.map((row, i) => schema.node('table_row', {},
    row.map(value => schema.node(i ? 'table_cell' : 'table_header', {},
      [schema.node('paragraph', {}, [schema.text(String(value))])])))));
}

function supportsCharts(editor: Editor) {
  return editor.editable && ['bar_chart', 'table', 'table_row', 'table_header', 'table_cell', 'paragraph', 'text']
    .every(name => editor.state.schema.nodes[name]);
}

/** One category column followed by one numeric column per named series. */
export function insertChart(editor: Editor, data: ChartData): boolean {
  const { schema } = editor.state;
  if (!supportsCharts(editor)) return false;
  if (!data || typeof data.title !== 'string' || !Array.isArray(data.series) || !data.series.length ||
    !data.series.every(name => typeof name === 'string') || !chartTypes.includes(data.kind ?? 'bar') ||
    (data.categoryLabel !== undefined && typeof data.categoryLabel !== 'string') ||
    (data.kind === 'pie' && data.series.length !== 1) || !Array.isArray(data.rows) ||
    !data.rows.every(row => Array.isArray(row) && row.length === data.series.length + 1 &&
      typeof row[0] === 'string' && row.slice(1).every(Number.isFinite))) return false;
  const table = chartTable(editor, [[data.categoryLabel ?? 'Category', ...data.series], ...data.rows]);
  const title = schema.node('paragraph', {}, [schema.text(data.title)]);
  const chart = schema.node('bar_chart', { kind: data.kind ?? 'bar' }, [title, table]);
  const previous = editor.state.doc;
  return insertNode(editor, chart) && editor.state.doc !== previous;
}

export interface CSVChartOptions {
  readonly title: string;
  readonly kind?: ChartType;
  /** Optional address for explicit, host-controlled refresh. Stored in JSON and HTML. */
  readonly sourceURL?: string;
}

function csvTable(editor: Editor, csv: string) {
  if (typeof csv !== 'string' || csv.length > 1_048_576) throw new Error('Chart CSV exceeds the one-million-character input limit.');
  const rows = readDelimitedRows(csv.replace(/^\uFEFF/u, ''), 'csv');
  if (!rows || rows.length < 2 || rows[0]!.length < 2) throw new Error('Expected a CSV header and rectangular data rows with at least two columns, up to 10,000 cells.');
  return chartTable(editor, rows);
}

function checkPlot(chart: Node) {
  const layout = chartLayout(chart);
  if (typeof layout === 'string') throw new Error(layout);
}

/** Imports cell spellings as text. Invalid CSV leaves the editor untouched. */
export function insertChartFromCSV(editor: Editor, csv: string, options: CSVChartOptions): boolean {
  if (!supportsCharts(editor)) return false;
  if (typeof options?.title !== 'string' || !chartTypes.includes(options.kind ?? 'bar')) return false;
  if (options.sourceURL !== undefined && !csvURL(options.sourceURL)) throw new Error('Expected an HTTP or HTTPS data address without credentials or a fragment.');
  const { schema } = editor.state;
  const title = schema.node('paragraph', {}, [schema.text(options.title)]);
  const chart = schema.node('bar_chart', { kind: options.kind ?? 'bar', csvURL: options.sourceURL ?? null }, [title, csvTable(editor, csv)]);
  checkPlot(chart);
  const previous = editor.state.doc;
  return insertNode(editor, chart) && editor.state.doc !== previous;
}

// Match rows by category and columns by heading. Duplicate labels are paired in source order.
function matchLabels(existing: readonly string[], incoming: readonly string[]): (number | undefined)[] {
  const positions = new Map<string, number[]>();
  for (let i = existing.length - 1; i >= 0; i--) {
    const label = existing[i]!;
    const bucket = positions.get(label);
    if (bucket) bucket.push(i);
    else positions.set(label, [i]);
  }
  return incoming.map(label => positions.get(label)?.pop());
}

function refreshedTable(previous: Node, incoming: Node): Node {
  const header = (table: Node) => table.child(0).content.slice(1).map(cell => cell.textContent);
  const categories = (table: Node) => table.content.slice(1).map(row => row.child(0).textContent);
  const columns = [0, ...matchLabels(header(previous), header(incoming)).map(i => i === undefined ? i : i + 1)];
  const rows = [0, ...matchLabels(categories(previous), categories(incoming)).map(i => i === undefined ? i : i + 1)];
  const merged = incoming.content.map((row, i) => {
    const index = rows[i];
    if (index === undefined) return row;
    const old = previous.child(index);
    const cells = row.content.map((cell, j) => {
      const col = columns[j];
      if (col === undefined || col >= old.childCount) return cell;
      const prior = old.child(col);
      if (prior.type !== cell.type) return cell;
      if (prior.textContent === cell.textContent) return prior;
      const paragraph = prior.child(0);
      const text = paragraph.childCount === 1 ? paragraph.child(0).withText(cell.textContent) : cell.child(0).content[0]!;
      return prior.copy([paragraph.copy([text])]);
    });
    return old.childCount === cells.length && cells.every((cell, j) => cell === old.child(j)) ? old : old.copy(cells);
  });
  return previous.childCount === merged.length && merged.every((row, i) => row === previous.child(i)) ? previous : previous.copy(merged);
}

const pendingRefresh = new WeakMap<Editor, object>();

/** Refresh only the chart the user requested. A newer request or intervening edit wins. */
export async function refreshChartFromCSV(editor: Editor, load: (url: string) => Promise<string>): Promise<boolean> {
  if (editor.isDestroyed || !editor.editable) return false;
  const original = selectedBarChart(editor);
  if (!original || !csvURL(original.attrs.csvURL)) return false;
  const request = {};
  pendingRefresh.set(editor, request);
  try {
    const csv = await load(original.attrs.csvURL);
    if (editor.isDestroyed || !editor.editable || pendingRefresh.get(editor) !== request) return false;
    const target = chartTarget(editor);
    if (target?.node !== original) return false;
    const at = original.childCount - 1;
    const previous = original.child(at);
    // Refresh replaces CSV values; complex authored cells require manual resolution.
    if (previous.content.some(row => row.content.some(cell => Number(cell.attrs.colspan) > 1 || Number(cell.attrs.rowspan) > 1 ||
      cell.childCount !== 1 || cell.child(0).type.name !== 'paragraph' || cell.child(0).content.some(child => !child.isText)))) {
      throw new Error('Restore simple unmerged chart cells before refreshing CSV data.');
    }
    const table = refreshedTable(previous, csvTable(editor, csv));
    if (table === previous) return true;
    const candidate = original.copy([...original.content.slice(0, at), table]);
    checkPlot(candidate);
    return editor.dispatch(editor.createTransaction().step(new RestructureChildrenStep(target.path, at, [previous], [table])));
  } catch (error) {
    if (editor.isDestroyed || !editor.editable || pendingRefresh.get(editor) !== request || selectedBarChart(editor) !== original) return false;
    throw error;
  } finally {
    if (pendingRefresh.get(editor) === request) pendingRefresh.delete(editor);
  }
}

export function insertBarChart(editor: Editor, title: string, values: readonly (readonly [string, number])[]): boolean {
  return insertChart(editor, { title, series: ['Value'], rows: values });
}

function chartTarget(editor: Editor) {
  const { doc, schema, selection } = editor.state;
  if (!schema.nodes.bar_chart || selection.kind === 'gap' || selection.kind === 'all') return null;
  const start = selection.kind === 'node' ? selection.nodePath : selection.path;
  const end = selection.kind === 'node' ? selection.nodePath : selection.endPath;
  let node = doc;
  let target: { node: Node; path: readonly number[] } | null = null;
  for (let i = 0; i < start.length && start[i] === end[i]; i++) {
    const parent = node;
    node = parent.child(start[i]);
    if (node.type.name === 'bar_chart' || (node.type.name === 'table' && parent.type.name !== 'bar_chart')) {
      target = { node, path: start.slice(0, i + 1) };
    }
  }
  if (target && selection.kind === 'range') {
    const range = nodeRangeAtPath(doc, target.path);
    if (selection.structuralFrom < range.from || selection.structuralTo > range.to) return null;
    if (selection.isCollapsed && (selection.head === range.from || selection.head === range.to)) return null;
  }
  return target;
}

export function selectedBarChart(editor: Editor): Node | null {
  const target = chartTarget(editor);
  return target?.node.type.name === 'bar_chart' ? target.node : null;
}

/** The chart action for the current table or chart selection. */
export function tableChartAction(editor: Editor): 'wrap' | 'unwrap' | null {
  if (!editor.editable) return null;
  const target = chartTarget(editor);
  return target ? (target.node.type.name === 'bar_chart' ? 'unwrap' : 'wrap') : null;
}

/** Wraps the selected table or lifts a chart's title and table in one undoable change. */
export function toggleTableChart(editor: Editor): boolean {
  const target = chartTarget(editor);
  if (!editor.editable || !target) return false;
  const { node, path } = target;
  const { schema, selection } = editor.state;
  const unwrap = node.type.name === 'bar_chart';
  const parent = path.slice(0, -1), index = path[path.length - 1];
  try {
    const after = unwrap ? node.content : [schema.node('bar_chart', {}, [node])];
    const transaction = editor.createTransaction().step(new RestructureChildrenStep(parent, index, [node], after));
    if (unwrap && selection.kind === 'node' && selection.nodePath.length === path.length) {
      transaction.setSelection(new NodeSelection(transaction.doc, [...parent, index + after.length - 1]));
    }
    schema.validate(transaction.doc);
    return editor.dispatch(transaction);
  } catch { return false; }
}

export function setChartType(editor: Editor, kind: ChartType): boolean {
  const target = chartTarget(editor);
  if (!editor.editable || target?.node.type.name !== 'bar_chart' || !chartTypes.includes(kind) || target.node.attrs.kind === kind) return false;
  return editor.dispatch(editor.createTransaction().setNodeAttrs(target.path, { ...target.node.attrs, kind }));
}

export const BarChartExtension = defineExtension({
  name: 'bar-chart',
  nodes: { bar_chart: barChartNode },
  commands: { insertChartFromCSV, insertChart, insertBarChart, toggleTableChart, setChartType },
});

export { BarChartExtension as ChartExtension, selectedBarChart as selectedChart };
