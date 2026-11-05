import type { Node } from '../schema';
import { matchesContentExpression } from '../schema/content-expression';
import { StepMap, textPointToPosition } from './mapping';
import { assertTextRange, comparePaths } from './path';

// Provenance is structural units, not a second text buffer. An unchanged subtree
// needs one run regardless of its size. New balancing tokens have no old origin.
interface Run { readonly from: number | null; readonly size: number }
interface Part {
  readonly node: Node;
  readonly before: number;
  readonly root: boolean;
  readonly open: number | null;
  readonly close: number | null;
  readonly runs: readonly Run[];
  readonly children?: readonly Part[];
}

function original(node: Node, before: number, root = false): Part {
  return { node, before, root, open: before, close: before + node.nodeSize - 1,
    runs: [{ from: before, size: node.nodeSize - (root ? 2 : 0) }] };
}

function children(part: Part): readonly Part[] {
  if (part.children) return part.children;
  let before = part.before + (part.root ? 0 : 1);
  return part.node.content.map(node => {
    const child = original(node, before);
    before += node.nodeSize;
    return child;
  });
}

function wrap(part: Part, content: readonly Part[], open = part.open, close = part.close): Part {
  return { ...part, node: part.node.copy(content.map(child => child.node)), children: content, open, close,
    runs: [...(part.root ? [] : [{ from: open, size: 1 }]),
      ...content.flatMap(child => child.runs), ...(part.root ? [] : [{ from: close, size: 1 }])] };
}

function fits(part: Part, content: readonly Part[]): boolean {
  const nodes = content.map(child => child.node);
  return matchesContentExpression(nodes, part.node.type.spec.content ?? '')
    && (!part.node.type.spec.validate || part.node.type.spec.validate(part.node.copy(nodes)));
}

function textBlock(part: Part): boolean {
  return part.node.type.isBlock && !part.node.type.spec.atom && Boolean(part.node.type.spec.content)
    && children(part).every(child => child.node.type.isInline)
    && matchesContentExpression([part.node.type.schema.text('')], part.node.type.spec.content!);
}

interface Join { readonly joined: boolean; readonly content: readonly Part[] }

/** Fit only the two cut edges. Unselected right-hand siblings stay outside a
 * left wrapper when that wrapper wasn't also present on their original side. */
function join(left: Part, right: Part): Join {
  const separate = (): Join => ({ joined: false, content: [left, right] });
  const a = children(left), b = children(right);
  if (textBlock(left) && textBlock(right)) {
    const content = [...a, ...b];
    return fits(left, content)
      ? { joined: true, content: [wrap(left, content, left.open, right.close)] } : separate();
  }
  if (left.node.type === right.node.type && a.length && b.length
    && JSON.stringify(left.node.attrs) === JSON.stringify(right.node.attrs)) {
    const edge = join(a.at(-1)!, b[0]!);
    const content = [...a.slice(0, -1), ...edge.content, ...b.slice(1)];
    if (edge.joined && fits(left, content)) {
      return { joined: true, content: [wrap(left, content, left.open, right.close)] };
    }
  }
  if (!textBlock(left) && a.length) {
    const edge = join(a.at(-1)!, right);
    const content = [...a.slice(0, -1), edge.content[0]!];
    if (edge.joined && fits(left, content)) {
      return { joined: true, content: [wrap(left, content), ...edge.content.slice(1)] };
    }
  }
  if (!textBlock(right) && b.length) {
    const edge = join(left, b[0]!);
    const remainder = [...edge.content.slice(1), ...b.slice(1)];
    if (edge.joined && (!remainder.length || fits(right, remainder))) {
      return { joined: true, content: [edge.content[0]!, ...(remainder.length ? [wrap(right, remainder)] : [])] };
    }
  }
  return separate();
}

function trim(part: Part, path: readonly number[], depth: number, offset: number, text: string, prefix: boolean): Part {
  if (part.node.isText) {
    const value = part.node.text ?? '';
    return { ...part, node: part.node.withText(prefix ? value.slice(0, offset) + text : value.slice(offset)),
      runs: prefix ? [{ from: part.before, size: offset }, { from: null, size: text.length }]
        : [{ from: part.before + offset, size: value.length - offset }] };
  }
  const content = children(part), index = path[depth]!;
  const edge = trim(content[index]!, path, depth + 1, offset, text, prefix);
  return prefix ? wrap(part, [...content.slice(0, index), edge], part.open, null)
    : wrap(part, [edge, ...content.slice(index + 1)], null, part.close);
}

const gridMembers = new Set(['table_row', 'table_cell', 'table_header']);

function boundaryRequiresStructure(doc: Node, path: readonly number[], common: number): boolean {
  let node = doc;
  for (let depth = 0; depth < path.length - 1; depth += 1) {
    node = node.child(path[depth]!);
    if (depth >= common && (node.type.isInline || node.type.spec.atom
      || node.type.name === 'table' || gridMembers.has(node.type.name))) return true;
  }
  return false;
}

function mapping(runs: readonly Run[], oldSize: number): StepMap {
  const ranges: number[] = [];
  let oldPosition = 0, inserted = 0;
  for (const run of runs) {
    if (!run.size) continue;
    if (run.from === null) { inserted += run.size; continue; }
    if (run.from < oldPosition) throw new Error('Range replacement reordered retained document units.');
    if (run.from > oldPosition || inserted) ranges.push(oldPosition, run.from - oldPosition, inserted);
    oldPosition = run.from + run.size;
    inserted = 0;
  }
  if (oldPosition < oldSize || inserted) ranges.push(oldPosition, oldSize - oldPosition, inserted);
  return new StepMap(ranges);
}

/** Replace cut block edges while retaining the origins of all surviving units.
 * Inline containers and partial grids retain their structure rather than being
 * flattened into an unrelated paragraph. This is not an arbitrary open slice. */
export function replaceNestedTextRange(
  doc: Node, startPath: readonly number[], from: number, endPath: readonly number[], to: number, text: string,
): { document: Node; map: StepMap } {
  const start = textPointToPosition(doc, startPath, from), end = textPointToPosition(doc, endPath, to);
  if (comparePaths(startPath, endPath) >= 0 || start > end) throw new Error('Text ranges must be ordered from start to end.');
  let common = 0;
  while (startPath[common] === endPath[common]) common += 1;
  const keepStructure = boundaryRequiresStructure(doc, startPath, common) || boundaryRequiresStructure(doc, endPath, common);

  const retaining = (part: Part, path: readonly number[]): Part => {
    const node = part.node;
    if (node.isText) {
      const isStart = comparePaths(path, startPath) === 0, isEnd = comparePaths(path, endPath) === 0;
      const a = isStart ? from : 0, b = isEnd ? to : node.nodeSize;
      const value = node.text ?? '';
      return { ...part, node: node.withText(value.slice(0, a) + (isStart ? text : '') + value.slice(b)),
        runs: [{ from: part.before, size: a }, { from: null, size: isStart ? text.length : 0 },
          { from: part.before + b, size: node.nodeSize - b }] };
    }
    const all = children(part);
    const changed = all.map((child, index) => {
      const childPath = [...path, index];
      const boundary = [startPath, endPath].some(endpoint => childPath.every((part, depth) => endpoint[depth] === part));
      return !boundary && (child.before + child.node.nodeSize <= start || child.before >= end)
        ? child : retaining(child, childPath);
    });
    const candidate = changed.filter((child, index) => {
      const previous = all[index]!;
      const insertion = [...path, index].every((part, depth) => startPath[depth] === part);
      return insertion || previous.before < start || previous.before + previous.node.nodeSize > end || gridMembers.has(child.node.type.name);
    });
    return wrap(part, fits(part, candidate) ? candidate : changed);
  };

  const visit = (part: Part, path: readonly number[]): Part => {
    const content = children(part), depth = path.length;
    if (depth < common) {
      const index = startPath[depth]!;
      return wrap(part, content.map((child, i) => i === index ? visit(child, [...path, i]) : child));
    }
    if (keepStructure) return retaining(part, path);
    const leftIndex = startPath[depth]!, rightIndex = endPath[depth]!;
    const left = trim(content[leftIndex]!, startPath, depth + 1, from, text, true);
    const right = trim(content[rightIndex]!, endPath, depth + 1, to, '', false);
    const edge = join(left, right);
    const result = [...content.slice(0, leftIndex), ...edge.content, ...content.slice(rightIndex + 1)];
    return fits(part, result) ? wrap(part, result) : retaining(part, path);
  };
  // Resolve/validate both leaves before constructing any candidate.
  let a = doc, b = doc;
  startPath.forEach(index => { a = a.child(index); });
  endPath.forEach(index => { b = b.child(index); });
  assertTextRange(a, from, a.nodeSize);
  assertTextRange(b, 0, to);
  let result = visit(original(doc, 0, true), []);
  try { doc.type.schema.validate(result.node); }
  catch {
    // A custom ancestor can require siblings removed by a cut edge. Preserve
    // its required shape instead of returning an invalid fitted subtree.
    result = retaining(original(doc, 0, true), []);
    doc.type.schema.validate(result.node);
  }
  return { document: result.node, map: mapping(result.runs, doc.nodeSize - 2) };
}
