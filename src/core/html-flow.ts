import type { HTMLParseElement, Node, Schema } from './schema';

/** Canonical Markdown distinguishes a cleared caret leaf from a childless flow.
 * This inert marker is local to the explicitly configured html_flow carrier;
 * ordinary empty paragraphs and anonymous native HTML are not normalized.
 */
export function restoreHTMLFlowCaret(type: string, element: Pick<HTMLParseElement, 'getAttribute'>, content: Node[], schema: Schema): Node[] {
  return type === 'html_flow' && element.getAttribute('data-fountain-empty-text') === 'true' && !content.length
    ? [schema.text('')] : content;
}

/** Preserve anonymous inline HTML without inventing a paragraph. */
export function importHTMLAnonymousFlow(content: readonly Node[], schema: Schema): Node | null {
  const type = schema.nodes.html_flow;
  if (!type?.isBlock || !content.some(node => !node.isText || /[^\t\n\f\r ]/u.test(node.text ?? '') || node.marks.length)) return null;
  try {
    const node = type.create({}, content);
    schema.validate(node);
    return node;
  } catch { return null; }
}
