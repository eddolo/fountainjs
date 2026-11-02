import type { Attributes, Node } from './schema';
import type { Transaction } from './transaction';
import { getNodeAtPath, replaceNodeAtPath } from './transaction/path';
import { sharedDirectionGroupAttribute } from './text-direction';
import { createSharedDirectionIndex } from './shared-direction-index';
import type { Editor } from './editor';

type DirectionIdentity = (path: readonly number[]) => string | null;
const identityProviders = new WeakMap<Editor, DirectionIdentity>();

/** Adapter-owned stable identity for a previously unmarked shared owner.
 * Local documents need no provider. Registration has no model side effects.
 */
export function registerSharedDirectionIdentity(editor: Editor, identity: DirectionIdentity): () => void {
  identityProviders.set(editor, identity);
  return () => { if (identityProviders.get(editor) === identity) identityProviders.delete(editor); };
}

export function sharedDirectionIdentity(editor: Editor): DirectionIdentity | undefined {
  return identityProviders.get(editor);
}

export function sharedDirectionGroup(node: Node): string | null {
  const group = node.attrs.directionGroup;
  return node.type.spec.attrs?.directionGroup && node.attrs.dir === 'auto'
    && typeof group === 'string' && sharedDirectionGroupAttribute.validate(group) ? group : null;
}

const resolvedSharedDirections = createSharedDirectionIndex(sharedDirectionGroup);

/** A derived snapshot projection, never serialized back into model attrs. */
export function sharedDirectionDOMAttributes(node: Node, document: Node): Attributes {
  const group = sharedDirectionGroup(node);
  if (!group) return {};
  const resolved = resolvedSharedDirections(document);
  return { dir: resolved.get(group) ?? 'ltr',
    'data-fountain-direction-group': group, 'data-fountain-direction-origin': 'auto' };
}

interface DirectionOwner { node: Node; path: readonly number[] }

function ownerAt(document: Node, path: readonly number[]): DirectionOwner | null {
  for (let length = path.length; length >= 0; length -= 1) {
    const ownerPath = path.slice(0, length);
    const node = getNodeAtPath(document, ownerPath);
    if (node.type.spec.attrs?.dir && ['auto', 'ltr', 'rtl'].includes(String(node.attrs.dir))) return { node, path: ownerPath };
  }
  return null;
}

const samePath = (left: readonly number[], right: readonly number[]) => left.length === right.length
  && left.every((part, index) => part === right[index]);

let fallbackSequence = 0;
function newGroup(): string {
  // No DOM constructor or Node-only import. This is identity, not a secret.
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return crypto?.randomUUID?.() ?? `auto-${Date.now().toString(36)}-${++fallbackSequence}-${Math.random().toString(36).slice(2)}`;
}

/** Paste creates a new context, unlike whole-document save/reopen. Keep all
 * members in the copied document linked, but never link them to the source or
 * to another paste of the same clipboard payload.
 */
export function copySharedDirectionGroups(document: Node): Node {
  const identities = new Map<string, string>();
  const copy = (node: Node): Node => {
    const content = node.content.map(copy);
    const group = sharedDirectionGroup(node);
    if (group) {
      let identity = identities.get(group);
      if (!identity) { identity = newGroup(); identities.set(group, identity); }
      return node.type.create({ ...node.attrs, directionGroup: identity }, content, node.text, node.marks);
    }
    return content.some((child, index) => child !== node.content[index]) ? node.copy(content) : node;
  };
  return copy(document);
}

/** A clipboard fragment cannot remain live-linked to content not copied.
 * Complete groups stay automatic; incomplete groups become explicit direction
 * snapshots. No hidden anchor text is inserted and the source is untouched.
 */
export function snapshotIncompleteSharedDirections(document: Node, source: Node): { document: Node; detached: number } {
  if (document === source) return { document, detached: 0 };
  const members = (root: Node) => {
    const result = new Map<string, Node[]>(), pending = [root];
    while (pending.length) {
      const node = pending.pop()!, group = sharedDirectionGroup(node);
      if (group) {
        let list = result.get(group);
        if (!list) { list = []; result.set(group, list); }
        list.push(node);
      }
      for (let index = node.childCount - 1; index >= 0; index -= 1) pending.push(node.child(index));
    }
    return result;
  };
  const selected = members(document);
  if (!selected.size) return { document, detached: 0 };
  const original = members(source), snapshots = new Map<string, 'ltr' | 'rtl'>();
  const resolved = resolvedSharedDirections(source);
  for (const [group, nodes] of selected) {
    const originals = original.get(group);
    if (!originals || nodes.length !== originals.length || nodes.some((node, index) => !node.eq(originals[index]!))) {
      snapshots.set(group, resolved.get(group) ?? 'ltr');
    }
  }
  if (!snapshots.size) return { document, detached: 0 };
  const snapshot = (node: Node): Node => {
    const content = node.content.map(snapshot), group = sharedDirectionGroup(node);
    const direction = group ? snapshots.get(group) : undefined;
    if (direction) return node.type.create({ ...node.attrs, dir: direction, directionGroup: undefined }, content, node.text, node.marks);
    return content.some((child, index) => child !== node.content[index]) ? node.copy(content) : node;
  };
  return { document: snapshot(document), detached: snapshots.size };
}

/** A whole-node selection omits its ancestors, unlike a text slice. Preserve
 * inherited direction without copying their hidden text or their structure.
 * Automatic context outside the selection becomes a reported fixed snapshot.
 * A restricted schema must be able to represent that boundary, or the caller
 * must leave copying to the browser rather than emit misleading Fountain JSON.
 */
export function snapshotInheritedNodeDirection(
  document: Node, source: Node, path: readonly number[],
): { document: Node; detached: number } | null {
  const owner = ownerAt(source, path);
  if (!owner || owner.path.length === path.length) return { document, detached: 0 };
  const group = sharedDirectionGroup(owner.node);
  const direction = owner.node.attrs.dir === 'auto'
    ? (group ? resolvedSharedDirections(source).get(group) : resolvedSharedDirections.contained(owner.node)) ?? 'ltr'
    : owner.node.attrs.dir;
  try {
    const child = document.child(0);
    let carrier: Node;
    if (child.type.spec.attrs?.dir) {
      const attrs: Attributes = { ...child.attrs, dir: direction };
      if (child.type.spec.attrs.align && attrs.align === 'left' && attrs.alignExplicit !== true) attrs.align = 'start';
      carrier = child.type.create(attrs, child.content, child.text, child.marks);
    } else {
      const type = document.type.schema.nodes.direction_scope;
      if (!type?.spec.attrs?.dir) return null;
      carrier = type.create({ dir: direction }, document.content);
    }
    const snapshot = document.copy([carrier]);
    document.type.schema.validate(snapshot);
    return { document: snapshot, detached: owner.node.attrs.dir === 'auto' ? 1 : 0 };
  } catch { return null; }
}

export interface SharedDirectionPreparation {
  readonly document: Node;
  readonly owners: readonly (readonly number[])[];
  readonly memberships: ReadonlyMap<string, string>;
}

/** Stage identity on a source automatic owner only when a reparenting actually
 * crosses its inheritance boundary. A complete independently owned subtree
 * follows itself. All changes are later dispatched with the structural edit.
 */
export function prepareSharedDirection(
  document: Node,
  moves: readonly { readonly from: readonly number[]; readonly to: readonly number[]; readonly fragment?: boolean }[],
  identity?: DirectionIdentity,
): SharedDirectionPreparation | null {
  let prepared = document;
  const owners: (readonly number[])[] = [];
  const memberships = new Map<string, string>();
  for (const move of moves) {
    const source = ownerAt(prepared, move.from), destination = ownerAt(prepared, move.to);
    if (!source || source.node.attrs.dir !== 'auto' || !move.fragment && samePath(source.path, move.from)) continue;
    const existing = sharedDirectionGroup(source.node);
    if (destination && (samePath(source.path, destination.path)
      || existing !== null && existing === sharedDirectionGroup(destination.node))) continue;
    if (!source.node.type.spec.attrs?.directionGroup) return null;
    const provided = !existing && identity ? identity(source.path) : undefined;
    // An active adapter must not silently replace an unmappable shared owner
    // with a client-local random identity. This is an integrity failure.
    if (!existing && identity && (typeof provided !== 'string' || !sharedDirectionGroupAttribute.validate(provided))) return null;
    const group = existing ?? provided ?? newGroup();
    if (!existing) {
      const owner = source.node.type.create({ ...source.node.attrs, directionGroup: group }, source.node.content);
      prepared = replaceNodeAtPath(prepared, source.path, owner);
      owners.push(source.path);
    }
    memberships.set(move.from.join('.'), group);
  }
  return { document: prepared, owners, memberships };
}

/** Preserve the source membership on the first capable descendants while
 * keeping authored child directions independent. Missing host capability is
 * explicit failure, not silent fixed-direction materialization.
 */
export function retainSharedDirection(node: Node, group: string | undefined): Node | null {
  if (!group || ['auto', 'ltr', 'rtl'].includes(String(node.attrs.dir))) return node;
  if (node.type.spec.attrs?.dir && node.type.spec.attrs?.directionGroup) {
    const attrs: Attributes = { ...node.attrs, dir: 'auto', directionGroup: group };
    if (node.type.spec.attrs.align && attrs.align === 'left' && attrs.alignExplicit !== true) attrs.align = 'start';
    try { return node.type.create(attrs, node.content, node.text, node.marks); }
    catch { return null; }
  }
  if (node.isText) return null;
  // An empty editable container may acquire eligible text later. Without a
  // capable descendant there is currently nowhere to retain its context.
  if (!node.childCount && node.type.spec.content && !node.type.spec.atom) return null;
  const content = node.content.map(child => retainSharedDirection(child, group));
  if (content.some(child => !child)) return null;
  // An incapable leaf cannot act as a carrier, but it also has no eligible
  // text descendants whose context could be silently lost.
  return content.some((child, index) => child !== node.content[index]) ? node.copy(content as Node[]) : node;
}

export function applySharedDirectionOwners(transaction: Transaction, prepared: SharedDirectionPreparation): void {
  for (const path of prepared.owners) transaction.setNodeAttrs(path, getNodeAtPath(prepared.document, path).attrs);
}
