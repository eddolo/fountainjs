import type { Mark, Node, Schema } from './schema';

/** Data that can be emitted as one HTML comment, never as executable markup. */
export function isHTMLCommentData(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 65_536
    && !/[\u0000\r]/u.test(value) && !/^(?:>|->)|--!?>/u.test(value)
    && !value.includes('<!--') && !value.endsWith('<!-');
}

export function htmlCommentSource(value: unknown): string {
  if (!isHTMLCommentData(value)) throw new TypeError('HTML comment data cannot be serialized safely.');
  return `<!--${value}-->`;
}

/** Schema opt-in only; failed validation never installs or invents a node type. */
export function importHTMLComment(data: string, schema: Schema, marks: readonly Mark[] = []): Node | null {
  const type = schema.nodes.html_comment;
  if (!type?.isInline || !type.spec.atom || !isHTMLCommentData(data)) return null;
  try {
    const node = type.create({ data }, [], undefined, marks);
    schema.validate(node);
    return node.attrs.data === data ? node : null;
  } catch { return null; }
}
