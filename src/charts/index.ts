import { readDelimitedRows } from '../core/delimited-text';
import { insertNode, nodeRangeAtPath, NodeSelection, type DOMOutputSpec, type Editor, type Node, type NodeSpec, type Schema } from '../core';
import { ReplaceTextRangeStep } from '../core/transaction/replace-text-range-step';
import { RestructureChildrenStep } from '../core/transaction/restructure-children-step';
import { defineExtension } from '../extensions/extension';
import { chartLayout, chartNumber, columnBounds, chartTypes, type ChartType } from './layout';
export type { ChartType } from './layout';
export { exportChartSVG, exportChartImage, exportChartSVG as exportBarChartSVG, exportChartImage as exportBarChartImage, type ChartImageFormat } from './image';

function percent(value: number): string {
  return Number(value.toFixed(5)) + '%';
}

function plot(node: Node): DOMOutputSpec {
  const layout = chartLayout(node);
  if (typeof layout === 'string') return ['p', layout];
  const { title, zero, kind, series, target } = layout;
  const multiple = series.length > 1;
  const legend: DOMOutputSpec[] = multiple ? [['div', { style: 'display:flex;gap:1em;flex-wrap:wrap' },
    ...series.map((item): DOMOutputSpec => ['span', ['span', { style: 'color:' + item.color }, '■ '], item.name])]] : [];
  const targetCaption = target ? target.caption + (target.visible ? '' : ' (outside axis range)') : '';
  if (target) legend.push(['div', { style: 'color:#983f19;font-weight:600;overflow-wrap:anywhere' }, targetCaption]);
  const targetLine = (vertical: boolean): DOMOutputSpec => ['span', { 'data-chart-target-line': '', style: 'position:absolute;pointer-events:none;' +
    (vertical ? 'height:100%;left:' + percent(target!.position) + ';border-left' : 'width:100%;top:' + percent(100 - target!.position) + ';border-top') + ':2px dashed #983f19' }];
  const label = (index: number) => layout.rows[index]!.label + (multiple ? '' : ' · ' + layout.rows[index]!.source);
  const axisCaption = (value: string, align: string): DOMOutputSpec[] => value ? [['div', {
    dir: 'auto', style: 'font-weight:600;white-space:pre-wrap;overflow-wrap:anywhere;text-align:' + align,
  }, value]] : [];
  const graphic = (children: DOMOutputSpec[]): DOMOutputSpec => ['div', {
    role: 'img', style: 'display:flow-root', 'aria-label': [title || kind + ' chart', layout.verticalTitle, layout.horizontalTitle, layout.rangeLabel, targetCaption,
      'Values are in the accompanying table.'].filter(Boolean).join('. '),
  }, ...(layout.rangeLabel ? [['div', layout.rangeLabel] as DOMOutputSpec] : []), ...axisCaption(layout.verticalTitle, 'start'), ...children, ...axisCaption(layout.horizontalTitle, 'center')];
  const { ticks } = layout;
  const gutter = ticks.length ? Math.max(...ticks.filter(tick => tick.showLabel).map(tick => tick.label.length)) + 1 + 'ch' : '6px';
  if (kind !== 'bar') {
    const markers: DOMOutputSpec[] = [];
    let style: string;
    if (kind === 'pie') {
      const stops = layout.rows.map(row => row.color + ' ' + percent(row.start) + ' ' + percent(row.end));
      style = 'width:min(100%,16em);aspect-ratio:1;border-radius:50%;margin:auto;background:conic-gradient(' + stops.join(',') + ')';
    } else {
      const aspect = ticks.length ? 2 : 4;
      style = `position:relative;aspect-ratio:${aspect};margin:12px 6px 12px ${gutter};background:#f5f3fa`;
      for (const tick of ticks) {
        markers.push(['div', { 'data-axis-tick': tick.label, style: `position:absolute;top:${percent(100 - tick.position)};width:100%;border-top:1px solid #d4d0df` },
          ...(tick.showLabel ? [['small', { style: 'position:absolute;right:100%;padding-right:3px;transform:translateY(-50%);white-space:nowrap' }, tick.label] as DOMOutputSpec] : [])]);
      }
      markers.push(['span', { style: `position:absolute;top:${percent(100 - zero)};width:100%;border-top:1px solid #aaa` }]);
      const position = (point: { x: number; y: number }) => `position:absolute;left:${percent(point.x)};top:${percent(point.y)}`;
      for (const [j, item] of series.entries()) {
        item.rows.forEach((row, index) => {
          if (kind === 'column') {
            const bounds = columnBounds(index, layout.rows.length, row.y, zero, j, series.length);
            markers.push(['span', { style: `position:absolute;left:${percent(bounds.left)};top:${percent(bounds.top)};width:${percent(bounds.width)};height:${percent(bounds.height)};background:${item.color}` }]);
            return;
          }
          if (row.visible) markers.push(['span', { style: `${position(row)};background:${item.color};border-radius:50%;width:6px;height:6px;transform:translate(-50%,-50%)` }]);
        });
        for (const segment of item.segments) {
          const dx = segment.endX - segment.x, dy = (segment.endY - segment.y) / aspect;
          markers.push(['span', { style: `${position(segment)};width:${percent(Math.hypot(dx, dy))};height:2px;background:${item.color};transform-origin:0 0;transform:rotate(${Math.atan2(dy, dx)}rad)` }]);
        }
      }
    }
    if (target?.visible) markers.push(targetLine(false));
    if (kind === 'column' && layout.rows.length <= 6) {
      return graphic([
        ...legend,
        ['div', { dir: 'ltr', style }, ...markers],
        ['div', { dir: 'ltr', style: `display:grid;grid-template-columns:repeat(${layout.rows.length},minmax(0,1fr));margin:0 6px 0 ${gutter};text-align:center;overflow-wrap:anywhere` },
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
        ...(target?.visible ? [targetLine(true)] : []),
      ];
    }),
  ]);
  const ruler: DOMOutputSpec[] = ticks.length ? [['div', { dir: 'ltr', style: 'position:relative;height:1.8em;border-top:1px solid #aaa' },
    ...ticks.map((tick): DOMOutputSpec => ['span', { 'data-axis-tick': tick.label, style: `position:absolute;left:${percent(tick.position)};height:4px;border-left:1px solid #777` },
      ...(tick.showLabel ? [['small', { style: `display:block;padding-top:4px;transform:translateX(-${tick.position}%);white-space:nowrap` }, tick.label] as DOMOutputSpec] : [])])]] : [];
  return graphic([...legend, ...rows, ...ruler]);
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
    const bound = (key: string) => {
      const raw = element.getAttribute('data-axis-' + key);
      return raw?.trim() && Number.isFinite(Number(raw)) ? Number(raw) : null;
    };
    const source = element.getAttribute('data-fountain-csv-url');
    const interval = bound('interval');
    return { kind, targetValue: bound('target'), targetLabel: element.getAttribute('data-target-label') ?? '', axisInterval: interval !== null && interval > 0 ? interval : null, axisMin: bound('min'), axisMax: bound('max'), csvURL: csvURL(source) ? source : null, categoryAxisTitle: element.getAttribute('data-category-axis-title') ?? '',
      valueAxisTitle: element.getAttribute('data-value-axis-title') ?? '' };
  }, contentElement: '[data-fountain-chart-source]',
}));

const axisTitle = { default: '', validate: (value: unknown) => typeof value === 'string' };

const axisBound = { default: null, validate: (value: unknown) => value === null || Number.isFinite(value) };

function validInterval(value: unknown) {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value > 0);
}

const barChartNode: NodeSpec = {
  group: 'block',
  attrs: { targetValue: axisBound, targetLabel: axisTitle, axisInterval: { default: null, validate: validInterval }, axisMin: axisBound, axisMax: axisBound, categoryAxisTitle: axisTitle, valueAxisTitle: axisTitle, kind: { default: 'bar', validate: value => chartTypes.includes(value as ChartType) }, csvURL: { default: null, validate: value => value === null || csvURL(value) } },
  content: 'paragraph? table',
  selectable: true,
  parseHTML: parseRules,
  parseDOM: parseRules,
  markdown: 'html',
  toDOM: node => ['figure', { 'data-fountain-chart': node.attrs.kind, ...(node.attrs.csvURL ? { 'data-fountain-csv-url': node.attrs.csvURL } : {}), ...(node.attrs.categoryAxisTitle ? { 'data-category-axis-title': node.attrs.categoryAxisTitle } : {}),
    ...(node.attrs.targetValue != null ? { 'data-axis-target': node.attrs.targetValue } : {}), ...(node.attrs.targetLabel ? { 'data-target-label': node.attrs.targetLabel } : {}),
    ...(node.attrs.axisInterval != null ? { 'data-axis-interval': node.attrs.axisInterval } : {}),
    ...(node.attrs.axisMin != null ? { 'data-axis-min': node.attrs.axisMin } : {}), ...(node.attrs.axisMax != null ? { 'data-axis-max': node.attrs.axisMax } : {}),
    ...(node.attrs.valueAxisTitle ? { 'data-value-axis-title': node.attrs.valueAxisTitle } : {}), style: 'margin:1em 0' },
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

function chartTable(schema: Schema, cells: readonly (readonly (string | number)[])[], hasHeader = true) {
  return schema.node('table', {}, cells.map((row, i) => schema.node('table_row', {},
    row.map(value => schema.node(i === 0 && hasHeader ? 'table_header' : 'table_cell', {},
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
  const table = chartTable(schema, [[data.categoryLabel ?? 'Category', ...data.series], ...data.rows]);
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
  return chartTable(editor.state.schema, rows);
}

function checkPlot(chart: Node) {
  const layout = chartLayout(chart);
  if (typeof layout === 'string') throw new Error(layout);
}

export interface TextChartOptions {
  readonly title: string;
  readonly kind?: ChartType;
  /** Omit to infer whether the first row names the series. */
  readonly header?: boolean;
  /** Omit to detect the field separator, or use null for one value per line. */
  readonly delimiter?: ',' | ';' | '|' | '\t' | null;
  /** Numeric cells use a decimal point unless the author selects a comma. */
  readonly decimalSeparator?: '.' | ',';
}

/** The first record chooses the separator. Punctuation inside a quoted label is data. */
function textSeparator(source: string) {
  const found = new Set<string>();
  let quoted = false;
  for (const char of source) {
    if (char === '"') quoted = !quoted;
    else if (!quoted) {
      if (char === '\r' || char === '\n') break;
      if ('\t|;,'.includes(char)) found.add(char);
    }
  }
  return (['\t', '|', ';', ','] as const).find(separator => found.has(separator));
}

/** Build and validate a detached chart for a preview or a server-side import. */
export function chartFromText(schema: Schema, text: string, options: TextChartOptions): Node {
  if (typeof text !== 'string' || text.length > 1_048_576) throw new Error('Use up to one million characters of chart data.');
  let source = text.replace(/^\uFEFF/u, '').replace(/^[\r\n]+|(?<![\r\n])[\r\n]+$/g, '');
  if (!source.trim()) throw new Error('Paste the rows to chart.');
  const firstLine = source.match(/^([^\r\n]+)(?:\r\n?|\n)/);
  const declared = chartTypes.find(kind => kind === firstLine?.[1]?.trim().toLowerCase());
  if (declared) source = source.slice(firstLine![0].length);
  const kind = declared ?? options?.kind ?? 'bar';
  if (typeof options?.title !== 'string' || !chartTypes.includes(kind)) throw new Error('Choose a supported chart type and a title.');
  const delimiter = options.delimiter === undefined ? textSeparator(source) ?? null : options.delimiter;
  if (delimiter !== null && ![',', ';', '|', '\t'].includes(delimiter)) throw new Error('Choose a supported column separator.');
  const rows = readDelimitedRows(source, 'chart', delimiter)!;
  const first = rows[0]!;
  const valueText = (cell: string) => {
    const value = cell.trim();
    return options.decimalSeparator === ',' && /^[+-]?(?:\d+,\d*|,\d+)(?:e[+-]?\d+)?$/i.test(value) ? value.replace(',', '.') : value;
  };
  const single = first.length === 1;
  const marked = first.some(cell => cell.trimStart().startsWith('{H}'));
  const hasHeader = options.header ?? (marked || (single ? !Number.isFinite(chartNumber(valueText(first[0]!))) :
    first.slice(1).every(cell => !Number.isFinite(chartNumber(valueText(cell))))));
  const headers = hasHeader ? first.map(cell => cell.replace(/^\{H\}\s*/, '')) : [];
  if (single) {
    if (!hasHeader) headers.push('Value');
    headers.unshift('Category');
  } else if (!hasHeader) {
    headers.push('Category', ...first.slice(1).map((_, i) => first.length === 2 ? 'Value' : 'Series ' + (i + 1)));
  }
  const data = (hasHeader ? rows.slice(1) : rows).map((row, i) => single ? [String(i + 1), valueText(row[0]!)] :
    [row[0]!, ...row.slice(1).map(valueText)]);
  if ((data.length + 1) * headers.length > 10_000) throw new Error('Use up to 10,000 cells per chart, including category and header cells.');
  const title = schema.node('paragraph', {}, options.title ? [schema.text(options.title)] : []);
  const chart = schema.node('bar_chart', { kind }, [title, chartTable(schema, [headers, ...data])]);
  checkPlot(chart);
  return chart;
}

/** Insert validated text as one chart transaction at the current selection. */
export function insertChartFromText(editor: Editor, text: string, options: TextChartOptions): boolean {
  if (!supportsCharts(editor)) return false;
  const chart = chartFromText(editor.state.schema, text, options);
  const previous = editor.state.doc;
  return insertNode(editor, chart) && editor.state.doc !== previous;
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
function matchLabels(existing: readonly string[], incoming: readonly string[], matchRenames: boolean): (number | undefined)[] {
  const positions = new Map<string, number[]>();
  for (let i = existing.length - 1; i >= 0; i--) {
    const label = existing[i]!;
    const bucket = positions.get(label);
    if (bucket) bucket.push(i);
    else positions.set(label, [i]);
  }
  const matches = incoming.map(label => positions.get(label)?.pop());
  if (matchRenames && existing.length === incoming.length) {
    const used = new Set(matches);
    return matches.map((index, i) => index ?? (used.has(i) ? undefined : i));
  }
  return matches;
}

function updateCellText(prior: Node, cell: Node, sourceEdit: boolean) {
  const value = cell.textContent, paragraph = prior.child(0);
  const old = prior.textContent;
  if (old === value || (sourceEdit && old.replace(/\r\n?/g, '\n') === value)) return prior;
  if (!paragraph.childCount) return prior.copy([paragraph.copy(cell.child(0).content)]);
  if (paragraph.childCount === 1) return prior.copy([paragraph.copy([paragraph.child(0).withText(value)])]);
  // Keep the existing marks on both sides of the changed text, as in a normal range edit.
  let from = 0, tail = 0;
  while (from < old.length && from < value.length && old[from] === value[from]) from++;
  while (old.length - tail > from && value.length - tail > from && old[old.length - tail - 1] === value[value.length - tail - 1]) tail++;
  // Move splice boundaries to whole Unicode scalar values.
  if (from && /[\uD800-\uDBFF]/u.test(old[from - 1]!)) from--;
  if (tail && /[\uDC00-\uDFFF]/u.test(old[old.length - tail]!)) tail--;
  const point = (offset: number, right = false) => {
    let i = 0;
    while (i < paragraph.childCount - 1) {
      const length = paragraph.child(i).nodeSize;
      if (offset < length || (offset === length && !right)) break;
      offset -= length;
      i++;
    }
    return { i, offset };
  };
  const start = point(from, from < old.length - tail), end = point(old.length - tail);
  const updated = new ReplaceTextRangeStep([start.i], start.offset, [end.i], end.offset, value.slice(from, value.length - tail)).apply(paragraph);
  return prior.copy([updated]);
}

function simpleChartTable(chart: Node) {
  if (chart.type.name !== 'bar_chart') throw new Error('Select an editable chart.');
  const table = chart.child(chart.childCount - 1);
  if (table.content.some(row => row.content.some(cell => Number(cell.attrs.colspan) > 1 || Number(cell.attrs.rowspan) > 1 ||
    cell.childCount !== 1 || cell.child(0).type.name !== 'paragraph' || cell.child(0).content.some(child => !child.isText)))) {
    throw new Error('Restore simple unmerged chart cells before editing the data as text.');
  }
  return table;
}

function refreshedTable(previous: Node, incoming: Node, sourceEdit = false): Node {
  // Native textareas normalize CRLF and CR. Match untouched multiline labels
  // after that projection so a change elsewhere cannot rewrite their contents.
  const key = (node: Node) => sourceEdit ? node.textContent.replace(/\r\n?/g, '\n') : node.textContent;
  const header = (table: Node) => table.child(0).content.slice(1).map(key);
  const hasHeader = !sourceEdit || previous.child(0).content.every(cell => cell.type.name === 'table_header');
  const offset = hasHeader ? 1 : 0;
  const categories = (table: Node) => table.content.slice(offset).map(row => key(row.child(0)));
  const columns = hasHeader ? [0, ...matchLabels(header(previous), header(incoming), sourceEdit).map(i => i === undefined ? i : i + 1)] :
    incoming.child(0).content.map((_, i) => i);
  const rows = [...(hasHeader ? [0] : []), ...matchLabels(categories(previous), categories(incoming), sourceEdit).map(i => i === undefined ? i : i + offset)];
  const merged = incoming.content.map((row, i) => {
    const index = rows[i];
    if (index === undefined) return row;
    const old = previous.child(index);
    const cells = row.content.map((cell, j) => {
      const col = columns[j];
      if (col === undefined || col >= old.childCount) return cell;
      const prior = old.child(col);
      if (!sourceEdit && prior.type !== cell.type) return cell;
      return updateCellText(prior, cell, sourceEdit);
    });
    return old.childCount === cells.length && cells.every((cell, j) => cell === old.child(j)) ? old : old.copy(cells);
  });
  return previous.childCount === merged.length && merged.every((row, i) => row === previous.child(i)) ? previous : previous.copy(merged);
}

/** Canonical editable chart source: a type line followed by CSV records in document order. */
export function chartToText(chart: Node): string {
  const table = simpleChartTable(chart);
  const quote = (value: string) => /[",\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
  const rows = table.content.map(row => row.content.map(cell => quote(cell.textContent)).join(','));
  return [chart.attrs.kind ?? 'bar', ...rows].join('\n');
}

/** Preview source edits against the actual chart, including its titles, formatting and scale. */
export function previewChartText(chart: Node, source: string): Node {
  const table = simpleChartTable(chart);
  if (typeof source !== 'string' || source.length > 1_048_576) throw new Error('Use up to one million characters of chart data.');
  const first = /^([^\r\n]+)(?:\r\n?|\n)/.exec(source);
  const declared = chartTypes.find(value => value === first?.[1]?.trim().toLowerCase());
  const kind = declared ?? chart.attrs.kind;
  const csv = declared && first ? source.slice(first[0].length) : source;
  const rows = readDelimitedRows(csv, 'csv');
  if (!rows || rows[0]!.length < 2) throw new Error('Enter rectangular CSV rows with a category and at least one value column. Quote cells containing commas or newlines. Use up to 10,000 cells.');
  const hasHeader = table.child(0).content.every(cell => cell.type.name === 'table_header');
  const revised = refreshedTable(table, chartTable(chart.type.schema, rows, hasHeader), true);
  let result = revised === table ? chart : chart.copy([...chart.content.slice(0, -1), revised]);
  if (kind !== chart.attrs.kind) result = result.withAttrs({ ...result.attrs, kind });
  checkPlot(result);
  return result;
}

/** Apply to the selected chart. Supply the chart that was opened to reject stale edits. */
export function updateChartFromText(editor: Editor, source: string, expected?: Node): boolean {
  const target = chartTarget(editor);
  if (editor.isDestroyed || !editor.editable || target?.node.type.name !== 'bar_chart' || (expected && target.node !== expected)) return false;
  const chart = target.node;
  const result = previewChartText(chart, source);
  if (result === chart) return true;
  const at = chart.childCount - 1;
  const transaction = editor.createTransaction();
  if (result.attrs.kind !== chart.attrs.kind) transaction.setNodeAttrs(target.path, result.attrs);
  if (result.child(at) !== chart.child(at)) transaction.step(new RestructureChildrenStep(target.path, at, [chart.child(at)], [result.child(at)]));
  return editor.dispatch(transaction);
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
    const previous = simpleChartTable(original);
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

export function setChartAxisTitle(editor: Editor, axis: 'category' | 'value', title: string): boolean {
  const target = chartTarget(editor);
  if (!editor.editable || target?.node.type.name !== 'bar_chart' || target.node.attrs.kind === 'pie' ||
      (axis !== 'category' && axis !== 'value') || typeof title !== 'string') return false;
  const key = axis + 'AxisTitle';
  if (target.node.attrs[key] === title) return false;
  return editor.dispatch(editor.createTransaction().setNodeAttrs(target.path, { ...target.node.attrs, [key]: title }));
}

/** Draw a labeled target across the numeric axis. Pass null to remove it. */
export function setChartTarget(editor: Editor, value: number | null, label = ''): boolean {
  const target = chartTarget(editor);
  if (!editor.editable || target?.node.type.name !== 'bar_chart' || target.node.attrs.kind === 'pie' ||
      !axisBound.validate(value) || typeof label !== 'string') return false;
  const attrs = target.node.attrs;
  const targetLabel = value === null ? '' : label.trim();
  if (attrs.targetValue === value && attrs.targetLabel === targetLabel) return false;
  return editor.dispatch(editor.createTransaction().setNodeAttrs(target.path, { ...attrs, targetValue: value, targetLabel }));
}

/** Null lets the plot derive that end of the value axis from the table. */
export function setChartValueRange(editor: Editor, min: number | null, max: number | null, interval?: number | null): boolean {
  const target = chartTarget(editor);
  if (!editor.editable || target?.node.type.name !== 'bar_chart' || target.node.attrs.kind === 'pie' ||
      !axisBound.validate(min) || !axisBound.validate(max) || (min !== null && max !== null && min >= max)) return false;
  const attrs = target.node.attrs;
  const axisInterval = interval === undefined ? attrs.axisInterval ?? null : interval;
  if (!validInterval(axisInterval)) return false;
  if (attrs.axisMin === min && attrs.axisMax === max && attrs.axisInterval === axisInterval) return false;
  return editor.dispatch(editor.createTransaction().setNodeAttrs(target.path, { ...attrs, axisMin: min, axisMax: max, axisInterval }));
}

export const BarChartExtension = defineExtension({
  name: 'bar-chart',
  nodes: { bar_chart: barChartNode },
  commands: { updateChartFromText, insertChartFromText, insertChartFromCSV, insertChart, insertBarChart, toggleTableChart, setChartType, setChartAxisTitle, setChartTarget, setChartValueRange },
});

export { BarChartExtension as ChartExtension, selectedBarChart as selectedChart };
