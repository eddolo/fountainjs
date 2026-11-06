import * as Y from 'yjs';
import type { Node, Schema } from '../core/schema';
import { assertRetainedCheckpointState, captureRetainedCheckpoint, restoreRetainedCheckpoint, type RetainedCheckpoint } from './retained-checkpoint';
import { validateRetainedRoomCheckpoint } from './retained-room-store';
import { RetainedDocumentStore } from './retained-document';
import { retainSelection, restoreSelection, type RetainedSelection } from './retained-selection';
import { YjsStructuredAttributeStore, type YjsStructuredAttributesOptions } from './structured-attributes';

export interface RetainedMigrationContext {
  /** Isolated snapshots, never the live source or an authoritative destination. */
  readonly source: Y.Doc;
  readonly target: Y.Doc;
  readonly document: Node;
  textAnchor(value: unknown): unknown;
  selection(value: unknown): RetainedSelection;
  checkSelection(source: unknown, target: unknown): void;
  nodeIdentity(value: string): string;
}
export interface RetainedRootMigrator {
  readonly name: string;
  readonly roots: readonly string[];
  migrate(context: RetainedMigrationContext): void;
  /** Host-owned semantic verification; unknown root formats are never guessed. */
  verify(context: RetainedMigrationContext): void;
}
export interface RetainedMigrationOptions {
  readonly history: 'reset-with-source-checkpoint';
  readonly offline: 'reconcile-before-activation';
  readonly externalState: 'host-coordinated';
  readonly migrators: readonly RetainedRootMigrator[];
}
export interface RetainedMigrationCandidate {
  readonly source: RetainedCheckpoint;
  readonly destination: RetainedCheckpoint;
  readonly report: {
    readonly sourceRoomId: string;
    readonly destinationRoomId: string;
    readonly sourceBytes: number;
    readonly destinationBytes: number;
    readonly auxiliaryRoots: readonly { readonly name: string; readonly migrator: string }[];
    readonly translated: { readonly textAnchors: number; readonly selections: number; readonly nodeIdentities: number };
    readonly history: RetainedMigrationOptions['history'];
    readonly offline: RetainedMigrationOptions['offline'];
    readonly externalState: RetainedMigrationOptions['externalState'];
    readonly activation: 'not-implemented';
  };
}

const equal = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>, keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
};
function metadata(document: Y.Doc, room: string): void {
  for (const [name, keys] of [[`${room}:document`, ['version', 'seeded']], [`${room}-nodes:metadata`, ['version']], [`${room}-text:metadata`, ['version']]] as const) {
    if ([...document.getMap(name).keys()].some(key => !(keys as readonly string[]).includes(key))) throw new Error(`Unrecognized engine metadata in ${name}; source retained.`);
  }
  for (const [key, value] of document.getMap(`${room}-nodes:identities`)) if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(key) || value !== true) throw new Error('Unrecognized engine identity metadata.');
  for (const [key, value] of document.getMap(`${room}-text:owners`)) if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(key) || typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value)) throw new Error('Unrecognized engine text ownership metadata.');
}
const map = (document: Y.Doc, name: string): Y.Map<unknown> => {
  const root = document.share.get(name);
  if (!(root instanceof Y.Map)) throw new Error(`Migration requires a declared map: ${name}`);
  return root;
};
const clone = (value: unknown): unknown => value instanceof Y.AbstractType ? value.clone() : structuredClone(value);
function synchronous(value: unknown): void {
  if (value && typeof (value as PromiseLike<unknown>).then === 'function') {
    void Promise.resolve(value).catch(() => {});
    throw new Error('Root migration and verification must complete synchronously.');
  }
}

/** Build and verify an isolated fresh-room candidate. No authoritative write,
 * provider handoff, offline-edit disposal or automatic history clearing. */
export function snapshotRetainedMigrationOptions(options: RetainedMigrationOptions): RetainedMigrationOptions {
  const history = options?.history, offline = options?.offline, externalState = options?.externalState;
  if (history !== 'reset-with-source-checkpoint' || offline !== 'reconcile-before-activation' || externalState !== 'host-coordinated'
    || !Array.isArray(options.migrators)) throw new Error('Migration needs explicit history, offline and external-state policies.');
  const migrators = options.migrators.map(migrator => {
    if (!migrator || typeof migrator.name !== 'string' || !migrator.name.trim() || migrator.name.length > 200
      || !Array.isArray(migrator.roots) || !migrator.roots.length || typeof migrator.migrate !== 'function' || typeof migrator.verify !== 'function') throw new Error('Invalid migration root owner.');
    return Object.freeze({ name: migrator.name, roots: Object.freeze([...migrator.roots]), migrate: migrator.migrate.bind(migrator), verify: migrator.verify.bind(migrator) });
  });
  return Object.freeze({ history, offline, externalState, migrators: Object.freeze(migrators) });
}

export async function buildRetainedMigrationCandidate(checkpoint: RetainedCheckpoint, schema: Schema, schemaVersion: string, options: RetainedMigrationOptions): Promise<RetainedMigrationCandidate> {
  const { history, offline, externalState, migrators } = snapshotRetainedMigrationOptions(options);
  const source = await validateRetainedRoomCheckpoint(checkpoint, schema, schemaVersion), restored = await restoreRetainedCheckpoint(source, schema, schemaVersion);
  const from = restored.document, room = source.manifest.room, target = new Y.Doc({ gc: from.gc });
  let sourceStore: RetainedDocumentStore | undefined, targetStore: RetainedDocumentStore | undefined, active = true;
  try {
    metadata(from, room);
    sourceStore = new RetainedDocumentStore(from, room, schema, () => { throw new Error('Migration source cannot allocate identities.'); });
    const document = sourceStore.read(), prefix = `m-${globalThis.crypto.randomUUID()}`; let sequence = 0;
    targetStore = new RetainedDocumentStore(target, room, schema, () => `${prefix}:${++sequence}`);
    targetStore.seed(document);
    const gate = new Y.XmlElement('fountain-retained-room'); gate.setAttribute('format', 'fountain-retained-document/3'); gate.setAttribute('room', `r-${globalThis.crypto.randomUUID()}`);
    target.getXmlFragment(room).insert(0, [gate]);
    const core = new Set(target.share.keys()), owners = new Map<string, string>();
    if (!equal(targetStore.read().toJSON(), document.toJSON())) throw new Error('Migration seed changed the document.');
    for (const migrator of migrators) for (const name of migrator.roots) {
      if (typeof name !== 'string' || !from.share.has(name) || core.has(name) || owners.has(name)) throw new Error(`Missing, reserved or duplicate migration root: ${String(name)}`);
      owners.set(name, migrator.name);
    }
    const unclaimed = [...from.share.keys()].filter(name => !core.has(name) && !owners.has(name));
    if (unclaimed.length) throw new Error(`Unclaimed migration roots: ${unclaimed.join(', ')}. Source retained.`);
    const checks: Array<() => void> = [], counts = { textAnchors: 0, selections: 0, nodeIdentities: 0 };
    const live = () => { if (!active) throw new Error('Migration context is no longer active.'); };
    const context: RetainedMigrationContext = Object.freeze({ source: from, target, document,
      textAnchor(value: unknown): unknown {
        live(); const point = sourceStore!.resolveTextAnchor(value);
        if (!point) throw new Error('Detached or unsupported source text anchor.');
        const relative = Y.createRelativePositionFromJSON(value as any), association = relative.assoc < 0 ? -1 : 1;
        const translated = targetStore!.textAnchor(point.path, point.offset, association); counts.textAnchors++;
        checks.push(() => { if (!equal(targetStore!.resolveTextAnchor(translated), point) || (Y.createRelativePositionFromJSON(translated as any).assoc < 0 ? -1 : 1) !== association) throw new Error('Translated text anchor changed its logical point or association.'); });
        return translated;
      },
      selection(value: unknown): RetainedSelection {
        live(); const resolved = restoreSelection(sourceStore!, document, value);
        if (!resolved) throw new Error('Detached or unsupported source selection.');
        const translated = retainSelection(targetStore!, document, resolved); counts.selections++;
        checks.push(() => { const next = restoreSelection(targetStore!, document, translated); if (!next || !next.eq(resolved)) throw new Error('Translated selection changed its logical range.'); });
        return translated;
      },
      checkSelection(before: unknown, after: unknown): void {
        live(); const a = restoreSelection(sourceStore!, document, before), b = restoreSelection(targetStore!, document, after);
        if (!a || !b || !a.eq(b)) throw new Error('Stored migrated selection changed its logical range.');
      },
      nodeIdentity(value: string): string {
        live(); const path = sourceStore!.path(value), translated = path && targetStore!.identity(path);
        if (!path || !translated) throw new Error('Detached or unsupported source node identity.');
        counts.nodeIdentities++; checks.push(() => { if (!equal(targetStore!.path(translated), path)) throw new Error('Translated node identity changed its path.'); });
        return translated;
      },
    });
    for (const migrator of migrators) {
      synchronous(migrator.migrate(context));
      if (migrator.roots.some(name => !target.share.has(name))) throw new Error(`Migrator ${migrator.name} did not produce every declared root.`);
    }
    if ([...target.share.keys()].some(name => !core.has(name) && !owners.has(name)) || [...core].some(name => !target.share.has(name))) throw new Error('Migrator changed the root ownership inventory.');
    if (!equal(targetStore.read().toJSON(), document.toJSON())) throw new Error('Migrator changed document content.');
    for (const check of checks) check();
    const inventory = () => { if ([...target.share.keys()].some(name => !core.has(name) && !owners.has(name)) || [...core, ...owners.keys()].some(name => !target.share.has(name))) throw new Error('Migration verifier changed the root ownership inventory.'); };
    inventory();
    assertRetainedCheckpointState(from, source);
    const destination = await validateRetainedRoomCheckpoint(await captureRetainedCheckpoint(target, schema, schemaVersion, room), schema, schemaVersion);
    for (const migrator of migrators) {
      synchronous(migrator.verify(context));
      inventory(); assertRetainedCheckpointState(from, source); assertRetainedCheckpointState(target, destination);
    }
    if (destination.manifest.documentSha256 !== source.manifest.documentSha256 || destination.manifest.roomId === source.manifest.roomId || destination.manifest.guid === source.manifest.guid) throw new Error('Migration destination does not preserve content with fresh identities.');
    if (!equal(targetStore.read().toJSON(), document.toJSON())) throw new Error('Migration verification changed document content.');
    for (const check of checks) check();
    inventory();
    assertRetainedCheckpointState(from, source); assertRetainedCheckpointState(target, destination);
    const report = Object.freeze({ sourceRoomId: source.manifest.roomId, destinationRoomId: destination.manifest.roomId,
      sourceBytes: source.manifest.bytes, destinationBytes: destination.manifest.bytes,
      auxiliaryRoots: Object.freeze([...owners].map(([name, migrator]) => Object.freeze({ name, migrator }))), translated: Object.freeze({ ...counts }),
      history, offline, externalState, activation: 'not-implemented' as const });
    return Object.freeze({ source, destination, report });
  } finally { active = false; sourceStore?.destroy(); targetStore?.destroy(); from.destroy(); target.destroy(); }
}

/** A map whose entire value contract is retained selections, not arbitrary data. */
export function retainedSelectionRootMigrator(name: string): RetainedRootMigrator {
  return { name: `retained-selections:${name}`, roots: [name], migrate(context) {
    const destination = context.target.getMap(name);
    for (const [key, value] of map(context.source, name)) destination.set(key, context.selection(value));
  }, verify(context) {
    const before = map(context.source, name), after = map(context.target, name);
    if (before.size !== after.size) throw new Error('Selection migration changed entry count.');
    for (const [key, value] of before) { if (!after.has(key)) throw new Error('Selection migration changed entry keys.'); context.checkSelection(value, after.get(key)); }
  } };
}

/** Structured attribute values retain their JSON/CRDT tree; this does not infer
 * application-specific references hidden inside opaque JSON values. */
export function retainedStructuredRootMigrator(options: Omit<YjsStructuredAttributesOptions, 'map'>, room = 'fountain'): RetainedRootMigrator {
  const name = options.mapName ?? `${room}:structured-attributes`;
  return { name: `structured-attributes:${name}`, roots: [name], migrate(context) {
    const source = map(context.source, name), target = context.target.getMap(name);
    for (const [key, value] of source) target.set(key, clone(value));
  }, verify(context) {
    const source = new YjsStructuredAttributeStore(context.source, options, name), target = new YjsStructuredAttributeStore(context.target, options, name);
    if (!equal(source.overlay(context.document), target.overlay(context.document)) || !equal(source.map.toJSON(), target.map.toJSON())) throw new Error('Structured migration changed attribute values.');
  } };
}
