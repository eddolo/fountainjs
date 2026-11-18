import type { Node } from '../core/schema';

function cellText(cell: Node): string | null {
  if (Number(cell.attrs.colspan) > 1 || Number(cell.attrs.rowspan) > 1 || cell.childCount !== 1) return null;
  const paragraph = cell.child(0);
  return paragraph.type.name === 'paragraph' && paragraph.content.every(child => child.isText)
    ? paragraph.textContent.trim() : null;
}

export function barChartLayout(node: Node) {
  if (node.type.name !== 'bar_chart') return 'Select a bar chart to export.';
  const table = node.child(node.childCount - 1);
  const bars: { label: string; source: string; value: number }[] = [];
  let minimum = 0, maximum = 0;
  for (const [index, row] of table.content.entries()) {
    if (row.childCount !== 2) return 'Use two columns for a bar chart: a category and a value.';
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
  // Scale before subtracting so opposite finite extremes cannot overflow.
  const magnitude = Math.max(-minimum, maximum) || 1;
  const span = maximum / magnitude - minimum / magnitude || 1;
  const zero = -(minimum / magnitude) / span * 100;
  const title = node.childCount === 2 ? node.child(0).textContent : '';
  const rows = bars.map(({ label, value, source }) => {
    const width = Math.abs(value / magnitude) / span * 100;
    const left = value < 0 ? Math.max(0, zero - width) : zero;
    return { label, source, width, left };
  });
  return { title, zero, rows };
}
