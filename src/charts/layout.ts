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

// Inputs are finite; halving preserves a meaningful fraction when subtracting opposite extremes overflows.
function fraction(value: number, from: number, to: number) {
  return Number.isFinite(to - from) ? (value - from) / (to - from) : (value / 2 - from / 2) / (to / 2 - from / 2);
}

function automaticInterval(low: number, high: number) {
  const span = high - low;
  const target = Number.isFinite(span) ? span / 4 : high / 4 - low / 4;
  const unit = 10 ** Math.floor(Math.log10(target)) || Number.MIN_VALUE;
  const factor = [1, 2, 2.5, 5, 10].find(step => step * unit >= target) ?? 10;
  return Math.min(Number.MAX_VALUE, factor * unit);
}

function axisTicks(low: number, high: number, interval: number | null, automatic: boolean) {
  if (interval == null && automatic) interval = automaticInterval(low, high);
  const ticks: { position: number; label: string; showLabel: boolean }[] = [];
  if (interval == null || !Number.isFinite(interval) || interval <= 0) return ticks;
  // Keep dense feeds bounded. Each displayed mark is still a multiple of the
  // requested interval from the lower bound, including at subnormal magnitudes.
  const span = high - low;
  const smallestSpacing = Number.isFinite(span) ? span / 24 : high / 24 - low / 24;
  let spacing = interval;
  while (spacing < smallestSpacing) spacing *= 2;
  let start = low;
  if (automatic) {
    const remainder = low % spacing;
    const first = remainder === 0 ? low : low + (remainder < 0 ? -remainder : spacing - remainder);
    if (Number.isFinite(first) && first >= low && first <= high) start = first;
  }
  const distance = high - start;
  const steps = Number.isFinite(distance) ? distance / spacing : high / spacing - start / spacing;
  const last = Math.min(24, Math.floor(steps + 8 * Number.EPSILON * steps));
  const labelStride = Math.max(1, Math.ceil(last / 4));
  for (let i = 0; i <= last; i++) {
    const offset = i * spacing;
    let value = Number.isFinite(offset) ? start + offset : (start / 2 + i * (spacing / 2)) * 2;
    if (i && Math.abs(steps - i) <= 8 * Number.EPSILON * steps) value = high;
    else if (i && Math.abs(value) < Number.EPSILON * Math.abs(low)) value = 0;
    if (!Number.isFinite(value) || value > high) continue;
    const position = fraction(value, low, high) * 100;
    if (ticks.length && position <= ticks[ticks.length - 1]!.position) continue;
    const rounded = Number(value.toPrecision(15));
    const label = String(Math.abs(rounded - value) < spacing / 16 ? rounded : value);
    ticks.push({ position, label, showLabel: i % labelStride === 0 });
  }
  return ticks;
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
  const magnitude = Math.max(-minimum, maximum) || 1;
  const min = kind === 'pie' ? null : node.attrs.axisMin as number | null;
  const max = kind === 'pie' ? null : node.attrs.axisMax as number | null;
  const targetValue = kind === 'pie' ? null : node.attrs.targetValue as number | null;
  if (targetValue != null) {
    minimum = Math.min(minimum, targetValue);
    maximum = Math.max(maximum, targetValue);
  }
  const fixed = min != null || max != null;
  let low = min ?? minimum, high = max ?? maximum;
  if (low >= high) {
    if (max == null) high = low + (Math.abs(low) || 1);
    else if (min == null) low = high - (Math.abs(high) || 1);
    if (!Number.isFinite(low) || !Number.isFinite(high) || low >= high) return 'Enter a minimum below the maximum for the value axis.';
  }
  const clamp = (value: number) => Math.min(high, Math.max(low, value));
  const position = (value: number) => fraction(clamp(value), low, high) * 100;
  const zero = position(0);
  const target = targetValue == null ? null : {
    value: targetValue, position: position(targetValue), visible: targetValue >= low && targetValue <= high,
    caption: (node.attrs.targetLabel || 'Target') + ' · ' + targetValue,
  };
  const title = node.childCount === 2 ? node.child(0).textContent : '';
  const series = columns.map(({ name, values }, j) => {
    const sum = kind === 'pie' ? values.reduce((total, row) => total + row.value / magnitude, 0) : 1;
    let cumulative = 0;
    const rows = values.map(({ value, source }, i) => {
      const endPosition = position(value);
      const width = Math.abs(endPosition - zero);
      const left = Math.min(endPosition, zero);
      const start = cumulative;
      if (kind === 'pie') cumulative += value / magnitude / sum * 100;
      const x = labels.length === 1 ? 50 : 100 * i / (labels.length - 1);
      const y = 100 - endPosition;
      return { value, visible: value >= low && value <= high, label: labels[i]!, source, width, left, x, y, start, end: cumulative, color: sliceColors[i % sliceColors.length]! };
    });
    const segments: { x: number; y: number; endX: number; endY: number }[] = [];
    if (kind === 'line') {
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1]!, b = rows[i]!;
        if (Math.min(a.value, b.value) > high || Math.max(a.value, b.value) < low) continue;
        const cross = (v: number) => a.x + (b.x - a.x) * fraction(clamp(v), a.value, b.value);
        segments.push({ x: a.visible ? a.x : cross(a.value), y: a.y, endX: b.visible ? b.x : cross(b.value), endY: b.y });
      }
    }
    return { name, rows, segments, color: sliceColors[j % sliceColors.length]! };
  });
  const categoryTitle = kind === 'pie' ? '' : String(node.attrs.categoryAxisTitle ?? '');
  const valueTitle = kind === 'pie' ? '' : String(node.attrs.valueAxisTitle ?? '');
  const horizontalTitle = kind === 'bar' ? valueTitle : categoryTitle;
  const verticalTitle = kind === 'bar' ? categoryTitle : valueTitle;
  const rangeLabel = fixed ? 'Value range: ' + low + ' to ' + high : '';
  return { kind, target, ticks: axisTicks(low, high, kind === 'pie' ? null : node.attrs.axisInterval as number | null, (kind === 'column' || kind === 'line') && node.attrs.axisInterval == null), rangeLabel, title, horizontalTitle, verticalTitle, zero, rows: series[0]!.rows, series };
}
