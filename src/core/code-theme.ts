import type { Node } from './schema';

function colorLuminance(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) return undefined;
  const channels = [1, 3, 5].map(offset => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722;
}

function contrast(left: number, right: number): number {
  return (Math.max(left, right) + .05) / (Math.min(left, right) + .05);
}

/** Presentation only: never remove copied colour marks or rewrite owned backgrounds.
 * Explicit host themes win. A source-owned background chooses the matching palette;
 * otherwise choose the better worst-case contrast for solid source foregrounds.
 * Mixed opposing colours/custom host CSS can still require host presentation policy.
 */
export function codeTheme(node: Node, configured?: 'light' | 'dark'): 'light' | 'dark' {
  if (configured) return configured;
  const ownedBackground = colorLuminance((node.attrs.layout as { background?: unknown } | undefined)?.background);
  if (ownedBackground !== undefined) return contrast(colorLuminance('#272437')!, ownedBackground)
    > contrast(colorLuminance('#e7e9ee')!, ownedBackground) ? 'light' : 'dark';
  const darkBackground = colorLuminance('#151823')!, lightBackground = colorLuminance('#f4f1eb')!;
  let darkScore = Infinity, lightScore = Infinity;
  for (const child of node.content) {
    if (!child.text?.trim() || child.marks.some(mark => mark.type.name === 'highlight')) continue;
    const color = colorLuminance(child.marks.find(mark => mark.type.name === 'text_color')?.attrs.color);
    if (color === undefined) continue;
    darkScore = Math.min(darkScore, contrast(color, darkBackground));
    lightScore = Math.min(lightScore, contrast(color, lightBackground));
  }
  return lightScore > darkScore ? 'light' : 'dark';
}
