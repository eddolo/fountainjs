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
  const { title, zero, kind } = layout;
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
      layout.rows.forEach((row, index) => {
        if (kind === 'column') {
          const bounds = columnBounds(index, layout.rows.length, row.y, zero);
          markers.push(['span', { style: `position:absolute;left:${percent(bounds.left)};top:${percent(bounds.top)};width:${percent(bounds.width)};height:${percent(bounds.height)};background:#55409c` }]);
          return;
        }
        const previous = layout.rows[index - 1];
        if (previous) {
          const dx = row.x - previous.x, dy = (row.y - previous.y) / 4;
          markers.push(['span', { style: `${position(previous)};width:${percent(Math.hypot(dx, dy))};height:2px;background:#55409c;transform-origin:0 0;transform:rotate(${Math.atan2(dy, dx)}rad)` }]);
        }
        markers.push(['span', { style: `${position(row)};background:#55409c;border-radius:50%;width:6px;height:6px;transform:translate(-50%,-50%)` }]);
      });
    }
    if (kind === 'column' && layout.rows.length <= 6) {
      return graphic([
        ['div', { dir: 'ltr', style }, ...markers],
        ['div', { dir: 'ltr', style: `display:grid;grid-template-columns:repeat(${layout.rows.length},minmax(0,1fr));margin:0 6px;text-align:center;overflow-wrap:anywhere` },
          ...layout.rows.map((row): DOMOutputSpec => ['span', { dir: 'auto' }, row.label + ' · ' + row.source])],
      ]);
    }
    return graphic([
      ['div', { dir: 'ltr', style }, ...markers],
      ...layout.rows.map((row, i): DOMOutputSpec => ['div',
        ['span', { style: kind === 'pie' ? `color:${row.color}` : '' }, kind === 'pie' ? '■ ' : (i + 1) + '. '],
        row.label + ' · ' + row.source]),
    ]);
  }
  const rows: DOMOutputSpec[] = layout.rows.map(({ label, source, width, left }) => {
    return ['div', { style: 'margin:.45em 0' },
      ['span', label + ' · ' + source],
      ['div', { dir: 'ltr', style: 'position:relative;height:.8em;background:#edeaf6' },
        ['span', { style: `position:absolute;left:${percent(left)};width:${percent(width)};height:100%;background:#55409c` }],
        ['span', { style: `position:absolute;left:${percent(zero)};height:100%;border-left:1px solid #564e62` }],
      ],
    ];
  });
  return graphic(rows);
}

const parseRules = chartTypes.map(kind => ({
  tag: `figure[data-fountain-chart="${kind}"]`, getAttrs: () => ({ kind }), contentElement: '[data-fountain-chart-source]',
}));

const barChartNode: NodeSpec = {
  group: 'block',
  attrs: { kind: { default: 'bar', validate: value => chartTypes.includes(value as ChartType) } },
  content: 'paragraph? table',
  selectable: true,
  parseHTML: parseRules,
  parseDOM: parseRules,
  markdown: 'html',
  toDOM: node => ['figure', { 'data-fountain-chart': node.attrs.kind, style: 'margin:1em 0' },
    ['div', { 'data-fountain-chart-source': 'true' }, 0],
    ['div', { contenteditable: 'false', 'data-fountain-chart-plot': 'true' }, plot(node)],
  ],
};

/** Inserts editable title and data cells, with a bar plot derived from the same table. */
export function insertBarChart(editor: Editor, title: string, values: readonly (readonly [string, number])[]): boolean {
  const { schema } = editor.state;
  const required = ['bar_chart', 'table', 'table_row', 'table_header', 'table_cell', 'paragraph', 'text'];
  if (!editor.editable || required.some(name => !schema.nodes[name])) return false;
  if (typeof title !== 'string' || !Array.isArray(values) || !values.every(pair => Array.isArray(pair) && pair.length === 2
    && typeof pair[0] === 'string' && Number.isFinite(pair[1]))) return false;
  const paragraph = (value: string) => schema.node('paragraph', {}, [schema.text(value)]);
  const row = (type: string, ...cells: string[]) => schema.node('table_row', {},
    cells.map(value => schema.node(type, {}, [paragraph(value)])));
  const table = schema.node('table', {}, [row('table_header', 'Category', 'Value'),
    ...values.map(([label, value]) => row('table_cell', label, String(value)))]);
  const chart = schema.node('bar_chart', {}, [paragraph(title), table]);
  const previous = editor.state.doc;
  return insertNode(editor, chart) && editor.state.doc !== previous;
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
  commands: { insertBarChart, toggleTableChart, setChartType },
});

export { BarChartExtension as ChartExtension, selectedBarChart as selectedChart };
