import type { Mark, Node } from '../schema';

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
