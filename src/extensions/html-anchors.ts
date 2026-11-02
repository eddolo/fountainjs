import type { NodeSpec } from '../core/schema';
import { defineExtension } from './extension';

const fields = { id: 'id', name: 'name', title: 'title', className: 'class', lang: 'lang', dir: 'dir' } as const;
const text = (limit: number) => ({ default: undefined, validate: (value: unknown) => value === undefined
  || typeof value === 'string' && value.length <= limit && !/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/u.test(value) });

/** A non-hyperlink HTML anchor. Absence of href is distinct from href="".
 * Opt-in hosts own imported bookmark names, IDs and stylesheet classes.
 */
export const htmlAnchor: NodeSpec = {
  inline: true, group: 'inline', content: 'inline*', selectable: true, markdown: 'html',
  attrs: {
    id: text(256), name: text(256), title: text(2048), className: text(2048), lang: text(128),
    dir: { default: undefined, validate: value => value === undefined || value === 'ltr' || value === 'rtl' || value === 'auto' },
  },
  validate: node => {
    // HTML parsers repair nested anchors by moving content outside them. Reject
    // that structure at the model boundary rather than lose bookmark ownership
    // on the next save/reopen. Hosts can unwrap a bookmark before making a link.
    let valid = true;
    node.descendants(child => {
      if (child !== node && child.type === node.type || child.marks.some(mark => mark.type.name === 'link')) valid = false;
      return valid;
    });
    return valid;
  },
  parseHTML: [{ tag: 'a', priority: 10, getAttrs: element => {
    const names = element.getAttributeNames?.();
    if (!names || names.some(name => !Object.values(fields).includes(name as typeof fields[keyof typeof fields]))) return false;
    return Object.fromEntries(Object.entries(fields).flatMap(([field, attribute]) => {
      const value = element.getAttribute(attribute);
      return value === null ? [] : [[field, field === 'dir' ? value.toLowerCase() : value]];
    }));
  } }],
  toDOM: node => ['a', Object.fromEntries(Object.entries(fields)
    .filter(([field]) => node.attrs[field] !== undefined).map(([field, attribute]) => [attribute, node.attrs[field]])), 0],
};

export const HTMLAnchorExtension = defineExtension({ name: 'html-anchors', nodes: { html_anchor: htmlAnchor } });
