import * as Y from 'yjs';
import type { Schema } from '../core/schema';
import { assertRetainedCheckpointState, captureRetainedCheckpoint, type RetainedCheckpoint } from './retained-checkpoint';
import { assertLegacyCheckpointState, restoreLegacyCheckpoint, snapshotLegacyProjection, type LegacyCheckpoint, type LegacyProjectionOptions } from './legacy-checkpoint';
import { snapshotRetainedMigrationOptions, type RetainedMigrationContext, type RetainedMigrationOptions, type RetainedRootMigrator } from './retained-migration';
import { RetainedDocumentStore } from './retained-document';
import { retainSelection, restoreSelection } from './retained-selection';
import { validateRetainedRoomCheckpoint } from './retained-room-store';

export interface LegacyMigrationOptions extends RetainedMigrationOptions {
  /** Explicit retained namespace. Required when the source name is incompatible. */
  readonly destinationRoom?: string;
}
export function snapshotLegacyMigrationOptions(options: LegacyMigrationOptions): LegacyMigrationOptions {
  const destinationRoom = options?.destinationRoom;
  if (destinationRoom !== undefined && (typeof destinationRoom !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,193}$/.test(destinationRoom))) throw new Error('Invalid explicit retained destination namespace.');
  return Object.freeze({ ...snapshotRetainedMigrationOptions(options), ...(destinationRoom === undefined ? {} : { destinationRoom }) });
}
export interface LegacyMigrationCandidate {
  readonly source: LegacyCheckpoint;
  readonly destination: RetainedCheckpoint;
  readonly report: {
    readonly sourceFormat: 'legacy-xml'; readonly sourceGuid: string; readonly destinationRoomId: string;
    readonly sourceRoom: string; readonly destinationRoom: string;
    readonly sourceBytes: number; readonly destinationBytes: number;
    readonly auxiliaryRoots: readonly { readonly name: string; readonly migrator: string }[];
    readonly translated: { readonly textAnchors: number; readonly selections: number; readonly nodeIdentities: number };
    readonly history: RetainedMigrationOptions['history']; readonly offline: RetainedMigrationOptions['offline']; readonly externalState: RetainedMigrationOptions['externalState'];
    readonly activation: 'not-implemented';
  };
}
const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>, keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && same(left[key], right[key]));
};
const synchronous = (value: unknown): void => { if (value && typeof (value as PromiseLike<unknown>).then === 'function') { void Promise.resolve(value).catch(() => {}); throw new Error('Legacy root migration/verification must be synchronous.'); } };

/** Verified isolated conversion from the public XML adapter, never a live switch.
 * Complete source wire state stays separately recoverable in its own format. */
export async function buildLegacyMigrationCandidate(checkpoint: LegacyCheckpoint, schema: Schema, schemaVersion: string, options: LegacyMigrationOptions, projection: LegacyProjectionOptions = {}): Promise<LegacyMigrationCandidate> {
  const policy = snapshotLegacyMigrationOptions(options), settings = snapshotLegacyProjection(projection);
  const restored = await restoreLegacyCheckpoint(checkpoint, schema, schemaVersion, settings), source = restored.checkpoint, from = restored.document, document = restored.baseDocument;
  const target = new Y.Doc({ gc: from.gc }), sourceRoom = source.manifest.room, room = policy.destinationRoom ?? sourceRoom, prefix = `legacy-${crypto.randomUUID()}`; let sequence = 0, active = true, store: RetainedDocumentStore | undefined;
  try {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,193}$/.test(room)) throw new Error('Legacy source requires an explicit retained destinationRoom namespace.');
    store = new RetainedDocumentStore(target, room, schema, () => `${prefix}:${++sequence}`); store.seed(document);
    const gate = new Y.XmlElement('fountain-retained-room'); gate.setAttribute('format', 'fountain-retained-document/3'); gate.setAttribute('room', `r-${crypto.randomUUID()}`); target.getXmlFragment(room).insert(0, [gate]);
    const core = new Set(target.share.keys()), owners = new Map<string, string>();
    for (const migrator of policy.migrators) for (const name of migrator.roots) {
      if (typeof name !== 'string' || name === sourceRoom || !from.share.has(name) || core.has(name) || owners.has(name)) throw new Error(`Missing, reserved or duplicate legacy migration root: ${String(name)}`);
      owners.set(name, migrator.name);
    }
    const unclaimed = [...from.share.keys()].filter(name => name !== sourceRoom && !owners.has(name));
    if (unclaimed.length) throw new Error(`Unclaimed legacy migration roots: ${unclaimed.join(', ')}. Source retained.`);
    const checks: Array<() => void> = [], counts = { textAnchors: 0, selections: 0, nodeIdentities: 0 }, live = () => { if (!active) throw new Error('Legacy migration context expired.'); };
    const context: RetainedMigrationContext = Object.freeze({ source: from, target, document,
      textAnchor(value: unknown): unknown {
        live(); const point = restored.reader.textAnchor(value), next = store!.textAnchor(point.path, point.offset, point.association); counts.textAnchors++;
        checks.push(() => { if (!same(store!.resolveTextAnchor(next), { path: point.path, offset: point.offset }) || (Y.createRelativePositionFromJSON(next as any).assoc < 0 ? -1 : 1) !== point.association) throw new Error('Legacy text anchor changed its logical point.'); }); return next;
      },
      selection(value: unknown) {
        live(); const selection = restored.reader.selection(value), next = retainSelection(store!, document, selection); counts.selections++;
        checks.push(() => { if (!restoreSelection(store!, document, next)?.eq(selection)) throw new Error('Legacy selection changed its logical range.'); }); return next;
      },
      checkSelection(before: unknown, after: unknown): void { live(); if (!restoreSelection(store!, document, after)?.eq(restored.reader.selection(before))) throw new Error('Stored legacy selection changed its logical range.'); },
      nodeIdentity(value: string): string {
        live(); const path = restored.reader.identities.get(value), next = path && store!.identity(path);
        if (!path || !next) throw new Error('Detached or unsupported legacy node identity.'); counts.nodeIdentities++;
        checks.push(() => { if (!same(store!.path(next), path)) throw new Error('Legacy node identity changed its logical path.'); }); return next;
      },
    });
    const inventory = () => { if ([...target.share.keys()].some(name => !core.has(name) && !owners.has(name)) || [...core, ...owners.keys()].some(name => !target.share.has(name))) throw new Error('Legacy migration changed the root ownership inventory.'); };
    for (const migrator of policy.migrators) { synchronous(migrator.migrate(context)); if (migrator.roots.some(name => !target.share.has(name))) throw new Error(`Legacy migrator ${migrator.name} omitted a declared root.`); }
    inventory(); if (!same(store.read().toJSON(), document.toJSON())) throw new Error('Legacy migration changed document content.');
    for (const check of checks) check(); assertLegacyCheckpointState(from, source);
    const destination = await validateRetainedRoomCheckpoint(await captureRetainedCheckpoint(target, schema, schemaVersion, room), schema, schemaVersion);
    for (const migrator of policy.migrators) { synchronous(migrator.verify(context)); inventory(); assertLegacyCheckpointState(from, source); assertRetainedCheckpointState(target, destination); }
    if (destination.manifest.documentSha256 !== source.manifest.documentSha256 || destination.manifest.guid === source.manifest.guid || !same(store.read().toJSON(), document.toJSON())) throw new Error('Legacy destination changed content or retained the old identity.');
    for (const check of checks) check(); inventory(); assertLegacyCheckpointState(from, source); assertRetainedCheckpointState(target, destination);
    const report = Object.freeze({ sourceFormat: 'legacy-xml' as const, sourceGuid: source.manifest.guid, destinationRoomId: destination.manifest.roomId, sourceRoom, destinationRoom: room,
      sourceBytes: source.manifest.bytes, destinationBytes: destination.manifest.bytes, auxiliaryRoots: Object.freeze([...owners].map(([name, migrator]) => Object.freeze({ name, migrator }))), translated: Object.freeze({ ...counts }),
      history: policy.history, offline: policy.offline, externalState: policy.externalState, activation: 'not-implemented' as const });
    return Object.freeze({ source, destination, report });
  } finally { active = false; store?.destroy(); target.destroy(); from.destroy(); }
}

/** Dedicated map of the legacy adapter's encoded text/range selections. */
export function legacySelectionRootMigrator(name: string): RetainedRootMigrator {
  const map = (document: Y.Doc) => { const value = document.share.get(name); if (!(value instanceof Y.Map)) throw new Error('Legacy selections require a declared map.'); return value; };
  return { name: `legacy-selections:${name}`, roots: [name], migrate(context) { const target = context.target.getMap(name); for (const [key, value] of map(context.source)) target.set(key, context.selection(value)); },
    verify(context) { const source = map(context.source), target = map(context.target); if (source.size !== target.size) throw new Error('Legacy selection entry count changed.'); for (const [key, value] of source) { if (!target.has(key)) throw new Error('Legacy selection entry missing.'); context.checkSelection(value, target.get(key)); } } };
}
