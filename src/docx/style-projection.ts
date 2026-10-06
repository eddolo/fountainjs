import { readWordRunFormatting, type readWordStyleSheet, type WordStyleReadIssue } from './style-reader';
import type { XMLElement } from './xml-types';
import type { WordTableTextFormatting } from './style-cascade';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
function isWord(element: XMLElement, local: string) {
  const colon = element.name.indexOf(':');
  return element.name.slice(colon + 1) === local && element.namespaces[colon < 0 ? '' : element.name.slice(0, colon)] === W;
}
export function wordStyleChild(parent: XMLElement | undefined, local: string) {
  const matches = parent?.children.filter((item): item is XMLElement => typeof item !== 'string' && isWord(item, local)) ?? [];
  if (matches.length > 1) throw new Error(`Ambiguous Word style reference ${local}.`);
  return matches[0];
}
export function wordStyleReference(parent: XMLElement | undefined, local: string) {
  const element = wordStyleChild(parent, local);
  if (!element) return undefined;
  const values = Object.entries(element.attrs).filter(([name]) => {
    const colon = name.indexOf(':');
    return colon > 0 && name.slice(colon + 1) === 'val' && element.namespaces[name.slice(0, colon)] === W;
  });
  if (values.length !== 1 || !values[0]![1] || values[0]![1].length > 253) throw new Error('Invalid Word style reference.');
  return values[0]![1];
}

/** Lower resolved declarations to absolute run properties consumed by the same
 * font/mark projection as direct formatting. This is an internal inert XML tree,
 * not a document rewrite: source bytes and style definitions stay untouched.
 */
export function projectWordRunStyle(run: XMLElement, paragraphStyle: string | undefined,
  sheet: ReturnType<typeof readWordStyleSheet>, warn: (code: string, message: string) => void, table?: WordTableTextFormatting): XMLElement {
  const properties = wordStyleChild(run, 'rPr');
  const characterStyle = wordStyleReference(properties, 'rStyle');
  const directIssues: WordStyleReadIssue[] = [];
  const direct = readWordRunFormatting(properties && { ...properties,
    children: properties.children.filter(item => typeof item === 'string' || !isWord(item, 'rStyle')),
  }, directIssues);
  const resolved = sheet.resolve({ paragraphStyle, characterStyle, direct, table });
  if (table?.runs.length && resolved.paragraphChain.includes('Normal')) warn('table-normal-style-precedence-unverified',
    'Word Normal/document-default equivalence can alter table text precedence. The explicit cascade is retained, but this combination still requires native Word verification.');
  const used = new Set([...resolved.paragraphChain, ...resolved.characterChain]);
  for (const issue of [...sheet.issues.filter(item => item.code !== 'unresolved-paragraph-properties'
    && item.code !== 'invalid-paragraph-property' && (item.styleId === undefined || used.has(item.styleId))), ...directIssues]) {
    warn(issue.code, `Word ${issue.styleId === undefined ? 'defaults/direct formatting' : `style ${issue.styleId}`}: ${issue.property} is not fully represented.`);
  }
  for (const issue of resolved.issues) warn(issue.code, `Word style resolution is incomplete: ${issue.styleId ?? issue.property ?? issue.code}.`);
  const formatting = resolved.formatting;
  const children: XMLElement[] = [];
  const add = (name: string, attrs: Record<string, string>) => children.push({ name: `w:${name}`, attrs: Object.fromEntries(Object.entries(attrs).map(([key, value]) => [`w:${key}`, value])), namespaces: { w: W }, children: [] });
  const fontAttrs: Record<string, string> = {};
  for (const [slot, font] of Object.entries(formatting.fonts ?? {})) {
    if (font.name !== undefined) fontAttrs[slot] = font.name;
    if (font.theme !== undefined) fontAttrs[slot === 'cs' ? 'cstheme' : `${slot}Theme`] = font.theme;
  }
  if (Object.keys(fontAttrs).length) add('rFonts', fontAttrs);
  if (formatting.size !== undefined) add('sz', { val: String(formatting.size) });
  if (formatting.sizeCS !== undefined) add('szCs', { val: String(formatting.sizeCS) });
  if (formatting.characterSpacing !== undefined) add('spacing', { val: String(formatting.characterSpacing) });
  for (const [toggle, name] of [['bold', 'b'], ['italic', 'i'], ['strike', 'strike']] as const) {
    const value = formatting.toggles[toggle];
    if (value !== 'unresolved') add(name, { val: value ? '1' : '0' });
  }
  for (const [toggle, value] of Object.entries(formatting.toggles)) {
    if (!['bold', 'italic', 'strike'].includes(toggle) && value !== false) warn('unrepresented-style-toggle', `Word ${toggle} is not represented by editable Fountain marks.`);
  }
  for (const [key, name] of [['color', 'color'], ['underline', 'u'], ['highlight', 'highlight'], ['verticalAlign', 'vertAlign']] as const) {
    const value = formatting[key];
    if (value !== undefined) add(name, { val: value });
  }
  if (formatting.verticalAlign && formatting.verticalAlign !== 'baseline') warn('unrepresented-run-vertical-align', `Word vertical alignment ${formatting.verticalAlign} is not yet projected.`);
  if (formatting.underline && !['single', 'none'].includes(formatting.underline)) warn('underline-style-normalized', `Word underline ${formatting.underline} becomes a single underline.`);
  // Preserve the existing direct code-style/double-strike adapter behavior.
  for (const item of properties?.children ?? []) if (typeof item !== 'string' && (isWord(item, 'rStyle') || isWord(item, 'dstrike'))) children.push(item);
  const effective: XMLElement = { name: 'w:rPr', attrs: {}, namespaces: { w: W }, children };
  return { ...run, children: [effective, ...run.children.filter(item => typeof item === 'string' || !isWord(item, 'rPr'))] };
}
