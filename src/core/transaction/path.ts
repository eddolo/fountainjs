import { Node } from '../schema';

export interface TextRangeSegment {
  readonly node: Node;
  readonly path: readonly number[];
  readonly from: number;
  readonly to: number;
}

export interface TextLeaf {
  readonly node: Node;
  readonly path: readonly number[];
}

export function comparePaths(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return (left[index] as number) - (right[index] as number);
  }
  return left.length - right.length;
}

export function getNodeAtPath(doc: Node, path: readonly number[]): Node {
  let node = doc;
  for (const index of path) node = node.child(index);
  return node;
}

export function replaceNodeAtPath(doc: Node, path: readonly number[], replacement: Node): Node {
  if (path.length === 0) return replacement;
  const [index, ...rest] = path;
  const content = [...doc.content];
  content[index] = replaceNodeAtPath(doc.child(index), rest, replacement);
  return doc.copy(content);
}

export function replaceNodeWithNodes(doc: Node, path: readonly number[], replacements: readonly Node[]): Node {
  if (path.length === 0) throw new Error('Cannot replace the root node with multiple nodes.');
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  const parent = getNodeAtPath(doc, parentPath);
  const content = [...parent.content.slice(0, index), ...replacements, ...parent.content.slice(index + 1)];
  return replaceNodeAtPath(doc, parentPath, parent.copy(content));
}

export function assertTextRange(node: Node, from: number, to: number): void {
  if (!node.isText) throw new Error('The target node is not text.');
  const length = node.text?.length ?? 0;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > length) {
    throw new RangeError(`Invalid text range ${from}..${to} for a ${length}-character node.`);
  }
}

export function getTextLeaves(doc: Node): readonly TextLeaf[] {
  const leaves: TextLeaf[] = [];
  doc.descendants((node, path) => {
    if (node.isText) leaves.push({ node, path: Object.freeze([...path]) });
  });
  return leaves;
}

/** Resolves an ordered model range into every text fragment it intersects. */
export function getTextRangeSegments(
  doc: Node,
  startPath: readonly number[],
  from: number,
  endPath: readonly number[],
  to: number,
): readonly TextRangeSegment[] {
  const start = getNodeAtPath(doc, startPath);
  const end = getNodeAtPath(doc, endPath);
  assertTextRange(start, from, start.text?.length ?? 0);
  assertTextRange(end, 0, to);
  if (comparePaths(startPath, endPath) > 0) throw new Error('Text ranges must be ordered from start to end.');
  if (comparePaths(startPath, endPath) === 0) {
    assertTextRange(start, from, to);
    return [{ node: start, path: Object.freeze([...startPath]), from, to }];
  }

  const leaves = getTextLeaves(doc);
  const startIndex = leaves.findIndex((entry) => comparePaths(entry.path, startPath) === 0);
  const endIndex = leaves.findIndex((entry) => comparePaths(entry.path, endPath) === 0);
  if (startIndex < 0 || endIndex < startIndex) throw new Error('Text range paths do not resolve in document order.');

  return leaves.slice(startIndex, endIndex + 1).map((entry, index, selected) => ({
    node: entry.node,
    path: Object.freeze([...entry.path]),
    from: index === 0 ? from : 0,
    to: index === selected.length - 1 ? to : entry.node.text?.length ?? 0,
  }));
}
