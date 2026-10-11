import type { NodeSpec } from '../../core/schema';
import { sharedDirectionGroupAttribute, readSharedDirectionSource } from '../../core/text-direction';

/** A neutral, shared reading-direction context. No layout or browser resolution
 * is performed by the model. Unlike independent automatic children, the whole
 * group's eligible first-strong text continues to determine its direction.
 */
export const directionScope: NodeSpec = {
  group: 'block', content: 'block+',
  attrs: { dir: { default: 'auto', validate: value => value === 'auto' || value === 'ltr' || value === 'rtl' }, directionGroup: sharedDirectionGroupAttribute },
  markdown: 'html',
  parseHTML: [{ tag: 'div[data-fountain-direction-scope]', priority: 60,
    getAttrs: element => {
      const names = element.getAttributeNames?.();
      if (!names || names.some(name => !['dir', 'data-fountain-direction-scope', 'data-fountain-direction-group', 'data-fountain-direction-origin'].includes(name))) return false;
      return readSharedDirectionSource(element) ?? { dir: element.getAttribute('dir')?.toLowerCase() ?? 'auto' };
    },
  }],
  toDOM: node => ['div', { 'data-fountain-direction-scope': '', dir: node.attrs.dir }, 0],
};
