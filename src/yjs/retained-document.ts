import type * as Y from 'yjs';
import type { Attributes, Mark, MarkJSON, NodeType, Schema } from '../core/schema';
import { Node } from '../core/schema/node';
import { Mark as ModelMark } from '../core/schema/mark';
import { computeAttrs, isDeeplyImmutable } from '../core/schema/attributes';
import { freezeAttributes } from '../core/schema/node-spec';
import { Mapping } from '../core/transaction/mapping';
import type { Step } from '../core/transaction/step';
import type { Transaction } from '../core/transaction/transaction';
import { ReplaceStep } from '../core/transaction/replace-step';
import { ReplaceTextStep } from '../core/transaction/replace-text-step';
import { getNodeAtPath } from '../core/transaction/path';
import { RetainedNodeStore, retainedNameKey as nameKey, retainedKeyName as keyName, validateRetainedMetadata, type RetainedNodeProjection, type RetainedNodeSeed } from './retained-nodes';
import { RetainedTextStore, validateRetainedTextFormat, type RetainedTextRun, type RetainedTextPartition } from './retained-text';
import { planRetainedNodeStarts, planRetainedText, type RetainedTextPlan } from './retained-mapping';
import { assertRetainedWireString } from './retained-wire';

const VERSION = 'fountain-retained-document/3';
const LEAF = 'fountain_leaf', ORDER = 'fountain_marks';
const EMPTY_ATTRS: Attributes = Object.freeze({});
const pathKey = (path: readonly number[]) => path.join('.');
// Callers compare validated portable metadata/documents, or missing fields.
// Object-key order is immaterial; avoid sorted copies of entire documents.
const same = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((entry, index) => same(entry, right[index]));
  if (Array.isArray(right)) return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>, keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
};
// Reused model values must also retain the factory's deterministic key order.
// Compare data directly rather than invoking host-defined toJSON methods.
const sameOrdered = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object'
    || Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    if (left.length !== (right as unknown[]).length || Object.getPrototypeOf(left) !== Array.prototype || Object.getPrototypeOf(right) !== Array.prototype) return false;
  } else if (![null, Object.prototype].includes(Object.getPrototypeOf(right))) return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>, keys = Object.keys(a), next = Object.keys(b);
  return keys.length === next.length && keys.every((key, index) => key === next[index] && sameOrdered(a[key], b[key]));
};
interface Binding { id: string; from: number; length: number; modelFrom: number; leaf: string }
interface GroupState { id: string; parent: string; value: RetainedNodeProjection }
interface Leaf { node: Node; path: number[]; at: number; leaf: string }
interface Group { parent: string; leaves: Leaf[]; ids: string[]; field: string; pieces: Piece[]; empty: boolean; preserved?: boolean }
interface Piece { original: string; from: number; to: number; at: number; group: Group; start?: unknown; end?: unknown; id?: string; leaf: Leaf }
interface Segment { original: string; id: string; from: number; to: number; group: Group }
interface Fragment { node: Node; id?: string; leaf?: string; bindings?: Binding[]; children?: Fragment[] }
interface TextFragment { text: string; attrs: Attributes; marks: readonly Mark[]; leaf: string; bindings: Binding[] }
interface ProjectionFrame {
  readonly projection: ReturnType<RetainedNodeStore['project']>;
  readonly partitions: ReadonlyMap<string, RetainedTextPartition>;
  readonly placements: ReadonlyMap<string, SplitPlacement>;
}
interface SplitPlacement { root: string; rootToken: string; token: string; partition: string }
// Partition/leaf identities cannot contain NUL; separate tuple fields without
// allocating an array and JSON serialization for every normalized text leaf.
const bindingKey = (bindings: readonly Binding[], leaf: string): string => `${bindings[0]?.id}\0${bindings[0]?.from}\0${leaf}`;
const sameBindings = (left: readonly Binding[], right: readonly Binding[]): boolean => left.length === right.length && left.every((entry, index) => {
  const other = right[index]!;
  return entry.id === other.id && entry.from === other.from && entry.length === other.length && entry.modelFrom === other.modelFrom && entry.leaf === other.leaf;
});

function format(node: Node, leaf: string): Record<string, string> {
  const result: Record<string, string> = { [LEAF]: leaf }, order: string[] = [], counts = new Map<string, number>();
  for (const [name, value] of Object.entries(node.attrs)) result[`a_${nameKey(name)}`] = JSON.stringify(value);
  for (const mark of node.marks) {
    const ordinal = counts.get(mark.type.name) ?? 0; counts.set(mark.type.name, ordinal + 1);
    const key = `m_${nameKey(mark.type.name)}_${ordinal}`; result[key] = JSON.stringify(mark.attrs); order.push(key);
  }
  result[ORDER] = JSON.stringify(order); return result;
}

interface NativeTextProof {
  readonly path: readonly number[]; readonly from: number; readonly to: number; readonly text: string;
  readonly original: Node; readonly target: Node;
}
function proveNativeText(before: Node, after: Node, mapping: Mapping, step: Step): NativeTextProof | undefined {
  if (!(step instanceof ReplaceTextStep) || step.apply !== ReplaceTextStep.prototype.apply) return;
  const { from, to, text } = step, path = Object.freeze([...step.path]);
  if (typeof text !== 'string') return;
  const expected = new ReplaceTextStep(path, from, to, text).getMap(before);
  if (mapping.maps.length !== 1 || !same(mapping.maps[0]!.ranges, expected.ranges)) return;
  let original = before, target = after;
  for (let depth = 0; depth <= path.length; depth++) {
    if (original.type !== target.type || !sameOrdered(original.attrs, target.attrs) || original.marks.length !== target.marks.length
      || original.marks.some((mark, index) => mark !== target.marks[index])) return;
    if (depth === path.length) {
      if (original.isText && target.isText && target.text === original.text!.slice(0, from) + text + original.text!.slice(to)) return { path, from, to, text, original, target };
      return;
    }
    if (original.isText || target.isText || original.childCount !== target.childCount) return;
    const index = path[depth]!;
    for (let sibling = 0; sibling < original.childCount; sibling++) if (sibling !== index && original.content[sibling] !== target.content[sibling]) return;
    original = original.child(index); target = target.child(index);
  }
}

export function validateRetainedDocument(document: Node, schema: Schema): void {
  if (document.type.schema !== schema) throw new Error('Retained document belongs to another schema.');
  let nodes = 0, characters = 0;
  const names = new Map<NamedType, string>();
  let reusable = true;
  for (const type of [...Object.values(schema.nodes), ...Object.values(schema.marks)]) {
    const descriptor = Object.getOwnPropertyDescriptor(type, 'name');
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string') reusable = false;
    else names.set(type, descriptor.value);
  }
  let certified = portableSchemas.get(schema);
  if (!certified || certified.names.size !== names.size || [...names].some(([type, name]) => certified!.names.get(type) !== name)) {
    certified = { names, bounds: new WeakMap() }; portableSchemas.set(schema, certified);
  }
  const standardSerialization = (): boolean => {
    const serializer = Object.getOwnPropertyDescriptor(ModelMark.prototype, 'toJSON');
    return !('toJSON' in Object.prototype) && !('toJSON' in Array.prototype) && !!serializer
      && Object.hasOwn(serializer, 'value') && serializer.value === nativeMarkJSON;
  };
  const visit = (node: Node, depth: number): PortableBounds => {
    const cached = reusable && standardSerialization() ? certified.bounds.get(node) : undefined;
    if (cached) {
      if ((nodes += cached.nodes) > 100_000 || depth + cached.height > 100 || (characters += cached.characters) > 10_000_000) throw new RangeError('Retained document is too large.');
      return cached;
    }
    if (++nodes > 100_000 || depth > 100 || (characters += node.text?.length ?? 0) > 10_000_000) throw new RangeError('Retained document is too large.');
    validateRetainedMetadata(node.attrs); validateRetainedMetadata(node.marks.map(mark => mark.toJSON()));
    if (node.type.name.length > 200 || Object.keys(node.attrs).length > 1_000 || Object.keys(node.attrs).some(name => name.length > 200)) throw new RangeError('Retained node metadata exceeds the candidate storage bounds.');
    assertRetainedWireString(node.type.name);
    if (typeof node.text === 'string') assertRetainedWireString(node.text);
    if (node.isText) validateRetainedTextFormat(format(node, 'preflight'));
    let count = 1, text = node.text?.length ?? 0, height = 0;
    let cacheable = reusable && standardSerialization() && names.get(node.type) === node.type.name && Object.getPrototypeOf(node) === Node.prototype && Object.isFrozen(node)
      && (node.text === undefined || typeof node.text === 'string')
      && frozenJSON(node.attrs) && node.marks.every(mark => names.get(mark.type) === mark.type.name
        && Object.getPrototypeOf(mark) === ModelMark.prototype && Object.isFrozen(mark) && frozenJSON(mark.attrs));
    // Host serializers may mutate type names or global serialization behavior.
    // After one uncacheable value, keep the rest of this evaluation fully live.
    if (!cacheable) reusable = false;
    for (const child of node.content) {
      const bounds = visit(child, depth + 1); count += bounds.nodes; text += bounds.characters; height = Math.max(height, bounds.height + 1);
      cacheable &&= bounds.cacheable;
    }
    cacheable &&= reusable;
    const bounds = { nodes: count, characters: text, height, cacheable };
    if (cacheable) certified.bounds.set(node, bounds);
    return bounds;
  };
  visit(document, 0);
  schema.validate(document);
}

type NamedType = { readonly name: string };
interface PortableBounds {
  readonly nodes: number;
  readonly characters: number;
  readonly height: number;
  readonly cacheable: boolean;
}
// Weak keys retain no document snapshots. This certifies only immutable data
// portability and aggregate bounds; live schema/factory rules remain separate.
const portableSchemas = new WeakMap<Schema, { names: ReadonlyMap<NamedType, string>; bounds: WeakMap<Node, PortableBounds> }>();
const nativeMarkJSON = Object.getOwnPropertyDescriptor(ModelMark.prototype, 'toJSON')?.value;
function frozenJSON(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true;
  const prototype = Object.getPrototypeOf(value);
  return Object.isFrozen(value) && (Array.isArray(value) ? prototype === Array.prototype : prototype === null || prototype === Object.prototype)
    && Object.values(value).every(frozenJSON);
}

/** Candidate model/CRDT bridge. Not registered with the public Yjs adapter yet. */
export class RetainedDocumentStore {
  readonly nodes: RetainedNodeStore;
  readonly text: RetainedTextStore;
  readonly scope: readonly (Y.Map<unknown> | Y.Array<unknown>)[];
  readonly observed: readonly (Y.Map<unknown> | Y.Array<unknown>)[];
  private readonly metadata: Y.Map<unknown>;
  private readonly splits: Y.Map<unknown>;
  private model?: Node;
  private frame?: ProjectionFrame;
  private frameCurrent = false;
  private sharedRevision: object = {};
  private frameTransaction?: Y.Transaction;
  private frameStamp?: string;
  private frameGuard?: () => boolean;
  private readonly remoteFrameKey = Symbol('retained-remote-frame');

  private soleCleanup(transaction: Y.Transaction): boolean {
    // Yjs queues observer writes before the earlier afterTransaction returns.
    const queue = this.document._transactionCleanups;
    return queue?.length === 1 && queue[0] === transaction;
  }

  private readonly sharedFrameChanged = (transaction: Y.Transaction): void => {
    // Remote formatting can schedule an empty Yjs cleanup transaction.
    if (!transaction.changed.size && !transaction.deleteSet.clients.size
      && transaction.beforeState.size === transaction.afterState.size
      && [...transaction.afterState].every(([client, clock]) => transaction.beforeState.get(client) === clock)) return;
    this.sharedRevision = {};
    if (this.frameCurrent && this.frame && !transaction.local && this.soleCleanup(transaction)) {
      transaction.meta.set(this.remoteFrameKey, this.frame);
    }
    try {
      this.frameCurrent = this.frameTransaction === transaction && this.frameStamp === this.text.writeVersion(transaction) && this.frameGuard?.() === true;
    } catch { this.frameCurrent = false; }
    this.frameTransaction = undefined; this.frameStamp = undefined; this.frameGuard = undefined;
  };

  private clearFrame(): void {
    this.frame = undefined; this.frameCurrent = false;
    this.frameTransaction = undefined; this.frameStamp = undefined; this.frameGuard = undefined;
  }
  private nodePaths = new Map<string, string>();
  private textPaths = new Map<string, Binding[]>();
  private identityPaths = new Map<string, readonly number[]>();
  private partitionPaths = new Map<string, { path: readonly number[]; binding: Binding }[]>();
  private textLocations = new Map<string, { leaf: string; path: readonly number[] }>();
  private groups = new Map<string, GroupState>();
  private graph?: RetainedNodeProjection;

  constructor(readonly document: Y.Doc, name: string, readonly schema: Schema, private readonly createId: () => string, private readonly origin?: unknown) {
    this.metadata = document.getMap(`${name}:document`);
    if (!this.metadata.size) document.transact(() => this.metadata.set('version', VERSION), origin);
    if (this.metadata.get('version') !== VERSION) throw new Error('Unsupported retained document version.');
    this.nodes = new RetainedNodeStore(document, `${name}-nodes`, createId, origin);
    this.text = new RetainedTextStore(document, `${name}-text`, origin);
    this.splits = document.getMap(`${name}:splits`);
    this.scope = [...this.nodes.scope, ...this.text.scope, this.splits];
    this.observed = [...new Set([...this.scope, this.metadata, this.nodes.metadata, ...this.text.observed])];
    this.document.on('afterTransaction', this.sharedFrameChanged);
  }

  get initialized(): boolean { return this.metadata.get('seeded') === true; }
  identity(path: readonly number[]): string | undefined { return this.nodePaths.get(pathKey(path)); }
  path(identity: string): readonly number[] | undefined { return this.identityPaths.get(identity); }

  textAnchor(path: readonly number[], offset: number, association: -1 | 1): unknown {
    const entries = this.textPaths.get(pathKey(path));
    const ordered = association < 0 ? entries : entries && [...entries].reverse();
    const binding = ordered?.find(entry => offset >= entry.modelFrom && offset <= entry.modelFrom + entry.length);
    if (!binding) throw new Error('Text selection is outside the retained document.');
    return this.text.relative(binding.id, binding.from + offset - binding.modelFrom, association);
  }

  resolveTextAnchor(value: unknown): { path: readonly number[]; offset: number } | undefined {
    const point = this.text.resolve(value);
    if (!point) return undefined;
    const entries = this.partitionPaths.get(point.id), ordered = point.association < 0 ? entries : entries && [...entries].reverse();
    const match = ordered?.find(({ binding }) => point.offset >= binding.from && point.offset <= binding.from + binding.length);
    return match ? { path: match.path, offset: match.binding.modelFrom + point.offset - match.binding.from } : undefined;
  }

  private splitPlacement(id: string): SplitPlacement | undefined {
    if (this.splits.size > 100_000) throw new RangeError('Too many retained split placements.');
    const raw = this.splits.get(id);
    if (raw === undefined) return undefined;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 4) throw new Error('Invalid retained split placement.');
    const value = raw as SplitPlacement;
    if (![value.root, value.rootToken, value.token, value.partition].every(entry => typeof entry === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(entry))) throw new Error('Invalid retained split identity.');
    return value.token === this.nodes.placementIdentity(id) && value.rootToken === this.nodes.placementIdentity(value.root) ? value : undefined;
  }

  private orderedChildren(raw: RetainedNodeProjection, partitions: ReadonlyMap<string, RetainedTextPartition>, placements: ReadonlyMap<string, SplitPlacement>): readonly RetainedNodeProjection[] {
    if (!placements.size || !raw.content.some(child => placements.has(child.id))) return raw.content;
    const result = [...raw.content], indexes = new Map(result.map((node, index) => [node.id, index]));
    const families = new Map<string, { index: number; node: RetainedNodeProjection; rank: number; stream: string }[]>();
    for (let index = 0; index < result.length; index++) {
      const node = result[index], placement = placements.get(node.id);
      if (!placement || !indexes.has(placement.root)) continue;
      const partition = partitions.get(placement.partition)!, entries = families.get(placement.root) ?? [];
      entries.push({ index, node, rank: partition.from, stream: partition.streamId }); families.set(placement.root, entries);
    }
    for (const [root, entries] of families) {
      if (new Set(entries.map(entry => entry.stream)).size !== 1) throw new Error('Retained split family crosses text streams.');
      // A root that also participates in another family may have moved.
      const rootIndex = placements.has(root) ? result.findIndex(child => child.id === root) : indexes.get(root)!;
      const slots = [rootIndex, ...entries.map(entry => entry.index)].sort((a, b) => a - b);
      const nodes = [result[rootIndex], ...entries.sort((a, b) => a.rank - b.rank || (a.node.id < b.node.id ? -1 : 1)).map(entry => entry.node)];
      slots.forEach((slot, index) => { result[slot] = nodes[index]; });
    }
    return result;
  }

  private validate(document: Node): void {
    validateRetainedDocument(document, this.schema);
  }

  private metadataFor(id: string, before: { type: string; attrs?: Attributes; marks?: readonly MarkJSON[] } | undefined, after: Node): void {
    if (!before || before.type !== after.type.name) this.nodes.setType(id, after.type.name);
    const previous = before?.attrs ?? {};
    for (const name of new Set([...Object.keys(previous), ...Object.keys(after.attrs)])) {
      if (!same(previous[name], after.attrs[name])) this.nodes.setAttribute(id, name, after.attrs[name]);
    }
    const marks = after.marks.map(mark => mark.toJSON());
    if (!same(before?.marks ?? [], marks)) this.nodes.setMarks(id, marks.length ? marks : undefined);
  }

  seed(source: Node): Node {
    this.validate(source);
    const root = this.nodes.project().root;
    if (this.metadata.get('seeded') === true || root.content.length) throw new Error('Retained document is already initialized.');
    const texts: { stream: string; id: string; runs: RetainedTextRun[] }[] = [];
    const visit = (node: Node): RetainedNodeSeed[] => {
        const result: RetainedNodeSeed[] = [];
        for (let index = 0; index < node.childCount;) {
          const child = node.child(index);
          const id = this.createId(), token = this.createId();
          if (!child.isText) {
            result.push({ id, token, type: child.type.name, attrs: { ...child.attrs }, marks: child.marks.map(mark => mark.toJSON()), content: visit(child) });
            index++; continue;
          }
          const content: Node[] = [child]; index++;
          if (child.nodeSize) while (index < node.childCount && node.child(index).isText && node.child(index).nodeSize) content.push(node.child(index++));
          result.push({ id, token, type: 'text', attrs: { ...child.attrs }, marks: child.marks.map(mark => mark.toJSON()), textLayout: { field: id, empty: child.nodeSize === 0 }, content: [] });
          texts.push({ stream: this.createId(), id, runs: content.filter(text => text.nodeSize).map(text => ({ text: text.text!, attributes: format(text, this.createId()) })) });
        }
        return result;
    };
    const content = visit(source);
    this.document.transact(() => {
      this.metadataFor('root', root, source); this.nodes.seed(content);
      this.text.seed(texts);
      this.metadata.set('seeded', true);
    }, this.origin);
    const projected = this.read();
    if (!same(projected.toJSON(), source.toJSON())) throw new Error('Retained seed changed source content.');
    this.model = source; return projected;
  }

  private projectionNode(type: NodeType, attrs: Attributes, content: readonly Node[], text: string | undefined, marks: readonly Mark[], used: Set<Node>, previous?: Node): Node {
    const reuse = previous?.type === type && previous.text === text && previous.content.length === content.length
      && !used.has(previous)
      && previous.content.every((child, index) => child === content[index]) && previous.marks.length === marks.length
      && isDeeplyImmutable(previous.attrs) && previous.marks.every(mark => isDeeplyImmutable(mark.attrs))
      && sameOrdered(previous.attrs, attrs) && previous.marks.every((mark, index) => mark.type === marks[index]!.type && sameOrdered(mark.attrs, marks[index]!.attrs));
    const node = reuse ? previous! : new Node(type, attrs, content, text, marks);
    if (reuse) used.add(node);
    // Match NodeType.create: fresh attribute and whole-node rules still run.
    if (type.spec.validate && !type.spec.validate(node)) throw new Error(`Invalid node invariant: ${type.name}`);
    return node;
  }

  private decode(run: RetainedTextRun): { leaf: string; attrs: Attributes; marks: MarkJSON[] } {
    const fields = run.attributes ?? {}, attrs: Attributes = Object.create(null), marks = new Map<string, MarkJSON>();
    const leaf = fields[LEAF];
    if (typeof leaf !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(leaf)) throw new Error(`Retained characters need a leaf identity (${Object.keys(fields).join(',')}).`);
    const order: unknown = JSON.parse(fields[ORDER] ?? '[]');
    if (!Array.isArray(order) || order.some(key => typeof key !== 'string')) throw new Error('Invalid retained mark order.');
    for (const [key, value] of Object.entries(fields).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      if (key === LEAF || key === ORDER) continue;
      const parsed: unknown = JSON.parse(value); validateRetainedMetadata(parsed);
      if (key.startsWith('a_')) attrs[keyName(key.slice(2))] = parsed;
      else if (/^m_[a-f0-9]*_\d+$/.test(key) && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        marks.set(key, { type: keyName(key.slice(2, key.lastIndexOf('_'))), attrs: parsed as Attributes });
      } else throw new Error('Unknown retained text format.');
    }
    return { leaf, attrs, marks: [...new Set([...order as string[], ...marks.keys()])].filter(key => marks.has(key)).map(key => marks.get(key)!) };
  }

  private acquireFrame(): ProjectionFrame {
    const projection = this.nodes.project();
    if (projection.issues.some(issue => issue.kind === 'unattached')) throw new Error('Retained document has unattached records.');
    const fields = new Set<string>(), placements = new Map<string, SplitPlacement>();
    const collect = (node: RetainedNodeProjection) => {
      if (node.type === 'text') {
        if (!node.textLayout) throw new Error(`Missing retained text layout for ${node.id}.`);
        fields.add(node.id);
      }
      for (const child of node.content) {
        const placement = this.splitPlacement(child.id);
        if (placement) { placements.set(child.id, placement); fields.add(placement.partition); }
        collect(child);
      }
    };
    collect(projection.root);
    const partitions = this.text.projectMany([...fields]);
    return { projection, partitions, placements };
  }

  read(validate = true): Node {
    this.clearFrame();
    const revision = this.sharedRevision;
    if (this.metadata.get('version') !== VERSION || this.metadata.get('seeded') !== true) throw new Error('Retained document is not initialized.');
    const frame = this.acquireFrame(), result = this.normalizeFrame(frame, validate);
    this.frame = frame; this.frameCurrent = revision === this.sharedRevision;
    return result;
  }

  readAfterRemote(transaction: Y.Transaction): Node {
    const previous = this.frame;
    const eligible = transaction.meta.get(this.remoteFrameKey) === previous;
    transaction.meta.delete(this.remoteFrameKey);
    if (!previous || !eligible || !this.soleCleanup(transaction)) return this.read();
    const partitions = this.text.refreshRemotePartitions(transaction, previous.partitions);
    if (!partitions || !this.soleCleanup(transaction)) return this.read();
    const frame = { ...previous, partitions };
    const result = this.normalizeFrame(frame, true);
    if (!this.soleCleanup(transaction)) return this.read();
    this.frame = frame;
    this.frameCurrent = true;
    return result;
  }

  private normalizeFrame({ projection, partitions, placements }: ProjectionFrame, validate: boolean): Node {
    // Candidates come only from this store's existing model/bindings. Shared
    // data was checked by acquisition or the guarded native-write proof.
    const previousNodes = new Map<string, Node>();
    const previousTexts = new Map<string, { node: Node; bindings: readonly Binding[] } | null>();
    const used = new Set<Node>();
    if (this.model) {
      for (const [id, path] of this.identityPaths) previousNodes.set(id, getNodeAtPath(this.model, path));
      for (const [path, bindings] of this.textPaths) {
        const location = this.textLocations.get(path);
        if (!location || !bindings.length) continue;
        const key = bindingKey(bindings, location.leaf), node = getNodeAtPath(this.model, location.path);
        previousTexts.set(key, previousTexts.has(key) ? null : { node, bindings });
      }
    }
    const groupStates = new Map<string, GroupState>();
    const visit = (raw: RetainedNodeProjection): Fragment => {
      if (!Object.hasOwn(this.schema.nodes, raw.type)) throw new Error(`Unknown retained node type: ${raw.type}`);
      const activeFields = new Set<string>();
      const ordered = this.orderedChildren(raw, partitions, placements);
      for (const child of ordered) if (child.type === 'text') {
        if (partitions.get(child.id)!.runs.some(run => run.text.length)) activeFields.add(child.textLayout!.field);
      }
      const emittedEmpty = new Set<string>(), children: (Fragment | TextFragment)[] = [];
      const append = (next: Fragment | TextFragment) => {
        const previous = children.at(-1);
        if (previous && 'text' in previous && 'text' in next && previous.leaf === next.leaf
          && same(previous.attrs, next.attrs) && same(previous.marks.map(mark => mark.toJSON()), next.marks.map(mark => mark.toJSON()))) {
          const length = previous.text.length;
          previous.text += next.text;
          previous.bindings.push(...next.bindings.map(binding => ({ ...binding, modelFrom: binding.modelFrom + length })));
        } else if (previous && 'node' in previous && 'node' in next && previous.leaf && previous.leaf === next.leaf
          && previous.node.isText && next.node.isText && same(previous.node.attrs, next.node.attrs)
          && same(previous.node.marks.map(mark => mark.toJSON()), next.node.marks.map(mark => mark.toJSON()))) {
          const length = previous.node.nodeSize;
          previous.node = previous.node.withText(previous.node.text! + next.node.text!);
          previous.bindings!.push(...next.bindings!.map(binding => ({ ...binding, modelFrom: binding.modelFrom + length })));
        } else children.push(next);
      };
      const appendText = (text: string, attrs: Attributes, markJSON: readonly MarkJSON[], leaf: string, bindings: Binding[]) => {
        const type = this.schema.nodes.text, marks = markJSON.map(mark => this.schema.markFromJSON(mark));
        // Preserve factory validation on every source run before merging when
        // a custom text invariant exists, rather than checking only the result.
        if (type.spec.validate) { append({ node: type.create(attrs, [], text, marks), leaf, bindings }); return; }
        const specs = type.spec.attrs;
        const prepared = specs === undefined && !Object.keys(attrs).length ? EMPTY_ATTRS : computeAttrs(specs, attrs);
        append({ text, attrs: Object.keys(prepared).length ? freezeAttributes(prepared) : EMPTY_ATTRS, marks, leaf, bindings });
      };
      for (const child of ordered) {
        if (child.type !== 'text') { append(visit(child)); continue; }
        groupStates.set(child.id, { id: child.id, parent: raw.id, value: child });
        const partition = partitions.get(child.id)!;
        let offset = 0;
        for (const run of partition.runs) {
          const decoded = this.decode(run);
          appendText(run.text, decoded.attrs, decoded.marks, decoded.leaf,
            [{ id: child.id, from: offset, length: run.text.length, modelFrom: 0, leaf: decoded.leaf }]);
          offset += run.text.length;
        }
        const layout = child.textLayout!;
        if (!offset && layout.empty && !activeFields.has(layout.field) && !emittedEmpty.has(layout.field)) {
          emittedEmpty.add(layout.field);
          appendText('', child.attrs ?? {}, child.marks ?? [], child.id,
            [{ id: child.id, from: 0, length: 0, modelFrom: 0, leaf: child.id }]);
        }
      }
      const fragments: Fragment[] = children.map(child => {
        if ('node' in child) return child;
        const previous = previousTexts.get(bindingKey(child.bindings, child.leaf));
        const candidate = previous && sameBindings(previous.bindings, child.bindings) ? previous.node : undefined;
        return { node: this.projectionNode(this.schema.nodes.text, child.attrs, [], child.text, child.marks, used, candidate), leaf: child.leaf, bindings: child.bindings };
      });
      const type = this.schema.nodes[raw.type], marks = (raw.marks ?? []).map(mark => this.schema.markFromJSON(mark)), attrs = computeAttrs(type.spec.attrs, raw.attrs ?? {});
      const node = this.projectionNode(type, attrs, fragments.map(child => child.node), undefined, marks, used, previousNodes.get(raw.id));
      return { node, id: raw.id, children: fragments };
    };
    const result = visit(projection.root);
    if (validate) this.schema.validate(result.node);
    const nodePaths = new Map<string, string>(), textPaths = new Map<string, Binding[]>();
    const textLocations = new Map<string, { leaf: string; path: readonly number[] }>(), identityPaths = new Map<string, readonly number[]>();
    const partitionPaths = new Map<string, { path: readonly number[]; binding: Binding }[]>();
    const bind = (fragment: Fragment, path: number[]) => {
      const key = pathKey(path), frozen = Object.freeze(path);
      if (fragment.id) { nodePaths.set(key, fragment.id); identityPaths.set(fragment.id, frozen); }
      if (fragment.bindings) {
        textPaths.set(key, fragment.bindings); textLocations.set(key, { leaf: fragment.leaf!, path: frozen });
        for (const binding of fragment.bindings) {
          const entries = partitionPaths.get(binding.id) ?? []; entries.push({ path: frozen, binding }); partitionPaths.set(binding.id, entries);
        }
      }
      fragment.children?.forEach((child, index) => bind(child, [...path, index]));
    };
    bind(result, []); this.nodePaths = nodePaths; this.textPaths = textPaths; this.textLocations = textLocations;
    this.identityPaths = identityPaths; this.partitionPaths = partitionPaths;
    this.groups = groupStates; this.graph = projection.root; this.model = result.node;
    return result.node;
  }

  apply(transaction: Transaction): Node {
    if (!this.model || !this.model.eq(transaction.originalDoc) && !same(this.model.toJSON(), transaction.originalDoc.toJSON())) throw new Error('Retained transaction uses a stale source.');
    this.validate(transaction.doc);
    let before = transaction.originalDoc;
    // Validate every step's provenance before writing any shared state. A later
    // invalid custom step must not leave an earlier valid step half-applied.
    const changes = transaction.steps.map(step => {
      const after = step.apply(before), mapping = new Mapping(step.getMaps?.(before) ?? [step.getMap(before)]);
      const native = transaction.steps.length === 1 ? proveNativeText(before, after, mapping, step) : undefined;
      const checked = native ? undefined : planRetainedText(before, after, mapping, step instanceof ReplaceStep);
      // A native single-step proof needs no whole-tree plan. All other steps
      // are preflighted in full; retain a plan only for a single fallback.
      const change = { before, after, mapping, step, native, plan: transaction.steps.length === 1 ? checked : undefined }; before = after; return change;
    });
    let writer: Y.Transaction | undefined, changedAfterProjection = false;
    const observed = (event: Y.Transaction): void => {
      if (event === writer) return;
      const changed = new Set<unknown>(event.changedParentTypes.keys());
      if (this.observed.some(type => changed.has(type))) changedAfterProjection = true;
    };
    this.document.on('afterTransaction', observed);
    try {
      const projected = this.document.transact(event => {
        writer = event;
        let result: Node | undefined;
        for (const change of changes) result = (change.native ? this.changeText(change.after, change.native, event) : undefined)
          ?? this.change(change.before, change.after, change.mapping, change.step, change.plan, event);
        return result;
      }, this.origin);
      // Reuse only this call's checked projection. Observer/cleanup writes can
      // share our origin, so freshness follows transaction identity, not origin.
      if (!projected || changedAfterProjection) return this.read();
      this.schema.validate(projected);
      return projected;
    } finally { this.document.off('afterTransaction', observed); }
  }

  private changeText(after: Node, { path, from, to, text, original, target }: NativeTextProof, shared: Y.Transaction): Node | undefined {
    // The native text step changes one existing leaf without structural or
    // formatting intent. Custom apply implementations use the general path.
    if (shared.changed.size) return;
    if (!original.isText || !target.isText || !original.nodeSize || !target.nodeSize || to - from === original.nodeSize) return;
    const bindings = this.textPaths.get(pathKey(path)), binding = bindings?.length === 1 ? bindings[0] : undefined;
    if (!binding || binding.from || binding.modelFrom || binding.length !== original.nodeSize
      || this.groups.get(binding.id)?.value.textLayout?.empty !== false) return;
    const frame = this.frameCurrent ? this.frame : undefined;
    const proof = frame ? this.text.prepareNativeProjection(binding.id, shared) : undefined;
    const desired = format(original, binding.leaf), partition = proof?.partition ?? this.text.project(binding.id);
    // Read the actual partition before writing. Incomplete bindings, mixed
    // formats or pending foreign text must not be treated as one native leaf.
    if (partition.runs.map(run => run.text).join('') !== original.text
      || partition.runs.some(run => !same(run.attributes ?? {}, desired))) return;
    if (to > from) this.text.delete(binding.id, from, to);
    if (text) this.text.insert(binding.id, from, text, desired);
    const current = proof?.partitions();
    let next: ProjectionFrame | undefined;
    if (frame && current) {
      const partitions = new Map(frame.partitions);
      for (const entry of current) if (partitions.has(entry.id)) partitions.set(entry.id, entry);
      next = { ...frame, partitions };
    }
    return this.finishChange(after, next, shared, proof?.unchangedOutside);
  }

  private finishChange(after: Node, frame?: ProjectionFrame, shared?: Y.Transaction, guard?: () => boolean): Node {
    this.clearFrame();
    const stamp = shared ? this.text.writeVersion(shared) : undefined;
    let projected: Node;
    if (frame && shared && guard) {
      projected = this.normalizeFrame(frame, false);
      if (stamp !== this.text.writeVersion(shared) || !guard()) projected = this.read(false);
      else this.frame = frame;
    } else projected = this.read(false);
    // Fresh projection has already checked shared values and factory rules.
    // Equal immutable branches need not allocate two complete JSON trees;
    // retain portable equality for equivalent, differently ordered metadata.
    if (!projected.eq(after) && !same(projected.toJSON(), after.toJSON())) throw new Error('Retained transaction changed the native document shape.');
    if (shared && this.frame && stamp === this.text.writeVersion(shared)) {
      this.frameCurrent = false; this.frameTransaction = shared; this.frameStamp = stamp;
      this.frameGuard = frame && guard ? guard : () => true;
    }
    this.model = after;
    return projected;
  }

  private change(before: Node, after: Node, mapping: Mapping, step: Step, checked?: RetainedTextPlan, shared?: Y.Transaction): Node {
    const plan = checked ?? planRetainedText(before, after, mapping, step instanceof ReplaceStep), oldNodes = this.nodePaths, oldBindings = this.textPaths;
    const intent = (step as Step & { getRetainedSplit?: () => { textPath: readonly number[]; rightTextPath: readonly number[]; offset: number } }).getRetainedSplit?.();
    const nextNodes = new Map<string, string>([['', 'root']]), values = new Map<string, RetainedNodeProjection>();
    const collect = (raw: RetainedNodeProjection) => { values.set(raw.id, raw); raw.content.forEach(collect); };
    collect(this.graph!);
    for (const retained of planRetainedNodeStarts(before, after, mapping)) {
      const id = oldNodes.get(pathKey(retained.before)); if (id) nextNodes.set(pathKey(retained.after), id);
    }
    const objects = new Map<Node, string | null>();
    const oldVisit = (node: Node, path: number[]) => {
      const id = oldNodes.get(pathKey(path));
      if (id) objects.set(node, objects.has(node) ? null : id);
      node.content.forEach((child, index) => oldVisit(child, [...path, index]));
    };
    oldVisit(before, []);
    const usedNodes = new Set(nextNodes.values()), expected = new Map<string, (string | Group)[]>(), groups: Group[] = [];
    const leaves = new Map<string, Leaf>(), usedLeaves = new Set<string>();
    const candidates = new Map<string, string[]>();
    const provenance = new Map<string, typeof plan.retained[number][]>();
    for (const retained of plan.retained) {
      const key = pathKey(retained.after.path), ids = candidates.get(key) ?? [];
      const slices = provenance.get(key) ?? []; slices.push(retained); provenance.set(key, slices);
      for (const binding of oldBindings.get(pathKey(retained.before.path)) ?? []) {
        if (binding.modelFrom < retained.before.to && binding.modelFrom + binding.length > retained.before.from) ids.push(binding.leaf);
      }
      candidates.set(key, ids);
    }
    const visit = (node: Node, path: number[], parent: string): void => {
      const key = pathKey(path);
      let id = nextNodes.get(key);
      const identity = objects.get(node);
      if (!id && identity && !usedNodes.has(identity)) { id = identity; nextNodes.set(key, id); usedNodes.add(id); }
      if (!id) {
        id = this.nodes.create({ type: node.type.name, attrs: { ...node.attrs }, marks: node.marks.map(mark => mark.toJSON()) }, parent);
        nextNodes.set(key, id); usedNodes.add(id);
      } else this.metadataFor(id, values.get(id), node);
      const children: (string | Group)[] = []; expected.set(id, children);
      for (let index = 0; index < node.childCount;) {
        const child = node.child(index);
        if (!child.isText) { visit(child, [...path, index], id); children.push(nextNodes.get(pathKey([...path, index]))!); index++; continue; }
        const group: Group = { parent: id, leaves: [], ids: [], field: '', pieces: [], empty: child.nodeSize === 0 };
        let at = 0;
        do {
          const text = node.child(index), textPath = [...path, index], textKey = pathKey(textPath);
          const previous = candidates.get(textKey)?.find(value => !usedLeaves.has(value));
          const leaf = previous ?? this.createId(); usedLeaves.add(leaf);
          const entry = { node: text, path: textPath, at, leaf }; leaves.set(textKey, entry); group.leaves.push(entry);
          at += text.nodeSize; index++;
        } while (!group.empty && index < node.childCount && node.child(index).isText && node.child(index).nodeSize > 0);
        // Reused parent identity alone is insufficient: an explicit replacement
        // can reuse objects while deleting/reinserting their characters. Require
        // full, offset-preserving provenance for every original text leaf too.
        const oldParent = identity === id ? this.identityPaths.get(id) : undefined;
        if (!intent && oldParent && !group.empty && group.leaves.every(leaf => {
          const oldKey = pathKey([...oldParent, leaf.path.at(-1)!]), bindings = oldBindings.get(oldKey);
          return bindings?.length && bindings.every(binding => this.groups.get(binding.id)?.parent === id)
            && (provenance.get(pathKey(leaf.path)) ?? []).filter(slice => pathKey(slice.before.path) === oldKey
              && slice.before.from === slice.after.from && slice.before.to === slice.after.to)
              .reduce((length, slice) => length + slice.after.to - slice.after.from, 0) === leaf.node.nodeSize;
        })) {
          group.ids = [...new Set(group.leaves.flatMap(leaf => oldBindings.get(pathKey([...oldParent, leaf.path.at(-1)!]))!.map(binding => binding.id)))];
          group.preserved = true;
        }
        groups.push(group); children.push(group);
      }
    };
    visit(after, [], 'root');
    const groupFor = new Map<Leaf, Group>(); groups.forEach(group => group.leaves.forEach(leaf => groupFor.set(leaf, group)));
    for (const retained of plan.retained) {
      const leaf = leaves.get(pathKey(retained.after.path))!, group = groupFor.get(leaf)!;
      if (group.preserved) continue;
      for (const binding of oldBindings.get(pathKey(retained.before.path)) ?? []) {
        const from = Math.max(binding.modelFrom, retained.before.from), to = Math.min(binding.modelFrom + binding.length, retained.before.to);
        if (from < to) group.pieces.push({ original: binding.id, from: binding.from + from - binding.modelFrom,
          to: binding.from + to - binding.modelFrom, at: leaf.at + retained.after.from + from - retained.before.from, group, leaf });
      }
    }
    // Splitting an empty block, or at either edge, still needs a shared marker:
    // there may be no retained character on one side to imply the boundary.
    if (intent) {
      const bindings = oldBindings.get(pathKey(intent.textPath)) ?? [];
      const binding = bindings.find(entry => entry.modelFrom <= intent.offset && entry.modelFrom + entry.length >= intent.offset);
      const left = leaves.get(pathKey(intent.textPath)), right = leaves.get(pathKey(intent.rightTextPath));
      if (!binding || !left || !right) throw new Error('Retained split has no source or target text boundary.');
      const offset = binding.from + intent.offset - binding.modelFrom;
      for (const leaf of [left, right]) {
        const group = groupFor.get(leaf)!;
        if (!group.pieces.some(piece => piece.original === binding.id && (piece.from === offset || piece.to === offset))) {
          group.pieces.push({ original: binding.id, from: offset, to: offset, at: leaf.at + (leaf === left ? leaf.node.nodeSize : 0), group, leaf });
        }
      }
    }
    const byOriginal = new Map<string, Piece[]>();
    for (const group of groups) for (const piece of group.pieces) {
      const entries = byOriginal.get(piece.original) ?? []; entries.push(piece); byOriginal.set(piece.original, entries);
    }
    const segments = new Map<string, Segment[]>();
    for (const [original, pieces] of byOriginal) {
      pieces.sort((a, b) => a.from - b.from || a.to - b.to || groups.indexOf(a.group) - groups.indexOf(b.group));
      const length = this.text.project(original).runs.reduce((sum, run) => sum + run.text.length, 0);
      const result: Segment[] = []; let current: Segment = { original, id: original, from: 0, to: length, group: pieces[0].group };
      for (const piece of pieces) {
        if (piece.group !== current.group) {
          const cut = piece.from, id = this.nodes.create({ ...values.get(original)!, textLayout: undefined }, piece.group.parent);
          this.text.split(current.id, id, cut - current.from); current.to = cut; result.push(current);
          current = { original, id, from: cut, to: length, group: piece.group };
        }
        piece.id = current.id;
        piece.start = this.text.relative(current.id, piece.from - current.from, 1);
        piece.end = this.text.relative(current.id, piece.to - current.from, -1);
      }
      result.push(current); segments.set(original, result);
      for (const segment of result) if (!segment.group.ids.includes(segment.id)) segment.group.ids.push(segment.id);
    }
    const assigned = new Set(groups.flatMap(group => group.ids));
    // A full replacement, including the first character typed in an empty
    // leaf, reuses its existing stream rather than allocating a competing one.
    for (const group of groups) if (!group.ids.length) {
      const binding = group.leaves.flatMap(leaf => oldBindings.get(pathKey(leaf.path)) ?? [])
        .find(entry => !assigned.has(entry.id) && this.groups.get(entry.id)?.parent === group.parent);
      if (binding) {
        group.ids.push(binding.id); assigned.add(binding.id);
        segments.set(binding.id, [{ original: binding.id, id: binding.id, from: 0,
          to: this.text.project(binding.id).runs.reduce((sum, run) => sum + run.text.length, 0), group }]);
      } else {
        const first = group.leaves[0].node;
        const id = this.nodes.create({ type: 'text', attrs: { ...first.attrs }, marks: first.marks.map(mark => mark.toJSON()) }, group.parent);
        this.text.create(this.createId(), id, []); group.ids.push(id); assigned.add(id);
      }
    }
    const deletions = new Map<string, { from: number; to: number }[]>();
    for (const removed of plan.removed) for (const binding of oldBindings.get(pathKey(removed.path)) ?? []) {
      const from = Math.max(removed.from, binding.modelFrom), to = Math.min(removed.to, binding.modelFrom + binding.length);
      if (from >= to) continue;
      const start = binding.from + from - binding.modelFrom, end = binding.from + to - binding.modelFrom;
      for (const segment of segments.get(binding.id) ?? []) {
        const a = Math.max(start, segment.from), b = Math.min(end, segment.to);
        if (a < b) { const entries = deletions.get(segment.id) ?? []; entries.push({ from: a - segment.from, to: b - segment.from }); deletions.set(segment.id, entries); }
      }
    }
    for (const [id, ranges] of deletions) for (const range of ranges.sort((a, b) => b.from - a.from)) this.text.delete(id, range.from, range.to);
    for (const inserted of plan.inserted) {
      const leaf = leaves.get(pathKey(inserted.path))!, group = groupFor.get(leaf)!, at = leaf.at + inserted.from;
      const right = group.pieces.filter(piece => piece.at >= at).sort((a, b) => a.at - b.at)[0];
      const left = group.pieces.filter(piece => piece.at + piece.to - piece.from <= at).sort((a, b) => b.at + b.to - b.from - a.at - a.to + a.from)[0];
      const anchor = right?.start ?? left?.end, resolved = anchor ? this.text.resolve(anchor) : undefined;
      const id = resolved?.id ?? group.ids[0], offset = resolved?.offset ?? 0, value = leaf.node.text!.slice(inserted.from, inserted.to);
      this.text.insert(id, offset, value, format(leaf.node, leaf.leaf));
      group.pieces.push({ original: id, id, from: 0, to: value.length, at, group, leaf,
        start: this.text.relative(id, offset, 1), end: this.text.relative(id, offset + value.length, -1) });
    }
    for (const group of groups) {
      group.field = this.groups.get(group.ids[0])?.value.textLayout?.field ?? group.ids[0];
      if (group.preserved) continue;
      group.pieces.sort((a, b) => a.at - b.at);
      group.ids = [...new Set([...group.pieces.map(piece => piece.id!), ...group.ids])];
      for (const id of group.ids) this.nodes.setTextLayout(id, { field: group.field, empty: group.empty });
      for (const piece of group.pieces) {
        if (piece.from === piece.to) continue;
        const start = this.text.resolve(piece.start), end = this.text.resolve(piece.end);
        if (!start || !end || start.id !== end.id) throw new Error('Retained formatting crossed a shared boundary.');
        const desired = format(piece.leaf.node, piece.leaf.leaf); let offset = 0;
        for (const run of this.text.project(start.id).runs) {
          const from = Math.max(offset, start.offset), to = Math.min(offset + run.text.length, end.offset); offset += run.text.length;
          if (from >= to) continue;
          const patch: Record<string, string | null> = {};
          for (const key of new Set([...Object.keys(run.attributes ?? {}), ...Object.keys(desired)])) {
            if (run.attributes?.[key] !== desired[key]) patch[key] = desired[key] ?? null;
          }
          if (Object.keys(patch).length) this.text.format(start.id, from, to, patch);
        }
      }
    }
    // Keep an emptied stream reachable when its parent survives. Concurrent
    // unseen typing must remain visible instead of becoming detached text.
    for (const state of this.groups.values()) if (!assigned.has(state.id) && usedNodes.has(state.parent)) {
      const group = groups.find(entry => entry.parent === state.parent);
      if (group) { group.ids.push(state.id); this.nodes.setTextLayout(state.id, { field: group.field, empty: false }); }
      else {
        expected.get(state.parent)!.push(state.id);
        this.nodes.setTextLayout(state.id, { field: state.value.textLayout!.field, empty: false });
      }
      assigned.add(state.id);
      // No retained target text still means the locally deleted characters
      // should be removed; remote insertions were never in this source range.
      const length = this.text.project(state.id).runs.reduce((sum, run) => sum + run.text.length, 0);
      if (length) this.text.delete(state.id, 0, length);
    }
    for (const [id] of values) if (id !== 'root' && !usedNodes.has(id) && !assigned.has(id)) this.nodes.remove(id);
    const orders = this.nodes.childrenOfMany([...expected.keys()]);
    let reordered = false;
    for (const [parent, children] of expected) {
      const ids = children.flatMap(child => typeof child === 'string' ? [child] : child.ids);
      // A plain edit does not change the sibling order. Revalidate that list
      // once; a move can change later positions, so refresh after each move.
      let current = reordered ? this.nodes.childrenOf(parent) : orders.get(parent)!;
      for (let index = 0; index < ids.length; index++) if (current[index] !== ids[index]) {
        this.nodes.move(ids[index], parent, index);
        reordered = true;
        current = this.nodes.childrenOf(parent);
      }
    }
    if (intent) {
      let divergence = 0;
      while (intent.textPath[divergence] === intent.rightTextPath[divergence]) divergence++;
      const leftId = nextNodes.get(pathKey(intent.textPath.slice(0, divergence + 1)))!;
      const rightId = nextNodes.get(pathKey(intent.rightTextPath.slice(0, divergence + 1)))!;
      const leaf = leaves.get(pathKey(intent.rightTextPath))!, group = groupFor.get(leaf)!;
      const previous = this.splitPlacement(leftId), root = previous?.root ?? leftId;
      this.splits.set(rightId, { root, rootToken: this.nodes.placementIdentity(root)!, token: this.nodes.placementIdentity(rightId)!, partition: group.ids[0] } satisfies SplitPlacement);
    }
    return this.finishChange(after, undefined, shared);
  }

  destroy(): void { this.document.off('afterTransaction', this.sharedFrameChanged); this.clearFrame(); this.text.destroy(); this.model = undefined; this.graph = undefined; this.groups.clear(); this.textPaths.clear(); this.nodePaths.clear(); this.textLocations.clear(); this.identityPaths.clear(); this.partitionPaths.clear(); }
}
