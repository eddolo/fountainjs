import * as Y from 'yjs';
import type { Node, Schema } from '../core/schema';
import { defineStructuredAttribute } from '../structured-attributes';
import { checkpointWire as wire, type CheckpointRoot } from './retained-checkpoint';
import { assertRetainedWireData, assertRetainedWireString } from './retained-wire';
import { LegacyDocumentReader, type LegacyStructuredOptions } from './legacy-document';

const FORMAT = 'fountain-legacy-checkpoint/1', MAX_BYTES = 64 * 1024 * 1024;
function legacyRoomName(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > 1_000) throw new Error('Invalid legacy room name.');
  assertRetainedWireString(value);
}
export interface LegacyProjectionOptions { readonly structuredAttributes?: LegacyStructuredOptions }
export interface LegacyCheckpointManifest {
  readonly format: typeof FORMAT;
  readonly room: string;
  readonly schemaVersion: string;
  readonly guid: string;
  readonly gc: boolean;
  readonly roots: readonly CheckpointRoot[];
  readonly projectionSha256: string;
  readonly bytes: number;
  readonly updateSha256: string;
  readonly documentSha256: string;
  readonly checkpointSha256: string;
}
export interface LegacyCheckpoint { readonly manifest: LegacyCheckpointManifest; readonly update: Uint8Array }
export interface RestoredLegacyCheckpoint {
  readonly document: Y.Doc;
  readonly baseDocument: Node;
  readonly reader: LegacyDocumentReader;
  readonly manifest: LegacyCheckpointManifest;
  readonly checkpoint: LegacyCheckpoint;
}
export function snapshotLegacyProjection(options: LegacyProjectionOptions = {}): LegacyProjectionOptions {
  const raw = options.structuredAttributes;
  if (!raw) return Object.freeze({});
  if ('map' in raw || !Array.isArray(raw.definitions) || !raw.definitions.length) throw new Error('Legacy projection needs portable structured definitions, not a live map.');
  return Object.freeze({ structuredAttributes: Object.freeze({ mapName: raw.mapName, identityAttribute: raw.identityAttribute,
    definitions: Object.freeze(raw.definitions.map(definition => defineStructuredAttribute({ nodeType: definition.nodeType, attribute: definition.attribute, root: definition.root, limits: definition.limits, ...(definition.validate ? { validate: definition.validate } : {}) }))) }) });
}
async function projectionDigest(options: LegacyProjectionOptions, room: string): Promise<string> {
  const value = options.structuredAttributes;
  return wire.digest(new TextEncoder().encode(wire.stableJSON(value ? { mapName: value.mapName ?? `${room}:structured-attributes`, identityAttribute: value.identityAttribute ?? 'nodeId', definitions: value.definitions.map(({ nodeType, attribute, root, limits }) => ({ nodeType, attribute, root, limits })) } : null)));
}
const own = (manifest: LegacyCheckpointManifest, bytes: Uint8Array): LegacyCheckpoint => Object.freeze({ manifest, get update() { return bytes.slice(); } });
function complete(document: Y.Doc): void { wire.assertIdle(document); if (document.store.pendingStructs || document.store.pendingDs) throw new Error('Legacy checkpoint has unresolved update dependencies.'); }
export function assertLegacyCheckpointState(document: Y.Doc, checkpoint: LegacyCheckpoint): void {
  complete(document); wire.assertUnchanged(document, checkpoint.update, checkpoint.manifest.roots);
  if (document.guid !== checkpoint.manifest.guid || document.gc !== checkpoint.manifest.gc) throw new Error('Legacy checkpoint options changed.');
}

/** Full rollback archive of an existing XML room, without connecting/repairing it. */
export async function captureLegacyCheckpoint(document: Y.Doc, schema: Schema, schemaVersion: string, options: LegacyProjectionOptions = {}, room = 'fountain'): Promise<LegacyCheckpoint> {
  options = snapshotLegacyProjection(options); wire.version(schemaVersion); complete(document); assertRetainedWireData(document);
  legacyRoomName(room);
  const roots = wire.roots(document), bytes = Y.encodeStateAsUpdate(document), guid = document.guid, gc = document.gc;
  if (!bytes.length || bytes.length > MAX_BYTES || typeof guid !== 'string' || !guid || guid.length > 1_000) throw new Error('Legacy checkpoint exceeds archive bounds.');
  const copy = wire.load(bytes, roots, guid);
  try {
    complete(copy); const reader = new LegacyDocumentReader(copy, room, schema, options.structuredAttributes);
    const [updateSha256, documentSha256, projectionSha256] = await Promise.all([wire.digest(bytes), wire.digest(new TextEncoder().encode(wire.stableJSON(reader.document.toJSON()))), projectionDigest(options, room)]);
    const body = { format: FORMAT, room, schemaVersion, guid, gc, roots, projectionSha256, bytes: bytes.length, updateSha256, documentSha256 } as const;
    const checkpointSha256 = await wire.digest(new TextEncoder().encode(wire.stableJSON(body)));
    wire.assertUnchanged(copy, bytes, roots); wire.assertUnchanged(document, bytes, roots);
    if (document.guid !== guid || document.gc !== gc) throw new Error('Legacy source options changed during capture.');
    return own(Object.freeze({ ...body, checkpointSha256 }), bytes);
  } finally { copy.destroy(); }
}

/** Isolated restore; callers must supply the host schema/structured definitions. */
export async function restoreLegacyCheckpoint(checkpoint: LegacyCheckpoint, schema: Schema, schemaVersion: string, options: LegacyProjectionOptions = {}): Promise<RestoredLegacyCheckpoint> {
  options = snapshotLegacyProjection(options); wire.version(schemaVersion);
  const raw = wire.fields(checkpoint.manifest, 'bytes,checkpointSha256,documentSha256,format,gc,guid,projectionSha256,room,roots,schemaVersion,updateSha256');
  if (raw.format !== FORMAT || raw.schemaVersion !== schemaVersion || typeof raw.gc !== 'boolean'
    || typeof raw.guid !== 'string' || !raw.guid || raw.guid.length > 1_000
    || !Number.isSafeInteger(raw.bytes) || raw.bytes < 1 || raw.bytes > MAX_BYTES
    || ![raw.updateSha256, raw.documentSha256, raw.projectionSha256, raw.checkpointSha256].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))) throw new Error('Invalid or incompatible legacy checkpoint manifest.');
  legacyRoomName(raw.room);
  const manifest = Object.freeze({ ...raw, roots: wire.copyRoots(raw.roots) }), supplied = checkpoint.update;
  if (!(supplied instanceof Uint8Array) || supplied.length !== manifest.bytes) throw new Error('Invalid legacy update length.');
  const bytes = Uint8Array.from(supplied), { checkpointSha256, ...body } = manifest;
  if (await wire.digest(new TextEncoder().encode(wire.stableJSON(body))) !== checkpointSha256 || await wire.digest(bytes) !== manifest.updateSha256) throw new Error('Legacy checkpoint checksum mismatch.');
  if (await projectionDigest(options, manifest.room) !== manifest.projectionSha256) throw new Error('Legacy projection definitions changed.');
  const document = wire.load(bytes, manifest.roots, manifest.guid);
  try {
    complete(document); const reader = new LegacyDocumentReader(document, manifest.room, schema, options.structuredAttributes);
    if (await wire.digest(new TextEncoder().encode(wire.stableJSON(reader.document.toJSON()))) !== manifest.documentSha256) throw new Error('Legacy document projection changed.');
    wire.assertUnchanged(document, bytes, manifest.roots); document.gc = manifest.gc;
    const owned = own(manifest, bytes); return { document, baseDocument: reader.document, reader, manifest, checkpoint: owned };
  } catch (error) { document.destroy(); throw error; }
}
