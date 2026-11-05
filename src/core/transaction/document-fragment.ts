import type { Node } from '../schema';
import { resolveDocumentPoint } from './document-point';

/** Closed clipboard projection. Fully selected nodes retain identity and data;
 * edge text is clipped without dropping marks. An unrepresentable open schema
 * fragment throws rather than silently including unselected source content. */
export function extractDocumentRange(doc: Node, from: number, to: number): Node {
  resolveDocumentPoint(doc, from);
  resolveDocumentPoint(doc, to);
  if (to <= from) throw new RangeError('Clipboard ranges must be nonempty and ordered.');
  const visit = (node: Node, before: number, root = false): Node | null => {
    const after = before + node.nodeSize;
    if (!root && (after <= from || before >= to)) return null;
    if (!root && before >= from && after <= to) return node;
    if (node.isText) {
      const a = Math.max(0, from - before), b = Math.min(node.nodeSize, to - before);
      return b > a ? node.withText(node.text!.slice(a, b)) : null;
    }
    let position = before + (root ? 0 : 1);
    const content: Node[] = [];
    node.content.forEach(child => {
      const selected = visit(child, position);
      if (selected) content.push(selected);
      position += child.nodeSize;
    });
    return node.copy(content);
  };
  const result = visit(doc, 0, true)!;
  doc.type.schema.validate(result);
  return result;
}
