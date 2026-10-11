import type { Node } from './schema';
import { bidiStrongRanges } from './bidi-strong-data';

type StrongDirection = 'ltr' | 'rtl' | null;

function ownsDirection(node: Node): boolean {
  let value = node.attrs.dir;
  // Inert adapters store original element attributes as data, not live DOM
  // attributes. Their explicit source context still excludes their text from
  // the original parent group's first-strong search.
  if (value === undefined && node.type.name.startsWith('html_inert_')) {
    const attrs = node.attrs.attributes;
    if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) value = (attrs as Record<string, unknown>).dir;
  }
  return typeof value === 'string' && ['ltr', 'rtl', 'auto'].includes(value.toLowerCase());
}

/** Internal Unicode classifier, not a full bidi layout/reordering algorithm. */
export function strongDirectionOfCodePoint(point: number): StrongDirection {
  if (!Number.isInteger(point) || point < 0 || point > 0x10ffff) return null;
  let low = 0, high = bidiStrongRanges.length / 2 - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (point <= bidiStrongRanges[middle * 2]!) high = middle;
    else low = middle + 1;
  }
  const value = bidiStrongRanges[low * 2 + 1];
  return value === 1 ? 'ltr' : value === 2 ? 'rtl' : null;
}

/** No normalization, stripping, source mutation or browser globals. */
export function firstStrongDirection(text: string): StrongDirection {
  for (const character of text) {
    const direction = strongDirectionOfCodePoint(character.codePointAt(0)!);
    if (direction) return direction;
  }
  return null;
}

/** Streams eligible text nodes without concatenating a whole document. */
export function firstStrongDirectionInText(texts: Iterable<string>): StrongDirection {
  for (const text of texts) {
    const direction = firstStrongDirection(text);
    if (direction) return direction;
  }
  return null;
}

/** First strong model text within one container's eligible descendants.
 * Nested explicit direction contexts and captured HTML raw-text bodies do not
 * participate. Attributes, media alternatives, toText() and UI labels are not
 * DOM text descendants and must not secretly determine document direction.
 * Custom renderers can exclude their own isolated subtrees. This does not yet
 * join fragmented scopes or attach group membership to the document.
 */
export function containedTextDirection(root: Node, exclude: (node: Node) => boolean = () => false): StrongDirection {
  if (root.isText) return firstStrongDirection(root.text!);
  // Frames visit only the next eligible child, avoiding both recursive stack
  // overflow and copying every sibling before the first strong text is found.
  const pending = [{ node: root, index: 0 }];
  while (pending.length) {
    const frame = pending.at(-1)!;
    if (frame.index === frame.node.childCount) { pending.pop(); continue; }
    const node = frame.node.child(frame.index++);
    if (exclude(node) || node.type.name === 'html_inert_raw_text' || ownsDirection(node)) continue;
    if (node.isText) {
      const direction = firstStrongDirection(node.text!);
      if (direction) return direction;
    } else pending.push({ node, index: 0 });
  }
  return null;
}

/** Fold a document's explicitly supplied shared-context membership in tree
 * order, even when references are no longer DOM ancestors of one another.
 * The accessor owns the future schema contract; this helper invents no IDs,
 * attributes, copied source, presentation state or document mutations.
 * Re-evaluation reads current text after edits/deletions/reordering. A null
 * value is deliberately distinct from a resolved direction and lets the
 * projection apply its declared no-strong fallback.
 */
export function sharedTextDirections(
  root: Node,
  groupOf: (node: Node) => string | null,
  exclude: (node: Node) => boolean = () => false,
): ReadonlyMap<string, StrongDirection> {
  const groups = new Map<string, StrongDirection>();
  const enter = (node: Node, inherited: string | null): string | null => {
    const own = groupOf(node);
    if (own !== null) {
      if (!groups.has(own)) groups.set(own, null);
      return own;
    }
    return ownsDirection(node) ? null : inherited;
  };
  if (exclude(root) || root.type.name === 'html_inert_raw_text') return groups;
  const pending = [{ node: root, index: 0, group: enter(root, null) }];
  while (pending.length) {
    const frame = pending.at(-1)!;
    if (frame.node.isText) {
      if (frame.group !== null && groups.get(frame.group) === null) {
        groups.set(frame.group, firstStrongDirection(frame.node.text!));
      }
      pending.pop();
    } else if (frame.index === frame.node.childCount) pending.pop();
    else {
      const node = frame.node.child(frame.index++);
      if (!exclude(node) && node.type.name !== 'html_inert_raw_text') {
        pending.push({ node, index: 0, group: enter(node, frame.group) });
      }
    }
  }
  return groups;
}
