import type { Node } from '../core/schema';
import { chartLayout } from './layout';

export type ChartImageFormat = 'svg' | 'png' | 'jpeg' | 'webp';

function escapeText(value: string): string {
  if (/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u.test(value)) {
    throw new Error('A chart label contains a character that cannot be written to SVG.');
  }
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function drawChart(node: Node) {
  const layout = chartLayout(node);
  if (typeof layout === 'string') throw new Error(layout);
  const title = layout.title || layout.kind[0].toUpperCase() + layout.kind.slice(1) + ' chart';
  const width = 800, inset = 24, track = width - 2 * inset;
  const drawing: string[] = [];
  let y = 12;
  function text(value: string, size: number, color = '#211d32') {
    // Budget one em per code point to leave room for wide glyphs as well as Latin text.
    const limit = Math.floor(track / size);
    for (const line of value.split(/\r\n|[\r\n]/u)) {
      const chars = Array.from(line);
      for (let start = 0; start < Math.max(1, chars.length);) {
        let end = Math.min(chars.length, start + limit);
        if (end < chars.length) {
          for (let i = end; i > start; i--) {
            if (chars[i] === ' ') { end = i; break; }
          }
        }
        y += size + 5;
        drawing.push(`<text x="${inset}" y="${y}" font-size="${size}" fill="${color}">${escapeText(chars.slice(start, end).join(''))}</text>`);
        start = end + (end === chars.length || chars[end] === ' ' ? 1 : 0);
      }
    }
  }
  text(title, 24);
  y += 10;
  const x = (p: number) => Number((track * p / 100).toFixed(4));
  if (layout.kind === 'line') {
    const graphHeight = track / 4;
    const points = layout.rows.map(row => [inset + x(row.x), y + graphHeight * row.y / 100]);
    drawing.push(`<path d="M${inset} ${y + graphHeight * (1 - layout.zero / 100)}h${track}" stroke="#aaa"/>`,
      `<polyline points="${points.map(point => point.join(',')).join(' ')}" fill="none" stroke="#55409c" stroke-width="2"/>`);
    for (const [cx, cy] of points) drawing.push(`<circle cx="${cx}" cy="${cy}" r="3" fill="#55409c"/>`);
    y += graphHeight + 12;
  } else if (layout.kind === 'pie') {
    const radius = 96, cx = width / 2, cy = y + radius;
    const point = (fraction: number) => {
      const angle = fraction * Math.PI / 50;
      return `${cx + radius * Math.sin(angle)} ${cy - radius * Math.cos(angle)}`;
    };
    for (const row of layout.rows) {
      const slice = row.end - row.start;
      if (slice >= 100) drawing.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${row.color}"/>`);
      else if (slice > 0) drawing.push(`<path d="M${cx} ${cy}L${point(row.start)}A${radius} ${radius} 0 ${slice > 50 ? 1 : 0} 1 ${point(row.end)}Z" fill="${row.color}"/>`);
    }
    y += radius * 2 + 12;
  }
  for (const [index, row] of layout.rows.entries()) {
    const label = row.label + ' · ' + row.source;
    if (layout.kind === 'pie') text('■ ' + label, 16, row.color);
    else if (layout.kind === 'line') text((index + 1) + '. ' + label, 16);
    else {
      text(label, 16);
      y += 7;
      drawing.push(`<rect x="${inset}" y="${y}" width="${track}" height="12" fill="#edeaf6"/>`,
        `<rect x="${inset + x(row.left)}" y="${y}" width="${x(row.width)}" height="12" fill="#55409c"/>`,
        `<path d="M${inset + x(layout.zero)} ${y}v12" stroke="#564e62"/>`);
      y += 23;
    }
  }
  const height = y + 12;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="chart-title"><title id="chart-title">${escapeText(title)}</title><rect width="100%" height="100%" fill="white"/><g fill="#211d32" font-family="sans-serif">${drawing.join('')}</g></svg>`;
  return { svg, width, height };
}

/** Standalone vector image of the chart's current data. Works in a server runtime. */
export function exportChartSVG(node: Node): string {
  return drawChart(node).svg;
}

/** Encodes the same drawing in the requested browser image format. */
export async function exportChartImage(node: Node, format: ChartImageFormat, owner: Document): Promise<Blob> {
  const { svg, width, height } = drawChart(node);
  const source = new Blob([svg], { type: 'image/svg+xml' });
  if (format === 'svg') return source;
  if (format !== 'png' && format !== 'jpeg' && format !== 'webp') throw new Error('Unknown chart image format.');
  if (height > 16384) throw new Error('This chart is too tall for a bitmap. Choose SVG to keep all rows.');
  const image = owner.createElement('img');
  const url = URL.createObjectURL(source);
  try {
    image.src = url;
    await image.decode();
    const canvas = owner.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not draw the chart.');
    context.drawImage(image, 0, 0);
    const mime = 'image/' + format;
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => {
      if (blob?.type === mime) resolve(blob);
      else reject(new Error(`This browser cannot export ${format.toUpperCase()}. Choose PNG or SVG.`));
    }, mime));
  } finally { URL.revokeObjectURL(url); }
}
