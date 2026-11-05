import { Node } from '../schema';
import { childOffset } from '../schema/child-offset';
import { nodeRangeAtPath, StepMap } from './mapping';
import { getNodeAtPath, replaceNodeAtPath } from './path';
import { Step } from './step';

interface Origin { readonly from: number; readonly size: number }

/** Internal reparenting operation. Retained subtrees keep their positions;
 * inserted/removed container tokens have ordinary insertion/deletion maps. */
export class RestructureChildrenStep extends Step {
  readonly parentPath: readonly number[];
  readonly before: readonly Node[];
  readonly content: readonly Node[];
  private readonly maps = new WeakMap<Node, StepMap>();

  constructor(parentPath: readonly number[], readonly from: number, before: readonly Node[], content: readonly Node[]) {
    super();
    this.parentPath = Object.freeze([...parentPath]);
    this.before = Object.freeze([...before]);
    this.content = Object.freeze([...content]);
  }

  private resolve(doc: Node): { parent: Node; content: readonly Node[]; map: StepMap } {
    const parent = getNodeAtPath(doc, this.parentPath), to = this.from + this.before.length;
    if (!Number.isInteger(this.from) || this.from < 0 || to > parent.childCount) throw new RangeError('Invalid child restructuring range.');
    const current = parent.content.slice(this.from, to);
    if (current.some((node, index) => !node.eq(this.before[index]!))) throw new Error('Restructuring source content changed.');

    // Replaying an earlier text/attribute step constructs equal new objects.
    // Rebind retained references to those actual current descendants.
    const versions = new Map<Node, Node[]>(), consumed = new Map<Node, number>();
    const pair = (captured: Node, actual: Node): void => {
      const values = versions.get(captured) ?? []; values.push(actual); versions.set(captured, values);
      captured.content.forEach((child, index) => pair(child, actual.child(index)));
    };
    const needsRebase = current.some((node, index) => node !== this.before[index]);
    if (needsRebase) this.before.forEach((node, index) => pair(node, current[index]!));
    const consume = (node: Node): void => {
      consumed.set(node, (consumed.get(node) ?? 0) + 1);
      node.content.forEach(consume);
    };
    const rebase = (node: Node): Node => {
      const actual = versions.get(node)?.[consumed.get(node) ?? 0];
      if (actual) { consume(node); return actual; }
      if (!node.childCount) return node;
      const children = node.content.map(rebase);
      return children.every((child, index) => child === node.content[index]) ? node : node.copy(children);
    };
    const content = needsRebase ? this.content.map(rebase) : this.content;
    const start = (this.parentPath.length ? nodeRangeAtPath(doc, this.parentPath).from + 1 : 0) + childOffset(parent, this.from);
    const origins = new Map<Node, Origin[]>();
    const index = (node: Node, from: number): void => {
      const entries = origins.get(node) ?? []; entries.push({ from, size: node.nodeSize }); origins.set(node, entries);
      let position = from + 1;
      node.content.forEach(child => { index(child, position); position += child.nodeSize; });
    };
    let end = start;
    current.forEach(node => { index(node, end); end += node.nodeSize; });
    let oldPosition = start, inserted = 0;
    const ranges: number[] = [], originOffsets = new Map<Node, number>();
    const gap = (until: number): void => {
      if (until !== oldPosition || inserted) ranges.push(oldPosition, until - oldPosition, inserted);
      oldPosition = until; inserted = 0;
    };
    const retain = (node: Node): void => {
      const candidates = origins.get(node);
      let offset = originOffsets.get(node) ?? 0;
      while (candidates?.[offset] && candidates[offset]!.from < oldPosition) offset++;
      const origin = candidates?.[offset];
      originOffsets.set(node, offset + (origin ? 1 : 0));
      if (origin) { gap(origin.from); oldPosition += origin.size; return; }
      if (node.isText) { inserted += node.nodeSize; return; }
      inserted++;
      node.content.forEach(retain);
      inserted++;
    };
    content.forEach(retain);
    gap(end);
    return { parent, content, map: ranges.length ? new StepMap(ranges) : StepMap.empty };
  }

  apply(doc: Node): Node {
    const { parent, content, map } = this.resolve(doc);
    const next = parent.copy([...parent.content.slice(0, this.from), ...content, ...parent.content.slice(this.from + this.before.length)]);
    this.maps.set(doc, map);
    return replaceNodeAtPath(doc, this.parentPath, next);
  }

  override getMap(doc: Node): StepMap { return this.maps.get(doc) ?? this.resolve(doc).map; }
}
