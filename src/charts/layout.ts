import type { Node } from '../core/schema';

function cellText(cell: Node): string | null {
  if (Number(cell.attrs.colspan) > 1 || Number(cell.attrs.rowspan) > 1 || cell.childCount !== 1) return null;
  const paragraph = cell.child(0);
  return paragraph.type.name === 'paragraph' && paragraph.content.every(child => child.isText)
    ? paragraph.textContent.trim() : null;
}

export const chartTypes = ['bar', 'line', 'pie'] as const;
export type ChartType = typeof chartTypes[number];
export const sliceColors = ['#55409c', '#007768', '#b15115', '#326b9b', '#a13967', '#686c21'];

export function chartLayout(node: Node) {
  if (node.type.name !== 'bar_chart') return 'Select a chart to export.';
  const table = node.child(node.childCount - 1);
  const bars: { label: string; source: string; value: number }[] = [];
  let minimum = 0, maximum = 0;
  for (const [index, row] of table.content.entries()) {
    if (row.childCount !== 2) return 'Use two columns for a chart: a category and a value.';
    const label = cellText(row.child(0)), source = cellText(row.child(1));
    if (label === null || source === null) return 'Use unmerged cells containing one line of text for each chart entry.';
    if (index === 0 && row.content.every(cell => cell.type.name === 'table_header')) continue;
    if (!label) return `Enter a category in row ${index + 1}.`;
    const value = Number(source);
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(source) || !Number.isFinite(value))
      return `Enter a number in row ${index + 1} to draw the chart.`;
    bars.push({ label, value, source });
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  if (!bars.length) return 'Add a data row below the column headings to draw the chart.';
  const kind = (node.attrs.kind ?? 'bar') as ChartType;
  if (kind === 'pie' && (minimum < 0 || maximum === 0)) {
    return 'Pie charts need nonnegative values and at least one positive value.';
  }
  // Scale before subtracting so opposite finite extremes cannot overflow.
  const magnitude = Math.max(-minimum, maximum) || 1;
  const span = maximum / magnitude - minimum / magnitude || 1;
  const zero = -(minimum / magnitude) / span * 100;
  const title = node.childCount === 2 ? node.child(0).textContent : '';
  const sum = kind === 'pie' ? bars.reduce((total, row) => total + row.value / magnitude, 0) : 1;
  let cumulative = 0;
  const rows = bars.map(({ label, value, source }, index) => {
    const width = Math.abs(value / magnitude) / span * 100;
    const left = value < 0 ? Math.max(0, zero - width) : zero;
    const start = cumulative;
    if (kind === 'pie') cumulative += value / magnitude / sum * 100;
    const x = bars.length === 1 ? 50 : 100 * index / (bars.length - 1);
    const y = 100 - (zero + value / magnitude / span * 100);
    return { label, source, width, left, x, y, start, end: cumulative, color: sliceColors[index % sliceColors.length] };
  });
  return { kind, title, zero, rows };
}
