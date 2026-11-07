import type { Attributes, Mark, Node, Schema } from '../schema';

// Import-only provenance: CSS reassertions are not authored emphasis elements.
// Weak membership retains neither a document nor its source tree.
const cssEmphasis = new WeakSet<Mark>();
export function rememberCSSEmphasis(mark: Mark): void { cssEmphasis.add(mark); }

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

export function addMark(marks: Mark[], mark: Mark): void {
  if (!marks.some((candidate) => candidate.type === mark.type)) marks.push(mark);
}

export function addSchemaMark(marks: Mark[], schema: Schema, name: string, attrs: Attributes = {}): void {
  const type = schema.marks[name];
  if (!type || marks.some((mark) => mark.type === type)) return;
  try { marks.push(type.create(attrs)); }
  catch { /* Invalid imported attributes leave the content unmarked. */ }
}

export function colorValue(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(normalized)?.[1];
  if (hex) return `#${hex.length === 3 ? Array.from(hex, (part) => `${part}${part}`).join('') : hex}`;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*(?:1(?:\.0+)?|100%))?\s*\)$/i.exec(normalized);
  if (!rgb) return null;
  const values = rgb.slice(1, 4).map(Number);
  if (values.some((part) => part < 0 || part > 255)) return null;
  return `#${values.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}
