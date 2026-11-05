import type { Node } from '../schema';

export interface DocumentTextPoint {
  readonly kind: 'text';
  readonly position: number;
  readonly path: readonly number[];
  readonly offset: number;
}

export interface DocumentBoundaryPoint {
  readonly kind: 'boundary';
  readonly position: number;
  readonly parentPath: readonly number[];
  readonly index: number;
}

export type DocumentPoint = DocumentTextPoint | DocumentBoundaryPoint;

/** Resolve a structural position without projecting an atom/gap onto nearby text.
 * Non-root nodes own opening/closing units. Opaque/leaf node interiors are not
 * editable endpoints; their before/after boundaries are valid. */
export function resolveDocumentPoint(doc: Node, position: number, association: -1 | 1 = 1): DocumentPoint {
  if (!Number.isInteger(position) || position < 0 || position > doc.nodeSize - 2) {
    throw new RangeError(`Invalid document position: ${position}.`);
  }
  const text = (path: readonly number[], offset: number): DocumentTextPoint => (
    Object.freeze({ kind: 'text', position, path: Object.freeze([...path]), offset })
  );
  const boundary = (path: readonly number[], index: number): DocumentBoundaryPoint => (
    Object.freeze({ kind: 'boundary', position, parentPath: Object.freeze([...path]), index })
  );
  const visit = (parent: Node, path: readonly number[], contentStart: number): DocumentPoint => {
    if (position === contentStart + parent.nodeSize - 2) {
      const last = parent.content.at(-1);
      return last?.isText ? text([...path, parent.childCount - 1], last.nodeSize) : boundary(path, parent.childCount);
    }
    let before = contentStart;
    for (let index = 0; index < parent.childCount; index += 1) {
      const child = parent.child(index), after = before + child.nodeSize;
      if (position === before) {
        const previous = parent.content[index - 1];
        if (association < 0 && previous?.isText) return text([...path, index - 1], previous.nodeSize);
        if (child.isText) {
          if (association > 0 && !child.nodeSize && parent.content[index + 1]?.isText) { before = after; continue; }
          return text([...path, index], 0);
        }
        return previous?.isText ? text([...path, index - 1], previous.nodeSize) : boundary(path, index);
      }
      if (position < after) {
        if (child.isText) return text([...path, index], position - before);
        if (child.type.spec.atom || !child.type.spec.content) {
          throw new RangeError(`Position ${position} is inside an opaque node.`);
        }
        return visit(child, [...path, index], before + 1);
      }
      if (position === after) {
        const next = parent.content[index + 1];
        if (association > 0 && next?.isText) return text([...path, index + 1], 0);
        if (child.isText) return text([...path, index], child.nodeSize);
        return next?.isText ? text([...path, index + 1], 0) : boundary(path, index + 1);
      }
      before = after;
    }
    return boundary(path, parent.childCount);
  };
  return visit(doc, [], 0);
}
