export const INLINE_DRAWING_SIDES = ['distT', 'distB', 'distL', 'distR'] as const;
export type InlineDrawingDistances = Partial<Record<typeof INLINE_DRAWING_SIDES[number], number>>;
export const INLINE_DRAWING_DATA = 'data-fountain-docx-inline-distances';

export function isInlineDrawingDistances(value: unknown): value is InlineDrawingDistances {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === null || prototype === Object.prototype) && Object.entries(value).every(([key, distance]) =>
    INLINE_DRAWING_SIDES.some(side => side === key) && typeof distance === 'number' && Number.isInteger(distance) && distance >= 0 && distance <= 0xFFFFFFFF);
}

export function readInlineDrawingData(source: string | null): InlineDrawingDistances | undefined {
  if (!source || source.length > 96) return undefined;
  try {
    const value: unknown = JSON.parse(source);
    return isInlineDrawingDistances(value) ? value : undefined;
  } catch { return undefined; }
}
