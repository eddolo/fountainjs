import { needsHTMLLinkSource, renderedLinkDestination, restoredHTMLLinkSource, restoredLinkDestination } from '../link-destination';
import { readParagraphLayout } from '../paragraph-layout';
import type { Attributes, Mark, Node, Schema } from '../schema';
import { importedHTMLLinkURL } from './html-link-url';

// Import-only provenance: CSS reassertions are not authored emphasis elements.
// Weak membership retains neither a document nor its source tree.
const cssEmphasis = new WeakSet<Mark>();

export function explicitHTMLEmphasis(tag: string): string | undefined {
  return tag === 'em' || tag === 'i' ? 'em' : tag === 'strong' || tag === 'b' ? 'strong' : undefined;
}

/** Preserve explicit emphasis nesting without treating inherited CSS as another
 * semantic level. Attribute-bearing marks still use the nearest local value.
 * Called once per source element, after its own rules/styles are deduplicated.
 */
export function mergeHTMLMarks(local: readonly Mark[], inherited: readonly Mark[], tag: string): Mark[] {
  const stacked = explicitHTMLEmphasis(tag);
  const effective = local.filter(own => {
    if (own.type.name === stacked || !['em', 'strong'].includes(own.type.name)) return true;
    const ancestors = inherited.filter(mark => mark.type === own.type);
    // Reasserting the same CSS font style/weight cannot erase two existing
    // semantic levels or introduce a new one. Differing custom attributes keep
    // the established nearest-value override rather than guessing inheritance.
    return !ancestors.length || !ancestors.every(mark => mark.eq(own));
  });
  return [
    ...inherited.filter(mark => mark.type.name === stacked || !effective.some(own => own.type === mark.type)),
    ...effective,
  ];
}

/** Bottom-up block projection: inner attributes retain their precedence, but
 * an explicit outer emphasis element contributes its own semantic level.
 */
export function mergeHTMLBlockMarks(inner: readonly Mark[], outer: readonly Mark[], tag: string): Mark[] {
  const stacked = explicitHTMLEmphasis(tag);
  return [...outer.filter(mark => mark.type.name === stacked || !inner.some(own => own.type === mark.type)), ...inner];
}

/** Resolve CSS with the full inherited context, then move that exact scope to
 * its owning inline container. Identity, not equality, distinguishes the outer
 * marks from a newly authored nested emphasis element with identical values.
 */
export function relativeHTMLContent(content: readonly Node[], inherited: readonly Mark[], includeCSS = false): readonly Node[] {
  if (!inherited.length) return content;
  return content.map(node => {
    const children = includeCSS ? relativeHTMLContent(node.content, inherited, true) : node.content;
    let result = children.some((child, index) => child !== node.content[index]) ? node.copy(children) : node;
    const marks = node.marks.filter(mark => !inherited.includes(mark)
      && !(includeCSS && cssEmphasis.has(mark) && inherited.some(outer => outer.eq(mark))));
    if (marks.length !== node.marks.length) result = result.withMarks(marks);
    return result;
  });
}

const HAS_EMOJI = /\p{Extended_Pictographic}/u;

export function unicodeEmojiName(value: string): string {
  return `unicode-${Array.from(value).map((character) => character.codePointAt(0)?.toString(16)).join('-')}`;
}

export function textNodes(value: string, schema: Schema, marks: readonly Mark[]): Node[] {
  if (!value || !schema.nodes.emoji || !HAS_EMOJI.test(value)) return value ? [schema.text(value, marks)] : [];
  const segments = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value), (part) => part.segment)
    : Array.from(value);
  const result: Node[] = [];
  let pending = '';
  const flush = () => {
    if (pending) result.push(schema.text(pending, marks));
    pending = '';
  };
  segments.forEach((segment) => {
    if (!HAS_EMOJI.test(segment)) { pending += segment; return; }
    flush();
    try { result.push(schema.node('emoji', { name: unicodeEmojiName(segment), emoji: segment }, [], undefined, marks)); }
    catch { result.push(schema.text(segment, marks)); }
  });
  flush();
  return result;
}

function addMark(marks: Mark[], mark: Mark): void {
  if (!marks.some((candidate) => candidate.type === mark.type)) marks.push(mark);
}

function addSchemaMark(marks: Mark[], schema: Schema, name: string, attrs: Attributes = {}): void {
  const type = schema.marks[name];
  if (!type || marks.some((mark) => mark.type === type)) return;
  try { marks.push(type.create(attrs)); }
  catch { /* Invalid imported attributes leave the content unmarked. */ }
}

function colorValue(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(normalized)?.[1];
  if (hex) return `#${hex.length === 3 ? Array.from(hex, (part) => `${part}${part}`).join('') : hex}`;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*(?:1(?:\.0+)?|100%))?\s*\)$/i.exec(normalized);
  if (!rgb) return null;
  const values = rgb.slice(1, 4).map(Number);
  if (values.some((part) => part < 0 || part > 255)) return null;
  return `#${values.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

interface MarkElement {
  readonly style: {
    readonly backgroundColor?: string;
    readonly color?: string;
    readonly fontStyle?: string;
    readonly fontWeight?: string;
    readonly textDecoration?: string;
    readonly textDecorationLine?: string;
  };
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
}

const tagMarks: Readonly<Partial<Record<string, string>>> = {
  strong: 'strong', b: 'strong', em: 'em', i: 'em', u: 'underline', s: 'strike',
  del: 'strike', code: 'code', mark: 'highlight', sub: 'subscript', sup: 'superscript',
};

export function projectHTMLFormatting(element: MarkElement, tag: string, schema: Schema, configured: () => Mark[]) {
  const layoutProjection = element.hasAttribute('data-fountain-paragraph-layout');
  const fontContext = readParagraphLayout(element).layout as { fontFamily?: string; fontSize?: number } | undefined;
  const configuredMarks = configured().filter(mark => !layoutProjection || !['highlight', 'line_height'].includes(mark.type.name))
    .filter(mark => !(mark.type.name === 'font_family' && fontContext?.fontFamily !== undefined)
      && !(mark.type.name === 'font_size' && fontContext?.fontSize !== undefined));
  const marks: Mark[] = [];
  configuredMarks.forEach(mark => addMark(marks, mark));

  const nativeMark = Object.hasOwn(tagMarks, tag) ? tagMarks[tag] : undefined;
  const style = element.style;
  const background = colorValue(style.backgroundColor ?? '');
  if (nativeMark === 'highlight') addSchemaMark(marks, schema, nativeMark, { color: background ?? '#fff3a3' });
  else if (nativeMark) addSchemaMark(marks, schema, nativeMark);
  const weight = (style.fontWeight ?? '').toLowerCase();
  const bold = weight === 'bold' || weight === 'bolder' || Number(weight) >= 500;
  const italic = (style.fontStyle ?? '').toLowerCase() === 'italic';
  if (bold) addSchemaMark(marks, schema, 'strong');
  if (italic) addSchemaMark(marks, schema, 'em');
  const decoration = `${style.textDecoration ?? ''} ${style.textDecorationLine ?? ''}`.toLowerCase();
  if (decoration.includes('underline')) addSchemaMark(marks, schema, 'underline');
  if (decoration.includes('line-through')) addSchemaMark(marks, schema, 'strike');
  const color = colorValue(style.color ?? '');
  if (color) addSchemaMark(marks, schema, 'text_color', { color });
  // Cell fills belong to the cell, not to movable text inside it.
  if (background && !layoutProjection && tag !== 'td' && tag !== 'th') addSchemaMark(marks, schema, 'highlight', { color: background });
  const explicit = explicitHTMLEmphasis(tag);
  marks.forEach(mark => {
    const name = mark.type.name;
    if (name !== explicit && (name === 'em' && italic || name === 'strong' && bold)) cssEmphasis.add(mark);
  });
  return { marks, hasConfiguredMarks: configuredMarks.length > 0, nativeMark };
}

export type HTMLLinkProjectionIssue = 'html-carrier' | 'native-carrier' | 'normalized' | 'normalized-with-source' | 'invalid-normalized' | 'rejected';

export function projectHTMLLink(element: MarkElement, schema: Schema, marks: Mark[], report?: (issue: HTMLLinkProjectionIssue) => void): void {
  const type = schema.marks.link;
  if (!type) return;
  const originalHref = element.getAttribute('href');
  const visibleHref = originalHref ?? '';
  const htmlCarrier = element.getAttribute('data-fountain-html-href');
  const literalCarrier = element.getAttribute('data-fountain-link-href');
  const nativeHTMLSource = literalCarrier === null ? restoredHTMLLinkSource(visibleHref, htmlCarrier) : null;
  const literalSource = htmlCarrier === null ? restoredLinkDestination(visibleHref, literalCarrier) : null;
  const source = nativeHTMLSource ?? visibleHref;
  const href = literalSource ?? importedHTMLLinkURL(source);
  const htmlHref = literalSource === null && type.spec.attrs?.htmlHref && needsHTMLLinkSource(source) ? source : undefined;
  if (htmlCarrier !== null && nativeHTMLSource === null) report?.('html-carrier');
  if (literalCarrier !== null && literalSource === null) report?.('native-carrier');
  if (originalHref === null) return;
  if (href === null) {
    report?.('rejected');
    return;
  }
  addSchemaMark(marks, schema, 'link', {
    href, title: element.getAttribute('title') ?? '',
    target: element.getAttribute('target') === '_self' ? '_self' : '_blank',
    ...(htmlHref === undefined ? {} : { htmlHref }),
  });
  if (!report) return;
  if (literalSource === null && nativeHTMLSource === null && (href !== originalHref || renderedLinkDestination(href, htmlHref) !== href)
    && marks.some(mark => mark.type.name === 'link' && mark.attrs.href === href)) {
    report(htmlHref === undefined ? 'normalized' : 'normalized-with-source');
  } else if (href !== originalHref && !marks.some(mark => mark.type.name === 'link')) {
    report('invalid-normalized');
  }
}
