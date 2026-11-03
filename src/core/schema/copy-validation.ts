import type { Node } from './node';
import type { NodeType, Schema } from './schema';

interface TypeGrammar { readonly type: NodeType; readonly name: string; readonly group: string | undefined }
export interface CopyGrammar { readonly expression: string; readonly types: readonly TypeGrammar[] }
interface ValidatedWide { readonly schema: Schema; readonly grammar?: CopyGrammar }
export interface CopyValidation extends ValidatedWide { readonly from: number; readonly to: number }

// Values contain schema/type identities and scalar bounds, never earlier nodes
// or content arrays. A live copied document must not retain its edit history.
const validated = new WeakMap<Node, ValidatedWide>();
const copied = new WeakMap<Node, CopyValidation>();
const minimumWidth = 64;

function typeGrammar(type: NodeType): TypeGrammar | undefined {
  const name = Object.getOwnPropertyDescriptor(type, 'name');
  const spec = Object.getOwnPropertyDescriptor(type, 'spec');
  if (!name || !('value' in name) || typeof name.value !== 'string'
    || !spec || !('value' in spec) || !spec.value || typeof spec.value !== 'object') return;
  let owner: object | null = spec.value;
  let group: unknown;
  while (owner) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, 'group');
    if (descriptor) {
      // An accessor may have per-read behavior. Keep the ordinary matcher.
      if (!('value' in descriptor)) return;
      group = descriptor.value;
      break;
    }
    owner = Object.getPrototypeOf(owner);
  }
  if (group !== undefined && typeof group !== 'string') return;
  return { type, name: name.value, group };
}

export function reusableCopyGrammar(proof: CopyGrammar | undefined, expression: string): boolean {
  return Boolean(proof && proof.expression === expression && proof.types.every(previous => {
    const current = typeGrammar(previous.type);
    return current && current.name === previous.name && current.group === previous.group;
  }));
}

/** Capture at the content check, before descendant validators can change specs. */
export function captureWideGrammar(node: Node, expression: string): CopyGrammar | undefined {
  if (node.childCount < minimumWidth) return;
  const seen = new Set<NodeType>(), types: TypeGrammar[] = [];
  for (const child of node.content) {
    if (seen.has(child.type)) continue;
    seen.add(child.type);
    const grammar = typeGrammar(child.type);
    if (!grammar) return;
    types.push(Object.freeze(grammar));
  }
  return Object.freeze({ expression, types: Object.freeze(types) });
}

export function markWideValidated(node: Node, schema: Schema, grammar?: CopyGrammar): void {
  if (node.childCount >= minimumWidth) validated.set(node, { schema, grammar });
}

export function copiedValidation(node: Node, schema: Schema): CopyValidation | undefined {
  const proof = copied.get(node);
  return proof?.schema === schema ? proof : undefined;
}

/** Node.copy supplies the immutable child identity prefix it already measured. */
export function inheritCopyValidation(before: Node, after: Node, prefix: number | undefined): void {
  if (prefix === undefined || after.childCount < minimumWidth) return;
  const previous = validated.get(before);
  // A merely copied, unvalidated intermediate snapshot is never a certificate.
  if (!previous) return;
  let suffix = 0;
  const bound = Math.min(before.childCount, after.childCount) - prefix;
  while (suffix < bound && before.content[before.childCount - suffix - 1] === after.content[after.childCount - suffix - 1]) suffix++;
  const to = after.childCount - suffix;
  let sameTypes = before.childCount === after.childCount;
  for (let index = prefix; sameTypes && index < to; index++) sameTypes = before.content[index]!.type === after.content[index]!.type;
  copied.set(after, { schema: previous.schema, from: prefix, to, grammar: sameTypes ? previous.grammar : undefined });
}
