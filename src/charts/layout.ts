import type { Node } from '../core/schema';

function cellText(cell: Node): string | null {
  if (Number(cell.attrs.colspan) > 1 || Number(cell.attrs.rowspan) > 1 || cell.childCount !== 1) return null;
  const paragraph = cell.child(0);
  return paragraph.type.name === 'paragraph' && paragraph.content.every(child => child.isText)
    ? paragraph.textContent.trim() : null;
}

export const chartTypes = ['bar', 'column', 'line', 'pie'] as const;
export type ChartType = typeof chartTypes[number];
export const sliceColors = ['#55409c', '#007768', '#b15115', '#326b9b', '#a13967', '#686c21'];

/** Bounds in plot percentages. Each category occupies one equal-width band. */
export function columnBounds(index: number, count: number, y: number, zero: number, seriesIndex = 0, seriesCount = 1) {
  const width = 70 / count / seriesCount;
  return { left: (index + 0.15) * 100 / count + width * seriesIndex, width,
    top: Math.min(y, 100 - zero), height: Math.abs(y - (100 - zero)) };
}

export function chartLayout(node: Node) {
  if (node.type.name !== 'bar_chart') return 'Select a chart to export.';
  const table = node.child(node.childCount - 1);
  const first = table.child(0);
  const count = first.childCount - 1;
  const hasHeader = first.content.every(cell => cell.type.name === 'table_header');
  if (count < 1) return 'Use a category column and at least one value column.';
  const kind = (node.attrs.kind ?? 'bar') as ChartType;
  if (kind === 'pie' && count !== 1) return 'Pie charts need one value column. Choose a bar, column or line chart to compare series.';
  const labels: string[] = [];
  const columns = Array.from({ length: count }, (_, j) => ({
    name: (hasHeader && first.child(j + 1).textContent) || (count === 1 ? 'Value' : 'Series ' + (j + 1)),
    values: [] as { value: number; source: string }[],
  }));
  let minimum = 0, maximum = 0;
  for (const [index, row] of table.content.entries()) {
    if (row.childCount !== count + 1) return 'Give each chart row the same number of cells.';
    const cells = row.content.map(cellText);
    if (cells.some(cell => cell === null)) return 'Use unmerged cells containing one line of text for each chart entry.';
    if (index === 0 && hasHeader) continue;
    if (!cells[0]) return `Enter a category in row ${index + 1}.`;
    labels.push(cells[0]);
    for (const [j, column] of columns.entries()) {
      const source = cells[j + 1]!;
      const value = Number(source);
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(source) || !Number.isFinite(value)) {
        const position = count === 1 ? '' : ', column ' + (j + 2);
        return `Enter a number in row ${index + 1}${position} to draw the chart.`;
      }
      column.values.push({ value, source });
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
  }
  if (!labels.length) return 'Add a data row below the column headings to draw the chart.';
  if (kind === 'pie' && (minimum < 0 || maximum === 0)) return 'Pie charts need nonnegative values and at least one positive value.';
  // All series share the same zero and scale, including opposite finite extremes.
  const magnitude = Math.max(-minimum, maximum) || 1;
  const span = maximum / magnitude - minimum / magnitude || 1;
  const zero = -(minimum / magnitude) / span * 100;
  const title = node.childCount === 2 ? node.child(0).textContent : '';
  const series = columns.map(({ name, values }, j) => {
    const sum = kind === 'pie' ? values.reduce((total, row) => total + row.value / magnitude, 0) : 1;
    let cumulative = 0;
    const rows = values.map(({ value, source }, i) => {
      const width = Math.abs(value / magnitude) / span * 100;
      const left = value < 0 ? Math.max(0, zero - width) : zero;
      const start = cumulative;
      if (kind === 'pie') cumulative += value / magnitude / sum * 100;
      const x = labels.length === 1 ? 50 : 100 * i / (labels.length - 1);
      const y = 100 - (zero + value / magnitude / span * 100);
      return { label: labels[i]!, source, width, left, x, y, start, end: cumulative, color: sliceColors[i % sliceColors.length]! };
    });
    return { name, rows, color: sliceColors[j % sliceColors.length]! };
  });
  return { kind, title, zero, rows: series[0]!.rows, series };
}
