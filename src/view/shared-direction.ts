import type { Node } from '../core/schema';
import { getNodeAtPath } from '../core/transaction/path';
import { sharedDirectionDOMAttributes } from '../core/shared-direction';

const sharedProjections = new WeakMap<HTMLElement, { dir: string; group: string }>();

/** Internal projection ownership; not re-exported by the public view barrel. */
export function applySharedDirectionProjection(element: HTMLElement, node: Node, doc: Node): void {
  const attrs = sharedDirectionDOMAttributes(node, doc), previous = sharedProjections.get(element);
  if (typeof attrs.dir === 'string' && typeof attrs['data-fountain-direction-group'] === 'string') {
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, String(value));
    sharedProjections.set(element, { dir: attrs.dir, group: attrs['data-fountain-direction-group'] });
  } else if (previous) {
    // Reused host views need only the attributes owned by this projection reset.
    if (element.getAttribute('dir') === previous.dir) {
      if (['auto', 'ltr', 'rtl'].includes(String(node.attrs.dir))) element.setAttribute('dir', String(node.attrs.dir));
      else element.removeAttribute('dir');
    }
    if (element.dataset.fountainDirectionGroup === previous.group) {
      delete element.dataset.fountainDirectionGroup;
      delete element.dataset.fountainDirectionOrigin;
    }
    sharedProjections.delete(element);
  }
}

/** Reused fragments hear about live off-fragment and offscreen anchor edits.
 * Visits mounted carriers only; resolution reads the complete immutable model.
 */
export function refreshSharedDirectionDOM(root: HTMLElement, doc: Node): void {
  root.querySelectorAll<HTMLElement>('[data-fountain-direction-group][data-fountain-path]').forEach(element => {
    const path = element.dataset.fountainPath?.split('.').map(Number);
    if (!path || path.some(part => !Number.isInteger(part) || part < 0)) return;
    try { applySharedDirectionProjection(element, getNodeAtPath(doc, path), doc); }
    catch { /* Removed/rebased host DOM is not an authoritative model carrier. */ }
  });
}
