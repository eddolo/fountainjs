import type { Node } from './schema';
import { firstStrongDirection, ownsDirection } from './first-strong-direction';

type Direction = ReturnType<typeof firstStrongDirection>;
interface Summary {
  // false means multiple distinct groups: preserve the ordered child stream.
  readonly group: string | null | false;
  readonly free: Direction;
  readonly inside: Direction;
  readonly combined: Direction;
}
const empty: Summary = Object.freeze({ group: null, free: null, inside: null, combined: null });

/** Private immutable-model index. Membership must be a stable function of
 * immutable node data and the editor-lifetime schema. Cache values contain no
 * nodes, old document references, hidden text, DOM or externally mutable state.
 */
export function createSharedDirectionIndex(groupOf: (node: Node) => string | null): (root: Node) => ReadonlyMap<string, Direction> {
  const summaries = new WeakMap<Node, Summary>();
  const documents = new WeakMap<Node, ReadonlyMap<string, Direction>>();
  const frame = (node: Node) => {
    const own = groupOf(node);
    return { node, index: 0, own, group: own as Summary['group'],
      free: null as Direction, inside: null as Direction, combined: null as Direction };
  };
  type Frame = ReturnType<typeof frame>;
  const merge = (parent: Frame, child: Summary) => {
    if (child.group === false || parent.group !== null && child.group !== null && parent.group !== child.group) parent.group = false;
    else if (parent.group === null) parent.group = child.group;
    parent.free ??= child.free;
    parent.inside ??= parent.own !== null ? child.combined : child.inside;
    parent.combined ??= child.combined;
  };

  // Bottom-up scalar summaries never copy descendant maps into every ancestor.
  // A changed ancestor reads cached children; unchanged subtrees are not walked.
  // Deep models remain iterative. Mixed-group summaries retain free flow, but
  // their ambiguous inside/combined values are never used for a collapsed fold.
  const summary = (root: Node): Summary => {
    const known = summaries.get(root);
    if (known) return known;
    const pending = [frame(root)];
    while (pending.length) {
      const current = pending.at(-1)!;
      let result: Summary | undefined;
      if (current.node.type.name === 'html_inert_raw_text') result = empty;
      else if (current.node.isText) {
        const strong = firstStrongDirection(current.node.text!);
        const free = ownsDirection(current.node) ? null : strong;
        const inside = current.own !== null ? strong : null;
        result = { group: current.group, free, inside, combined: current.own !== null ? inside : free };
      } else if (current.index === current.node.childCount) {
        const barrier = ownsDirection(current.node);
        result = { group: current.group, free: barrier ? null : current.free, inside: current.inside,
          combined: barrier ? current.inside : current.combined };
      }
      if (result) {
        summaries.set(current.node, result);
        pending.pop();
        if (pending.length) merge(pending.at(-1)!, result);
      } else {
        const child = current.node.child(current.index++), cached = summaries.get(child);
        if (cached) merge(current, cached);
        else pending.push(frame(child));
      }
    }
    return summaries.get(root)!;
  };

  return root => {
    const known = documents.get(root);
    if (known) return known;
    const groups = new Map<string, Direction>();
    const add = (group: string | null, direction: Direction) => {
      if (group === null) return;
      if (!groups.has(group)) groups.set(group, direction);
      else if (groups.get(group) === null && direction) groups.set(group, direction);
    };
    const pending: { node: Node; inherited: string | null; index: number; context?: string | null }[] = [{ node: root, inherited: null, index: 0 }];
    while (pending.length) {
      const current = pending.at(-1)!, cached = summary(current.node);
      if (cached.group !== false) {
        if (cached.group === current.inherited) add(cached.group, cached.combined);
        else { add(cached.group, cached.inside); add(current.inherited, cached.free); }
        pending.pop();
      } else {
        if (current.index === 0) {
          const own = groupOf(current.node);
          current.context = own ?? (ownsDirection(current.node) ? null : current.inherited);
          add(own, null);
        }
        if (current.index === current.node.childCount) pending.pop();
        else pending.push({ node: current.node.child(current.index++), inherited: current.context!, index: 0 });
      }
    }
    documents.set(root, groups);
    return groups;
  };
}
