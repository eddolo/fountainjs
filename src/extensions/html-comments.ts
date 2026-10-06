import type { NodeSpec } from '../core/schema';
import { isHTMLCommentData } from '../core/html-comment';
import { defineExtension } from './extension';

/** Inert source data. Editor badge differs deliberately from native reader HTML. */
export const htmlComment: NodeSpec = {
  group: 'inline', inline: true, atom: true, selectable: true,
  attrs: { data: { default: '', validate: isHTMLCommentData } },
  toText: () => '',
  toDOM: node => ['span', {
    'data-fountain-html-comment': 'true', contenteditable: 'false',
    title: `HTML comment: ${String(node.attrs.data)}`,
    'aria-label': `HTML comment: ${String(node.attrs.data)}`,
    style: 'display:inline-block;padding:0 0.3em;border:1px solid currentColor;border-radius:0.2em;font-size:0.75em',
  }, 'HTML comment'],
};

/** Explicit opt-in, not included in StarterKit or ordinary Markdown parsing. */
export const HTMLCommentExtension = defineExtension({
  name: 'html-comments', nodes: { html_comment: htmlComment },
});
