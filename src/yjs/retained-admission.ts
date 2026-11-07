import * as Y from 'yjs';
import type {Node,Schema} from '../core/schema';
import {checkpointWire as wire,type CheckpointRoot,type RetainedCheckpoint,captureRetainedCheckpoint} from './retained-checkpoint';
import {validateRetainedRoomCheckpoint} from './retained-room-store';
import {RetainedDocumentStore} from './retained-document';
import {assertRetainedWireData} from './retained-wire';

/** The host supplies an already initialized, authorized room snapshot. A live
 * provider must not autoconnect before this barrier. Epochs/authentication and
 * atomic first-room provisioning remain the host authority's responsibility. */
export interface RetainedAdmission {
  readonly schemaVersion:string;
  readonly load:(signal:AbortSignal)=>RetainedCheckpoint|Promise<RetainedCheckpoint>;
}

function declare(document:Y.Doc,roots:readonly CheckpointRoot[]):void {
  for(const root of roots){
    if(root.kind==='map')document.getMap(root.name);
    else if(root.kind==='array')document.getArray(root.name);
    else if(root.kind==='text')document.getText(root.name);
    else if(root.kind==='xml-fragment')document.getXmlFragment(root.name);
    else if(root.kind==='xml-text')document.get(root.name,Y.XmlText);
    else document.get(root.name);
  }
}

/** Validate the complete merge in isolation. The caller can inspect the result
 * and reject a draft conflict before any shared client state is changed. */
export async function prepareRetainedAdmission(document:Y.Doc,checkpoint:RetainedCheckpoint,schema:Schema,schemaVersion:string,room:string):Promise<{readonly document:Node;install(origin:unknown):void}> {
  const incoming=await validateRetainedRoomCheckpoint(checkpoint,schema,schemaVersion);
  if(incoming.manifest.room!==room)throw new Error('Admission checkpoint belongs to another namespace.');
  wire.assertIdle(document);assertRetainedWireData(document);
  const before=Y.encodeStateAsUpdate(document),roots=wire.roots(document),guid=document.guid,gc=document.gc;
  if(before.length>64*1024*1024)throw new Error('Admission client exceeds checkpoint bounds.');
  const inventory=new Map(roots.map(root=>[root.name,root]));
  for(const root of incoming.manifest.roots){const local=inventory.get(root.name);if(local&&local.kind!==root.kind&&local.kind!=='unresolved'&&root.kind!=='unresolved')throw new Error('Admission shared-root types conflict.');if(!local||local.kind==='unresolved')inventory.set(root.name,root);}
  const mergedRoots=wire.copyRoots([...inventory.values()]),staged=wire.load(before,mergedRoots,guid);staged.gc=gc;
  try{
    Y.applyUpdate(staged,incoming.update);
    if(staged.store.pendingStructs||staged.store.pendingDs)throw new Error('Admission has unresolved shared dependencies.');
    const verified=await captureRetainedCheckpoint(staged,schema,schemaVersion,room);
    if(verified.manifest.roomId!==incoming.manifest.roomId)throw new Error('Admission conflicts with the local room identity; both sources preserved.');
    const reader=new RetainedDocumentStore(staged,room,schema,()=>{throw new Error('Admission reader cannot allocate identities.');});let value:Node;
    try{value=reader.read();}finally{reader.destroy();}
    wire.assertUnchanged(staged,verified.update,verified.manifest.roots);
    let installed=false;
    return Object.freeze({document:value,install(origin:unknown){
      if(installed)throw new Error('Admission candidate already installed.');
      wire.assertUnchanged(document,before,roots);
      if(document.guid!==guid||document.gc!==gc)throw new Error('Admission client options changed during validation.');
      installed=true;declare(document,mergedRoots);Y.applyUpdate(document,incoming.update,origin);
    }});
  }finally{staged.destroy();}
}
