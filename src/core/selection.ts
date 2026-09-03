import type { Node } from './schema';
import { TableMap } from './table-map';
import { comparePaths, getNodeAtPath, getTextLeaves } from './transaction/path';

export type SelectionKind = 'text' | 'node' | 'gap' | 'all' | 'cell';
export type SelectionAssociation = -1 | 1;

interface TextPoint {
  readonly path: readonly number[];
  readonly offset: number;
}

interface PositionedTextPoint extends TextPoint {
  readonly from: number;
  readonly to: number;
}

function validatePath(path: readonly number[]): void {
  if (!path.every((part) => Number.isInteger(part) && part >= 0)) {
    throw new RangeError('Selection paths must contain non-negative integers.');
  }
}

function validateOffset(offset: number): void {
  if (!Number.isInteger(offset) || offset < 0) throw new RangeError('Invalid selection range.');
}

function textLeafPositions(doc: Node): readonly PositionedTextPoint[] {
  const leaves: PositionedTextPoint[] = [];
  const visit = (node: Node, path: readonly number[], before: number, root = false): void => {
    if (node.isText) {
      leaves.push({
        path: Object.freeze([...path]),
        offset: 0,
        from: before,
        to: before + (node.text?.length ?? 0),
      });
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

function nearestTextPoint(doc: Node, position: number, association: SelectionAssociation = 1): TextPoint {
  const leaves = textLeafPositions(doc);
  if (!leaves.length) return { path: Object.freeze([]), offset: 0 };
  const inside = leaves.find((leaf) => position > leaf.from && position < leaf.to);
  if (inside) return { path: inside.path, offset: position - inside.from };
  if (association < 0) {
    const previous = [...leaves].reverse().find((leaf) => leaf.to <= position) ?? leaves[0] as PositionedTextPoint;
    return { path: previous.path, offset: Math.max(0, Math.min(position - previous.from, previous.to - previous.from)) };
  }
  const next = leaves.find((leaf) => leaf.from >= position) ?? leaves.at(-1) as PositionedTextPoint;
  return { path: next.path, offset: Math.max(0, Math.min(position - next.from, next.to - next.from)) };
}

function structuralRangeAtPath(doc: Node, path: readonly number[]): { from: number; to: number } {
  validatePath(path);
  if (!path.length) return { from: 0, to: Math.max(0, doc.nodeSize - 2) };
  let node = doc;
  let position = 0;
  for (let depth = 0; depth < path.length; depth += 1) {
    const index = path[depth] as number;
    for (let sibling = 0; sibling < index; sibling += 1) position += node.child(sibling).nodeSize;
    node = node.child(index);
    if (depth < path.length - 1) position += 1;
  }
  return { from: position, to: position + node.nodeSize };
}

function structuralGapAtPosition(doc: Node, target: number): { parentPath: readonly number[]; index: number } | null {
  let found: { parentPath: readonly number[]; index: number } | null = null;
  const record = (node: Node, path: readonly number[], index: number): void => {
    const before = node.content[index - 1];
    const after = node.content[index];
    if ((!before && !after) || before?.type.isInline || after?.type.isInline) return;
    found = { parentPath: Object.freeze([...path]), index };
  };
  const visit = (node: Node, path: readonly number[], before: number, root = false): void => {
    if (node.isText) return;
    let position = before + (root ? 0 : 1);
    node.content.forEach((child, index) => {
      if (position === target) record(node, path, index);
      visit(child, [...path, index], position);
      position += child.nodeSize;
    });
    if (position === target) record(node, path, node.childCount);
  };
  visit(doc, [], 0, true);
  return found;
}

function projectionForNode(doc: Node, nodePath: readonly number[]): { start: TextPoint; end: TextPoint } {
  const node = getNodeAtPath(doc, nodePath);
  const leaves = getTextLeaves(node);
  if (leaves.length) {
    const first = leaves[0] as (typeof leaves)[number];
    const last = leaves.at(-1) as (typeof leaves)[number];
    return {
      start: { path: Object.freeze([...nodePath, ...first.path]), offset: 0 },
      end: { path: Object.freeze([...nodePath, ...last.path]), offset: last.node.text?.length ?? 0 },
    };
  }
  const range = structuralRangeAtPath(doc, nodePath);
  const point = nearestTextPoint(doc, range.from, 1);
  return { start: point, end: point };
}

/** Common immutable selection state. `path`/offset fields are a text projection. */
export abstract class BaseSelection {
  abstract readonly kind: SelectionKind;
  readonly path: readonly number[];
  readonly endPath: readonly number[];
  readonly from: number;
  readonly to: number;

  protected constructor(path: readonly number[], from: number, to: number, endPath: readonly number[]) {
    validatePath(path);
    validatePath(endPath);
    validateOffset(from);
    validateOffset(to);
    const order = comparePaths(path, endPath);
    if (order > 0 || (order === 0 && to < from)) {
      throw new RangeError('Selection ranges must be ordered from start to end.');
    }
    this.path = Object.freeze([...path]);
    this.endPath = Object.freeze([...endPath]);
    this.from = from;
    this.to = to;
  }

  get isSingleText(): boolean { return false; }
  get isCollapsed(): boolean { return false; }

  protected projectionEq(other: BaseSelection): boolean {
    return this.from === other.from && this.to === other.to
      && comparePaths(this.path, other.path) === 0
      && comparePaths(this.endPath, other.endPath) === 0;
  }

  abstract eq(other: BaseSelection): boolean;
}

/** A caret or ordered range inside editable text. Kept as `Selection` for API compatibility. */
export class Selection extends BaseSelection {
  readonly kind = 'text' as const;

  constructor(path: readonly number[], from: number, to: number = from, endPath: readonly number[] = path) {
    super(path, from, to, endPath);
  }

  static cursor(path: readonly number[], offset: number): Selection {
    return new Selection(path, offset, offset);
  }

  static createCursor(path: readonly number[], offset: number): Selection {
    return Selection.cursor(path, offset);
  }

  static range(startPath: readonly number[], from: number, endPath: readonly number[], to: number): Selection {
    return new Selection(startPath, from, to, endPath);
  }

  override get isSingleText(): boolean { return comparePaths(this.path, this.endPath) === 0; }
  override get isCollapsed(): boolean { return this.isSingleText && this.from === this.to; }

  eq(other: BaseSelection): boolean {
    return other.kind === 'text' && this.projectionEq(other);
  }
}

/** Selects one complete non-root document node while retaining a text projection. */
export class NodeSelection extends BaseSelection {
  readonly kind = 'node' as const;
  readonly nodePath: readonly number[];
  readonly nodeType: string;
  readonly structuralFrom: number;
  readonly structuralTo: number;

  constructor(doc: Node, nodePath: readonly number[]) {
    if (!nodePath.length) throw new RangeError('Use AllSelection for the root document.');
    const node = getNodeAtPath(doc, nodePath);
    if (node.isText) throw new Error('Node selections cannot target text nodes; use Selection instead.');
    const projection = projectionForNode(doc, nodePath);
    super(projection.start.path, projection.start.offset, projection.end.offset, projection.end.path);
    const range = structuralRangeAtPath(doc, nodePath);
    this.nodePath = Object.freeze([...nodePath]);
    this.nodeType = node.type.name;
    this.structuralFrom = range.from;
    this.structuralTo = range.to;
  }

  eq(other: BaseSelection): boolean {
    return other instanceof NodeSelection
      && comparePaths(this.nodePath, other.nodePath) === 0
      && this.nodeType === other.nodeType;
  }
}

/** Selects a structural insertion point between document nodes. */
export class GapSelection extends BaseSelection {
  readonly kind = 'gap' as const;
  readonly parentPath: readonly number[];
  readonly index: number;

  constructor(
    doc: Node,
    public readonly position: number,
    public readonly association: SelectionAssociation = 1,
  ) {
    const maximum = Math.max(0, doc.nodeSize - 2);
    if (!Number.isInteger(position) || position < 0 || position > maximum) {
      throw new RangeError(`Invalid gap selection position: ${position}.`);
    }
    const point = nearestTextPoint(doc, position, association);
    super(point.path, point.offset, point.offset, point.path);
    const gap = structuralGapAtPosition(doc, position);
    if (!gap) throw new Error(`Position ${position} is not a structural gap.`);
    this.parentPath = gap.parentPath;
    this.index = gap.index;
  }

  override get isCollapsed(): boolean { return true; }

  eq(other: BaseSelection): boolean {
    return other instanceof GapSelection
      && this.position === other.position
      && this.association === other.association;
  }
}

/** Selects the complete document. */
export class AllSelection extends BaseSelection {
  readonly kind = 'all' as const;

  constructor(doc: Node) {
    const leaves = getTextLeaves(doc);
    const first = leaves[0];
    const last = leaves.at(-1);
    const start = first ? { path: first.path, offset: 0 } : nearestTextPoint(doc, 0);
    const end = last ? { path: last.path, offset: last.node.text?.length ?? 0 } : start;
    super(start.path, start.offset, end.offset, end.path);
  }

  eq(other: BaseSelection): boolean { return other instanceof AllSelection; }
}

interface CellSelectionData {
  readonly paths: readonly (readonly number[])[];
  readonly start: TextPoint;
  readonly end: TextPoint;
  readonly rowFrom: number;
  readonly rowTo: number;
  readonly columnFrom: number;
  readonly columnTo: number;
}

function cellSelectionData(doc: Node, anchorPath: readonly number[], headPath: readonly number[]): CellSelectionData {
  const anchor = getNodeAtPath(doc, anchorPath);
  const head = getNodeAtPath(doc, headPath);
  const cellNames = new Set(['table_cell', 'table_header']);
  if (!cellNames.has(anchor.type.name) || !cellNames.has(head.type.name)) {
    throw new Error('Cell selections require table_cell or table_header paths.');
  }
  if (anchorPath.length < 3 || headPath.length !== anchorPath.length) {
    throw new Error('Cell selections require cells in one table.');
  }
  const tablePath = anchorPath.slice(0, -2);
  if (comparePaths(tablePath, headPath.slice(0, -2)) !== 0) {
    throw new Error('Cell selections cannot cross tables.');
  }
  const table = getNodeAtPath(doc, tablePath);
  if (table.type.name !== 'table') throw new Error('Cell selections require a table ancestor.');
  const map = TableMap.create(table, tablePath);
  const rect = map.rectangleBetween(anchorPath, headPath);
  const paths = map.cellsInRect(rect).map((cell) => cell.path);
  if (!paths.length) throw new Error('Cell selection rectangle is empty.');
  const firstProjection = projectionForNode(doc, paths[0] as readonly number[]);
  const lastProjection = projectionForNode(doc, paths.at(-1) as readonly number[]);
  return {
    paths: Object.freeze(paths.map((path) => Object.freeze(path))),
    start: firstProjection.start,
    end: lastProjection.end,
    ...rect,
  };
}

/** Selects a rectangular group of cells in one table. */
export class CellSelection extends BaseSelection {
  readonly kind = 'cell' as const;
  readonly anchorCellPath: readonly number[];
  readonly headCellPath: readonly number[];
  readonly cellPaths: readonly (readonly number[])[];
  readonly rowFrom: number;
  readonly rowTo: number;
  readonly columnFrom: number;
  readonly columnTo: number;

  constructor(doc: Node, anchorCellPath: readonly number[], headCellPath: readonly number[] = anchorCellPath) {
    const data = cellSelectionData(doc, anchorCellPath, headCellPath);
    super(data.start.path, data.start.offset, data.end.offset, data.end.path);
    this.anchorCellPath = Object.freeze([...anchorCellPath]);
    this.headCellPath = Object.freeze([...headCellPath]);
    this.cellPaths = data.paths;
    this.rowFrom = data.rowFrom;
    this.rowTo = data.rowTo;
    this.columnFrom = data.columnFrom;
    this.columnTo = data.columnTo;
  }

  eq(other: BaseSelection): boolean {
    return other instanceof CellSelection
      && comparePaths(this.anchorCellPath, other.anchorCellPath) === 0
      && comparePaths(this.headCellPath, other.headCellPath) === 0;
  }
}

export type AnySelection = Selection | NodeSelection | GapSelection | AllSelection | CellSelection;

export function isTextSelection(selection: BaseSelection): selection is Selection {
  return selection.kind === 'text';
}
