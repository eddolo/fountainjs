import { Selection } from '../selection';
import { Node } from '../schema';
import { getNodeAtPath } from './path';

export type MapAssociation = -1 | 1;

export interface MapResult {
  readonly position: number;
  readonly deleted: boolean;
  readonly deletedBefore: boolean;
  readonly deletedAfter: boolean;
  readonly deletedAcross: boolean;
}

export interface TextPoint {
  readonly path: readonly number[];
  readonly offset: number;
}

export interface NodeRange {
  readonly from: number;
  readonly to: number;
}

interface TextLeafPosition extends TextPoint {
  readonly from: number;
  readonly to: number;
}

function validatePosition(position: number): void {
  if (!Number.isInteger(position) || position < 0) throw new RangeError(`Invalid document position: ${position}.`);
}

/**
 * Describes positional changes as repeating `start, oldSize, newSize` triples.
 * Positions use the same structural units as `Node.nodeSize`: text characters
 * occupy one unit and non-root nodes contribute opening and closing units.
 */
export class StepMap {
  static readonly empty = new StepMap([]);
  readonly ranges: readonly number[];

  constructor(ranges: readonly number[]) {
    if (ranges.length % 3 !== 0) throw new RangeError('StepMap ranges must contain start, oldSize, and newSize triples.');
    let previousEnd = -1;
    for (let index = 0; index < ranges.length; index += 3) {
      const start = ranges[index] as number;
      const oldSize = ranges[index + 1] as number;
      const newSize = ranges[index + 2] as number;
      if (![start, oldSize, newSize].every((value) => Number.isInteger(value) && value >= 0)) {
        throw new RangeError('StepMap ranges must contain non-negative integers.');
      }
      if (start < previousEnd) throw new RangeError('StepMap ranges must be ordered and non-overlapping.');
      previousEnd = start + oldSize;
    }
    this.ranges = Object.freeze([...ranges]);
  }

  map(position: number, association: MapAssociation = 1): number {
    return this.mapResult(position, association).position;
  }

  mapResult(position: number, association: MapAssociation = 1): MapResult {
    validatePosition(position);
    let offset = 0;
    for (let index = 0; index < this.ranges.length; index += 3) {
      const start = this.ranges[index] as number;
      const oldSize = this.ranges[index + 1] as number;
      const newSize = this.ranges[index + 2] as number;
      const end = start + oldSize;
      if (position < start) break;
      if (position <= end) {
        const side = oldSize === 0
          ? association
          : position === start
            ? -1
            : position === end
              ? 1
              : association;
        return {
          position: start + offset + (side < 0 ? 0 : newSize),
          deleted: position > start && position < end,
          deletedBefore: position > start,
          deletedAfter: position < end,
          deletedAcross: position > start && position < end,
        };
      }
      offset += newSize - oldSize;
    }
    return {
      position: position + offset,
      deleted: false,
      deletedBefore: false,
      deletedAfter: false,
      deletedAcross: false,
    };
  }

  invert(): StepMap {
    const inverse: number[] = [];
    let offset = 0;
    for (let index = 0; index < this.ranges.length; index += 3) {
      const start = this.ranges[index] as number;
      const oldSize = this.ranges[index + 1] as number;
      const newSize = this.ranges[index + 2] as number;
      inverse.push(start + offset, newSize, oldSize);
      offset += newSize - oldSize;
    }
    return new StepMap(inverse);
  }
}

/** Maps positions through a sequence of document-changing steps. */
export class Mapping {
  private readonly mutableMaps: StepMap[] = [];

  constructor(maps: readonly StepMap[] = []) {
    this.mutableMaps.push(...maps);
  }

  get maps(): readonly StepMap[] { return this.mutableMaps; }

  appendMap(map: StepMap): this {
    this.mutableMaps.push(map);
    return this;
  }

  map(position: number, association: MapAssociation = 1): number {
    return this.mutableMaps.reduce((mapped, stepMap) => stepMap.map(mapped, association), position);
  }

  mapResult(position: number, association: MapAssociation = 1): MapResult {
    let mapped = position;
    let deletedBefore = false;
    let deletedAfter = false;
    let deletedAcross = false;
    for (const stepMap of this.mutableMaps) {
      const result = stepMap.mapResult(mapped, association);
      mapped = result.position;
      deletedBefore ||= result.deletedBefore;
      deletedAfter ||= result.deletedAfter;
      deletedAcross ||= result.deletedAcross;
    }
    return {
      position: mapped,
      deleted: deletedAcross || (deletedBefore && deletedAfter),
      deletedBefore,
      deletedAfter,
      deletedAcross,
    };
  }
}

/** Converts a path/offset text point into a structural document position. */
export function textPointToPosition(doc: Node, path: readonly number[], offset: number): number {
  const target = getNodeAtPath(doc, path);
  if (!target.isText) throw new Error('Text positions must resolve to text nodes.');
  const length = target.text?.length ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > length) throw new RangeError(`Invalid text offset ${offset}.`);

  let node = doc;
  let position = 0;
  for (let depth = 0; depth < path.length; depth += 1) {
    const index = path[depth] as number;
    for (let sibling = 0; sibling < index; sibling += 1) position += node.child(sibling).nodeSize;
    node = node.child(index);
    if (depth < path.length - 1) {
      if (node.isText) throw new Error('A text node cannot contain a selection descendant.');
      position += 1;
    }
  }
  return position + offset;
}

/** Returns the structural range occupied by a node at `path`. */
export function nodeRangeAtPath(doc: Node, path: readonly number[]): NodeRange {
  if (!path.length) return { from: 0, to: Math.max(0, doc.nodeSize - 2) };
  let node = doc;
  let position = 0;
  for (let depth = 0; depth < path.length; depth += 1) {
    const index = path[depth] as number;
    for (let sibling = 0; sibling < index; sibling += 1) position += node.child(sibling).nodeSize;
    node = node.child(index);
    if (depth < path.length - 1) {
      if (node.isText) throw new Error('A text node cannot contain a descendant node.');
      position += 1;
    }
  }
  return { from: position, to: position + node.nodeSize };
}

/** Returns the position before a top-level child, including the end position. */
export function topLevelPosition(doc: Node, childIndex: number): number {
  if (!Number.isInteger(childIndex) || childIndex < 0 || childIndex > doc.childCount) {
    throw new RangeError(`Invalid top-level child index: ${childIndex}.`);
  }
  return doc.content.slice(0, childIndex).reduce((position, child) => position + child.nodeSize, 0);
}

function textLeafPositions(doc: Node): readonly TextLeafPosition[] {
  const leaves: TextLeafPosition[] = [];
  const visit = (node: Node, path: readonly number[], before: number, root = false): void => {
    if (node.isText) {
      leaves.push({ path: Object.freeze([...path]), offset: 0, from: before, to: before + (node.text?.length ?? 0) });
      return;
    }
    let position = before + (root ? 0 : 1);
    node.content.forEach((child, index) => {
      visit(child, [...path, index], position);
      position += child.nodeSize;
    });
  };
  visit(doc, [], 0, true);
  return leaves;
}

/** Resolves a structural position to the nearest editable text point. */
export function positionToTextPoint(doc: Node, position: number, association: MapAssociation = 1): TextPoint {
  validatePosition(position);
  const leaves = textLeafPositions(doc);
  if (!leaves.length) throw new Error('The document does not contain an editable text position.');

  const inside = leaves.find((leaf) => position > leaf.from && position < leaf.to);
  if (inside) return { path: inside.path, offset: position - inside.from };

  if (association < 0) {
    const previous = [...leaves].reverse().find((leaf) => leaf.to <= position) ?? leaves[0] as TextLeafPosition;
    return { path: previous.path, offset: Math.max(0, Math.min(position - previous.from, previous.to - previous.from)) };
  }
  const next = leaves.find((leaf) => leaf.from >= position) ?? leaves.at(-1) as TextLeafPosition;
  return { path: next.path, offset: Math.max(0, Math.min(position - next.from, next.to - next.from)) };
}

/** Maps a text selection from one document version into the next. */
export function mapSelection(selection: Selection, before: Node, after: Node, map: StepMap): Selection {
  const start = textPointToPosition(before, selection.path, selection.from);
  if (selection.isCollapsed) {
    const mapped = positionToTextPoint(after, map.map(start, 1), 1);
    return Selection.cursor(mapped.path, mapped.offset);
  }
  const end = textPointToPosition(before, selection.endPath, selection.to);
  const startPosition = map.map(start, 1);
  const endPosition = map.map(end, -1);
  if (startPosition >= endPosition) {
    const mapped = positionToTextPoint(after, startPosition, 1);
    return Selection.cursor(mapped.path, mapped.offset);
  }
  const mappedStart = positionToTextPoint(after, startPosition, 1);
  const mappedEnd = positionToTextPoint(after, endPosition, -1);
  return Selection.range(mappedStart.path, mappedStart.offset, mappedEnd.path, mappedEnd.offset);
}
