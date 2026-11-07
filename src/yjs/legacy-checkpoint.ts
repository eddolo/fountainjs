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
interface LegacyFragmentIdentity { readonly client: number; readonly clock: number }
export interface LegacyCheckpointManifest {
  readonly format: typeof FORMAT;
  readonly room: string;
  /** Native identity of an explicitly selected nested XML fragment. */
  readonly fragment?: LegacyFragmentIdentity;
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
function fragmentIdentity(raw: LegacyFragmentIdentity): LegacyFragmentIdentity {
  const value = wire.fields(raw, 'client,clock');
  if (!Number.isInteger(value.client) || value.client < 0 || value.client > 0xffff_ffff
    || !Number.isSafeInteger(value.clock) || value.clock < 0) throw new Error('Invalid legacy nested fragment identity.');
  return Object.freeze(value);
}
function nestedFragment(document: Y.Doc, identity: LegacyFragmentIdentity): Y.XmlFragment {
  const relative = new Y.RelativePosition(Y.createID(identity.client, identity.clock), null, null);
  const fragment = Y.createAbsolutePositionFromRelativePosition(relative, document, false)?.type;
  if (!(fragment instanceof Y.XmlFragment) || fragment.constructor !== Y.XmlFragment || !fragment.parent) {
    throw new Error('Legacy nested fragment is missing or incompatible.');
  }
  for (let type: Y.AbstractType<any> | null = fragment; type; type = type.parent) {
    if (type._item?.deleted) throw new Error('Legacy nested fragment is detached.');
  }
  return fragment;
}
export function assertLegacyCheckpointState(document: Y.Doc, checkpoint: LegacyCheckpoint): void {
  complete(document); wire.assertUnchanged(document, checkpoint.update, checkpoint.manifest.roots);
  if (document.guid !== checkpoint.manifest.guid || document.gc !== checkpoint.manifest.gc) throw new Error('Legacy checkpoint options changed.');
}

/** Full rollback archive of an existing XML room, without connecting/repairing it. */
export async function captureLegacyCheckpoint(document: Y.Doc, schema: Schema, schemaVersion: string, options: LegacyProjectionOptions = {}, room = 'fountain', fragment?: Y.XmlFragment): Promise<LegacyCheckpoint> {
  options = snapshotLegacyProjection(options); wire.version(schemaVersion); complete(document); assertRetainedWireData(document);
  legacyRoomName(room);
  const namedFragment: unknown = document.share.get(room);
  let identity: LegacyFragmentIdentity | undefined;
  if (fragment !== undefined && fragment !== namedFragment) {
    if (!(fragment instanceof Y.XmlFragment) || fragment.constructor !== Y.XmlFragment || fragment.doc !== document || !fragment.parent) {
      throw new Error('Legacy capture requires an integrated nested XML fragment or the named top-level fragment.');
    }
    const reference = Y.createRelativePositionFromTypeIndex(fragment, 0).type;
    if (!reference) throw new Error('Legacy nested fragment has no native identity.');
    identity = fragmentIdentity({ client: reference.client, clock: reference.clock });
    if (nestedFragment(document, identity) !== fragment) throw new Error('Legacy nested fragment identity changed.');
  }
  const roots = wire.roots(document), bytes = Y.encodeStateAsUpdate(document), guid = document.guid, gc = document.gc;
  if (!bytes.length || bytes.length > MAX_BYTES || typeof guid !== 'string' || !guid || guid.length > 1_000) throw new Error('Legacy checkpoint exceeds archive bounds.');
  const copy = wire.load(bytes, roots, guid);
  try {
    complete(copy); const reader = new LegacyDocumentReader(copy, room, schema, options.structuredAttributes, identity && nestedFragment(copy, identity));
    const [updateSha256, documentSha256, projectionSha256] = await Promise.all([wire.digest(bytes), wire.digest(new TextEncoder().encode(wire.stableJSON(reader.document.toJSON()))), projectionDigest(options, room)]);
    const body = { format: FORMAT, room, ...(identity ? { fragment: identity } : {}), schemaVersion, guid, gc, roots, projectionSha256, bytes: bytes.length, updateSha256, documentSha256 } as const;
    const checkpointSha256 = await wire.digest(new TextEncoder().encode(wire.stableJSON(body)));
    wire.assertUnchanged(copy, bytes, roots); wire.assertUnchanged(document, bytes, roots);
    if (document.guid !== guid || document.gc !== gc) throw new Error('Legacy source options changed during capture.');
    return own(Object.freeze({ ...body, checkpointSha256 }), bytes);
  } finally { copy.destroy(); }
}

/** Isolated restore; callers must supply the host schema/structured definitions. */
export async function restoreLegacyCheckpoint(checkpoint: LegacyCheckpoint, schema: Schema, schemaVersion: string, options: LegacyProjectionOptions = {}): Promise<RestoredLegacyCheckpoint> {
  options = snapshotLegacyProjection(options); wire.version(schemaVersion);
  const input = checkpoint.manifest;
  const raw = wire.fields(input, Object.hasOwn(input ?? {}, 'fragment')
    ? 'bytes,checkpointSha256,documentSha256,format,fragment,gc,guid,projectionSha256,room,roots,schemaVersion,updateSha256'
    : 'bytes,checkpointSha256,documentSha256,format,gc,guid,projectionSha256,room,roots,schemaVersion,updateSha256');
  if (raw.format !== FORMAT || raw.schemaVersion !== schemaVersion || typeof raw.gc !== 'boolean'
    || typeof raw.guid !== 'string' || !raw.guid || raw.guid.length > 1_000
    || !Number.isSafeInteger(raw.bytes) || raw.bytes < 1 || raw.bytes > MAX_BYTES
    || ![raw.updateSha256, raw.documentSha256, raw.projectionSha256, raw.checkpointSha256].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))) throw new Error('Invalid or incompatible legacy checkpoint manifest.');
  legacyRoomName(raw.room);
  const manifest = Object.freeze({ ...raw, ...(Object.hasOwn(raw, 'fragment') ? { fragment: fragmentIdentity(raw.fragment!) } : {}), roots: wire.copyRoots(raw.roots) }), supplied = checkpoint.update;
  if (!(supplied instanceof Uint8Array) || supplied.length !== manifest.bytes) throw new Error('Invalid legacy update length.');
  const bytes = Uint8Array.from(supplied), { checkpointSha256, ...body } = manifest;
  if (await wire.digest(new TextEncoder().encode(wire.stableJSON(body))) !== checkpointSha256 || await wire.digest(bytes) !== manifest.updateSha256) throw new Error('Legacy checkpoint checksum mismatch.');
  if (await projectionDigest(options, manifest.room) !== manifest.projectionSha256) throw new Error('Legacy projection definitions changed.');
  const document = wire.load(bytes, manifest.roots, manifest.guid);
  try {
    complete(document); const reader = new LegacyDocumentReader(document, manifest.room, schema, options.structuredAttributes, manifest.fragment && nestedFragment(document, manifest.fragment));
    if (await wire.digest(new TextEncoder().encode(wire.stableJSON(reader.document.toJSON()))) !== manifest.documentSha256) throw new Error('Legacy document projection changed.');
    wire.assertUnchanged(document, bytes, manifest.roots); document.gc = manifest.gc;
    const owned = own(manifest, bytes); return { document, baseDocument: reader.document, reader, manifest, checkpoint: owned };
  } catch (error) { document.destroy(); throw error; }
}
