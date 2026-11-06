import type * as Y from 'yjs';
import type { Attributes, MarkJSON, Node, Schema } from '../core/schema';
import { Mapping } from '../core/transaction/mapping';
import type { Step } from '../core/transaction/step';
import type { Transaction } from '../core/transaction/transaction';
import { RetainedNodeStore, retainedNameKey as nameKey, retainedKeyName as keyName, validateRetainedMetadata, type RetainedNodeProjection } from './retained-nodes';
import { RetainedTextStore, validateRetainedTextFormat, type RetainedTextRun } from './retained-text';
import { planRetainedNodeStarts, planRetainedText } from './retained-mapping';

const VERSION = 'fountain-retained-document/3';
const LEAF = 'fountain_leaf', ORDER = 'fountain_marks';
const pathKey = (path: readonly number[]) => path.join('.');
const same = (left: unknown, right: unknown): boolean => {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, canonical(entry)])) : value;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
};
interface Binding { id: string; from: number; length: number; modelFrom: number; leaf: string }
interface GroupState { id: string; parent: string; value: RetainedNodeProjection }
interface Leaf { node: Node; path: number[]; at: number; leaf: string }
interface Group { parent: string; leaves: Leaf[]; ids: string[]; field: string; pieces: Piece[]; empty: boolean }
interface Piece { original: string; from: number; to: number; at: number; group: Group; start?: unknown; end?: unknown; id?: string; leaf: Leaf }
interface Segment { original: string; id: string; from: number; to: number; group: Group }
interface Fragment { node: Node; id?: string; leaf?: string; bindings?: Binding[]; children?: Fragment[] }
interface SplitPlacement { root: string; rootToken: string; token: string; partition: string }

function format(node: Node, leaf: string): Record<string, string> {
  const result: Record<string, string> = { [LEAF]: leaf }, order: string[] = [], counts = new Map<string, number>();
  for (const [name, value] of Object.entries(node.attrs)) result[`a_${nameKey(name)}`] = JSON.stringify(value);
  for (const mark of node.marks) {
    const ordinal = counts.get(mark.type.name) ?? 0; counts.set(mark.type.name, ordinal + 1);
    const key = `m_${nameKey(mark.type.name)}_${ordinal}`; result[key] = JSON.stringify(mark.attrs); order.push(key);
  }
  result[ORDER] = JSON.stringify(order); return result;
}

export function validateRetainedDocument(document: Node, schema: Schema): void {
  if (document.type.schema !== schema) throw new Error('Retained document belongs to another schema.');
  let nodes = 0, characters = 0;
  document.descendants((node, path) => {
    if (++nodes > 100_000 || path.length > 100 || (characters += node.text?.length ?? 0) > 10_000_000) throw new RangeError('Retained document is too large.');
    validateRetainedMetadata(node.attrs); validateRetainedMetadata(node.marks.map(mark => mark.toJSON()));
    if (node.type.name.length > 200 || Object.keys(node.attrs).length > 1_000 || Object.keys(node.attrs).some(name => name.length > 200)) throw new RangeError('Retained node metadata exceeds the candidate storage bounds.');
    if (node.isText) validateRetainedTextFormat(format(node, 'preflight'));
  });
  schema.validate(document);
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
  private nodePaths = new Map<string, string>();
  private textPaths = new Map<string, Binding[]>();
  private identityPaths = new Map<string, readonly number[]>();
  private partitionPaths = new Map<string, { path: readonly number[]; binding: Binding }[]>();
  private leafPaths = new Map<string, string>();
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

  private orderedChildren(raw: RetainedNodeProjection): readonly RetainedNodeProjection[] {
    const result = [...raw.content], families = new Map<string, { index: number; node: RetainedNodeProjection; rank: number; stream: string }[]>();
    for (let index = 0; index < result.length; index++) {
      const node = result[index], placement = this.splitPlacement(node.id);
      if (!placement || !result.some(child => child.id === placement.root)) continue;
      const partition = this.text.project(placement.partition), entries = families.get(placement.root) ?? [];
      entries.push({ index, node, rank: partition.from, stream: partition.streamId }); families.set(placement.root, entries);
    }
    for (const [root, entries] of families) {
      if (new Set(entries.map(entry => entry.stream)).size !== 1) throw new Error('Retained split family crosses text streams.');
      const rootIndex = result.findIndex(child => child.id === root), slots = [rootIndex, ...entries.map(entry => entry.index)].sort((a, b) => a - b);
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
    if (this.metadata.get('seeded') === true || this.nodes.project().root.content.length) throw new Error('Retained document is already initialized.');
    this.document.transact(() => {
      this.metadataFor('root', this.nodes.project().root, source);
      const visit = (node: Node, parent: string): void => {
        for (let index = 0; index < node.childCount;) {
          const child = node.child(index);
          if (!child.isText) {
            const id = this.nodes.create({ type: child.type.name, attrs: { ...child.attrs }, marks: child.marks.map(mark => mark.toJSON()) }, parent);
            visit(child, id); index++; continue;
          }
          const content: Node[] = [child]; index++;
          if (child.nodeSize) while (index < node.childCount && node.child(index).isText && node.child(index).nodeSize) content.push(node.child(index++));
          const id = this.nodes.create({ type: 'text', attrs: { ...child.attrs }, marks: child.marks.map(mark => mark.toJSON()) }, parent);
          this.nodes.setTextLayout(id, { field: id, empty: child.nodeSize === 0 });
          this.text.create(this.createId(), id, content.filter(text => text.nodeSize).map(text => ({ text: text.text!, attributes: format(text, this.createId()) })));
        }
      };
      visit(source, 'root'); this.metadata.set('seeded', true);
    }, this.origin);
    const projected = this.read();
    if (!same(projected.toJSON(), source.toJSON())) throw new Error('Retained seed changed source content.');
    this.model = source; return projected;
  }

  private textNode(text: string, attrs: Attributes, marks: readonly MarkJSON[]): Node {
    return this.schema.nodes.text.create(attrs, [], text, marks.map(mark => this.schema.markFromJSON(mark)));
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

  read(validate = true): Node {
    if (this.metadata.get('version') !== VERSION || this.metadata.get('seeded') !== true) throw new Error('Retained document is not initialized.');
    const projection = this.nodes.project();
    if (projection.issues.some(issue => issue.kind === 'unattached')) throw new Error('Retained document has unattached records.');
    const groupStates = new Map<string, GroupState>();
    const visit = (raw: RetainedNodeProjection): Fragment => {
      if (!Object.hasOwn(this.schema.nodes, raw.type)) throw new Error(`Unknown retained node type: ${raw.type}`);
      const activeFields = new Set<string>();
      const ordered = this.orderedChildren(raw);
      for (const child of ordered) if (child.type === 'text') {
        if (!child.textLayout || !this.text.has(child.id)) throw new Error(`Missing retained text layout for ${child.id} (layout: ${!!child.textLayout}, stream: ${this.text.has(child.id)}).`);
        if (this.text.project(child.id).runs.some(run => run.text.length)) activeFields.add(child.textLayout.field);
      }
      const emittedEmpty = new Set<string>(), children: Fragment[] = [];
      const append = (next: Fragment) => {
        const previous = children.at(-1);
        if (previous?.leaf && previous.leaf === next.leaf && previous.node.isText && next.node.isText
          && same(previous.node.attrs, next.node.attrs) && same(previous.node.marks.map(mark => mark.toJSON()), next.node.marks.map(mark => mark.toJSON()))) {
          const length = previous.node.nodeSize;
          previous.node = previous.node.withText(previous.node.text! + next.node.text!);
          previous.bindings!.push(...next.bindings!.map(binding => ({ ...binding, modelFrom: binding.modelFrom + length })));
        } else children.push(next);
      };
      for (const child of ordered) {
        if (child.type !== 'text') { append(visit(child)); continue; }
        groupStates.set(child.id, { id: child.id, parent: raw.id, value: child });
        const partition = this.text.project(child.id);
        let offset = 0;
        for (const run of partition.runs) {
          const decoded = this.decode(run);
          append({ node: this.textNode(run.text, decoded.attrs, decoded.marks), leaf: decoded.leaf,
            bindings: [{ id: child.id, from: offset, length: run.text.length, modelFrom: 0, leaf: decoded.leaf }] });
          offset += run.text.length;
        }
        const layout = child.textLayout!;
        if (!offset && layout.empty && !activeFields.has(layout.field) && !emittedEmpty.has(layout.field)) {
          emittedEmpty.add(layout.field);
          append({ node: this.textNode('', child.attrs ?? {}, child.marks ?? []), leaf: child.id,
            bindings: [{ id: child.id, from: 0, length: 0, modelFrom: 0, leaf: child.id }] });
        }
      }
      const node = this.schema.nodes[raw.type].create(raw.attrs ?? {}, children.map(child => child.node), undefined,
        (raw.marks ?? []).map(mark => this.schema.markFromJSON(mark)));
      return { node, id: raw.id, children };
    };
    const result = visit(projection.root);
    if (validate) this.schema.validate(result.node);
    const nodePaths = new Map<string, string>(), textPaths = new Map<string, Binding[]>(), leafPaths = new Map<string, string>();
    const bind = (fragment: Fragment, path: number[]) => {
      if (fragment.id) nodePaths.set(pathKey(path), fragment.id);
      if (fragment.bindings) { textPaths.set(pathKey(path), fragment.bindings); leafPaths.set(pathKey(path), fragment.leaf!); }
      fragment.children?.forEach((child, index) => bind(child, [...path, index]));
    };
    bind(result, []); this.nodePaths = nodePaths; this.textPaths = textPaths; this.leafPaths = leafPaths;
    this.identityPaths = new Map([...nodePaths].map(([path, id]) => [id, Object.freeze(path ? path.split('.').map(Number) : [])]));
    const partitionPaths = new Map<string, { path: readonly number[]; binding: Binding }[]>();
    for (const [key, bindings] of textPaths) {
      const path = Object.freeze(key.split('.').map(Number));
      for (const binding of bindings) {
        const entries = partitionPaths.get(binding.id) ?? []; entries.push({ path, binding }); partitionPaths.set(binding.id, entries);
      }
    }
    this.partitionPaths = partitionPaths;
    this.groups = groupStates; this.graph = projection.root; this.model = result.node;
    return result.node;
  }

  apply(transaction: Transaction): Node {
    if (!this.model || !same(this.model.toJSON(), transaction.originalDoc.toJSON())) throw new Error('Retained transaction uses a stale source.');
    this.validate(transaction.doc);
    let before = transaction.originalDoc;
    // Validate every step's provenance before writing any shared state. A later
    // invalid custom step must not leave an earlier valid step half-applied.
    const changes = transaction.steps.map(step => {
      const after = step.apply(before), mapping = new Mapping(step.getMaps?.(before) ?? [step.getMap(before)]);
      planRetainedText(before, after, mapping);
      const change = { before, after, mapping, step }; before = after; return change;
    });
    this.document.transact(() => {
      for (const change of changes) this.change(change.before, change.after, change.mapping, change.step);
    }, this.origin);
    return this.read();
  }

  private change(before: Node, after: Node, mapping: Mapping, step: Step): void {
    const plan = planRetainedText(before, after, mapping), oldNodes = this.nodePaths, oldBindings = this.textPaths;
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
    for (const retained of plan.retained) {
      const key = pathKey(retained.after.path), ids = candidates.get(key) ?? [];
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
        groups.push(group); children.push(group);
      }
    };
    visit(after, [], 'root');
    const groupFor = new Map<Leaf, Group>(); groups.forEach(group => group.leaves.forEach(leaf => groupFor.set(leaf, group)));
    for (const retained of plan.retained) {
      const leaf = leaves.get(pathKey(retained.after.path))!, group = groupFor.get(leaf)!;
      for (const binding of oldBindings.get(pathKey(retained.before.path)) ?? []) {
        const from = Math.max(binding.modelFrom, retained.before.from), to = Math.min(binding.modelFrom + binding.length, retained.before.to);
        if (from < to) group.pieces.push({ original: binding.id, from: binding.from + from - binding.modelFrom,
          to: binding.from + to - binding.modelFrom, at: leaf.at + retained.after.from + from - retained.before.from, group, leaf });
      }
    }
    // Splitting an empty block, or at either edge, still needs a shared marker:
    // there may be no retained character on one side to imply the boundary.
    const intent = (step as Step & { getRetainedSplit?: () => { textPath: readonly number[]; rightTextPath: readonly number[]; offset: number } }).getRetainedSplit?.();
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
    for (const [parent, children] of expected) {
      const ids = children.flatMap(child => typeof child === 'string' ? [child] : child.ids);
      for (let index = 0; index < ids.length; index++) if (this.nodes.childrenOf(parent)[index] !== ids[index]) this.nodes.move(ids[index], parent, index);
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
    const projected = this.read(false);
    if (!same(projected.toJSON(), after.toJSON())) throw new Error('Retained transaction changed the native document shape.');
    this.model = after;
  }

  destroy(): void { this.text.destroy(); this.model = undefined; this.graph = undefined; this.groups.clear(); this.textPaths.clear(); this.nodePaths.clear(); this.leafPaths.clear(); this.identityPaths.clear(); this.partitionPaths.clear(); }
}
