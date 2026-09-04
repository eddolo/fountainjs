const GENERIC_FONT_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
  'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji',
  'math', 'fangsong',
]);

function canonicalNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}

function splitFontFamilies(value: string): string[] | null {
  const families: string[] = [];
  let current = '';
  let quote = '';
  for (const character of value) {
    if ((character === '"' || character === "'") && (!quote || quote === character)) {
      quote = quote ? '' : character;
      current += character;
    } else if (character === ',' && !quote) {
      families.push(current);
      current = '';
    } else current += character;
  }
  if (quote) return null;
  families.push(current);
  return families;
}

/** Returns a portable comma-separated family list or `null` for unsafe CSS. */
export function normalizeFontFamily(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 320 || /[;{}<>\\\u0000-\u001f]/u.test(value)) return null;
  const candidates = splitFontFamilies(value.trim());
  if (!candidates || candidates.length < 1 || candidates.length > 8) return null;
  const families = candidates.map((candidate) => {
    const trimmed = candidate.trim();
    const unquoted = (/^(["']).*\1$/u.test(trimmed) ? trimmed.slice(1, -1) : trimmed).trim();
    return unquoted;
  });
  if (families.some((family) => !family || family.length > 64
    || !/^[\p{L}\p{N} _.-]+$/u.test(family))) return null;
  return families.join(', ');
}

/** Produces CSS from a value that has already passed `normalizeFontFamily`. */
export function fontFamilyCSS(value: unknown): string {
  const normalized = normalizeFontFamily(value);
  if (!normalized) return 'system-ui';
  return normalized.split(', ').map((family) => (
    GENERIC_FONT_FAMILIES.has(family.toLowerCase()) || !/\s/u.test(family)
      ? family
      : `"${family}"`
  )).join(',');
}

function normalizeMeasurement(
  value: unknown,
  ranges: Readonly<Record<string, readonly [number, number]>>,
): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const match = /^\s*(\d+(?:\.\d{1,4})?|\.\d{1,4})\s*(px|pt|rem|em|%)?\s*$/iu.exec(String(value));
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] ?? '').toLowerCase();
  const range = ranges[unit];
  if (!range || !Number.isFinite(amount) || amount < range[0] || amount > range[1]) return null;
  return `${canonicalNumber(amount)}${unit}`;
}

/** Normalizes a practical, bounded inline font size. */
export function normalizeFontSize(value: unknown): string | null {
  return normalizeMeasurement(value, {
    px: [1, 512], pt: [1, 384], rem: [0.25, 32], em: [0.25, 32], '%': [25, 800],
  });
}

/** Normalizes unitless or unit-aware line height without permitting CSS functions. */
export function normalizeLineHeight(value: unknown): string | null {
  return normalizeMeasurement(value, {
    '': [0.5, 5], px: [8, 512], rem: [0.5, 5], em: [0.5, 5], '%': [50, 500],
  });
}

/** Normalizes opaque CSS hex/rgb colours to six-digit lowercase hex. */
export function normalizeTextStyleColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/iu.exec(normalized)?.[1];
  if (hex) return `#${hex.length === 3 ? Array.from(hex, (part) => `${part}${part}`).join('') : hex}`;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*(?:1(?:\.0+)?|100%))?\s*\)$/iu.exec(normalized);
  if (!rgb) return null;
  const channels = rgb.slice(1, 4).map(Number);
  if (channels.some((channel) => channel < 0 || channel > 255)) return null;
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}
