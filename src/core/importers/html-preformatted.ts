import type { Mark, Node, Schema } from '../schema';

/** Private tree boundary shared by the browser and DOM-free HTML adapters. */
export interface PreformattedTree<T> {
  kind(node: T): 'text' | 'element' | 'ignore';
  children(node: T): readonly T[];
  tag(node: T): string;
  text(node: T): string;
  marks(node: T, inherited: readonly Mark[]): readonly Mark[];
}

/** Preserve actual HTML text/formatting, never interpret code source syntax.
 * Iterative traversal keeps deeply nested browser input off the JS call stack.
 */
export function preformattedContent<T>(root: T, schema: Schema, tree: PreformattedTree<T>): Node[] {
  const result: Node[] = [], roots = tree.children(root);
  let emitted = 0;
  const append = (value: string, marks: readonly Mark[]) => {
    emitted++;
    const previous = result.at(-1);
    if (value && previous?.text && previous.marks.length === marks.length
      && previous.marks.every((mark, index) => mark.eq(marks[index]!))) {
      result[result.length - 1] = previous.withText(previous.text + value);
    } else result.push(schema.text(value, marks));
  };
  type Frame = { visit: true; node: T; marks: readonly Mark[]; structuralCode: boolean }
    | { visit: false; start: number; marks: readonly Mark[] };
  const stack: Frame[] = roots.map(node => ({ visit: true, node, marks: [],
    structuralCode: roots.length === 1 && tree.tag(node) === 'code' }));
  stack.reverse();
  while (stack.length) {
    const frame = stack.pop()!;
    if (!frame.visit) {
      if (emitted === frame.start && frame.marks.length) append('', frame.marks);
      continue;
    }
    const kind = tree.kind(frame.node);
    if (kind === 'ignore') continue;
    if (kind === 'text') {
      const value = tree.text(frame.node);
      if (value) append(value, frame.marks);
      continue;
    }
    const applied = tree.marks(frame.node, frame.marks);
    // A sole outer <code> supplies the block's code surface. Nested <code>
    // remains a real inline mark, including when written by the safe exporter.
    const marks = frame.structuralCode ? applied.filter(mark => mark.type.name !== 'code') : applied;
    if (tree.tag(frame.node) === 'br') { append('\n', marks); continue; }
    const children = tree.children(frame.node);
    stack.push({ visit: false, start: emitted, marks });
    for (let index = children.length - 1; index >= 0; index--) {
      stack.push({ visit: true, node: children[index]!, marks, structuralCode: false });
    }
  }
  return result.length ? result : [schema.text('')];
}
