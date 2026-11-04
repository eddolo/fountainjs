import type { Attributes, Node, NodeDOMContext } from './schema';
import { getNodeAtPath } from './transaction/path';
import { isParagraphLayout, type ParagraphLayout } from './paragraph-layout';
import { fontFamilyCSS } from '../text-style/values';

/** Native markers must use their first paragraph's declared font context.
 * Otherwise Chromium's larger marker line box can add space between items.
 * This does not change descendant text or replace semantic native markers.
 */
export const PARAGRAPH_SPACING_STYLES: string = 'li[data-fountain-paragraph-marker-font]::marker{font-family:var(--fountain-paragraph-marker-family,inherit);font-size:var(--fountain-paragraph-marker-size,inherit);line-height:var(--fountain-paragraph-marker-line,inherit)}';

/** Adjacent paragraph gap in points. The original declarations are never
 * rewritten: matching identities suppress only enabled contributions, after
 * taking the larger of the two declared spaces, with a zero floor.
 */
export function resolveParagraphGap(previous?: ParagraphLayout, next?: ParagraphLayout): number {
  if (previous !== undefined && !isParagraphLayout(previous) || next !== undefined && !isParagraphLayout(next)) {
    throw new TypeError('Invalid paragraph spacing layout.');
  }
  const after = previous?.spacingAfter ?? 0, before = next?.spacingBefore ?? 0;
  const same = previous?.spacingGroup !== undefined && previous.spacingGroup === next?.spacingGroup;
  return Math.max(0, Math.max(after, before) - (same && previous?.contextualSpacing ? after : 0)
    - (same && next?.contextualSpacing ? before : 0));
}

function layoutOf(node: Node): ParagraphLayout | undefined {
  const value = node.attrs.layout;
  return node.type.isBlock && node.type.spec.paragraphFlow === 'text'
    && isParagraphLayout(value) && value.spacingGroup !== undefined ? value : undefined;
}

/** Only explicitly transparent schema containers join paragraph flows. An
 * atomic/custom block, table or separate story is not skipped to find text.
 */
function edge(node: Node, direction: -1 | 1): Node | undefined {
  let current = node;
  while (current.type.spec.paragraphFlow === 'transparent') {
    if (!current.childCount) return undefined;
    current = current.child(direction === 1 ? 0 : current.childCount - 1);
  }
  return layoutOf(current) ? current : undefined;
}

function neighbour(document: Node, path: readonly number[], direction: -1 | 1): Node | undefined {
  let cursor = [...path];
  while (cursor.length) {
    const index = cursor.at(-1)!;
    const parentPath = cursor.slice(0, -1);
    const parent = getNodeAtPath(document, parentPath);
    const next = index + direction;
    if (next >= 0 && next < parent.childCount) return edge(parent.child(next), direction);
    if (parent.type.spec.paragraphFlow !== 'transparent') return undefined;
    cursor = parentPath;
  }
  return undefined;
}

export interface ParagraphSpacing {
  readonly unit: 'pt';
  readonly spacingBefore: number;
  readonly spacingAfter: number;
}

/** Derived spacing for one current snapshot. The following carrier owns the
 * combined gap; the preceding carrier has zero trailing space at that boundary.
 * Separate/unknown flows keep their original edge spacing.
 */
export function paragraphSpacingAt(document: Node, path: readonly number[]): ParagraphSpacing | undefined {
  const current = layoutOf(getNodeAtPath(document, path));
  if (!current) return undefined;
  const previousNode = neighbour(document, path, -1), nextNode = neighbour(document, path, 1);
  return Object.freeze({ unit: 'pt',
    spacingBefore: previousNode ? resolveParagraphGap(layoutOf(previousNode), current) : current.spacingBefore ?? 0,
    spacingAfter: nextNode ? 0 : current.spacingAfter ?? 0,
  });
}

/** Inert view projection shared by the browser and HTML serializer. */
export function paragraphSpacingDOMAttributes(node: Node, context?: NodeDOMContext): Attributes {
  if (!context) return {};
  const spacing = layoutOf(node) ? paragraphSpacingAt(context.document, context.path) : undefined;
  const styles: string[] = [];
  let markerFont = false;
  const points = (value: number) => `${Number(value.toFixed(4))}pt`;
  if (spacing) styles.push(`margin-block-start:${points(spacing.spacingBefore)}`, `margin-block-end:${points(spacing.spacingAfter)}`);
  else if (node.type.spec.paragraphFlow === 'transparent') {
    const first = edge(node, 1);
    if (first) {
      styles.push('margin-block-start:0');
      const layout = layoutOf(first)!;
      styles.push(`--fountain-paragraph-marker-family:${layout.fontFamily ? fontFamilyCSS(layout.fontFamily) : 'initial'}`,
        `--fountain-paragraph-marker-size:${layout.fontSize === undefined ? 'initial' : points(layout.fontSize)}`,
        `--fountain-paragraph-marker-line:${layout.lineHeight === undefined ? 'initial' : layout.lineHeightUnit === 'pt' ? points(layout.lineHeight) : layout.lineHeight}`);
      markerFont = true;
    }
    if (edge(node, -1)) styles.push('margin-block-end:0');
  }
  return styles.length ? { 'data-fountain-paragraph-spacing': '', ...(markerFont ? { 'data-fountain-paragraph-marker-font': '' } : {}), style: styles.join(';') } : {};
}
