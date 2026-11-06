import * as Y from 'yjs';
import type { Node, Schema } from '../core/schema';
import { RetainedDocumentStore, validateRetainedDocument } from './retained-document';
import { assertRetainedWireData } from './retained-wire';

const FORMAT = 'fountain-retained-checkpoint/1';
const ROOM_FORMAT = 'fountain-retained-document/3';
const MAX_BYTES = 64 * 1024 * 1024, MAX_ROOTS = 1_000;
type RootKind = 'map' | 'array' | 'text' | 'xml-fragment' | 'xml-text' | 'unresolved';
interface Root { readonly name: string; readonly kind: RootKind }
export interface RetainedCheckpointManifest {
  readonly format: typeof FORMAT;
  readonly room: string;
  readonly roomId: string;
  readonly schemaVersion: string;
  readonly guid: string;
  readonly gc: boolean;
  readonly roots: readonly Root[];
  readonly bytes: number;
  readonly updateSha256: string;
  readonly documentSha256: string;
  readonly checkpointSha256: string;
}
/** Experimental internal rollback snapshot, not an online compaction or .fjs format. */
export interface RetainedCheckpoint {
  readonly manifest: RetainedCheckpointManifest;
  /** Capture returns an owned copy on every access. */
  readonly update: Uint8Array;
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((value, index) => value === b[index]);
function stableJSON(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJSON).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJSON((value as Record<string, unknown>)[key])).join(',') + '}';
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Checkpoint metadata is not portable JSON.');
  return encoded;
}
async function digest(bytes: Uint8Array): Promise<string> {
  const result = await globalThis.crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}
function version(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Checkpoint needs an explicit schema version.');
}
function rootKind(type: Y.AbstractType<any>): RootKind {
  if (type.constructor === Y.Map) return 'map';
  if (type.constructor === Y.Array) return 'array';
  if (type.constructor === Y.Text) return 'text';
  if (type.constructor === Y.XmlFragment) return 'xml-fragment';
  if (type.constructor === Y.XmlText) return 'xml-text';
  if (type.constructor === Y.AbstractType) return 'unresolved';
  throw new Error('Checkpoint cannot preserve this custom top-level shared type.');
}
function roots(document: Y.Doc): readonly Root[] {
  if (document.share.size > MAX_ROOTS) throw new Error('Too many checkpoint shared roots.');
  return Object.freeze([...document.share].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, type]) => {
    if (name.length > 1_000) throw new Error('Invalid checkpoint shared root name.');
    return Object.freeze({ name, kind: rootKind(type) });
  }));
}
function assertIdle(document: Y.Doc): void {
  if (document.isDestroyed || document._transaction) throw new Error('Checkpoint requires a live document outside a shared transaction.');
  if (document.getSubdocs().size) throw new Error('Checkpoint does not include subdocument state.');
}
function gate(document: Y.Doc, room: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,193}$/.test(room)) throw new Error('Invalid checkpoint room name.');
  const fragment = document.getXmlFragment(room), entry = fragment.get(0);
  if (fragment.length !== 1 || !(entry instanceof Y.XmlElement) || entry.nodeName !== 'fountain-retained-room'
    || entry.length || Object.keys(entry.getAttributes()).length !== 2 || entry.getAttribute('format') !== ROOM_FORMAT) throw new Error('Checkpoint needs a compatible retained room.');
  const id = entry.getAttribute('room');
  if (typeof id !== 'string' || !/^r-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) throw new Error('Invalid checkpoint room identity.');
  return id;
}
function declare(document: Y.Doc, entries: readonly Root[]): void {
  for (const entry of entries) {
    if (entry.kind === 'map') document.getMap(entry.name);
    else if (entry.kind === 'array') document.getArray(entry.name);
    else if (entry.kind === 'text') document.getText(entry.name);
    else if (entry.kind === 'xml-fragment') document.getXmlFragment(entry.name);
    else if (entry.kind === 'xml-text') document.get(entry.name, Y.XmlText);
    else document.get(entry.name);
  }
}
function projection(document: Y.Doc, room: string, schema: Schema): { node: Node; roots: readonly Root[] } {
  const reader = new RetainedDocumentStore(document, room, schema, () => { throw new Error('Checkpoint reader cannot allocate identities.'); });
  try { const declared = roots(document), node = reader.read(); validateRetainedDocument(node, schema); return { node, roots: declared }; }
  finally { reader.destroy(); }
}
function load(update: Uint8Array, entries: readonly Root[], guid: string): Y.Doc {
  const document = new Y.Doc({ gc: false, guid });
  try { declare(document, entries); Y.applyUpdate(document, update); assertIdle(document); return document; }
  catch (error) { document.destroy(); throw error; }
}
function assertUnchanged(document: Y.Doc, update: Uint8Array, entries: readonly Root[]): void {
  assertIdle(document);
  assertRetainedWireData(document);
  if (!sameBytes(Y.encodeStateAsUpdate(document), update) || stableJSON(roots(document)) !== stableJSON(entries)) throw new Error('Checkpoint validation changed shared state.');
}

/** Capture a stable full-wire rollback point. The source is never repaired. */
export async function captureRetainedCheckpoint(document: Y.Doc, schema: Schema, schemaVersion: string, room = 'fountain'): Promise<RetainedCheckpoint> {
  version(schemaVersion); assertIdle(document);
  assertRetainedWireData(document);
  const inventory = roots(document), update = Y.encodeStateAsUpdate(document), guid = document.guid, gc = document.gc;
  if (!update.length || update.length > MAX_BYTES || typeof guid !== 'string' || !guid || guid.length > 1_000) throw new Error('Checkpoint exceeds its archive bounds.');
  const copy = load(update, inventory, guid);
  try {
    const roomId = gate(copy, room), projected = projection(copy, room, schema);
    const encoded = new TextEncoder().encode(stableJSON(projected.node.toJSON()));
    assertUnchanged(copy, update, projected.roots);
    const [updateSha256, documentSha256] = await Promise.all([digest(update), digest(encoded)]);
    const body = { format: FORMAT, room, roomId, schemaVersion, guid, gc, roots: projected.roots, bytes: update.length, updateSha256, documentSha256 } as const;
    const checkpointSha256 = await digest(new TextEncoder().encode(stableJSON(body)));
    assertUnchanged(copy, update, projected.roots); assertUnchanged(document, update, inventory);
    if (document.guid !== guid || document.gc !== gc) throw new Error('Checkpoint source options changed during capture.');
    const manifest: RetainedCheckpointManifest = Object.freeze({ ...body, checkpointSha256 });
    return Object.freeze({ manifest, get update() { return update.slice(); } });
  } finally { copy.destroy(); }
}

function fields<T extends object>(raw: T, keys: string): T {
  if (!raw || Object.getPrototypeOf(raw) !== Object.prototype || Object.getOwnPropertySymbols(raw).length) throw new Error('Invalid checkpoint manifest fields.');
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  if (Object.keys(descriptors).sort().join(',') !== keys || Object.values(descriptors).some(entry => !entry.enumerable || !('value' in entry))) throw new Error('Invalid checkpoint manifest fields.');
  return Object.fromEntries(Object.entries(descriptors).map(([key, entry]) => [key, entry.value])) as T;
}
function manifestCopy(raw: RetainedCheckpointManifest, expected: string): RetainedCheckpointManifest {
  version(expected);
  raw = fields(raw, 'bytes,checkpointSha256,documentSha256,format,gc,guid,room,roomId,roots,schemaVersion,updateSha256');
  if (raw.format !== FORMAT || raw.schemaVersion !== expected || typeof raw.gc !== 'boolean'
    || typeof raw.guid !== 'string' || !raw.guid || raw.guid.length > 1_000
    || typeof raw.room !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,193}$/.test(raw.room)
    || typeof raw.roomId !== 'string' || !/^r-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(raw.roomId)
    || !Number.isSafeInteger(raw.bytes) || raw.bytes < 1 || raw.bytes > MAX_BYTES
    || ![raw.updateSha256, raw.documentSha256, raw.checkpointSha256].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
    || !Array.isArray(raw.roots) || Object.getPrototypeOf(raw.roots) !== Array.prototype || raw.roots.length > MAX_ROOTS
    || Object.getOwnPropertySymbols(raw.roots).length || Object.keys(raw.roots).length !== raw.roots.length
    || Object.keys(raw.roots).some((key, index) => key !== String(index))) throw new Error('Invalid or incompatible checkpoint manifest.');
  const seen = new Set<string>();
  const inventory = Array.from({ length: raw.roots.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(raw.roots, String(index));
    if (!descriptor || !('value' in descriptor)) throw new Error('Invalid checkpoint shared-root inventory.');
    const entry: Root = fields(descriptor.value, 'kind,name');
    if (typeof entry.name !== 'string' || entry.name.length > 1_000 || seen.has(entry.name)
      || !['map', 'array', 'text', 'xml-fragment', 'xml-text', 'unresolved'].includes(entry.kind)) throw new Error('Invalid checkpoint shared-root inventory.');
    seen.add(entry.name); return Object.freeze({ name: entry.name, kind: entry.kind });
  });
  inventory.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return Object.freeze({ ...raw, roots: Object.freeze(inventory) });
}

/** Restore into an isolated document only. Never merges into a live room. */
export async function restoreRetainedCheckpoint(checkpoint: RetainedCheckpoint, schema: Schema, schemaVersion: string): Promise<{ document: Y.Doc; baseDocument: Node; manifest: RetainedCheckpointManifest }> {
  const manifest = manifestCopy(checkpoint.manifest, schemaVersion), supplied = checkpoint.update;
  if (!(supplied instanceof Uint8Array) || supplied.length !== manifest.bytes) throw new Error('Invalid checkpoint update length.');
  const update = Uint8Array.from(supplied);
  const { checkpointSha256, ...body } = manifest;
  if (await digest(new TextEncoder().encode(stableJSON(body))) !== checkpointSha256) throw new Error('Checkpoint manifest checksum mismatch.');
  if (await digest(update) !== manifest.updateSha256) throw new Error('Checkpoint update checksum mismatch.');
  const document = load(update, manifest.roots, manifest.guid);
  try {
    if (gate(document, manifest.room) !== manifest.roomId) throw new Error('Checkpoint room identity mismatch.');
    const baseDocument = projection(document, manifest.room, schema).node;
    const encoded = new TextEncoder().encode(stableJSON(baseDocument.toJSON()));
    assertUnchanged(document, update, manifest.roots);
    if (await digest(encoded) !== manifest.documentSha256) throw new Error('Checkpoint document projection mismatch.');
    assertUnchanged(document, update, manifest.roots); document.gc = manifest.gc;
    return { document, baseDocument, manifest };
  } catch (error) { document.destroy(); throw error; }
}
