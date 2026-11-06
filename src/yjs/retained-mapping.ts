import type { Node } from '../core/schema';
import type { Mapping, StepMap } from '../core/transaction/mapping';

interface Span { readonly before: number; readonly after: number; readonly length: number }
export interface TextSlice { readonly path: readonly number[]; readonly from: number; readonly to: number }
export interface RetainedTextSlice {
  readonly before: TextSlice;
  readonly after: TextSlice;
}
export interface RetainedTextPlan {
  readonly retained: readonly RetainedTextSlice[];
  readonly removed: readonly TextSlice[];
  readonly inserted: readonly TextSlice[];
}
export interface RetainedNodeStart { readonly before: readonly number[]; readonly after: readonly number[] }
interface Leaf { readonly node: Node; readonly path: readonly number[]; readonly position: number }

function leaves(document: Node): readonly Leaf[] {
  const result: Leaf[] = [];
  const visit = (node: Node, path: readonly number[], position: number, root = false): void => {
    if (node.isText) { if (node.nodeSize) result.push({ node, path: Object.freeze([...path]), position }); return; }
    let next = root ? position : position + 1;
    node.content.forEach((child, index) => { visit(child, [...path, index], next); next += child.nodeSize; });
  };
  visit(document, [], 0, true);
  return result;
}

function retainedUnits(size: number, maps: readonly StepMap[]): { readonly spans: readonly Span[]; readonly size: number } {
  let spans: Span[] = size ? [{ before: 0, after: 0, length: size }] : [];
  for (const map of maps) {
    const unchanged: Span[] = [];
    let old = 0, next = 0;
    for (let index = 0; index < map.ranges.length; index += 3) {
      const start = map.ranges[index]!, removed = map.ranges[index + 1]!, inserted = map.ranges[index + 2]!;
      if (start + removed > size) throw new RangeError('Retained mapping exceeds its source document.');
      if (start > old) unchanged.push({ before: old, after: next, length: start - old });
      next += start - old + inserted; old = start + removed;
    }
    if (old < size) unchanged.push({ before: old, after: next, length: size - old });
    const updated: Span[] = [];
    let index = 0;
    for (const span of spans) {
      while (index < unchanged.length && unchanged[index]!.before + unchanged[index]!.length <= span.after) index++;
      for (let at = index; at < unchanged.length && unchanged[at]!.before < span.after + span.length; at++) {
        const segment = unchanged[at]!, from = Math.max(span.after, segment.before), to = Math.min(span.after + span.length, segment.before + segment.length);
        if (from < to) updated.push({ before: span.before + from - span.after, after: segment.after + from - segment.before, length: to - from });
      }
    }
    spans = updated; size = next + size - old;
  }
  return { spans, size };
}

function gaps(all: readonly Leaf[], retained: readonly TextSlice[]): readonly TextSlice[] {
  const byPath = new Map<string, TextSlice[]>();
  for (const slice of retained) {
    const key = slice.path.join('.'), slices = byPath.get(key) ?? [];
    slices.push(slice); byPath.set(key, slices);
  }
  const result: TextSlice[] = [];
  for (const leaf of all) {
    let position = 0;
    for (const slice of byPath.get(leaf.path.join('.')) ?? []) {
      if (slice.from < position) throw new Error('Retained text slices overlap.');
      if (slice.from > position) result.push({ path: leaf.path, from: position, to: slice.from });
      position = slice.to;
    }
    if (position < leaf.node.nodeSize) result.push({ path: leaf.path, from: position, to: leaf.node.nodeSize });
  }
  return result;
}

/** Retain container identity only where its opening unit is actually retained. */
export function planRetainedNodeStarts(before: Node, after: Node, mapping: Mapping): readonly RetainedNodeStart[] {
  const collect = (document: Node) => {
    const result: { path: readonly number[]; position: number }[] = [];
    const visit = (node: Node, path: readonly number[], position: number, root = false): void => {
      if (node.isText) return;
      if (!root) result.push({ path, position });
      let next = root ? 0 : position + 1;
      node.content.forEach((child, index) => { visit(child, [...path, index], next); next += child.nodeSize; });
    };
    visit(document, [], 0, true); return result;
  };
  const next = new Map(collect(after).map(entry => [entry.position, entry.path]));
  const { spans, size } = retainedUnits(before.nodeSize - 2, mapping.maps), result: RetainedNodeStart[] = [];
  if (size !== after.nodeSize - 2) throw new Error('Transaction maps do not describe the target document size.');
  let index = 0;
  for (const entry of collect(before)) {
    while (index < spans.length && spans[index]!.before + spans[index]!.length <= entry.position) index++;
    const span = spans[index];
    if (!span || entry.position < span.before) continue;
    const path = next.get(span.after + entry.position - span.before);
    if (path) result.push({ before: entry.path, after: path });
  }
  return result;
}

/** Derive character provenance from exact transaction maps or unambiguous
 * unchanged text-node identity, never equal-content matching.
 * The adapter can use these slices to retain shared text through new model
 * paths, mark-leaf splits and structural boundaries. No document roots are cached. */
export function planRetainedText(before: Node, after: Node, mapping: Mapping, retainReusedNodes = false): RetainedTextPlan {
  const oldLeaves = leaves(before), newLeaves = leaves(after), retained: RetainedTextSlice[] = [];
  const { spans, size } = retainedUnits(before.nodeSize - 2, mapping.maps);
  if (size !== after.nodeSize - 2) throw new Error('Transaction maps do not describe the target document size.');
  let oldIndex = 0, newIndex = 0;
  for (const span of spans) {
    while (oldIndex < oldLeaves.length && oldLeaves[oldIndex]!.position + oldLeaves[oldIndex]!.node.nodeSize <= span.before) oldIndex++;
    for (let index = oldIndex; index < oldLeaves.length && oldLeaves[index]!.position < span.before + span.length; index++) {
      const source = oldLeaves[index]!, from = Math.max(span.before, source.position), to = Math.min(span.before + span.length, source.position + source.node.nodeSize);
      const start = span.after + from - span.before, end = start + to - from;
      let covered = 0;
      while (newIndex < newLeaves.length && newLeaves[newIndex]!.position + newLeaves[newIndex]!.node.nodeSize <= start) newIndex++;
      for (let targetIndex = newIndex; targetIndex < newLeaves.length && newLeaves[targetIndex]!.position < end; targetIndex++) {
        const target = newLeaves[targetIndex]!, left = Math.max(start, target.position), right = Math.min(end, target.position + target.node.nodeSize);
        if (left >= right) continue;
        const oldFrom = from + left - start - source.position, newFrom = left - target.position, length = right - left;
        if (source.node.text!.slice(oldFrom, oldFrom + length) !== target.node.text!.slice(newFrom, newFrom + length)) {
          throw new Error('Transaction maps claim changed text was retained.');
        }
        retained.push({ before: { path: source.path, from: oldFrom, to: oldFrom + length },
          after: { path: target.path, from: newFrom, to: newFrom + length } });
        covered += length;
      }
      if (covered !== to - from) throw new Error('Transaction maps move retained text into a structural token.');
    }
  }
  // Whole-node moves can use a root replacement map while explicitly reusing
  // immutable nodes. Keep their characters only when both occurrences are
  // unique and neither side is already owned by a map-derived slice.
  if (retainReusedNodes) {
    const unique = (all: readonly Leaf[]) => {
      const result = new Map<Node, Leaf | null>();
      for (const leaf of all) result.set(leaf.node, result.has(leaf.node) ? null : leaf);
      return result;
    };
    const previous = unique(oldLeaves), next = unique(newLeaves);
    const sourceOwned = new Set(retained.map(slice => slice.before.path.join('.'))), targetOwned = new Set(retained.map(slice => slice.after.path.join('.')));
    for (const [node, source] of previous) {
      const target = next.get(node);
      if (!source || !target || sourceOwned.has(source.path.join('.')) || targetOwned.has(target.path.join('.'))) continue;
      retained.push({ before: { path: source.path, from: 0, to: node.nodeSize }, after: { path: target.path, from: 0, to: node.nodeSize } });
    }
  }
  return { retained, removed: gaps(oldLeaves, retained.map(slice => slice.before)), inserted: gaps(newLeaves, retained.map(slice => slice.after)) };
}
