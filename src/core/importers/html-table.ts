/** Native table row order: header, body/direct rows, footer; stable within each. */
export function orderedHTMLTableRows<T>(rows: readonly T[], groupName: (row: T) => string): T[] {
  const head: T[] = [];
  const body: T[] = [];
  const foot: T[] = [];
  for (const row of rows) {
    const tag = groupName(row).toLowerCase();
    (tag === 'thead' ? head : tag === 'tfoot' ? foot : body).push(row);
  }
  return [...head, ...body, ...foot];
}

/** Remaining rows are counted within each source row group, not the whole table. */
export function remainingHTMLTableRows<T>(rows: readonly T[], group: (row: T) => unknown): ReadonlyMap<T, number> {
  const counts = new Map<unknown, number>();
  const remaining = new Map<T, number>();
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index];
    const key = group(row);
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    remaining.set(row, count);
  }
  return remaining;
}

/** HTML non-negative integer parsing; null means invalid/missing, not zero. */
export function htmlTableSpan(value: string | null): number | null {
  const digits = /^[\t\n\f\r ]*\+?(\d+)/u.exec(value ?? '')?.[1];
  return digits === undefined ? null : Number(digits);
}
