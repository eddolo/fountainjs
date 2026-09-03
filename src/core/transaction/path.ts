import { Node } from '../schema';

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
