import type { NodeSpec } from '../core/schema';
import { defineExtension } from './extension';

/** A model block grouping anonymous inline HTML, not an authored paragraph.
 * Native HTML exports its children. The DOM editor supplies an inline carrier.
 */
export const htmlFlow: NodeSpec = {
  group: 'block', content: 'inline*',
  parseHTML: [{
    tag: 'div[data-fountain-html-flow="true"]',
    getAttrs: element => element.getAttributeNames?.().every(name => name === 'data-fountain-html-flow'
      || name === 'data-fountain-empty-text' && element.getAttribute(name) === 'true' && element.textContent === '') ? {} : false,
  }],
  toDOM: () => ['span', { 'data-fountain-html-flow': 'true', style: 'white-space:normal' }, 0],
};

/** Explicit opt-in. Does not change StarterKit or the ordinary caret policy. */
export const HTMLFlowExtension = defineExtension({ name: 'html-flow', nodes: { html_flow: htmlFlow } });
