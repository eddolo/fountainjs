/** Opaque RGB table fills shared by DOM and no-DOM format boundaries. */
export function tableBackground(value: unknown): string {
  if (typeof value !== 'string') return '';
  const color = value.trim();
  if (/^#[\da-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(color)) return '#' + [...color.slice(1)].map(char => char + char).join('').toLowerCase();
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(color);
  if (rgb && rgb.slice(1).every(component => Number(component) <= 255)) return '#' + rgb.slice(1).map(component => Number(component).toString(16).padStart(2, '0')).join('');
  return '';
}
