import type { NodeSpec } from '../../core';
import { paragraphLayoutAttribute, paragraphLayoutDOMAttributes } from '../../core/paragraph-layout';
import { textDirectionAttribute, textDirectionDOMAttributes } from '../../core/text-direction';

export const codeBlock: NodeSpec = {
  group: 'block', content: 'text*', code: true,
  attrs: {
    // A label is metadata, not markup or a registered tokenizer name. HTML
    // serialization escapes it; hosts may impose their own narrower schema.
    language: { default: 'text', validate: (value) => typeof value === 'string' && !/\s/u.test(value) },
    lineNumbers: { default: true, validate: (value) => typeof value === 'boolean' },
    layout: paragraphLayoutAttribute,
    dir: textDirectionAttribute,
  },
  toDOM: (node) => ['pre', { ...paragraphLayoutDOMAttributes(node.attrs.layout), ...textDirectionDOMAttributes(node.attrs), tabindex: 0, role: 'region', 'aria-label': `${node.attrs.language} code`, 'data-language': node.attrs.language, 'data-line-numbers': String(Boolean(node.attrs.lineNumbers)) }, ['code', 0]],
};
