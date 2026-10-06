import { createWordRunStyleCascade, WORD_PARAGRAPH_BORDER_SIDES, type WordFontDeclaration, type WordFontSlot, type WordParagraphBorder, type WordParagraphBorderSide, type WordParagraphFormatting, type WordRunFormatting, type WordStyleDefinition, type WordToggle } from './style-cascade';
import type { XMLElement } from './xml-types';
import { createWordTableStyleCascade } from './table-style';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const TOGGLES: Readonly<Record<string, WordToggle>> = { b: 'bold', i: 'italic', strike: 'strike', caps: 'caps', smallCaps: 'smallCaps', outline: 'outline', shadow: 'shadow', emboss: 'emboss', imprint: 'imprint', vanish: 'vanish', bCs: 'boldCS', iCs: 'italicCS' };
const FONT_ATTRIBUTES = ['ascii', 'hAnsi', 'eastAsia', 'cs', 'asciiTheme', 'hAnsiTheme', 'eastAsiaTheme', 'cstheme'];
export interface WordStyleReadIssue {
  readonly code: 'unsupported-style-kind' | 'unresolved-paragraph-properties' | 'invalid-paragraph-property' | 'unsupported-run-property' | 'unsupported-run-attribute' | 'invalid-run-property' | 'theme-color-not-resolved';
  readonly styleId?: string;
  readonly property: string;
}

/** Decode the paragraph declarations Fountain can faithfully preserve. Values
 * stay in Word units until the format-projection boundary. Attributes cascade
 * independently, matching Word's spacing and indentation inheritance model.
 */
export function readWordParagraphFormatting(properties: XMLElement | undefined, issues: WordStyleReadIssue[], styleId?: string): WordParagraphFormatting {
  if (properties && expanded(properties) !== `${W}|pPr`) throw new Error('Invalid Word paragraph-properties root.');
  const result: { -readonly [K in keyof WordParagraphFormatting]: WordParagraphFormatting[K] } = {};
  const borders: Partial<Record<WordParagraphBorderSide, WordParagraphBorder | null>> = {};
  const seen = new Set<string>();
  const issue = (code: WordStyleReadIssue['code'], property: string) => issues.push(Object.freeze({ code, property, ...(styleId === undefined ? {} : { styleId }) }));
  const integer = (raw: string | undefined, property: string, signed = false): number | undefined => {
    if (raw === undefined || !(signed ? /^-?\d+$/ : /^\d+$/).test(raw)) { issue('invalid-paragraph-property', property); return undefined; }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || Math.abs(value) > 20_000_000) { issue('invalid-paragraph-property', property); return undefined; }
    return value;
  };
  for (const element of children(properties)) {
    const name = expanded(element);
    if (seen.has(name)) throw new Error(`Ambiguous Word paragraph property ${name}.`);
    seen.add(name);
    if (!name.startsWith(`${W}|`)) { issue('unresolved-paragraph-properties', name); continue; }
    const local = name.slice(W.length + 1);
    const values = attributes(element);
    const known = new Set<string>();
    const take = (name: string) => { known.add(`${W}|${name}`); return values[`${W}|${name}`]; };
    if (local === 'jc') {
      const value = take('val');
      if (!value || value.length > 64) issue('invalid-paragraph-property', local);
      else result.align = value;
    } else if (local === 'spacing') {
      const before = take('before'); const after = take('after'); const line = take('line'); const rule = take('lineRule');
      if (before !== undefined) result.spacingBefore = integer(before, 'spacing/before');
      if (after !== undefined) result.spacingAfter = integer(after, 'spacing/after');
      if (line !== undefined) result.line = integer(line, 'spacing/line');
      if (rule !== undefined) {
        if (['auto', 'exact', 'atLeast'].includes(rule)) result.lineRule = rule as WordParagraphFormatting['lineRule'];
        else issue('invalid-paragraph-property', 'spacing/lineRule');
      }
    } else if (local === 'ind') {
      const left = take('left'); const right = take('right'); const firstLine = take('firstLine'); const hanging = take('hanging');
      if (left !== undefined) result.indentLeft = integer(left, 'ind/left', true);
      if (right !== undefined) result.indentRight = integer(right, 'ind/right', true);
      if (firstLine !== undefined && hanging !== undefined) issue('invalid-paragraph-property', 'ind/firstLine+hanging');
      else if (firstLine !== undefined) { result.firstLine = integer(firstLine, 'ind/firstLine'); result.hanging = null; }
      else if (hanging !== undefined) { result.hanging = integer(hanging, 'ind/hanging'); result.firstLine = null; }
    } else if (['keepNext', 'keepLines', 'pageBreakBefore'].includes(local)) {
      const raw = take('val'); const value = onOff(raw);
      if (value === undefined) issue('invalid-paragraph-property', local);
      else Object.assign(result, { [local]: value });
    } else if (local === 'shd') {
      take('val'); const fill = take('fill');
      if (fill === undefined || fill === 'auto') result.background = null;
      else if (/^[\da-f]{6}$/i.test(fill)) result.background = fill.toUpperCase();
      else issue('invalid-paragraph-property', 'shd/fill');
    } else if (local === 'pBdr') {
      for (const border of children(element)) {
        const sideName = expanded(border);
        if (!sideName.startsWith(`${W}|`)) { issue('unresolved-paragraph-properties', sideName); continue; }
        const side = sideName.slice(W.length + 1) as WordParagraphBorderSide;
        if (!WORD_PARAGRAPH_BORDER_SIDES.includes(side)) { issue('unresolved-paragraph-properties', `pBdr/${side}`); continue; }
        if (Object.hasOwn(borders, side)) throw new Error(`Ambiguous Word paragraph border ${side}.`);
        const borderValues = attributes(border);
        const value = borderValues[`${W}|val`];
        if (!value || value.length > 64) { issue('invalid-paragraph-property', `pBdr/${side}/val`); continue; }
        if (value === 'none' || value === 'nil') { borders[side] = null; continue; }
        const sizeRaw = borderValues[`${W}|sz`]; const spaceRaw = borderValues[`${W}|space`]; const borderColor = borderValues[`${W}|color`];
        const size = sizeRaw === undefined ? undefined : integer(sizeRaw, `pBdr/${side}/sz`);
        const space = spaceRaw === undefined ? undefined : integer(spaceRaw, `pBdr/${side}/space`);
        if (borderColor !== undefined && borderColor !== 'auto' && !/^[\da-f]{6}$/i.test(borderColor)) issue('invalid-paragraph-property', `pBdr/${side}/color`);
        borders[side] = Object.freeze({ value, ...(size === undefined ? {} : { size }), ...(space === undefined ? {} : { space }),
          ...(borderColor === undefined ? {} : { color: borderColor }) });
        for (const key of Object.keys(borderValues)) if (![`${W}|val`, `${W}|sz`, `${W}|space`, `${W}|color`].includes(key)) issue('unresolved-paragraph-properties', `pBdr/${side}/${key}`);
        if (children(border).length) issue('unresolved-paragraph-properties', `pBdr/${side}/nested-content`);
      }
      known.clear();
    } else {
      issue('unresolved-paragraph-properties', local);
      continue;
    }
    for (const key of Object.keys(values)) if (!known.has(key)) issue('unresolved-paragraph-properties', `${local}/${key}`);
    if (local !== 'pBdr' && children(element).length) issue('unresolved-paragraph-properties', `${local}/nested-content`);
  }
  if (Object.keys(borders).length) result.borders = Object.freeze(borders);
  return Object.freeze(result);
}

function expanded(element: XMLElement, name = element.name, attribute = false) {
  const split = name.indexOf(':'); const prefix = split < 0 ? '' : name.slice(0, split);
  const namespace = attribute && split < 0 ? '' : element.namespaces[prefix];
  if (split >= 0 && !namespace) throw new Error('Unbound XML namespace in Word styles.');
  return `${namespace ?? ''}|${split < 0 ? name : name.slice(split + 1)}`;
}
const children = (parent?: XMLElement): XMLElement[] => parent?.children.filter((item): item is XMLElement => typeof item !== 'string') ?? [];
function single(parent: XMLElement | undefined, name: string): XMLElement | undefined {
  const matches = children(parent).filter(element => expanded(element) === `${W}|${name}`);
  if (matches.length > 1) throw new Error(`Ambiguous Word style element ${name}.`);
  return matches[0];
}
function attributes(element: XMLElement): Readonly<Record<string, string>> {
  const result: Record<string, string> = Object.create(null);
  for (const [key, value] of Object.entries(element.attrs)) {
    if (key === 'xmlns' || key.startsWith('xmlns:')) continue;
    const name = expanded(element, key, true);
    if (Object.hasOwn(result, name)) throw new Error('Duplicate expanded Word style attribute.');
    result[name] = value;
  }
  return result;
}
const attribute = (element: XMLElement | undefined, name: string) => element && attributes(element)[`${W}|${name}`];
function onOff(raw: string | undefined) {
  if (raw === undefined || ['1', 'true', 'on'].includes(raw)) return true;
  if (['0', 'false', 'off'].includes(raw)) return false;
  return undefined;
}

/** Decode declarations, not browser styles. Unknown properties are reported,
 * never silently declared supported. Style XML and computed format are separate
 * from the editable mark/paragraph projection.
 */
export function readWordRunFormatting(properties: XMLElement | undefined, issues: WordStyleReadIssue[], styleId?: string): WordRunFormatting {
  if (properties && expanded(properties) !== `${W}|rPr`) throw new Error('Invalid Word run-properties root.');
  const result: { -readonly [K in keyof WordRunFormatting]: WordRunFormatting[K] } = {};
  const toggles: Partial<Record<WordToggle, boolean>> = {};
  const fonts: Partial<Record<WordFontSlot, WordFontDeclaration>> = {};
  const seen = new Set<string>();
  const issue = (code: WordStyleReadIssue['code'], property: string) => issues.push(Object.freeze({ code, property, ...(styleId === undefined ? {} : { styleId }) }));
  for (const element of children(properties)) {
    const name = expanded(element);
    if (seen.has(name)) throw new Error(`Ambiguous Word run property ${name}.`);
    seen.add(name);
    const values = attributes(element);
    if (!name.startsWith(`${W}|`)) { issue('unsupported-run-property', name); continue; }
    const local = name.slice(W.length + 1);
    const raw = values[`${W}|val`];
    const allowedAttributes = local === 'rFonts' ? FONT_ATTRIBUTES : ['val'];
    for (const key of Object.keys(values)) {
      if (!allowedAttributes.some(allowed => key === `${W}|${allowed}`)) issue(local === 'color' && key.startsWith(`${W}|theme`) ? 'theme-color-not-resolved' : 'unsupported-run-attribute', `${local}/${key}`);
    }
    if (Object.hasOwn(TOGGLES, local)) {
      const value = onOff(raw);
      if (value === undefined) issue('invalid-run-property', local);
      else toggles[TOGGLES[local]!] = value;
    } else if (local === 'rFonts') {
      for (const slot of ['ascii', 'hAnsi', 'eastAsia', 'cs'] as const) {
        const name = values[`${W}|${slot}`];
        const theme = values[`${W}|${slot === 'cs' ? 'cstheme' : `${slot}Theme`}`];
        if ([name, theme].some(value => value !== undefined && (!value || value.length > 320))) { issue('invalid-run-property', `rFonts/${slot}`); continue; }
        if (name !== undefined || theme !== undefined) fonts[slot] = Object.freeze({ ...(name === undefined ? {} : { name }), ...(theme === undefined ? {} : { theme }) });
      }
    } else if (local === 'sz' || local === 'szCs') {
      const value = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : NaN;
      if (!Number.isSafeInteger(value) || value <= 0) issue('invalid-run-property', local);
      else result[local === 'sz' ? 'size' : 'sizeCS'] = value;
    } else if (local === 'spacing') {
      const value = raw !== undefined && /^[+-]?\d+$/.test(raw) ? Number(raw) : NaN;
      if (!Number.isSafeInteger(value)) issue('invalid-run-property', local);
      else result.characterSpacing = value;
    } else if (local === 'color') {
      if (raw === 'auto' || raw && /^[0-9a-f]{6}$/i.test(raw)) result.color = raw;
      else if (raw !== undefined) issue('invalid-run-property', local);
    } else if (local === 'u' || local === 'highlight' || local === 'vertAlign') {
      const value = raw ?? (local === 'u' ? 'single' : undefined);
      if (!value || value.length > 320) issue('invalid-run-property', local);
      else result[local === 'u' ? 'underline' : local === 'highlight' ? 'highlight' : 'verticalAlign'] = value;
    } else issue('unsupported-run-property', local);
    if (children(element).length) issue('unsupported-run-property', `${local}/nested-content`);
  }
  return Object.freeze({ ...result, toggles: Object.freeze(toggles), fonts: Object.freeze(fonts) });
}

/** Prepare document defaults and actual paragraph/character style definitions
 * for the bounded cascade. All style IDs, including unsupported kinds, take part
 * in duplicate checking. No built-in style is guessed from its display name.
 */
export function readWordStyleSheet(document: XMLElement, limits: { readonly maxStyles?: number; readonly maxDepth?: number } = {}) {
  const root = single(document, 'styles');
  if (!root || children(document).length !== 1) throw new Error('Invalid Word styles root.');
  const maxStyles = limits.maxStyles ?? 4096;
  if (!Number.isSafeInteger(maxStyles) || maxStyles < 1 || maxStyles > 100_000) throw new Error('Invalid Word style limit.');
  const issues: WordStyleReadIssue[] = [];
  const styleElements = children(root).filter(element => expanded(element) === `${W}|style`);
  if (styleElements.length > maxStyles) throw new Error(`Word styles exceed ${maxStyles} definitions.`);
  const defaultsRoot = single(root, 'docDefaults');
  const defaults = readWordRunFormatting(single(single(defaultsRoot, 'rPrDefault'), 'rPr'), issues);
  const paragraphDefaults = readWordParagraphFormatting(single(single(defaultsRoot, 'pPrDefault'), 'pPr'), issues);
  const styles: WordStyleDefinition[] = [];
  const ids = new Set<string>();
  for (const element of styleElements) {
    const id = attribute(element, 'styleId');
    const kind = attribute(element, 'type');
    if (!id || id.length > 253) throw new Error('Invalid Word style identity.');
    if (ids.has(id)) throw new Error(`Duplicate Word style ${id}.`);
    ids.add(id);
    if (kind === 'table') continue; // Separate Word table inheritance/region boundary.
    if (kind !== 'paragraph' && kind !== 'character') {
      issues.push(Object.freeze({ code: 'unsupported-style-kind', property: kind ?? '(missing)', styleId: id })); continue;
    }
    const defaultRaw = attribute(element, 'default');
    const isDefault = defaultRaw === undefined ? false : onOff(defaultRaw);
    if (isDefault === undefined) throw new Error('Invalid Word default-style flag.');
    const basedOnElement = single(element, 'basedOn');
    const basedOn = attribute(basedOnElement, 'val');
    if (basedOnElement && (!basedOn || basedOn.length > 253)) throw new Error('Invalid Word parent-style identity.');
    const run = readWordRunFormatting(single(element, 'rPr'), issues, id);
    const paragraph = readWordParagraphFormatting(single(element, 'pPr'), issues, id);
    styles.push(Object.freeze({ id, kind, isDefault, ...(basedOn === undefined ? {} : { basedOn }), run, paragraph }));
  }
  const cascade = createWordRunStyleCascade({ styles, defaults, paragraphDefaults, ...limits });
  return Object.freeze({ defaults, paragraphDefaults, styles: Object.freeze(styles), issues: Object.freeze(issues), resolve: cascade.resolve, resolveParagraph: cascade.resolveParagraph,
    resolveTable: createWordTableStyleCascade(styleElements, limits.maxDepth) });
}
