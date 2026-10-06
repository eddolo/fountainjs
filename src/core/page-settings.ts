/** Portable physical page settings. One point is 1/72 inch; no DOM units.
 * Omitted fields are unspecified, not implicitly zero. Renderers/adapters must
 * disclose their defaults and unsupported settings rather than silently clamp.
 */
export interface DocumentPageSettings {
  readonly unit: 'pt';
  readonly width?: number;
  readonly height?: number;
  readonly orientation?: 'portrait' | 'landscape';
  readonly marginTop?: number;
  readonly marginRight?: number;
  readonly marginBottom?: number;
  readonly marginLeft?: number;
  readonly headerDistance?: number;
  readonly footerDistance?: number;
  readonly gutter?: number;
}

export const PAGE_SETTING_LENGTHS = Object.freeze([
  'width', 'height', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'headerDistance', 'footerDistance', 'gutter',
] as const);

export function isDocumentPageSettings(value: unknown): value is DocumentPageSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.unit !== 'pt' || Object.keys(record).some(key => !['unit', 'orientation', ...PAGE_SETTING_LENGTHS].includes(key))) return false;
  if (record.orientation !== undefined && record.orientation !== 'portrait' && record.orientation !== 'landscape') return false;
  return PAGE_SETTING_LENGTHS.every(key => {
    const length = record[key];
    if (length === undefined) return true;
    if (typeof length !== 'number' || !Number.isFinite(length)) return false;
    if (key === 'width' || key === 'height') return length > 0;
    // Negative top/bottom margins are retained data; not every renderer can
    // honour their header/footer-overlap semantics (not a negative padding).
    return key === 'marginTop' || key === 'marginBottom' || length >= 0;
  });
}

export function readDocumentPageSettings(document: { readonly attrs: Readonly<Record<string, unknown>> }): DocumentPageSettings | undefined {
  const settings = document.attrs.pageSettings;
  if (settings === undefined || settings === null) return undefined;
  if (!isDocumentPageSettings(settings)) throw new TypeError('Invalid document pageSettings. Expected physical point values.');
  return Object.freeze(Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined))) as unknown as DocumentPageSettings;
}
