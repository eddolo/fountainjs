/** HTML signed integer parsing with the native reflected `ol.start` long range. */
export function htmlOrderedListStart(value: string | null): number {
  const prefix = /^[\t\n\f\r ]*([+-]?\d+)/u.exec(value ?? '')?.[1];
  const parsed = prefix === undefined ? NaN : Number(prefix);
  return Number.isInteger(parsed) && parsed >= -2147483648 && parsed <= 2147483647 ? parsed : 1;
}
