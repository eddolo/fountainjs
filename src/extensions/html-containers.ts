import type { NodeSpec } from '../core/schema';
import { defineExtension } from './extension';

const tags = ['div', 'section', 'article', 'aside', 'nav', 'main', 'header', 'footer', 'address'] as const;
const attributes = { id: 'id', className: 'class', title: 'title', lang: 'lang', dir: 'dir' } as const;
const textAttribute = (limit: number) => ({ default: '', validate: (value: unknown) => typeof value === 'string' && value.length <= limit && !/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/u.test(value) });

/** Optional structured section wrappers, not arbitrary HTML or CSS execution.
 * Hosts opting in own their stylesheet and the meaning of imported IDs/classes.
 */
export const htmlContainer: NodeSpec = {
  group: 'block', content: 'block*',
  attrs: {
    tag: { default: 'div', validate: value => tags.includes(value as typeof tags[number]) },
    id: textAttribute(256), className: textAttribute(2048), title: textAttribute(2048), lang: textAttribute(128),
    dir: { default: '', validate: value => typeof value === 'string' && ['', 'ltr', 'rtl', 'auto'].includes(value) },
  },
  parseHTML: tags.map(tag => ({
    tag, priority: 10,
    getAttrs: element => {
      const names = element.getAttributeNames?.();
      if (!names || names.some(name => !Object.values(attributes).includes(name as typeof attributes[keyof typeof attributes]))) return false;
      return { tag, ...Object.fromEntries(Object.entries(attributes).map(([name, html]) => [name, element.getAttribute(html) ?? ''])) };
    },
  })),
  toDOM: node => [String(node.attrs.tag), Object.fromEntries(Object.entries(attributes)
    .filter(([name]) => node.attrs[name] !== '').map(([name, html]) => [html, node.attrs[name]])), 0],
};

/** Add explicitly with composeExtensions; StarterKit keeps its existing schema. */
export const HTMLContainerExtension = defineExtension({
  name: 'html-containers',
  nodes: { html_container: htmlContainer },
});
