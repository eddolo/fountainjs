import * as Y from 'yjs';
import type { Attributes, MarkJSON } from '../core/schema';

const VERSION = 'fountain-retained-nodes/2';
const ROOT = 'root';
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_NODES = 100_000;
const MAX_REFERENCES = 1_000_000;

interface Placement { readonly parent: string; readonly token: string }
interface Reference { readonly id: string; readonly token: string }
export interface RetainedTextLayout { readonly field: string; readonly empty: boolean }
export interface RetainedNodeValue {
  readonly type: string; readonly attrs?: Attributes; readonly marks?: readonly MarkJSON[];
  /** Private projection state, never stored in application attributes. */
  readonly textLayout?: RetainedTextLayout;
}
export interface RetainedNodeProjection extends RetainedNodeValue {
  readonly id: string;
  readonly content: readonly RetainedNodeProjection[];
}
/** Preallocated candidate identities for one fresh document seed. */
export interface RetainedNodeSeed extends RetainedNodeValue {
  readonly id: string;
  readonly token: string;
  readonly content: readonly RetainedNodeSeed[];
}
export interface RetainedNodeIssue { readonly kind: 'cycle-lifted' | 'duplicate-reference' | 'unattached'; readonly id: string }

function id(value: unknown): value is string { return typeof value === 'string' && SAFE_ID.test(value) && !UNSAFE.has(value); }
function key(value: string): boolean { return typeof value === 'string' && value.length <= 200; }
// Yjs encodes map keys as UTF-8. Encoding the original UTF-16 units first also
// preserves application attribute names containing unpaired surrogates.
export const retainedNameKey = (name: string): string => Array.from({ length: name.length }, (_, index) => name.charCodeAt(index).toString(16).padStart(4, '0')).join('');
export function retainedKeyName(value: string): string {
  if (!/^(?:[a-f0-9]{4}){0,200}$/.test(value)) throw new Error('Invalid retained attribute encoding.');
  return (value.match(/..../g) ?? []).map(entry => String.fromCharCode(Number.parseInt(entry, 16))).join('');
}
function encode(value: unknown): string {
  let entries = 0;
  const ancestors = new Set<object>();
  const validate = (item: unknown, depth = 0): void => {
    if (++entries > 100_000 || depth > 100) throw new RangeError('Retained node value is too large.');
    if (item === null || typeof item === 'string' || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item)) return;
    if (!item || typeof item !== 'object' || ancestors.has(item)
      || !Array.isArray(item) && ![null, Object.prototype].includes(Object.getPrototypeOf(item))) throw new TypeError('Retained metadata must be portable JSON.');
    ancestors.add(item);
    if (Object.getOwnPropertySymbols(item).length) throw new TypeError('Retained metadata cannot contain symbol keys.');
    if (Array.isArray(item)) {
      if (Object.keys(item).length !== item.length) throw new TypeError('Retained metadata cannot contain sparse or extended arrays.');
      for (let index = 0; index < item.length; index++) {
        if (!Object.hasOwn(item, index)) throw new TypeError('Retained metadata cannot contain sparse arrays.');
        validate(item[index], depth + 1);
      }
    }
    else for (const entry of Object.values(item)) {
      validate(entry, depth + 1);
    }
    ancestors.delete(item);
  };
  validate(value);
  const result = JSON.stringify(value);
  if (result.length > 1_000_000) throw new RangeError('Retained node value is too large.');
  return result;
}
export function validateRetainedMetadata(value: unknown): void { encode(value); }
function decode(value: unknown): unknown {
  if (typeof value !== 'string' || value.length > 1_000_000) throw new Error('Invalid retained metadata encoding.');
  const result: unknown = JSON.parse(value); encode(result); return result;
}

/** Internal candidate node pool. Tree placements are references; moving a node
 * never deletes its metadata or descendants. A single placement register picks
 * one owner during concurrent moves. The existing adapter does not use this yet. */
export class RetainedNodeStore {
  readonly metadata: Y.Map<unknown>;
  readonly scope: readonly (Y.Map<unknown> | Y.Array<unknown>)[];
  private readonly nodes: Y.Map<unknown>;
  private readonly placements: Y.Map<unknown>;
  private readonly identities: Y.Map<unknown>;
  private readonly root: Y.Map<unknown>;
  private readonly rootChildren: Y.Array<unknown>;

  constructor(readonly document: Y.Doc, name: string, private readonly createId: () => string, private readonly origin?: unknown) {
    if (!(document instanceof Y.Doc) || !id(name) || typeof createId !== 'function') throw new TypeError('Invalid retained node namespace.');
    this.metadata = document.getMap(`${name}:metadata`);
    if (!this.metadata.size) document.transact(() => this.metadata.set('version', VERSION), origin);
    if (this.metadata.get('version') !== VERSION) throw new Error('Unsupported retained node representation.');
    this.nodes = document.getMap(`${name}:nodes`); this.placements = document.getMap(`${name}:placements`);
    this.identities = document.getMap(`${name}:identities`); this.root = document.getMap(`${name}:root`);
    this.rootChildren = document.getArray(`${name}:root-children`);
    if (!this.root.has('type')) document.transact(() => this.root.set('type', 'doc'), origin);
    this.scope = Object.freeze([this.nodes, this.placements, this.identities, this.root, this.rootChildren]);
  }

  private valid(): void {
    if (this.metadata.get('version') !== VERSION) throw new Error('Unsupported retained node representation.');
    if (this.nodes.size > MAX_NODES || this.identities.size > MAX_REFERENCES) throw new RangeError('Retained node pool is too large.');
  }

  private readRecord(nodeId: string): Y.Map<unknown> {
    if (nodeId === ROOT) return this.root;
    const value = this.nodes.get(nodeId);
    if (!id(nodeId) || !(value instanceof Y.Map)) throw new Error('Unknown retained node.');
    return value;
  }

  private record(nodeId: string): Y.Map<unknown> { this.valid(); return this.readRecord(nodeId); }

  private readChildren(nodeId: string): Y.Array<unknown> {
    if (nodeId === ROOT) return this.rootChildren;
    const value = this.readRecord(nodeId).get('children');
    if (!(value instanceof Y.Array)) throw new Error('Invalid retained children.');
    return value;
  }

  private children(nodeId: string): Y.Array<unknown> { this.valid(); return this.readChildren(nodeId); }

  private fresh(): string {
    this.valid();
    if (this.identities.size >= MAX_REFERENCES) throw new RangeError('Too many retained identities.');
    const next = this.createId();
    if (!id(next) || next === ROOT || this.identities.has(next)) throw new Error('ID factory must supply a fresh retained identity.');
    return next;
  }

  private placement(nodeId: string): Placement | undefined {
    const value = this.placements.get(nodeId);
    if (value === undefined) return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid retained placement.');
    const candidate = value as Record<string, unknown>;
    if (Object.keys(candidate).length !== 2 || !id(candidate.parent) || !id(candidate.token)) throw new Error('Invalid retained placement.');
    return { parent: candidate.parent, token: candidate.token };
  }

  private references(parent: string): readonly Reference[] {
    return this.readReferences(this.children(parent));
  }

  private readReferences(array: Y.Array<unknown>): readonly Reference[] {
    if (array.length > MAX_REFERENCES) throw new RangeError('Too many retained child references.');
    return array.toArray().map(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid retained child reference.');
      const candidate = value as Record<string, unknown>;
      if (Object.keys(candidate).length !== 2 || !id(candidate.id) || !id(candidate.token)) throw new Error('Invalid retained child reference.');
      return { id: candidate.id, token: candidate.token };
    });
  }

  private readLiveChildren(parent: string): readonly string[] {
    return this.readReferences(this.readChildren(parent)).filter(reference => {
      const placement = this.placement(reference.id);
      return placement?.parent === parent && placement.token === reference.token && this.readRecord(reference.id).get('deleted') !== true;
    }).map(reference => reference.id);
  }

  private liveChildren(parent: string): readonly string[] { this.valid(); return this.readLiveChildren(parent); }

  childrenOf(parent: string): readonly string[] { return this.liveChildren(parent); }
  childrenOfMany(parents: readonly string[]): ReadonlyMap<string, readonly string[]> {
    this.valid();
    if (parents.length > MAX_NODES + 1) throw new RangeError('Too many retained parents.');
    return new Map(parents.map(parent => [parent, this.readLiveChildren(parent)]));
  }
  placementIdentity(nodeId: string): string | undefined { this.valid(); return this.placement(nodeId)?.token; }

  private placementTarget(nodeId: string, parent: string, index: number): { array: Y.Array<unknown>; index: number } {
    const target = this.record(parent);
    if (target.get('deleted') === true) throw new Error('Cannot place a retained node inside a deleted parent.');
    const array = this.children(parent), live = this.liveChildren(parent).filter(child => child !== nodeId);
    if (!Number.isSafeInteger(index) || index < 0 || index > live.length) throw new RangeError('Invalid retained child position.');
    const next = live[index];
    const rawIndex = next ? this.references(parent).findIndex(reference => reference.id === next && this.placement(next)?.token === reference.token) : array.length;
    return { array, index: rawIndex };
  }

  private place(nodeId: string, parent: string, token: string, target: { array: Y.Array<unknown>; index: number }): void {
    this.identities.set(token, true);
    target.array.insert(target.index, [{ id: nodeId, token }]);
    this.placements.set(nodeId, { parent, token });
  }

  private prepare(value: RetainedNodeValue) {
    const type = value.type;
    if (!key(type) || !type.length) throw new TypeError('Invalid retained node type.');
    encode(value.attrs ?? {});
    const attrs = Object.entries(value.attrs ?? {}).map(([name, entry]) => {
      if (!key(name)) throw new TypeError('Invalid retained attribute name.');
      return [`attr:${retainedNameKey(name)}`, encode(entry)] as const;
    });
    if (attrs.length > 1_000 || value.marks !== undefined && !Array.isArray(value.marks)) throw new TypeError('Invalid retained node metadata.');
    const marks = value.marks === undefined ? undefined : encode(value.marks);
    const layout = value.textLayout === undefined ? undefined : this.layout(type, value.textLayout);
    return { type, attrs, marks, layout };
  }

  /** Validate a complete fresh tree before writing; never reuse a live-tree cache. */
  seed(content: readonly RetainedNodeSeed[]): void {
    const empty = () => {
      this.valid();
      if (this.nodes.size || this.placements.size || this.identities.size || this.rootChildren.length) throw new Error('Retained node seed requires empty pools.');
    };
    empty();
    const identities = new Set<string>(); let count = 0;
    type Prepared = ReturnType<RetainedNodeStore['prepare']> & { id: string; token: string; content: Prepared[] };
    const prepare = (values: readonly RetainedNodeSeed[], depth: number): Prepared[] => {
      if (!Array.isArray(values) || depth > 100 || values.length > MAX_NODES - count) throw new RangeError('Retained node seed is too large.');
      if (Object.keys(values).length !== values.length || Object.getOwnPropertySymbols(values).length) throw new TypeError('Invalid retained seed children.');
      return Array.from(values, value => {
        if (++count > MAX_NODES) throw new RangeError('Retained node seed is too large.');
        const nodeId = value.id, token = value.token;
        for (const identity of [nodeId, token]) {
          if (!id(identity) || identity === ROOT || identities.has(identity)) throw new Error('Retained seed identities must be distinct and fresh.');
          identities.add(identity);
        }
        const prepared = this.prepare(value);
        return { ...prepared, id: nodeId, token, content: prepare(value.content, depth + 1) };
      });
    };
    const prepared = prepare(content, 0);
    // Input getters can run during preflight; refuse intervening pool writes.
    empty();
    this.document.transact(() => {
      const visit = (values: readonly Prepared[], parent: string, array: Y.Array<unknown>) => {
        for (const value of values) {
          const record = new Y.Map<unknown>(), children = new Y.Array<unknown>();
          record.set('type', value.type); record.set('children', children);
          value.attrs.forEach(([name, entry]) => record.set(name, entry));
          if (value.marks !== undefined) record.set('marks', value.marks);
          if (value.layout !== undefined) record.set('textLayout', value.layout);
          this.nodes.set(value.id, record); this.identities.set(value.id, true);
          this.place(value.id, parent, value.token, { array, index: array.length });
          visit(value.content, value.id, children);
        }
      };
      visit(prepared, ROOT, this.rootChildren);
    }, this.origin);
  }

  create(value: RetainedNodeValue, parent = ROOT, index = this.liveChildren(parent).length): string {
    const nodeId = this.fresh(), token = this.fresh();
    if (nodeId === token) throw new Error('ID factory must supply distinct retained identities.');
    if (this.nodes.size >= MAX_NODES || this.identities.size + 2 > MAX_REFERENCES) throw new RangeError('Retained node pool is too large.');
    const { type, attrs, marks, layout } = this.prepare(value);
    const target = this.placementTarget(nodeId, parent, index);
    this.document.transact(() => {
      const record = new Y.Map<unknown>(); record.set('type', type); record.set('children', new Y.Array());
      attrs.forEach(([name, entry]) => record.set(name, entry)); if (marks !== undefined) record.set('marks', marks);
      if (layout !== undefined) record.set('textLayout', layout);
      this.nodes.set(nodeId, record); this.identities.set(nodeId, true); this.place(nodeId, parent, token, target);
    }, this.origin);
    return nodeId;
  }

  setAttribute(nodeId: string, name: string, value: unknown): void {
    const record = this.record(nodeId);
    if (!key(name)) throw new TypeError('Invalid retained attribute name.');
    const field = `attr:${retainedNameKey(name)}`;
    if (value !== undefined && !record.has(field) && [...record.keys()].filter(entry => entry.startsWith('attr:')).length >= 1_000) {
      throw new RangeError('Too many retained node attributes.');
    }
    const encoded = value === undefined ? undefined : encode(value);
    if (record.get(field) === encoded) return;
    this.document.transact(() => { if (encoded === undefined) record.delete(field); else record.set(field, encoded); }, this.origin);
  }

  setType(nodeId: string, type: string): void {
    const record = this.record(nodeId);
    if (!key(type) || !type.length) throw new TypeError('Invalid retained node type.');
    if (record.get('type') === type) return;
    this.document.transact(() => record.set('type', type), this.origin);
  }

  setMarks(nodeId: string, marks: readonly MarkJSON[] | undefined): void {
    const record = this.record(nodeId);
    if (marks !== undefined && !Array.isArray(marks)) throw new TypeError('Invalid retained node marks.');
    const value = marks === undefined ? undefined : encode(marks);
    if (record.get('marks') === value) return;
    this.document.transact(() => { if (value === undefined) record.delete('marks'); else record.set('marks', value); }, this.origin);
  }

  private layout(type: unknown, value: unknown): RetainedTextLayout {
    if (type !== 'text' || !value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid retained text layout.');
    const candidate = value as Record<string, unknown>;
    if (Object.keys(candidate).length !== 2 || !id(candidate.field) || typeof candidate.empty !== 'boolean') throw new TypeError('Invalid retained text layout.');
    return { field: candidate.field, empty: candidate.empty };
  }

  setTextLayout(nodeId: string, value: RetainedTextLayout): void {
    const record = this.record(nodeId), layout = this.layout(record.get('type'), value);
    const previous = record.get('textLayout') as RetainedTextLayout | undefined;
    if (previous?.field === layout.field && previous.empty === layout.empty) return;
    this.document.transact(() => record.set('textLayout', layout), this.origin);
  }

  move(nodeId: string, parent: string, index: number): void {
    if (nodeId === ROOT || this.record(nodeId).get('deleted') === true) throw new Error('Cannot move the root or a deleted retained node.');
    // Refuse a locally visible cycle. Concurrent cycles are projected below
    // without destructive repair writes or duplicate node ownership.
    let current: string | undefined = parent;
    const seen = new Set<string>();
    while (current && current !== ROOT) {
      if (current === nodeId || seen.has(current)) throw new Error('Retained move would create a cycle.');
      seen.add(current); current = this.placement(current)?.parent;
    }
    const target = this.placementTarget(nodeId, parent, index), token = this.fresh();
    this.document.transact(() => this.place(nodeId, parent, token, target), this.origin);
  }

  remove(nodeId: string): void {
    if (nodeId === ROOT) throw new Error('Cannot delete the retained root.');
    const record = this.record(nodeId);
    this.document.transact(() => record.set('deleted', true), this.origin);
  }

  private value(record: Y.Map<unknown>): RetainedNodeValue {
    const type = record.get('type'), attrs: Attributes = Object.create(null);
    if (typeof type !== 'string' || !type.length || !key(type) || record.size > 1_005
      || record.has('deleted') && typeof record.get('deleted') !== 'boolean') throw new Error('Invalid retained node metadata.');
    // Y.Map key iteration can reflect each peer's arrival order. Metadata
    // projection needs one portable order for equality/fingerprint consumers.
    for (const [name, entry] of [...record].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
      if (name === 'type' || name === 'children' || name === 'deleted' || name === 'marks' || name === 'textLayout') continue;
      if (!name.startsWith('attr:')) throw new Error('Unknown retained node metadata.');
      attrs[retainedKeyName(name.slice(5))] = decode(entry);
    }
    const marks = record.get('marks');
    const decodedMarks = marks === undefined ? undefined : decode(marks);
    if (decodedMarks !== undefined && !Array.isArray(decodedMarks)) throw new Error('Invalid retained node marks.');
    return { type, ...(Object.keys(attrs).length ? { attrs } : {}),
      ...(decodedMarks === undefined ? {} : { marks: decodedMarks as unknown as readonly MarkJSON[] }),
      ...(record.has('textLayout') ? { textLayout: this.layout(type, record.get('textLayout')) } : {}) };
  }

  project(): { readonly root: RetainedNodeProjection; readonly issues: readonly RetainedNodeIssue[] } {
    this.valid();
    const issues: RetainedNodeIssue[] = [], parents = new Map<string, string>(), lifted = new Set<string>();
    const alive = [...this.nodes.keys()].filter(nodeId => {
      if (!id(nodeId) || nodeId === ROOT) throw new Error('Invalid retained node identity.');
      return this.readRecord(nodeId).get('deleted') !== true;
    }).sort();
    for (const nodeId of alive) { const placement = this.placement(nodeId); if (placement) parents.set(nodeId, placement.parent); }
    const completed = new Set<string>();
    for (const nodeId of alive) {
      const path: string[] = [], local = new Map<string, number>();
      let current: string | undefined = nodeId;
      while (current && current !== ROOT && !completed.has(current)) {
        const repeated = local.get(current);
        if (repeated !== undefined) {
          const chosen = path.slice(repeated).sort().at(-1)!;
          parents.set(chosen, ROOT); lifted.add(chosen); issues.push({ kind: 'cycle-lifted', id: chosen }); break;
        }
        local.set(current, path.length); path.push(current); current = parents.get(current);
      }
      path.forEach(entry => completed.add(entry));
    }
    const visited = new Set<string>();
    const visit = (nodeId: string, depth = 0): RetainedNodeProjection => {
      if (depth > 100 || visited.has(nodeId)) throw new Error('Invalid retained node depth or duplicate ownership.');
      visited.add(nodeId);
      const children: string[] = [], seen = new Set<string>();
      const record = this.readRecord(nodeId), array = nodeId === ROOT ? this.rootChildren : record.get('children');
      if (!(array instanceof Y.Array)) throw new Error('Invalid retained children.');
      // Projection is a synchronous read. Pool bounds were checked at entry;
      // validate every reference/record without rescanning global map sizes.
      for (const reference of this.readReferences(array)) {
        const child = reference.id, placement = this.placement(child);
        if (placement?.parent !== nodeId || placement.token !== reference.token
          || this.readRecord(child).get('deleted') === true || parents.get(child) !== nodeId) continue;
        if (seen.has(child)) issues.push({ kind: 'duplicate-reference', id: child });
        else { children.push(child); seen.add(child); }
      }
      if (nodeId === ROOT) for (const child of [...lifted].sort()) if (!seen.has(child)) children.push(child);
      return { id: nodeId, ...this.value(record), content: children.map(child => visit(child, depth + 1)) };
    };
    const root = visit(ROOT);
    for (const nodeId of alive) if (!visited.has(nodeId)) issues.push({ kind: 'unattached', id: nodeId });
    return { root, issues };
  }
}
