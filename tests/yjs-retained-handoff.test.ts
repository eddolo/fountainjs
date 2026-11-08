// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import * as Y from 'yjs';
import { CoreExtension, Selection, composeExtensions, createEditor, getCollaborationState, insertText, moveNode, toggleQuote } from '../src';
import { createRetainedYjsCollaborationExtension } from '../src/yjs/retained-adapter';
import { prepareRetainedAdmission } from '../src/yjs/retained-admission';
import { RetainedDocumentStore } from '../src/yjs/retained-document';
import { captureRetainedCheckpoint, restoreRetainedCheckpoint, type RetainedCheckpoint } from '../src/yjs/retained-checkpoint';
import { CoordinatedRetainedRoom } from '../src/yjs/retained-room-coordinator';
import { RetainedRoomHandoff, type RetainedHandoffRepository, type RetainedHandoffPolicy } from '../src/yjs/retained-handoff';
import { type RetainedMigrationOptions } from '../src/yjs/retained-migration';
import { SQLiteRetainedRoomRepository } from '../examples/backends/retained-sqlite';
import { RetainedTextRecovery } from '../examples/backends/retained-text-recovery';

const cleanup: Array<() => void> = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });
const key = 'project:handoff', version = 'schema-1', uuid = () => globalThis.crypto.randomUUID();
const content = { type: 'doc', attrs: { title: 'Retained paper' }, content: [
  { type: 'paragraph', attrs: { nodeId: 'intro' }, content: [{ type: 'text', text: 'Alpha α 😀' }] },
  { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested quotation' }] }] },
  { type: 'image_super', attrs: { nodeId: 'figure', src: '/figure.png', alt: 'A retained figure' } },
] };
const options = (): RetainedMigrationOptions => ({ history: 'reset-with-source-checkpoint', offline: 'reconcile-before-activation', externalState: 'host-coordinated', migrators: [] });
const policy = (): RetainedHandoffPolicy => ({ history: 'reset-with-source-archive', offline: 'retain-retired-room-branches', externalReceipt: 'host-coordination-1' });
function client(document = new Y.Doc(), name = 'Ada') {
  const kit = composeExtensions([CoreExtension, createRetainedYjsCollaborationExtension({ document, captureTimeout: 0, user: { id: name, name, color: '#7048e8' } })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
  cleanup.push(() => { editor.destroy(); document.destroy(); });
  return { document, editor, schema: editor.state.schema };
}
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'fountain-retained-handoff-'));
  cleanup.push(() => {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('fountain-retained-handoff-')) throw new Error('Unsafe cleanup target.');
    rmSync(directory, { recursive: true, force: true });
  });
  const path = join(directory, 'rooms.sqlite'), a = new SQLiteRetainedRoomRepository(path), b = new SQLiteRetainedRoomRepository(path);
  cleanup.push(() => b.close()); cleanup.push(() => a.close());
  const source = client(), checkpoint = await captureRetainedCheckpoint(source.document, source.schema, version);
  const room = new CoordinatedRetainedRoom(a, key, source.schema, version), other = new CoordinatedRetainedRoom(b, key, source.schema, version);
  const handoff = new RetainedRoomHandoff(a, key, source.schema, version), second = new RetainedRoomHandoff(b, key, source.schema, version);
  const initial = await room.initialize(checkpoint);
  return { ...source, path, a, b, room, other, handoff, second, checkpoint, initial };
}
async function model(checkpoint: RetainedCheckpoint, pair: Awaited<ReturnType<typeof fixture>>) {
  const restored = await restoreRetainedCheckpoint(checkpoint, pair.schema, version);
  try { return restored.baseDocument.toJSON(); } finally { restored.document.destroy(); }
}
async function open(checkpoint: RetainedCheckpoint, pair: Awaited<ReturnType<typeof fixture>>, name = 'Grace') {
  const restored = await restoreRetainedCheckpoint(checkpoint, pair.schema, version); return client(restored.document, name);
}
function type(source: ReturnType<typeof client>, text: string) {
  source.editor.dispatch(source.editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
  expect(insertText(source.editor, text)).toBe(true); return Y.encodeStateAsUpdate(source.document);
}
async function migrate(pair: Awaited<ReturnType<typeof fixture>>) {
  const ticket = await pair.room.freeze(await pair.room.snapshot()), operation = uuid();
  return { ticket, operation, result: await pair.handoff.migrate(ticket, operation, options(), policy()) };
}
function gate(base: RetainedHandoffRepository, method: 'installWithArchive' | 'compareArchiveBranch' | 'readArchive' = 'installWithArchive') {
  let release!: () => void, reached!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { reached = resolve; });
  const repository: RetainedHandoffRepository = {
    read: base.read.bind(base), create: base.create.bind(base), compareAndSwap: base.compareAndSwap.bind(base),
    readArchive: base.readArchive.bind(base), readRetiredRoom: base.readRetiredRoom.bind(base),
    installWithArchive: base.installWithArchive.bind(base), compareArchiveBranch: base.compareArchiveBranch.bind(base),
    readRetiredDraft: base.readRetiredDraft.bind(base), createRetiredDraft: base.createRetiredDraft.bind(base),
  };
  // Hold one real storage boundary; all other methods still use independent SQLite connections.
  const original = repository[method] as (...args: any[]) => Promise<any>;
  (repository as any)[method] = async (...args: any[]) => { reached(); await waiting; return original(...args); };
  return { repository, ready, release };
}

it('atomically installs an exact fresh-room document with immutable original and destination archives', async () => {
  const pair = await fixture(), before = pair.editor.getJSON(), moved = await migrate(pair), current = await pair.other.snapshot();
  expect(typeof globalThis.document).toBe('undefined'); expect(current).toEqual(moved.result.snapshot);
  expect(current.epoch).not.toBe(pair.initial.epoch); expect(current.revision).toBe(1); expect(current.phase).toBe('active');
  expect(current.checkpoint.manifest.roomId).not.toBe(pair.checkpoint.manifest.roomId); expect(await model(current.checkpoint, pair)).toEqual(before);
  const archive = await pair.b.readArchive(key, moved.operation);
  expect(archive!.source.checkpoint).toEqual(pair.checkpoint); expect(archive!.source.phase).toBe('frozen');
  expect(archive!.destination.checkpoint).toEqual(current.checkpoint); expect(archive!.branch).toEqual(pair.checkpoint); expect(archive!.branchRevision).toBe(0);
  expect(moved.result.current).toBe(true); expect(moved.result.replayed).toBe(false);
  moved.result.archive.source.checkpoint.update.fill(0); current.checkpoint.update.fill(0);
  expect((await pair.room.snapshot()).checkpoint).toEqual(archive!.destination.checkpoint);
  expect((await pair.b.readArchive(key, moved.operation))!.source.checkpoint).toEqual(pair.checkpoint);
});

it('keeps the original room and archive inventory intact when compaction cannot meet the requested savings', async () => {
  const pair = await fixture();
  const before = await pair.a.read(key);
  const settings = {...options(), minimumBytesSaved: pair.checkpoint.manifest.bytes};
  const checked = await pair.handoff.preflightCompaction(pair.initial, settings);
  expect(checked).toEqual({epoch:pair.initial.epoch, revision:pair.initial.revision, sourceBytes:pair.checkpoint.manifest.bytes,
    destinationBytes:expect.any(Number), minimumBytesSaved:settings.minimumBytesSaved, meetsMinimum:false});
  expect(await pair.b.read(key)).toEqual(before);
  const ticket = await pair.room.freeze(pair.initial), operation = uuid();
  const frozen = await pair.a.read(key);
  await expect(pair.handoff.preflightCompaction(pair.initial, settings)).rejects.toMatchObject({code:'frozen'});
  await expect(pair.handoff.migrate(ticket, operation, settings, policy()))
    .rejects.toMatchObject({code:'insufficient-savings'});
  expect(await pair.b.read(key)).toEqual(frozen);
  expect(await pair.b.readArchive(key, operation)).toBeUndefined();
  expect(await pair.other.abort(ticket)).toEqual(pair.initial);
});

it('refuses a stale compaction check when another writer saves during validation', async () => {
  const pair = await fixture(), read = pair.a.read.bind(pair.a);
  const update = type(pair, ' STILL WRITABLE');
  const reader = vi.spyOn(pair.a, 'read').mockImplementationOnce(read).mockImplementationOnce(async roomKey => {
    await pair.other.write({epoch:pair.initial.epoch, update});
    return read(roomKey);
  });
  try {
    await expect(pair.handoff.preflightCompaction(pair.initial, {...options(), minimumBytesSaved:1}))
      .rejects.toMatchObject({code:'revision-conflict'});
  } finally { reader.mockRestore(); }
  const saved = await pair.room.snapshot();
  expect(saved).toMatchObject({epoch:pair.initial.epoch,revision:1,phase:'active'});
  expect(await model(saved.checkpoint,pair)).toEqual(pair.editor.getJSON());
  await expect(pair.room.freeze(pair.initial)).rejects.toMatchObject({code:'revision-conflict'});
});

it('compacts a long edit history while keeping old writers fenced and both branches recoverable', async () => {
  const pair = await fixture();
  const originalText = pair.editor.state.doc.child(0).textContent;
  for (let index = 0; index <= 32; index += 1) {
    const previous = pair.editor.state.doc.child(0).textContent;
    const next = index === 32 ? originalText : `Temporary draft ${index}.`;
    pair.editor.dispatch(pair.editor.createTransaction().replaceText([0, 0], 0, previous.length, next));
  }
  const edited = await pair.room.write({epoch:pair.initial.epoch,update:Y.encodeStateAsUpdate(pair.document)});
  expect(pair.b.readStorageUsage('missing-room')).toBeUndefined();
  expect(pair.b.readStorageUsage(key)).toEqual({
    revision: edited.revision, liveBytes: edited.checkpoint.manifest.bytes, liveCheckpointBytes: edited.checkpoint.manifest.bytes,
    archiveCount: 0, archiveBytes: 0, draftCount: 0, draftBytes: 0, batchCount: 0, batchBytes: 0,
    recoveryBytes: 0, totalBytes: edited.checkpoint.manifest.bytes,
  });
  const settings = {...options(),minimumBytesSaved:1_000};
  const checked = await pair.handoff.preflightCompaction(edited, settings);
  expect(checked).toMatchObject({meetsMinimum:true, minimumBytesSaved:1_000});
  expect(checked.sourceBytes - checked.destinationBytes).toBeGreaterThanOrEqual(1_000);
  expect(await pair.other.snapshot()).toEqual(edited);
  const ticket = await pair.room.freeze(checked), operation = uuid();
  const result = await pair.handoff.migrate(ticket, operation, settings, policy());
  expect(result.archive.minimumBytesSaved).toBe(1_000);
  expect(result.archive.source.checkpoint).toEqual(edited.checkpoint);
  const db = new DatabaseSync(pair.path);
  cleanup.push(() => db.close());
  const storedSource = db.prepare('SELECT source_wire FROM fountain_retained_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key, operation)?.source_wire as Uint8Array;
  expect(storedSource.length).toBeLessThan(edited.checkpoint.manifest.bytes / 2);
  expect((await pair.b.readArchive(key, operation))?.source.checkpoint).toEqual(edited.checkpoint);
  const setSourceWire = db.prepare('UPDATE fountain_retained_archives_v1 SET source_wire = ? WHERE room_key = ? AND archive_id = ?');
  const oversized = gzipSync(new Uint8Array(edited.checkpoint.manifest.bytes + 1));
  setSourceWire.run(oversized, key, operation);
  await expect(pair.b.readArchive(key, operation)).rejects.toMatchObject({ code: 'ERR_BUFFER_TOO_LARGE' });
  expect(pair.b.readStorageUsage(key)).toMatchObject({ archiveCount: 1, liveBytes: result.snapshot.checkpoint.manifest.bytes });
  // Existing databases can contain the original raw representation alongside
  // new compressed checkpoints.
  setSourceWire.run(edited.checkpoint.update, key, operation);
  expect((await pair.b.readArchive(key, operation))?.source.checkpoint).toEqual(edited.checkpoint);
  expect(edited.checkpoint.manifest.bytes - result.snapshot.checkpoint.manifest.bytes).toBeGreaterThanOrEqual(1_000);
  expect(await model(result.snapshot.checkpoint, pair)).toEqual(pair.editor.getJSON());
  expect((await pair.second.migrate(ticket, operation, settings, policy())).replayed).toBe(true);
  await expect(pair.second.migrate(ticket, operation, options(), policy())).rejects.toMatchObject({code:'invalid-ticket'});
  await expect(pair.second.migrate(ticket, operation, {...settings,minimumBytesSaved:999}, policy())).rejects.toMatchObject({code:'invalid-ticket'});
  const late = type(pair, 'OFFLINE');
  await expect(pair.room.write({epoch:edited.epoch,update:late})).rejects.toMatchObject({code:'stale-epoch'});
  const branch = await pair.second.retainLateUpdate({archiveId:operation,roomId:edited.checkpoint.manifest.roomId,update:late});
  expect(await model(branch.branch, pair)).toEqual(pair.editor.getJSON());
  const draft = await captureRetainedCheckpoint(pair.document, pair.schema, version);
  const draftId = uuid();
  await pair.second.saveRetiredDraft({ archiveId: operation, roomId: edited.checkpoint.manifest.roomId, draftId, checkpoint: draft });
  const storedArchive = db.prepare('SELECT length(branch_wire) AS branchBytes, length(destination_wire) AS destinationBytes FROM fountain_retained_archives_v1 WHERE room_key = ? AND archive_id = ?').get(key, operation);
  const storedDraft = db.prepare('SELECT length(wire) AS bytes FROM fountain_retained_drafts_v1 WHERE room_key = ? AND archive_id = ? AND draft_id = ?').get(key, operation, draftId);
  expect(storedArchive?.branchBytes).toBeLessThan(branch.branch.manifest.bytes);
  expect(storedDraft?.bytes).toBeLessThan(draft.manifest.bytes);
  const archiveBytes = edited.checkpoint.manifest.bytes + Number(storedArchive?.branchBytes) + Number(storedArchive?.destinationBytes);
  const draftBytes = Number(storedDraft?.bytes), liveBytes = result.snapshot.checkpoint.manifest.bytes;
  expect(pair.b.readStorageUsage(key)).toEqual({
    revision: result.snapshot.revision, liveBytes, liveCheckpointBytes: liveBytes,
    archiveCount: 1, archiveBytes, draftCount: 1, draftBytes, batchCount: 0, batchBytes: 0,
    recoveryBytes: archiveBytes + draftBytes, totalBytes: liveBytes + archiveBytes + draftBytes,
  });
  const neighborKey = 'project:storage-neighbor';
  const neighbor = new CoordinatedRetainedRoom(pair.a, neighborKey, pair.schema, version);
  await neighbor.initialize(pair.checkpoint);
  expect(pair.b.readStorageUsage(neighborKey)).toMatchObject({
    liveBytes: pair.checkpoint.manifest.bytes, recoveryBytes: 0, totalBytes: pair.checkpoint.manifest.bytes,
  });
  expect(await pair.handoff.readRetiredDraft(operation, draftId)).toEqual(draft);
  const rollback = await pair.second.rollback(await pair.room.freeze(result.snapshot), uuid(), operation, 'retained-branch', policy());
  expect(await model(rollback.snapshot.checkpoint, pair)).toEqual(pair.editor.getJSON());
  expect(rollback.archive.source.checkpoint).toEqual(result.snapshot.checkpoint);
  expect(pair.b.readStorageUsage(key)).toMatchObject({
    revision: rollback.snapshot.revision, liveBytes: rollback.snapshot.checkpoint.manifest.bytes, archiveCount: 2, draftCount: 1,
  });
});

it('keeps the exact offline checkpoint alongside an overlapping retired merge and reopens it through SQLite', async () => {
  const pair = await fixture();
  const offlineDocument = new Y.Doc();
  const admitted = await prepareRetainedAdmission(offlineDocument,pair.checkpoint,pair.schema,version,'fountain');
  admitted.install('test-admission');
  const offline = client(offlineDocument,'offline-writer');
  expect(getCollaborationState(offline.editor)?.status).toBe('connected');
  const online = await open(pair.checkpoint, pair);
  online.editor.dispatch(online.editor.createTransaction().replaceText([0, 0], 0, 'Alpha α 😀'.length, 'Rewritten online'));
  const latest = await pair.room.write({epoch:pair.initial.epoch,update:Y.encodeStateAsUpdate(online.document)});
  const moved = await migrate(pair);
  const update = type(offline, 'OFFLINE');
  const checkpoint = await captureRetainedCheckpoint(offline.document, pair.schema, version);
  expect(checkpoint.manifest.guid).not.toBe(pair.checkpoint.manifest.guid);
  const request = {archiveId:moved.operation,draftId:uuid(),roomId:pair.checkpoint.manifest.roomId,checkpoint};

  await expect(pair.handoff.saveRetiredDraft({...request,roomId:'other',get checkpoint(): RetainedCheckpoint {throw new Error('must fence before reading');}})).rejects.toMatchObject({code:'stale-epoch'});
  await expect(pair.handoff.saveRetiredDraft({...request,checkpoint:moved.result.snapshot.checkpoint})).rejects.toMatchObject({code:'stale-epoch'});
  const invalid = checkpoint.update;
  invalid[0] ^= 0xff;
  await expect(pair.handoff.saveRetiredDraft({...request,checkpoint:{manifest:checkpoint.manifest,update:invalid}})).rejects.toThrow('checksum mismatch');
  expect(await pair.handoff.readRetiredDraft(request.archiveId,request.draftId)).toBeUndefined();
  expect(await pair.handoff.saveRetiredDraft(request)).toEqual(checkpoint);
  expect((await pair.b.readArchive(key, moved.operation))?.branchRevision).toBe(0);
  const branch = await pair.second.retainLateUpdate({archiveId:moved.operation,roomId:request.roomId,update});
  expect(await model(branch.branch,pair)).not.toEqual(offline.editor.getJSON());
  expect(await model(latest.checkpoint,pair)).toEqual(online.editor.getJSON());
  const reopened = new SQLiteRetainedRoomRepository(pair.path);
  cleanup.push(() => reopened.close());
  const service = new RetainedRoomHandoff(reopened,key,pair.schema,version);
  const saved = (await service.readRetiredDraft(request.archiveId,request.draftId))!;
  expect(saved.update).toEqual(checkpoint.update);
  expect(await model(saved,pair)).toEqual(offline.editor.getJSON());
  saved.update.fill(0);
  expect(await service.saveRetiredDraft(request)).toEqual(checkpoint);
  await expect(service.saveRetiredDraft({...request,checkpoint:latest.checkpoint})).rejects.toMatchObject({code:'invalid-ticket'});
  expect(await service.readRetiredDraft(request.archiveId,request.draftId)).toEqual(checkpoint);
  expect(await pair.room.snapshot()).toEqual(moved.result.snapshot);
});

it('applies a reviewed paragraph only to its checked live revision and leaves the saved draft intact', async () => {
  const pair = await fixture(), moved = await migrate(pair);
  type(pair,'OFFLINE');
  const draft = await captureRetainedCheckpoint(pair.document,pair.schema,version);
  const draftId = uuid(), request = {archiveId:moved.operation,draftId,nodeId:'intro'};
  await pair.handoff.saveRetiredDraft({...request,roomId:draft.manifest.roomId,checkpoint:draft});
  const service = new RetainedTextRecovery(pair.a,key,pair.schema,version);
  const review = await service.preview(request);
  expect(review).toMatchObject({currentText:'Alpha α 😀',draftText:'AlOFFLINEpha α 😀'});
  const concurrent = await open(moved.result.snapshot.checkpoint,pair);
  concurrent.editor.dispatch(concurrent.editor.createTransaction().insertText([1,0,0], 0, 'Peer note. '));
  const newer = await pair.other.write({epoch:review.epoch,update:Y.encodeStateAsUpdate(concurrent.document)});
  await expect(service.apply(review,'Reviewed text')).rejects.toMatchObject({code:'revision-conflict'});
  expect(await pair.room.snapshot()).toEqual(newer);
  const fresh = await service.preview(request);
  const saved = await service.apply(fresh,'Reviewed text');
  expect(saved.revision).toBe(newer.revision+1);
  const expected = concurrent.editor.createTransaction().replaceText([0,0],0,'Alpha α 😀'.length,'Reviewed text').doc;
  expect(await model(saved.checkpoint,pair)).toEqual(expected.toJSON());
  expect(await pair.handoff.readRetiredDraft(request.archiveId,draftId)).toEqual(draft);
  await expect(pair.room.write({epoch:review.epoch,expectedRevision:review.revision,get update():Uint8Array {throw new Error('stale payload read');}}))
    .rejects.toMatchObject({code:'revision-conflict'});
  const ticket = await pair.room.freeze(saved);
  const resumed = await pair.room.commitResume(ticket,await pair.room.prepareResume(ticket));
  expect((await service.preview(request)).epoch).toBe(resumed.epoch);
  await expect(service.apply(fresh,'Old review')).rejects.toMatchObject({code:'revision-conflict'});
});

it('restores saved marks and links into a moved paragraph without changing its current attributes or identity', async () => {
  const pair = await fixture(), moved = await migrate(pair), {schema} = pair;
  const draftParagraph = pair.editor.state.doc.child(0).copy([
    schema.text('Bold', [schema.mark('strong')]),
    schema.text(' and '),
    schema.text('linked', [schema.mark('em'), schema.mark('link', {href:'https://example.com/review'})]),
  ]);
  pair.editor.dispatch(pair.editor.createTransaction().replaceNode([0],[draftParagraph]));
  const draft = await captureRetainedCheckpoint(pair.document,schema,version);
  const draftId = uuid(), request = {archiveId:moved.operation,draftId,nodeId:'intro'};
  await pair.handoff.saveRetiredDraft({...request,roomId:draft.manifest.roomId,checkpoint:draft});

  const current = await open(moved.result.snapshot.checkpoint,pair);
  current.editor.dispatch(current.editor.createTransaction().setNodeAttrs([0],{...current.editor.state.doc.child(0).attrs,align:'right'})
    .setSelection(Selection.cursor([0,0],0)));
  expect(toggleQuote(current.editor)).toBe(true);
  const online = await pair.room.write({epoch:moved.result.snapshot.epoch,update:Y.encodeStateAsUpdate(current.document)});
  const store = new RetainedDocumentStore(current.document,'fountain',schema,()=>uuid());
  cleanup.push(() => store.destroy());
  store.read();
  const identity = store.identity([0,0]);
  expect(identity).toBeTruthy();
  const service = new RetainedTextRecovery(pair.a,key,schema,version);
  const review = await service.preview(request);
  expect(review.canEditPlainText).toBe(false);
  expect(review.draftParagraph).toEqual(draftParagraph.toJSON());
  await expect(service.apply(review,'Lose the marks')).rejects.toThrow('single unformatted run');
  expect(await pair.room.snapshot()).toEqual(online);
  const saved = await service.apply(review,{useSavedFormatting:true});
  const restored = await restoreRetainedCheckpoint(saved.checkpoint,schema,version);
  cleanup.push(() => restored.document.destroy());
  const reader = new RetainedDocumentStore(restored.document,'fountain',schema,()=>uuid());
  cleanup.push(() => reader.destroy());
  const document = reader.read();
  const expected = current.editor.state.doc.child(0).child(0).copy(draftParagraph.content);
  expect(document.toJSON()).toEqual(current.editor.createTransaction().replaceNode([0,0],[expected]).doc.toJSON());
  expect(reader.identity([0,0])).toBe(identity);
  expect(await pair.handoff.readRetiredDraft(request.archiveId,draftId)).toEqual(draft);
  const fresh = await service.preview(request);
  await expect(service.apply(fresh,{content:[{type:'hard_break'}]})).rejects.toThrow('single-line text and marks');
  await expect(service.apply(fresh,{content:[{type:'text',text:'unsafe',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}]}))
    .rejects.toThrow('Invalid value for attribute: href');
  expect(await pair.room.snapshot()).toEqual(saved);
  const combined = [...draftParagraph.content, schema.text(' with a live update.',[schema.mark('strong')])];
  const replacement = {content:combined.map(node=>node.toJSON())};
  await expect(service.apply(review,replacement)).rejects.toMatchObject({code:'revision-conflict'});
  const resolved = await service.apply(fresh,replacement);
  const resolvedDoc = await restoreRetainedCheckpoint(resolved.checkpoint,schema,version);
  cleanup.push(() => resolvedDoc.document.destroy());
  expect(resolvedDoc.baseDocument.child(0).child(0).toJSON()).toEqual(expected.copy(combined).toJSON());
  expect(await pair.handoff.readRetiredDraft(request.archiveId,draftId)).toEqual(draft);
});

it('reapplies the archived placement with the live text and refuses a stale or missing anchor', async () => {
  const pair = await fixture();
  pair.editor.dispatch(pair.editor.createTransaction().setNodeAttrs([1],{nodeId:'quote'}).setNodeAttrs([1,0],{nodeId:'anchor'}));
  await pair.room.write({epoch:pair.initial.epoch,update:Y.encodeStateAsUpdate(pair.document)});
  const moved = await migrate(pair);
  expect(moveNode(pair.editor,{fromPath:[0],toParentPath:[1],toIndex:1})).toBe(true);
  const draft = await captureRetainedCheckpoint(pair.document,pair.schema,version);
  const draftId=uuid(),request={archiveId:moved.operation,draftId,nodeId:'intro'};
  await pair.handoff.saveRetiredDraft({...request,roomId:draft.manifest.roomId,checkpoint:draft});
  const service = new RetainedTextRecovery(pair.a,key,pair.schema,version);
  const review = await service.preview(request);
  expect(review).toMatchObject({currentLocation:'Document · block 1',draftLocation:'blockquote · block 2',canUseSavedPlacement:true});

  const live = await open(moved.result.snapshot.checkpoint,pair);
  live.editor.dispatch(live.editor.createTransaction().insertText([0,0],0,'Live update. ')
    .setNodeAttrs([1,0],{nodeId:'changed-anchor'}));
  const changed=await pair.other.write({epoch:review.epoch,update:Y.encodeStateAsUpdate(live.document)});
  await expect(service.apply(review,{useSavedPlacement:true})).rejects.toMatchObject({code:'revision-conflict'});
  const missing=await service.preview(request);
  expect(missing.canUseSavedPlacement).toBe(false);
  await expect(service.apply(missing,{useSavedPlacement:true})).rejects.toThrow('no unambiguous live destination');
  expect(await pair.room.snapshot()).toEqual(changed);

  live.editor.dispatch(live.editor.createTransaction().setNodeAttrs([1,0],{nodeId:'anchor'}));
  await pair.room.write({epoch:review.epoch,update:Y.encodeStateAsUpdate(live.document)});
  const current=await service.preview(request);
  const store=new RetainedDocumentStore(live.document,'fountain',pair.schema,()=>uuid());
  cleanup.push(()=>store.destroy());
  const before=store.read(), identity=store.identity([0]);
  expect(identity).toBeTruthy();
  const resolved=await service.apply(current,{useSavedPlacement:true});
  const restored=await restoreRetainedCheckpoint(resolved.checkpoint,pair.schema,version);
  cleanup.push(()=>restored.document.destroy());
  const reader=new RetainedDocumentStore(restored.document,'fountain',pair.schema,()=>uuid());
  cleanup.push(()=>reader.destroy());
  const document=reader.read();
  expect(document.child(0).child(1).toJSON()).toEqual(before.child(0).toJSON());
  expect(document.child(0).child(0).toJSON()).toEqual(before.child(1).child(0).toJSON());
  expect(document.child(1).toJSON()).toEqual(before.child(2).toJSON());
  expect(reader.identity([0,1])).toBe(identity);
  expect(await pair.handoff.readRetiredDraft(request.archiveId,draftId)).toEqual(draft);

  expect(moveNode(pair.editor,{fromPath:[0,1],toParentPath:[],toIndex:1})).toBe(true);
  const rootDraft=await captureRetainedCheckpoint(pair.document,pair.schema,version);
  const rootRequest={...request,draftId:uuid()};
  await pair.handoff.saveRetiredDraft({...rootRequest,roomId:draft.manifest.roomId,checkpoint:rootDraft});
  const rootReview=await service.preview(rootRequest);
  expect(rootReview).toMatchObject({draftLocation:'Document · block 2',canUseSavedPlacement:true});
  const returned=await service.apply(rootReview,{useSavedPlacement:true});
  const root=await restoreRetainedCheckpoint(returned.checkpoint,pair.schema,version);
  cleanup.push(()=>root.document.destroy());
  const rootReader=new RetainedDocumentStore(root.document,'fountain',pair.schema,()=>uuid());
  cleanup.push(()=>rootReader.destroy());
  expect(rootReader.read().child(1).toJSON()).toEqual(before.child(0).toJSON());
  expect(rootReader.identity([1])).toBe(identity);
});

it.each(['active', 'prepared', 'stale-ticket', 'foreign-ticket'] as const)('refuses %s migration without archiving or replacing the source', async mode => {
  const pair = await fixture(), ticket = await pair.room.freeze(pair.initial), operation = uuid();
  if (mode === 'active') await pair.room.abort(ticket);
  if (mode === 'prepared') await pair.room.prepareResume(ticket);
  const before = await pair.a.read(key);
  await expect(pair.handoff.migrate(mode === 'stale-ticket' ? { ...ticket, revision: 8 } : mode === 'foreign-ticket' ? { ...ticket, key: 'other' } : ticket, operation, options(), policy())).rejects.toMatchObject({ code: 'invalid-ticket' });
  expect(await pair.b.read(key)).toEqual(before); expect(await pair.b.readArchive(key, operation)).toBeUndefined();
});

it.each(['history', 'offline', 'externalReceipt'] as const)('requires an explicit %s handoff policy', async field => {
  const pair = await fixture(), ticket = await pair.room.freeze(pair.initial), operation = uuid(), before = await pair.a.read(key);
  await expect(pair.handoff.migrate(ticket, operation, options(), { ...policy(), [field]: undefined } as any)).rejects.toThrow('explicit');
  expect(await pair.b.read(key)).toEqual(before); expect(await pair.b.readArchive(key, operation)).toBeUndefined();
});

it('refuses unclaimed source state and invalid operation identities without touching the frozen source', async () => {
  const pair = await fixture(); pair.document.getMap('unknown-host-data').set('important', 'must survive');
  await pair.room.write({ epoch: pair.initial.epoch, update: Y.encodeStateAsUpdate(pair.document) });
  const ticket = await pair.room.freeze(await pair.room.snapshot()), operation = uuid(), before = await pair.a.read(key);
  await expect(pair.handoff.migrate(ticket, operation, options(), policy())).rejects.toThrow('Unclaimed');
  await expect(pair.handoff.migrate(ticket, 'not-a-uuid', options(), policy())).rejects.toThrow('UUID');
  expect(await pair.b.read(key)).toEqual(before); expect(await pair.b.readArchive(key, operation)).toBeUndefined();
});

it('rolls back the live-row update when archive insertion fails inside the same SQLite transaction', async () => {
  const pair = await fixture(), ticket = await pair.room.freeze(pair.initial), operation = uuid(), before = await pair.a.read(key);
  const db = new DatabaseSync(pair.path); cleanup.push(() => db.close());
  db.exec("CREATE TRIGGER fail_archive BEFORE INSERT ON fountain_retained_archives_v1 BEGIN SELECT RAISE(ABORT, 'injected archive failure'); END");
  await expect(pair.handoff.migrate(ticket, operation, options(), policy())).rejects.toThrow('injected archive failure');
  expect(await pair.b.read(key)).toEqual(before); expect(await pair.b.readArchive(key, operation)).toBeUndefined();
  db.exec('DROP TRIGGER fail_archive');
  expect((await pair.handoff.migrate(ticket, operation, options(), policy())).snapshot.revision).toBe(1);
});

it('does not install a validated candidate after a competing administrator aborts and refreezes', async () => {
  const pair = await fixture(), ticket = await pair.room.freeze(pair.initial), operation = uuid(), held = gate(pair.a);
  const service = new RetainedRoomHandoff(held.repository, key, pair.schema, version), pending = service.migrate(ticket, operation, options(), policy());
  await held.ready; await pair.other.abort(ticket); const newer = await pair.other.freeze(pair.initial), before = await pair.b.read(key); held.release();
  await expect(pending).rejects.toMatchObject({ code: 'revision-conflict' });
  expect(await pair.a.read(key)).toEqual(before); expect(await pair.a.readArchive(key, operation)).toBeUndefined();
  expect((await pair.room.recoverFrozen(pair.initial)).ticket).toEqual(newer);
});

it('allows only one competing fresh-room installation and retains the losing operation for explicit retry', async () => {
  const pair = await fixture(), ticket = await pair.room.freeze(pair.initial), operations = [uuid(), uuid()];
  const results = await Promise.allSettled([pair.handoff.migrate(ticket, operations[0]!, options(), policy()), pair.second.migrate(ticket, operations[1]!, options(), policy())]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
  expect((await pair.room.snapshot()).revision).toBe(1);
  const saved = await Promise.all(operations.map(operation => pair.b.readArchive(key, operation)));
  expect(saved.filter(Boolean)).toHaveLength(1);
});

it('fences the old writer before reading bytes, retaining its edits only in the retired branch', async () => {
  const pair = await fixture(), moved = await migrate(pair), update = type(pair, ' OLD '), before = await pair.room.snapshot(), getter = vi.fn(() => update);
  await expect(pair.other.write({ epoch: pair.initial.epoch, get update() { return getter(); } })).rejects.toMatchObject({ code: 'stale-epoch' });
  expect(getter).not.toHaveBeenCalled();
  const archive = await pair.second.retainLateUpdate({ archiveId: moved.operation, roomId: pair.checkpoint.manifest.roomId, update });
  expect(archive.branchRevision).toBe(1); expect(await model(archive.branch, pair)).toEqual(pair.editor.getJSON());
  expect(archive.source.checkpoint).toEqual(pair.checkpoint); expect(archive.destination.checkpoint).toEqual(before.checkpoint);
  expect(await pair.room.snapshot()).toEqual(before);
  expect(await pair.handoff.retiredRoom(pair.checkpoint.manifest.roomId)).toEqual(archive);
});

it('does not read late update bytes for a different retired room', async () => {
  const pair = await fixture(), moved = await migrate(pair), getter = vi.fn(() => { throw new Error('Unread'); });
  await expect(pair.second.retainLateUpdate({ archiveId: moved.operation, roomId: 'wrong', get update() { return getter(); } })).rejects.toMatchObject({ code: 'stale-epoch' });
  expect(getter).not.toHaveBeenCalled(); expect((await pair.a.readArchive(key, moved.operation))!.branchRevision).toBe(0);
});

it('keeps the saved branch revision when retrying after a lost reply and a newer retired edit', async () => {
  const pair = await fixture(), peer = await open(pair.checkpoint, pair), moved = await migrate(pair);
  const request = { archiveId: moved.operation, roomId: pair.checkpoint.manifest.roomId, update: type(pair, ' FIRST ') };
  const active = await pair.room.snapshot();
  const saved = await pair.handoff.retainLateUpdate(request);
  expect(saved.branchRevision).toBe(1);
  const newer = await pair.second.retainLateUpdate({ ...request, update: type(peer, ' SECOND ') });
  expect(newer.branchRevision).toBe(2);
  expect(await pair.handoff.retainLateUpdate(request)).toEqual(newer);
  expect(await pair.b.readArchive(key, moved.operation)).toEqual(newer);
  expect(await pair.room.snapshot()).toEqual(active);
  Y.applyUpdate(pair.document, Y.encodeStateAsUpdate(peer.document));
  expect(await model(newer.branch, pair)).toEqual(pair.editor.getJSON());
});

it('acknowledges two connections racing to retain the same offline edit with one branch revision', async () => {
  const pair = await fixture(), moved = await migrate(pair), held = gate(pair.a, 'compareArchiveBranch');
  const service = new RetainedRoomHandoff(held.repository, key, pair.schema, version);
  const request = { archiveId: moved.operation, roomId: pair.checkpoint.manifest.roomId, update: type(pair, ' SAME ') };
  const pending = service.retainLateUpdate(request);
  await held.ready;
  const saved = await pair.second.retainLateUpdate(request).finally(held.release);
  expect(saved.branchRevision).toBe(1);
  expect(await pending).toEqual(saved);
  expect(await pair.b.readArchive(key, moved.operation)).toEqual(saved);
});

it.each(['invalid-wire', 'different-room', 'missing-dependency'] as const)('does not change either room or archive after a late %s update', async mode => {
  const pair = await fixture(), moved = await migrate(pair); let update: Uint8Array = new Uint8Array([255]);
  if (mode === 'different-room') update = Y.encodeStateAsUpdate(client().document);
  if (mode === 'missing-dependency') { const updates: Uint8Array[] = []; pair.document.on('update', value => updates.push(value)); type(pair, 'X'); type(pair, 'Y'); update = updates[1]!; }
  const before = await pair.b.readArchive(key, moved.operation), current = await pair.room.snapshot();
  await expect(pair.handoff.retainLateUpdate({ archiveId: moved.operation, roomId: pair.checkpoint.manifest.roomId, update })).rejects.toMatchObject({ code: 'invalid-update' });
  expect(await pair.b.readArchive(key, moved.operation)).toEqual(before); expect(await pair.room.snapshot()).toEqual(current);
});

it('rejects a racing branch replacement and preserves both authors after explicit retry', async () => {
  const pair = await fixture(), grace = await open(pair.checkpoint, pair), moved = await migrate(pair), held = gate(pair.a, 'compareArchiveBranch');
  const service = new RetainedRoomHandoff(held.repository, key, pair.schema, version), a = type(pair, 'A'), b = type(grace, 'B');
  const pending = service.retainLateUpdate({ archiveId: moved.operation, roomId: pair.checkpoint.manifest.roomId, update: a }); await held.ready;
  await pair.second.retainLateUpdate({ archiveId: moved.operation, roomId: pair.checkpoint.manifest.roomId, update: b }); held.release();
  await expect(pending).rejects.toMatchObject({ code: 'revision-conflict' });
  const saved = await pair.handoff.retainLateUpdate({ archiveId: moved.operation, roomId: pair.checkpoint.manifest.roomId, update: a });
  Y.applyUpdate(pair.document, b); expect(await model(saved.branch, pair)).toEqual(pair.editor.getJSON()); expect(saved.branchRevision).toBe(2);
});

it.each(['frozen-source', 'retained-branch'] as const)('rolls back to %s while archiving every accepted new-room edit', async restore => {
  const pair = await fixture(), moved = await migrate(pair), oldUpdate = type(pair, ' OLD ');
  await pair.handoff.retainLateUpdate({ archiveId: moved.operation, roomId: pair.checkpoint.manifest.roomId, update: oldUpdate });
  const fresh = await open(moved.result.snapshot.checkpoint, pair), newUpdate = type(fresh, ' NEW ');
  const accepted = await pair.room.write({ epoch: moved.result.snapshot.epoch, update: newUpdate }), ticket = await pair.room.freeze(accepted), operation = uuid();
  const restored = await pair.second.rollback(ticket, operation, moved.operation, restore, policy());
  expect(restored.snapshot.epoch).not.toBe(pair.initial.epoch); expect(restored.snapshot.epoch).not.toBe(accepted.epoch);
  expect(restored.snapshot.revision).toBe(3); expect(restored.archive.source.checkpoint).toEqual(accepted.checkpoint);
  expect(await model(restored.archive.source.checkpoint, pair)).toEqual(fresh.editor.getJSON());
  expect(await model(restored.snapshot.checkpoint, pair)).toEqual(restore === 'frozen-source' ? await model(pair.checkpoint, pair) : pair.editor.getJSON());
  expect((await pair.a.readArchive(key, moved.operation))!.branchRevision).toBe(1);
  for (const epoch of [pair.initial.epoch, accepted.epoch]) await expect(pair.room.write({ epoch, update: oldUpdate })).rejects.toMatchObject({ code: 'stale-epoch' });
  expect(await pair.handoff.rollback(ticket, operation, moved.operation, restore, policy())).toMatchObject({ replayed: true, current: true });
});

it('refuses rollback when a late branch changes after its validation but before installation', async () => {
  const pair = await fixture(), moved = await migrate(pair), ticket = await pair.room.freeze(moved.result.snapshot), operation = uuid(), held = gate(pair.a);
  const service = new RetainedRoomHandoff(held.repository, key, pair.schema, version), pending = service.rollback(ticket, operation, moved.operation, 'retained-branch', policy());
  await held.ready; const update = type(pair, 'LATE'); await pair.second.retainLateUpdate({ archiveId: moved.operation, roomId: pair.checkpoint.manifest.roomId, update });
  const before = await pair.b.read(key); held.release(); await expect(pending).rejects.toMatchObject({ code: 'revision-conflict' });
  expect(await pair.a.read(key)).toEqual(before); expect(await pair.a.readArchive(key, operation)).toBeUndefined();
  const result = await pair.handoff.rollback(ticket, operation, moved.operation, 'retained-branch', policy());
  expect(await model(result.snapshot.checkpoint, pair)).toEqual(pair.editor.getJSON());
});

it('replays a committed migration after connection restart without replacing later accepted edits', async () => {
  const pair = await fixture(), moved = await migrate(pair), fresh = await open(moved.result.snapshot.checkpoint, pair);
  const accepted = await pair.room.write({ epoch: moved.result.snapshot.epoch, update: type(fresh, 'AFTER') });
  const repository = new SQLiteRetainedRoomRepository(pair.path); cleanup.push(() => repository.close());
  const restarted = new RetainedRoomHandoff(repository, key, pair.schema, version), result = await restarted.migrate(moved.ticket, moved.operation, options(), policy());
  expect(result).toMatchObject({ replayed: true, current: true }); expect(result.snapshot).toEqual(accepted);
  expect(result.archive.destination.checkpoint).toEqual(moved.result.snapshot.checkpoint);
});

it('reports a historical replay as superseded rather than reinstalling an old destination', async () => {
  const pair = await fixture(), moved = await migrate(pair), ticket = await pair.room.freeze(moved.result.snapshot);
  const restored = await pair.handoff.rollback(ticket, uuid(), moved.operation, 'frozen-source', policy());
  const replay = await pair.second.migrate(moved.ticket, moved.operation, options(), policy());
  expect(replay).toMatchObject({ replayed: true, current: false }); expect(replay.snapshot).toEqual(restored.snapshot);
});

it.each(['ticket', 'policy', 'kind'] as const)('refuses reuse of an operation UUID for a different %s', async mode => {
  const pair = await fixture(), moved = await migrate(pair), before = await pair.room.snapshot();
  const pending = mode === 'kind' ? pair.handoff.rollback(moved.ticket, moved.operation, uuid(), 'frozen-source', policy())
    : pair.handoff.migrate(mode === 'ticket' ? { ...moved.ticket, id: uuid() } : moved.ticket, moved.operation, options(), mode === 'policy' ? { ...policy(), externalReceipt: 'another' } : policy());
  await expect(pending).rejects.toMatchObject({ code: 'invalid-ticket' }); expect(await pair.room.snapshot()).toEqual(before);
});

it('snapshots ticket, migration options and host policy before the first storage await', async () => {
  const pair = await fixture(), ticket = { ...await pair.room.freeze(pair.initial) }, expected = { ...ticket }, settings = { ...options(), migrators: [] as any[] }, host = { ...policy() }, held = gate(pair.a, 'readArchive');
  const service = new RetainedRoomHandoff(held.repository, key, pair.schema, version), operation = uuid(), pending = service.migrate(ticket, operation, settings, host);
  await held.ready; ticket.revision = 99; settings.migrators.push({ name: 'bad' }); host.externalReceipt = 'changed'; held.release();
  const result = await pending; expect(result.archive.source.revision).toBe(expected.revision); expect(result.archive.policy.externalReceipt).toBe(policy().externalReceipt);
});

it.each(['source_wire', 'destination_wire', 'branch_wire'] as const)('rejects corrupt archived %s before retaining updates or replacing the live room', async field => {
  const pair = await fixture(), moved = await migrate(pair), db = new DatabaseSync(pair.path); cleanup.push(() => db.close());
  if (field === 'branch_wire') await pair.handoff.retainLateUpdate({ archiveId: moved.operation, roomId: pair.checkpoint.manifest.roomId, update: type(pair, 'X') });
  // Identifiers are test-owned constants, values remain parameterized.
  db.prepare(`UPDATE fountain_retained_archives_v1 SET ${field} = ? WHERE room_key = ? AND archive_id = ?`).run(new Uint8Array([255]), key, moved.operation);
  const before = await pair.b.readArchive(key, moved.operation), current = await pair.room.snapshot();
  await expect(pair.handoff.retainLateUpdate({ archiveId: moved.operation, roomId: pair.checkpoint.manifest.roomId, update: type(pair, 'Y') })).rejects.toThrow();
  expect(await pair.b.readArchive(key, moved.operation)).toEqual(before); expect(await pair.room.snapshot()).toEqual(current);
  const ticket = await pair.room.freeze(current), frozen = await pair.a.read(key);
  await expect(pair.second.rollback(ticket, uuid(), moved.operation, 'frozen-source', policy())).rejects.toThrow(); expect(await pair.a.read(key)).toEqual(frozen);
});

it('finds the latest retired incarnation after rollback and a second migration of the same room identity', async () => {
  const pair = await fixture(), first = await migrate(pair), ticket = await pair.room.freeze(first.result.snapshot);
  await pair.handoff.rollback(ticket, uuid(), first.operation, 'frozen-source', policy());
  const second = await migrate(pair), found = await pair.second.retiredRoom(pair.checkpoint.manifest.roomId);
  expect(found!.id).toBe(second.operation); expect(found!.source.revision).toBe(2); expect(await pair.handoff.retiredRoom('missing')).toBeUndefined();
});
