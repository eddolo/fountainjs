import type { Node } from '../core/schema';
import { getNodeAtPath } from '../core/transaction/path';
import { paragraphSpacingDOMAttributes } from '../core/paragraph-spacing';

type OwnedStyle = { original: string; priority: string; applied: string };
const owned = new WeakMap<HTMLElement, Map<string, OwnedStyle>>();

function restoreStyle(element: HTMLElement, property: string, previous: OwnedStyle): void {
  if (element.style.getPropertyValue(property) !== previous.applied) return;
  if (previous.original) element.style.setProperty(property, previous.original, previous.priority);
  else element.style.removeProperty(property);
}

/** A reused host view sees its base styles before update(), so a new value
 * equal to the previous projection cannot be mistaken for stale engine state.
 */
export function clearParagraphSpacingProjection(element: HTMLElement): void {
  const previous = owned.get(element);
  if (!previous) return;
  previous.forEach((value, property) => restoreStyle(element, property, value));
  owned.delete(element);
  delete element.dataset.fountainParagraphSpacing;
  delete element.dataset.fountainParagraphMarkerFont;
}

/** Derived margins only. Model data, DOM text/selection positions and host
 * styles outside this projection stay untouched, including on reused views.
 */
export function applyParagraphSpacingProjection(element: HTMLElement, node: Node, document: Node, path: readonly number[]): void {
  const attrs = paragraphSpacingDOMAttributes(node, { document, path });
  const styles = typeof attrs.style === 'string' ? new Map(attrs.style.split(';').map(item => {
    const colon = item.indexOf(':'); return [item.slice(0, colon), item.slice(colon + 1)];
  })) : new Map<string, string>();
  const prior = owned.get(element) ?? new Map<string, OwnedStyle>();
  for (const [property, previous] of prior) {
    if (styles.has(property)) continue;
    restoreStyle(element, property, previous);
    prior.delete(property);
  }
  for (const [property, value] of styles) {
    if (!prior.has(property)) prior.set(property, { original: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property), applied: '' });
    element.style.setProperty(property, value);
    prior.get(property)!.applied = element.style.getPropertyValue(property);
  }
  if (attrs['data-fountain-paragraph-marker-font'] === '') element.dataset.fountainParagraphMarkerFont = '';
  else delete element.dataset.fountainParagraphMarkerFont;
  if (prior.size) {
    owned.set(element, prior); element.dataset.fountainParagraphSpacing = '';
  } else { owned.delete(element); delete element.dataset.fountainParagraphSpacing; }
}

/** Visits mounted carriers only. Neighbourhood/flow comes from the complete
 * immutable model, including offscreen paragraphs, never DOM adjacency.
 */
export function refreshParagraphSpacingDOM(root: HTMLElement, document: Node): void {
  root.querySelectorAll<HTMLElement>('[data-fountain-paragraph-spacing][data-fountain-path]').forEach(element => {
    const path = element.dataset.fountainPath?.split('.').map(Number);
    if (!path || path.some(part => !Number.isInteger(part) || part < 0)) return;
    try { applyParagraphSpacingProjection(element, getNodeAtPath(document, path), document, path); }
    catch { /* Detached/rebased DOM is not an authoritative model node. */ }
  });
}
