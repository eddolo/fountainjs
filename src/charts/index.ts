import { insertNode, nodeRangeAtPath, NodeSelection, type DOMOutputSpec, type Editor, type Node, type NodeSpec } from '../core';
import { RestructureChildrenStep } from '../core/transaction/restructure-children-step';
import { defineExtension } from '../extensions/extension';

function cellText(cell: Node): string | null {
  if (Number(cell.attrs.colspan) > 1 || Number(cell.attrs.rowspan) > 1 || cell.childCount !== 1) return null;
  const paragraph = cell.child(0);
  return paragraph.type.name === 'paragraph' && paragraph.content.every(child => child.isText)
    ? paragraph.textContent.trim() : null;
}

function percent(value: number): string {
  return Number(value.toFixed(5)) + '%';
}

function plot(node: Node): DOMOutputSpec {
  const table = node.child(node.childCount - 1);
  const bars: { label: string; source: string; value: number }[] = [];
  let minimum = 0, maximum = 0;
  for (const [index, row] of table.content.entries()) {
    if (row.childCount !== 2) return ['p', 'Use two columns for a bar chart: a category and a value.'];
    const label = cellText(row.child(0)), source = cellText(row.child(1));
    if (label === null || source === null) return ['p', 'Use unmerged cells containing one line of text for each chart entry.'];
    if (index === 0 && row.content.every(cell => cell.type.name === 'table_header')) continue;
    if (!label) return ['p', `Enter a category in row ${index + 1}.`];
    const value = Number(source);
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(source) || !Number.isFinite(value))
      return ['p', `Enter a number in row ${index + 1} to draw the chart.`];
    bars.push({ label, value, source });
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  if (!bars.length) return ['p', 'Add a data row below the column headings to draw the chart.'];
  // Scale before subtracting so opposite finite extremes cannot overflow.
  const magnitude = Math.max(-minimum, maximum) || 1;
  const span = maximum / magnitude - minimum / magnitude || 1;
  const zero = -(minimum / magnitude) / span * 100;
  const rows: DOMOutputSpec[] = bars.map(({ label, value, source }) => {
    const width = Math.abs(value / magnitude) / span * 100;
    const left = value < 0 ? Math.max(0, zero - width) : zero;
    return ['div', { style: 'margin:.45em 0' },
      ['span', label + ' · ' + source],
      ['div', { dir: 'ltr', style: 'position:relative;height:.8em;background:#edeaf6' },
        ['span', { style: `position:absolute;left:${percent(left)};width:${percent(width)};height:100%;background:#55409c` }],
        ['span', { style: `position:absolute;left:${percent(zero)};height:100%;border-left:1px solid #564e62` }],
      ],
    ];
  });
  const title = node.childCount === 2 ? node.child(0).textContent : '';
  return ['div', { role: 'img', 'aria-label': (title ? 'Bar chart: ' + title : 'Bar chart') + '. Values are in the accompanying table.' }, ...rows];
}

const parseRules = [{ tag: 'figure[data-fountain-chart="bar"]', contentElement: '[data-fountain-chart-source]' }];

const barChartNode: NodeSpec = {
  group: 'block',
  content: 'paragraph? table',
  selectable: true,
  parseHTML: parseRules,
  parseDOM: parseRules,
  markdown: 'html',
  toDOM: node => ['figure', { 'data-fountain-chart': 'bar', style: 'margin:1em 0' },
    ['div', { 'data-fountain-chart-source': 'true' }, 0],
    ['div', { contenteditable: 'false', 'data-fountain-chart-plot': 'true' }, plot(node)],
  ],
};

/** Inserts editable title and data cells, with a bar plot derived from the same table. */
export function insertBarChart(editor: Editor, title: string, values: readonly (readonly [string, number])[]): boolean {
  const { schema } = editor.state;
  if (!editor.editable || !schema.nodes.bar_chart || !schema.nodes.table || !schema.nodes.table_row
    || !schema.nodes.table_header || !schema.nodes.table_cell || !schema.nodes.paragraph || !schema.nodes.text) return false;
  if (typeof title !== 'string' || !Array.isArray(values) || !values.every(pair => Array.isArray(pair) && pair.length === 2
    && typeof pair[0] === 'string' && Number.isFinite(pair[1]))) return false;
  const paragraph = (value: string) => schema.node('paragraph', {}, [schema.text(value)]);
  const row = (type: string, label: string, value: string) => schema.node('table_row', {}, [
    schema.node(type, {}, [paragraph(label)]), schema.node(type, {}, [paragraph(value)]),
  ]);
  const table = schema.node('table', {}, [row('table_header', 'Category', 'Value'),
    ...values.map(([label, value]) => row('table_cell', label, String(value)))]);
  const chart = schema.node('bar_chart', {}, [paragraph(title), table]);
  const previous = editor.state.doc;
  return insertNode(editor, chart) && editor.state.doc !== previous;
}

function chartTarget(editor: Editor) {
  const { doc, schema, selection } = editor.state;
  if (!editor.editable || !schema.nodes.bar_chart || selection.kind === 'gap' || selection.kind === 'all') return null;
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

/** The chart action for the current table or chart selection. */
export function tableChartAction(editor: Editor): 'wrap' | 'unwrap' | null {
  const target = chartTarget(editor);
  return target ? (target.node.type.name === 'bar_chart' ? 'unwrap' : 'wrap') : null;
}

/** Wraps the selected table or lifts a chart's title and table in one undoable change. */
export function toggleTableChart(editor: Editor): boolean {
  const target = chartTarget(editor);
  if (!target) return false;
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

export const BarChartExtension = defineExtension({
  name: 'bar-chart',
  nodes: { bar_chart: barChartNode },
  commands: { insertBarChart, toggleTableChart },
});
