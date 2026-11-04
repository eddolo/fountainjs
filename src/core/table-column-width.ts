/** Zero is the existing unknown-column sentinel; known widths use CSS pixels. */
export function isTableColumnWidth(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
    && (value === 0 || (value >= 40 && value <= 2_000));
}

/** Typed metadata is authoritative; a CSS fallback must be an actual px length. */
export function readTableCellWidths(cell: {
  getAttribute(name: string): string | null;
  readonly style?: { readonly width?: string };
}, colspan: number): number[] | null {
  const raw = cell.getAttribute('data-colwidth');
  if (raw !== null && raw.length <= 4096) {
    const fields = raw.split(',');
    if (fields.length === colspan && fields.every(field => field.trim().length > 0)) {
      const widths = fields.map(Number);
      if (widths.every(isTableColumnWidth)) return widths;
    }
  }
  const match = /^(\d+(?:\.\d+)?)px$/.exec(cell.style?.width?.trim() ?? '');
  const width = match ? Number(match[1]) : NaN;
  return colspan === 1 && width > 0 && isTableColumnWidth(width) ? [width] : null;
}
