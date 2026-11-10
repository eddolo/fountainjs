import * as Y from 'yjs';

const VERSION = 'fountain-retained-text/3';
const MARKER = '$fountain:partition';
const PROVENANCE = '$f';
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;
const SAFE_ATTRIBUTE = /^[A-Za-z_][\w.:-]{0,2047}$/;
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_TEXT = 10_000_000;
const MAX_PARTITIONS = 100_000;
const MAX_ATTRIBUTES = 1_000;
const MAX_ATTRIBUTE_LENGTH = 1_000_000;
const MAX_PROVENANCE = 2_000_000;

/** A native undo can delete only redundant provenance resets after another
 * author deletes the associated text. Check the surviving wire attributes. */
export function removesOnlyDuplicateProvenance(transaction: Y.Transaction): boolean {
  const [change] = transaction.changed;
  if (transaction.changed.size !== 1 || !change || !(change[0] instanceof Y.Text)
    || change[1].size !== 1 || !change[1].has(null)) return false;
  for (const [client, clock] of transaction.afterState) {
    if (clock !== (transaction.beforeState.get(client) ?? 0)) return false;
  }
  let deleted = 0;
  for (const ranges of transaction.deleteSet.clients.values()) {
    for (const range of ranges) deleted += range.len;
  }
  if (!deleted || deleted > 32) return false;

  let duplicate = true;
  Y.iterateDeletedStructs(transaction, transaction.deleteSet, item => {
    if (!duplicate) return;
    if (!(item instanceof Y.Item) || item.parent !== change[0]
      || !(item.content instanceof Y.ContentFormat) || item.content.key !== PROVENANCE
      || !Array.isArray(item.content.value) || item.content.value.length !== 3) {
      duplicate = false;
      return;
    }
    const provenance = item.content.value;
    // Deleted markers in the same transaction cannot prove equivalence.
    let previous = item.left;
    for (let hops = 0; previous && hops < 64; hops++, previous = previous.left) {
      const format = previous.content;
      if (previous.deleted || !(format instanceof Y.ContentFormat) || format.key !== PROVENANCE) continue;
      const value: unknown = format.value;
      duplicate = Array.isArray(value) && value.length === 3
        && value.every((part, index) => Number.isSafeInteger(part) && part === provenance[index]);
      return;
    }
    duplicate = false;
  });
  return duplicate;
}

export interface RetainedTextRun {
  readonly text: string;
  /** Opaque serialized mark/attribute values; decoding belongs to the schema adapter. */
  readonly attributes?: Readonly<Record<string, string>>;
}

export interface RetainedTextPartition {
  readonly id: string;
  readonly streamId: string;
  /** Y.Text positions, including private boundary embeds. Never model offsets. */
  readonly from: number;
  readonly to: number;
  readonly runs: readonly RetainedTextRun[];
}
export interface RetainedTextSeed {
  readonly stream: string;
  readonly id: string;
  readonly runs: readonly RetainedTextRun[];
}

const styleEncoding = (value: Readonly<Record<string, string>>) => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));

interface StreamRead {
  readonly text: Y.Text;
  readonly entries: readonly RetainedTextPartition[];
  readonly byId: ReadonlyMap<string, RetainedTextPartition>;
}
interface TextRead {
  readonly partitions: ReadonlyMap<string, RetainedTextPartition>;
  readonly streams: ReadonlyMap<string, StreamRead>;
}

interface DecodedFormatCache {
  previous?: { client: number; style: number; raw: Record<string, unknown>; value: Record<string, string> };
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value) && !UNSAFE.has(value);
}

function attributes(value: unknown, remove = false): Record<string, string | null> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) throw new TypeError('Invalid retained text attributes.');
  const entries = Object.entries(value);
  if (entries.length > MAX_ATTRIBUTES) throw new RangeError('Too many retained text attributes.');
  for (const [key, entry] of entries) {
    if (!SAFE_ATTRIBUTE.test(key) || UNSAFE.has(key) || !(typeof entry === 'string' && entry.length <= MAX_ATTRIBUTE_LENGTH || remove && entry === null)) {
      throw new TypeError('Invalid retained text attribute.');
    }
  }
  return Object.fromEntries(entries);
}
export function validateRetainedTextFormat(value: Readonly<Record<string, string>>): void {
  const format = attributes(value);
  if (JSON.stringify({ id: '9007199254740991:9007199254740991', attributes: format }).length > MAX_PROVENANCE) throw new RangeError('Retained format provenance is too large.');
}

// Keep removals as explicit shared values. Absence alone cannot distinguish a
// concurrent deletion of a formatting item from an intentional mark removal.
function encodeAttributes(value: Readonly<Record<string, string | null>>): Record<string, string | false> {
  // Logical values are always strings. A boolean is an unambiguous removal
  // value, with no second JSON encoding of potentially large source strings.
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, entry === null ? false : entry]));
}

function decodeFields(raw: Record<string, unknown>): Record<string, string | null> {
  return attributes(Object.fromEntries(Object.entries(raw).filter(([key]) => key !== PROVENANCE).map(([key, entry]) => {
    if (entry !== false && (typeof entry !== 'string' || entry.length > MAX_ATTRIBUTE_LENGTH)) throw new Error('Invalid retained format encoding.');
    return [key, entry === false ? null : entry];
  })), true);
}

function decodeAttributes(value: unknown, lookup: (client: number, clock: number) => Readonly<Record<string, string>>, cache?: DecodedFormatCache): Record<string, string> {
  if (value === undefined) throw new Error('Missing retained format provenance.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid retained text attributes.');
  const raw = value as Record<string, unknown>, provenance = raw[PROVENANCE];
  if (!Object.hasOwn(raw, PROVENANCE)) throw new Error('Missing retained format provenance.');
  if (!Array.isArray(provenance) || provenance.length !== 3 || provenance.some(entry => !Number.isSafeInteger(entry) || entry < 0)) throw new Error('Invalid retained format provenance.');
  const previous = cache?.previous, keys = Object.keys(raw);
  if (previous && previous.client === provenance[0] && previous.style === provenance[2] && keys.length === Object.keys(previous.raw).length
    && keys.every(key => key === PROVENANCE || Object.hasOwn(previous.raw, key) && raw[key] === previous.raw[key])) return previous.value;
  const original = lookup(provenance[0], provenance[2]);
  const current = decodeFields(raw);
  const result = { ...original };
  for (const [key, entry] of Object.entries(current)) { if (entry === null) delete result[key]; else result[key] = entry; }
  const decoded = Object.fromEntries(Object.entries(result).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  if (cache) cache.previous = { client: provenance[0], style: provenance[2], raw, value: decoded };
  return decoded;
}

/** Internal candidate storage for the next collaboration representation.
 * Character sequences live outside the document tree. Private boundary embeds
 * partition them without copying characters or exposing embeds as document text.
 * This is deliberately not wired into, or exported by, the existing adapter. */
export class RetainedTextStore {
  readonly metadata: Y.Map<unknown>;
  readonly scope: readonly Y.Map<unknown>[];
  readonly observed: readonly Y.Map<unknown>[];
  private readonly texts: Y.Map<unknown>;
  private readonly owners: Y.Map<unknown>;
  private readonly styles: Y.Map<unknown>;
  private localStyles = new Map<string, number>();
  private decodedStyles = new Map<string, { encoded: string; value: Readonly<Record<string, string>> }>();
  private destroyed = false;

  constructor(readonly document: Y.Doc, name: string, private readonly origin?: unknown) {
    if (!(document instanceof Y.Doc) || !validId(name)) throw new TypeError('Invalid retained text namespace.');
    // Named shared containers merge even when two peers initialize offline.
    // Assigning fresh nested maps to the same metadata keys would choose one
    // map through LWW conflict resolution and detach the other peer's content.
    this.metadata = document.getMap(`${name}:metadata`);
    if (this.metadata.size === 0) document.transact(() => this.metadata.set('version', VERSION), origin);
    if (this.metadata.get('version') !== VERSION) throw new Error('Unsupported retained text representation.');
    this.texts = document.getMap(`${name}:texts`); this.owners = document.getMap(`${name}:owners`);
    this.styles = document.getMap(`${name}:styles`);
    // Immutable style definitions are metadata. Undoing the insertion that
    // first introduced a style must not strand another insertion's reference.
    this.scope = Object.freeze([this.texts, this.owners]);
    this.observed = Object.freeze([...this.scope, this.metadata, this.styles]);
  }

  private clock(): number { return Y.getState(this.document.store, this.document.clientID); }

  private provenance(value: Readonly<Record<string, string>>, seedStyles?: Set<string>): readonly number[] {
    const encoded = styleEncoding(value);
    const client = this.document.clientID, key = `${client}:${encoded}`;
    let style = this.localStyles.get(key);
    if (style === undefined) {
      if (seedStyles) {
        if (!seedStyles.delete(encoded)) throw new Error('Retained seed style was not reserved.');
      } else if (this.styles.size >= MAX_PARTITIONS) throw new RangeError('Retained style definitions need compaction.');
      style = this.clock(); this.styles.set(`${client}:${style}`, encoded); this.localStyles.set(key, style);
    } else if (this.styles.get(`${client}:${style}`) !== encoded) throw new Error('Retained style definition was changed.');
    return [client, this.clock(), style];
  }

  private readonly style = (client: number, clock: number): Readonly<Record<string, string>> => {
    const key = `${client}:${clock}`, encoded = this.styles.get(key), cached = this.decodedStyles.get(key);
    if (typeof encoded !== 'string' || encoded.length > MAX_PROVENANCE) throw new Error('Missing retained format provenance definition.');
    if (cached?.encoded === encoded) return cached.value;
    const value = JSON.parse(encoded); validateRetainedTextFormat(value);
    const result = Object.freeze(attributes(value) as Record<string, string>);
    this.decodedStyles.set(key, { encoded, value: result }); return result;
  };

  private assertLive(): void {
    if (this.destroyed) throw new Error('Retained text store is destroyed.');
    if (this.metadata.get('version') !== VERSION) throw new Error('Unsupported retained text representation.');
    if (this.owners.size > MAX_PARTITIONS || this.texts.size > MAX_PARTITIONS) throw new RangeError('Retained text pool is too large.');
    if (this.styles.size > MAX_PARTITIONS) throw new RangeError('Too many retained style definitions.');
  }

  private readStream(id: string): Y.Text {
    const text = this.texts.get(id);
    if (!validId(id) || !(text instanceof Y.Text)) throw new Error('Unknown retained text stream.');
    if (text.length > MAX_TEXT + MAX_PARTITIONS) throw new RangeError('Retained text stream is too large.');
    return text;
  }

  private stream(id: string): Y.Text { this.assertLive(); return this.readStream(id); }

  private index(streamId: string): readonly RetainedTextPartition[] {
    this.assertLive();
    return this.scan(streamId, this.readStream(streamId));
  }

  private scan(streamId: string, text: Y.Text): readonly RetainedTextPartition[] {
    const entries: RetainedTextPartition[] = [], ids = new Set<string>();
    // The insertion nonce changes every keystroke, but its style and explicit
    // field values commonly do not. Reuse only a validated exact wire match.
    const formats: DecodedFormatCache = {};
    let current: { id: string; streamId: string; from: number; to: number; runs: RetainedTextRun[] } | undefined;
    let position = 0, characters = 0;
    for (const operation of text.toDelta()) {
      if (typeof operation.insert === 'string') {
        if (!current) throw new Error('Retained characters need a partition boundary.');
        const format = decodeAttributes(operation.attributes, this.style, formats);
        const previous = current.runs.at(-1), keys = Object.keys(format);
        if (previous && Object.keys(previous.attributes ?? {}).length === keys.length && keys.every(key => previous.attributes?.[key] === format[key])) {
          current.runs[current.runs.length - 1] = Object.freeze({ text: previous.text + operation.insert,
            ...(keys.length ? { attributes: Object.freeze(format) } : {}) });
        } else current.runs.push(Object.freeze({ text: operation.insert,
          ...(keys.length ? { attributes: Object.freeze(format) } : {}) }));
        position += operation.insert.length; characters += operation.insert.length;
      } else {
        const marker = operation.insert;
        if (!marker || typeof marker !== 'object' || Array.isArray(marker) || Object.keys(marker).length !== 1
          || !validId(marker[MARKER])) {
          throw new Error('Unknown retained text embed.');
        }
        // A peer can format across a boundary it has not seen yet. Validate its
        // wire fields, but keep the private embed out of visible text/styles.
        if (operation.attributes) {
          if (Object.hasOwn(operation.attributes, PROVENANCE)) decodeAttributes(operation.attributes, this.style);
          else decodeFields(operation.attributes);
        }
        const id = marker[MARKER] as string;
        if (ids.has(id) || this.owners.get(id) !== streamId) throw new Error('Invalid retained text partition owner.');
        ids.add(id);
        if (current) { current.to = position; Object.freeze(current.runs); Object.freeze(current); }
        current = { id, streamId, from: position + 1, to: position + 1, runs: [] };
        entries.push(current); position++;
      }
      if (characters > MAX_TEXT || entries.length > MAX_PARTITIONS) throw new RangeError('Retained text stream is too large.');
    }
    if (current) { current.to = position; Object.freeze(current.runs); Object.freeze(current); }
    return Object.freeze(entries);
  }

  private freshId(id: string): void {
    this.assertLive();
    if (!validId(id) || this.owners.has(id)) throw new Error('Invalid or duplicate retained text partition ID.');
    if (this.owners.size >= MAX_PARTITIONS) throw new RangeError('Too many retained text partitions.');
  }

  private prepareRuns(runs: readonly RetainedTextRun[]) {
    if (!Array.isArray(runs) || Object.keys(runs).length !== runs.length || Object.getOwnPropertySymbols(runs).length) throw new TypeError('Invalid retained text runs.');
    let length = 0;
    return Array.from(runs, run => {
      const text = run.text, format = attributes(run.attributes) as Record<string, string>;
      if (typeof text !== 'string' || (length += text.length) > MAX_TEXT) throw new RangeError('Invalid retained text length.');
      validateRetainedTextFormat(format);
      return { text, attributes: format };
    });
  }

  /** Fresh-pool initialization with capacity reserved before any shared write. */
  seed(entries: readonly RetainedTextSeed[]): void {
    const empty = () => {
      this.assertLive();
      if (this.texts.size || this.owners.size || this.styles.size || this.localStyles.size || this.decodedStyles.size) throw new Error('Retained text seed requires fresh pools.');
    };
    empty();
    if (!Array.isArray(entries) || entries.length > MAX_PARTITIONS || Object.keys(entries).length !== entries.length || Object.getOwnPropertySymbols(entries).length) throw new RangeError('Invalid retained text seed.');
    const streams = new Set<string>(), partitions = new Set<string>(), styles = new Set<string>();
    const prepared = Array.from(entries, entry => {
      const stream = entry.stream, id = entry.id;
      if (!validId(stream) || !validId(id) || streams.has(stream) || partitions.has(id)) throw new Error('Invalid or duplicate retained seed identity.');
      streams.add(stream); partitions.add(id);
      const runs = this.prepareRuns(entry.runs);
      for (const run of runs) if (run.text) styles.add(styleEncoding(run.attributes));
      if (styles.size > MAX_PARTITIONS) throw new RangeError('Too many retained seed style definitions.');
      return { stream, id, runs };
    });
    // Getters may write into the pools during preflight. Preserve those writes.
    empty();
    this.document.transact(() => {
      for (const entry of prepared) {
        const text = new Y.Text(); this.texts.set(entry.stream, text); this.owners.set(entry.id, entry.stream);
        text.insertEmbed(0, { [MARKER]: entry.id }, {});
        for (const run of entry.runs) if (run.text) {
          text.insert(text.length, run.text, { ...encodeAttributes(run.attributes), [PROVENANCE]: this.provenance(run.attributes, styles) });
        }
      }
    }, this.origin);
  }

  create(streamId: string, id: string, runs: readonly RetainedTextRun[]): void {
    this.freshId(id);
    if (!validId(streamId) || this.texts.has(streamId)) throw new Error('Invalid or duplicate retained text stream ID.');
    const safeRuns = this.prepareRuns(runs);
    this.document.transact(() => {
      const text = new Y.Text(); this.texts.set(streamId, text); this.owners.set(id, streamId);
      text.insertEmbed(0, { [MARKER]: id }, {});
      for (const run of safeRuns) if (run.text) {
        text.insert(text.length, run.text, { ...encodeAttributes(run.attributes), [PROVENANCE]: this.provenance(run.attributes as Record<string, string>) });
      }
    }, this.origin);
  }

  project(id: string): RetainedTextPartition {
    return this.projectMany([id]).get(id)!;
  }

  /** Internal proof for one native edit in an otherwise untouched transaction.
   * New format definitions may be added, but old definitions, ownership and
   * other streams must not change. The complete edited stream is read again. */
  prepareNativeProjection(id: string, transaction: Y.Transaction): {
    partition: RetainedTextPartition;
    unchangedOutside: () => boolean;
    partitions: () => readonly RetainedTextPartition[] | undefined;
  } {
    if (transaction.doc !== this.document || transaction.changed.size) throw new Error('Native projection needs a clean owning transaction.');
    const frame = this.readFrame([id]), partition = frame.partitions.get(id)!, stream = frame.streams.get(partition.streamId)!;
    const nextStyle = `${this.document.clientID}:${this.clock()}`, unusedStyle = !this.styles.has(nextStyle);
    const unchangedOutside = (): boolean => [...transaction.changed].every(([type, keys]) =>
      Object.is(type, stream.text) && keys.size === 1 && keys.has(null)
      || Object.is(type, this.styles) && unusedStyle && keys.size === 1 && keys.has(nextStyle));
    return { partition, unchangedOutside, partitions: () => {
      if (!unchangedOutside()) return;
      const current = this.partitions(partition.streamId);
      if (current.length !== stream.entries.length || current.some((entry, index) => entry.id !== stream.entries[index]!.id)) return;
      return current;
    } };
  }

  refreshRemotePartitions(transaction: Y.Transaction, previous: ReadonlyMap<string, RetainedTextPartition>): ReadonlyMap<string, RetainedTextPartition> | undefined {
    const streams = new Set<string>();
    for (const [type, keys] of transaction.changed) {
      if (!(type instanceof Y.Text) || type.parent !== this.texts || keys.size !== 1 || !keys.has(null)) return;
      const id = type._item?.parentSub;
      if (!validId(id) || this.texts.get(id) !== type) return;
      streams.add(id);
    }
    if (!streams.size) return;
    this.assertLive();
    const pending = new Set<string>();
    const visibleStreams = new Set<string>();
    for (const [id, partition] of previous) {
      if (!streams.has(partition.streamId)) continue;
      pending.add(id);
      visibleStreams.add(partition.streamId);
    }
    if (visibleStreams.size !== streams.size) return;
    const partitions = new Map(previous);
    for (const id of streams) {
      for (const entry of this.scan(id, this.readStream(id))) {
        const old = previous.get(entry.id);
        if (!old) continue;
        if (old.streamId !== id) return;
        partitions.set(entry.id, entry);
        pending.delete(entry.id);
      }
    }
    return pending.size ? undefined : partitions;
  }

  /** Insert clocks alone miss deletions. Compare both public transaction facts. */
  writeVersion(transaction: Y.Transaction): string {
    let deleted = 0;
    for (const ranges of transaction.deleteSet.clients.values()) for (const range of ranges) deleted += range.len;
    // This stamp is compared only within one document. The live clocks catch
    // nested writes that are not yet reflected in the transaction's afterState.
    const store = this.document.store;
    let clocks = '';
    for (const client of store.clients.keys()) clocks += `${client}:${Y.getState(store, client)},`;
    return `${clocks}/${deleted}`;
  }

  /** One synchronous read, not a cache that can outlive pending Yjs edits. */
  projectMany(ids: readonly string[]): ReadonlyMap<string, RetainedTextPartition> {
    return this.readFrame(ids).partitions;
  }

  private readFrame(ids: readonly string[]): TextRead {
    this.assertLive();
    if (ids.length > MAX_PARTITIONS) throw new RangeError('Too many retained text partitions.');
    const streams = new Map<string, StreamRead>(), result = new Map<string, RetainedTextPartition>();
    for (const id of ids) {
      const streamId = this.owners.get(id);
      if (!validId(id) || !validId(streamId)) throw new Error('Unknown retained text partition.');
      let stream = streams.get(streamId);
      if (!stream) {
        const text = this.readStream(streamId), entries = this.scan(streamId, text);
        stream = { text, entries, byId: new Map(entries.map(entry => [entry.id, entry])) };
        streams.set(streamId, stream);
      }
      const entry = stream.byId.get(id);
      if (!entry) throw new Error('Retained text partition boundary is missing.');
      result.set(id, entry);
    }
    return { partitions: result, streams };
  }

  has(id: string): boolean { this.assertLive(); return validId(id) && this.owners.has(id); }

  /** A stream and its initial boundaries outlive undo of their authoring. */
  retainUndoAllocation(item: Y.Item, insertions: Y.Transaction['deleteSet']): boolean {
    if (item.parent === this.texts && item.content instanceof Y.ContentType && item.content.type instanceof Y.Text) return true;
    const created = (stream: unknown): boolean => {
      if (!(stream instanceof Y.Text) || stream.parent !== this.texts) return false;
      const allocation = Y.createRelativePositionFromTypeIndex(stream, 0).type;
      return !!allocation && Y.isDeleted(insertions, allocation);
    };
    if (item.parent === this.owners) {
      const stream = this.texts.get(item.content.getContent()[0]);
      return created(stream);
    }
    return item.content instanceof Y.ContentEmbed && created(item.parent);
  }

  partitions(streamId: string): readonly RetainedTextPartition[] { return this.index(streamId); }

  private position(partition: RetainedTextPartition, offset: number): number {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > partition.to - partition.from) throw new RangeError('Invalid retained text offset.');
    return partition.from + offset;
  }

  private point(id: string, offset: number): { partition: RetainedTextPartition; text: Y.Text; position: number; characters: number } {
    const frame = this.readFrame([id]), partition = frame.partitions.get(id)!, stream = frame.streams.get(partition.streamId)!;
    return { partition, text: stream.text, position: this.position(partition, offset), characters: stream.text.length - stream.entries.length };
  }

  private wireFormatAt(text: Y.Text, index: number): Record<string, unknown> {
    let position = 0, previous: Record<string, unknown> = {};
    for (const operation of text.toDelta()) {
      const length = typeof operation.insert === 'string' ? operation.insert.length : 1;
      const current = operation.attributes ?? {};
      if (index < position + length) return { ...current };
      previous = current; position += length;
    }
    return { ...previous };
  }

  split(id: string, newId: string, offset: number): void {
    this.freshId(newId);
    const { partition, text, position } = this.point(id, offset);
    const format = this.wireFormatAt(text, position);
    this.document.transact(() => {
      this.owners.set(newId, partition.streamId);
      // A hidden boundary must not introduce a formatting reset through a
      // visible run. That reset could outlive concurrent replacement markers.
      text.insertEmbed(position, { [MARKER]: newId }, format);
    }, this.origin);
  }

  insert(id: string, offset: number, value: string, format?: Readonly<Record<string, string>>): void {
    const safeFormat = attributes(format), { text, position, characters } = this.point(id, offset);
    if (typeof value !== 'string' || characters + value.length > MAX_TEXT) throw new RangeError('Invalid retained text insertion.');
    validateRetainedTextFormat(safeFormat as Record<string, string>);
    this.document.transact(() => {
      if (value) text.insert(position, value, { ...encodeAttributes(safeFormat), [PROVENANCE]: this.provenance(safeFormat as Record<string, string>) });
    }, this.origin);
  }

  delete(id: string, from: number, to: number): void {
    const start = this.point(id, from), end = this.position(start.partition, to);
    if (to < from) throw new RangeError('Retained text deletion must be ordered.');
    this.document.transact(() => { start.text.delete(start.position, end - start.position); }, this.origin);
  }

  format(id: string, from: number, to: number, value: Readonly<Record<string, string | null>>): void {
    const safeFormat = attributes(value, true), start = this.point(id, from), end = this.position(start.partition, to);
    if (to < from) throw new RangeError('Retained text formatting must be ordered.');
    this.document.transact(() => {
      // Keep the insertion-owned provenance immutable. Replacing that marker
      // for an observed range can detach unseen splits from their source.
      start.text.format(start.position, end - start.position, encodeAttributes(safeFormat));
    }, this.origin);
  }

  /** Merge adjacent partitions in one stream without deleting any characters. */
  join(leftId: string, rightId: string): void {
    const frame = this.readFrame([leftId, rightId]), left = frame.partitions.get(leftId)!, right = frame.partitions.get(rightId)!, stream = frame.streams.get(left.streamId)!, entries = stream.entries;
    if (left.streamId !== right.streamId || entries[entries.findIndex(entry => entry.id === leftId) + 1]?.id !== rightId) throw new Error('Only adjacent retained partitions can join.');
    this.document.transact(() => { stream.text.delete(right.from - 1, 1); this.owners.delete(rightId); }, this.origin);
  }

  relative(id: string, offset: number, association: -1 | 1 = 1): unknown {
    if (association !== -1 && association !== 1) throw new RangeError('Invalid retained text association.');
    const { text, position } = this.point(id, offset);
    return Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, position, association));
  }

  resolve(value: unknown): { readonly id: string; readonly offset: number; readonly association: -1 | 1 } | undefined {
    this.assertLive();
    try {
      if (!value || typeof value !== 'object') return undefined;
      const point = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(value), this.document);
      if (!point || !(point.type instanceof Y.Text)) return undefined;
      for (const [streamId, text] of this.texts) if (text === point.type) {
        const entry = this.index(streamId).find(partition => point.index >= partition.from && point.index <= partition.to);
        return entry ? { id: entry.id, offset: point.index - entry.from, association: point.assoc < 0 ? -1 : 1 } : undefined;
      }
    } catch { return undefined; }
    return undefined;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.localStyles.clear(); this.decodedStyles.clear(); this.destroyed = true;
  }
}
