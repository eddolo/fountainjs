// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, composeExtensions, createEditor } from '../src';
import { SQLiteRetainedRoomRepository } from '../examples/backends/retained-sqlite';
import { CoordinatedDocumentRoom, type DocumentRoomAdmission } from '../src/yjs/document-room';
import { CoordinatedRetainedRoom } from '../src/yjs/retained-room-coordinator';
import { createRetainedYjsCollaborationExtension } from '../src/yjs/retained-adapter';
import { captureRetainedCheckpoint } from '../src/yjs/retained-checkpoint';

async function withRoom(run: (fixture: Awaited<ReturnType<typeof openRoom>>) => Promise<void>) {
  const path = mkdtempSync(join(tmpdir(), 'fountain-sqlite-presence-'));
  try { await run(await openRoom(join(path, 'rooms.sqlite'))); }
  finally {
    if (dirname(resolve(path)) !== resolve(tmpdir()) || !basename(path).startsWith('fountain-sqlite-presence-')) throw new Error('Unsafe cleanup path.');
    rmSync(path, {recursive:true,force:true});
  }
}

async function openRoom(path: string) {
  let now = 0;
  const first = new SQLiteRetainedRoomRepository(path, () => now);
  const second = new SQLiteRetainedRoomRepository(path, () => now);
  const document = new Y.Doc();
  const kit = composeExtensions([CoreExtension, createRetainedYjsCollaborationExtension({
    document,user:{id:'seed',name:'Seed',color:'#7048e8'},
  })]);
  const editor = createEditor({schema:kit.schema,plugins:kit.plugins});
  try {
    const schema = editor.state.schema;
    const checkpoint = await captureRetainedCheckpoint(document,schema,'schema-1');
    const room = new CoordinatedDocumentRoom(first,'paper',schema,'schema-1');
    const opened = await room.openForEditing({protocols:['retained'],loadCheckpoint:()=>checkpoint});
    const other = new CoordinatedRetainedRoom(second,'paper',schema,'schema-1');
    return {first,second,room,other,opened,time(value: number){now=value;},close(){first.close();second.close();}};
  } catch (error) { first.close();second.close();throw error; }
  finally { editor.destroy();document.destroy(); }
}

it('shares cursor state and expiry across SQLite connections without revising the document', async () => withRoom(async fixture => {
  const {first,second,room,opened,time,close} = fixture, lease = opened.admission;
  try {
    const ada=first.bindPresence(lease), grace=second.bindPresence(lease);
    const cursor={fountain:{user:'Grace'}};
    expect(second.exchangePresence(lease,grace,cursor)).toEqual([]);
    expect(first.exchangePresence(lease,ada,null)).toEqual([[-2,cursor]]);
    time(2_500);
    expect(first.exchangePresence(lease,ada,null)).toEqual([]);
    second.exchangePresence(lease,grace,cursor);
    expect(first.exchangePresence(lease,ada,null)).toEqual([[-2,cursor]]);
    first.leavePresence(lease.key,lease.epoch,grace);
    expect(first.exchangePresence(lease,ada,null)).toEqual([]);
    expect(await room.snapshot()).toEqual(opened.snapshot);
  } finally { close(); }
}));

it('fences old presence on freeze and rotation without clearing a new peer', async () => withRoom(async fixture => {
  const {first,second,room,other,opened,close} = fixture, lease = opened.admission;
  try {
    const previous=first.bindPresence(lease);
    await room.admit(lease);
    const ticket=await other.freeze(opened.snapshot);
    expect(()=>first.bindPresence(lease)).toThrow('frozen');
    expect(()=>first.exchangePresence(lease,previous,null)).toThrow('frozen');
    await other.commitResume(ticket,await other.prepareResume(ticket));
    const {admission: fresh}=await room.openForEditing({protocols:['retained'],loadCheckpoint(){throw new Error('already saved');}});
    expect(()=>first.exchangePresence(lease,previous,null)).toThrow('stale');
    expect(()=>first.bindPresence({...fresh,identity:'wrong'})).toThrow('does not match');
    const ada=first.bindPresence(fresh), grace=second.bindPresence(fresh), cursor={fountain:{user:'Ada'}};
    first.exchangePresence(fresh,ada,cursor);
    first.leavePresence(lease.key,lease.epoch,ada);
    expect(second.exchangePresence(fresh,grace,null)).toEqual([[-2,cursor]]);
    expect(()=>second.exchangePresence(fresh,previous,null)).toThrow('no longer active');
  } finally { close(); }
}));

it('enforces shared capacity and expires old tokens without reusing their display IDs', async () => withRoom(async fixture => {
  const {first,second,opened,time,close}=fixture, lease:DocumentRoomAdmission=opened.admission;
  try {
    const tokens=Array.from({length:64},(_,index)=>(index%2?second:first).bindPresence(lease));
    expect(()=>second.bindPresence(lease)).toThrow('capacity');
    expect(()=>first.exchangePresence(lease,tokens[0],{value:'α'.repeat(9_000)})).toThrow('Invalid presence state');
    time(120_000);
    const fresh=second.bindPresence(lease), observer=first.bindPresence(lease), state={fountain:{user:'Fresh'}};
    expect(()=>first.exchangePresence(lease,tokens[0],null)).toThrow('no longer active');
    second.exchangePresence(lease,fresh,state);
    expect(first.exchangePresence(lease,observer,null)).toEqual([[-65,state]]);
  } finally { close(); }
}));
