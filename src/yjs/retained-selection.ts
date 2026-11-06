import { AllSelection, CellSelection, GapSelection, NodeSelection, RangeSelection, Selection, nodeRangeAtPath,
  resolveDocumentPoint, selectionAtPosition, textPointToPosition, type AnySelection, type Node } from '../core';
import type { RetainedDocumentStore } from './retained-document';

type Neighbor = { type: 'node'; id: string } | { type: 'text'; at: unknown };
type Point = { type: 'text'; at: unknown } | { type: 'boundary'; parent: string; left?: Neighbor; right?: Neighbor; association: -1 | 1 };
export type RetainedSelection = { version: 1 } & (
  { kind: 'text' | 'range' | 'gap'; anchor: Point; head: Point; association: -1 | 1 }
  | { kind: 'node'; id: string } | { kind: 'cell'; anchor: string; head: string } | { kind: 'all' }
);
const nodeAt = (document: Node, path: readonly number[]) => path.reduce((node, index) => node.child(index), document);
const samePath = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((part, index) => part === b[index]);

function anchor(store: RetainedDocumentStore, document: Node, position: number, association: -1 | 1): Point {
  const point = resolveDocumentPoint(document, position, association);
  if (point.kind === 'text') return { type: 'text', at: store.textAnchor(point.path, point.offset, association) };
  const parent = nodeAt(document, point.parentPath), identity = store.identity(point.parentPath);
  if (!identity) throw new Error('Selection has no retained parent.');
  const neighbor = (index: number, end: boolean): Neighbor | undefined => {
    const child = parent.content[index]; if (!child) return undefined;
    const path = [...point.parentPath, index];
    if (child.isText) return { type: 'text', at: store.textAnchor(path, end ? child.nodeSize : 0, end ? -1 : 1) };
    const id = store.identity(path); if (!id) throw new Error('Selection has no retained neighbor.'); return { type: 'node', id };
  };
  return { type: 'boundary', parent: identity, left: neighbor(point.index - 1, true), right: neighbor(point.index, false), association };
}

export function retainSelection(store: RetainedDocumentStore, document: Node, selection: AnySelection): RetainedSelection {
  if (selection.kind === 'all') return { version: 1, kind: 'all' };
  const identity = (path: readonly number[]) => { const id = store.identity(path); if (!id) throw new Error('Selected node has no retained identity.'); return id; };
  if (selection.kind === 'node') return { version: 1, kind: 'node', id: identity(selection.nodePath) };
  if (selection.kind === 'cell') return { version: 1, kind: 'cell', anchor: identity(selection.anchorCellPath), head: identity(selection.headCellPath) };
  const from = selection.kind === 'range' ? selection.anchor : selection.kind === 'gap' ? selection.position : textPointToPosition(document, selection.path, selection.from);
  const to = selection.kind === 'range' ? selection.head : selection.kind === 'gap' ? selection.position : textPointToPosition(document, selection.endPath, selection.to);
  const association = selection.kind === 'gap' ? selection.association : 1;
  const start = anchor(store, document, from, from === to ? association : from < to ? 1 : -1);
  return { version: 1, kind: selection.kind, association, anchor: start, head: from === to ? start : anchor(store, document, to, to < from ? 1 : -1) };
}

function resolve(store: RetainedDocumentStore, document: Node, value: Point): number {
  if (!value || typeof value !== 'object') throw new Error('Invalid retained selection point.');
  if (value.type === 'text') {
    const point = store.resolveTextAnchor(value.at); if (!point) throw new Error('Detached retained text selection.');
    return textPointToPosition(document, point.path, point.offset);
  }
  if (value.type !== 'boundary' || ![-1, 1].includes(value.association)) throw new Error('Invalid retained boundary selection.');
  const parentPath = store.path(value.parent); if (!parentPath) throw new Error('Detached retained selection parent.');
  const parent = nodeAt(document, parentPath), contentStart = parentPath.length ? nodeRangeAtPath(document, parentPath).from + 1 : 0;
  const neighbor = (entry: Neighbor | undefined, end: boolean): number | undefined => {
    if (!entry) return undefined;
    if (entry.type === 'text') {
      const point = store.resolveTextAnchor(entry.at);
      return point && samePath(point.path.slice(0, -1), parentPath) ? textPointToPosition(document, point.path, point.offset) : undefined;
    }
    if (entry.type !== 'node') throw new Error('Invalid retained selection neighbor.');
    const path = store.path(entry.id); if (!path || !samePath(path.slice(0, -1), parentPath)) return undefined;
    const range = nodeRangeAtPath(document, path); return end ? range.to : range.from;
  };
  const left = () => neighbor(value.left, true), right = () => neighbor(value.right, false);
  return value.association < 0 ? left() ?? (value.left ? right() : undefined) ?? contentStart
    : right() ?? (value.right ? left() : undefined) ?? contentStart + parent.content.reduce((sum, child) => sum + child.nodeSize, 0);
}

export function restoreSelection(store: RetainedDocumentStore, document: Node, raw: unknown): AnySelection | undefined {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const value = raw as RetainedSelection; if (value.version !== 1) return undefined;
    if (value.kind === 'all') return new AllSelection(document);
    if (value.kind === 'node') { const path = store.path(value.id); return path ? new NodeSelection(document, path) : undefined; }
    if (value.kind === 'cell') {
      const start = store.path(value.anchor), end = store.path(value.head); return start && end ? new CellSelection(document, start, end) : undefined;
    }
    if (!['text', 'range', 'gap'].includes(value.kind) || ![-1, 1].includes(value.association)) return undefined;
    const from = resolve(store, document, value.anchor), to = resolve(store, document, value.head);
    if (value.kind === 'gap') return new GapSelection(document, from, value.association);
    if (value.kind === 'range') return from === to ? selectionAtPosition(document, from, value.association) : new RangeSelection(document, from, to);
    const first = resolveDocumentPoint(document, Math.min(from, to)), last = resolveDocumentPoint(document, Math.max(from, to));
    return first.kind === 'text' && last.kind === 'text' ? Selection.range(first.path, first.offset, last.path, last.offset)
      : from === to ? selectionAtPosition(document, from, value.association) : new RangeSelection(document, from, to);
  } catch { return undefined; }
}
