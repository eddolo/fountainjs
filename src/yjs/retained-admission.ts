import * as Y from 'yjs';
import type {Node,Schema} from '../core/schema';
import {checkpointWire as wire,type CheckpointRoot,type RetainedCheckpoint,captureRetainedCheckpoint} from './retained-checkpoint';
import {validateRetainedRoomCheckpoint} from './retained-room-store';
import {RetainedDocumentStore} from './retained-document';
import {assertRetainedWireData} from './retained-wire';
import type {DocumentRoomSnapshot} from './document-room';
import {projectRetainedRoomAttributes, type YjsStructuredAttributesOptions} from './structured-attributes';
import {retainedStructuredMap} from './retained-structured-map';

export interface RetainedAdmissionLease {
  readonly key:string;readonly epoch:string;readonly revision:number;
  readonly protocol:'retained';readonly room:string;readonly identity:string;
}

/** The host supplies an already initialized, authorized room snapshot. A live
 * provider must not autoconnect before this barrier. Authority mode binds the
 * verified session before transport starts. Authentication and first-room
 * provisioning remain the host authority's responsibility. */
export interface RetainedAdmission {
  readonly schemaVersion:string;
  readonly load:(signal:AbortSignal)=>RetainedCheckpoint|DocumentRoomSnapshot|Promise<RetainedCheckpoint|DocumentRoomSnapshot>;
  readonly authority?:{
    readonly key:string;
    readonly bind:(lease:RetainedAdmissionLease,signal:AbortSignal)=>void|Promise<void>;
  };
}

export function snapshotRetainedAdmission(input:RetainedAdmission):RetainedAdmission {
  const schemaVersion=input?.schemaVersion,load=input?.load,authority=input?.authority;
  if(typeof schemaVersion!=='string'||!schemaVersion.trim()||schemaVersion.length>200||/[\u0000-\u001f\u007f]/.test(schemaVersion)||typeof load!=='function')throw new TypeError('Invalid retained admission contract.');
  let owned:RetainedAdmission['authority'];
  if(authority!==undefined){const key=authority?.key,bind=authority?.bind;if(typeof key!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,193}$/.test(key)||typeof bind!=='function')throw new TypeError('Invalid retained authority admission contract.');owned=Object.freeze({key,bind});}
  return Object.freeze({schemaVersion,load,...(owned?{authority:owned}:{})});
}

/** Metadata is checked before checkpoint byte access. These fields are
 * consistency fences, never credentials or a substitute for host authorization. */
export function readRetainedAdmission(input:RetainedCheckpoint|DocumentRoomSnapshot,admission:RetainedAdmission,previous?:RetainedAdmissionLease):{checkpoint:RetainedCheckpoint;reference?:Omit<RetainedAdmissionLease,'room'|'identity'>} {
  if(!admission.authority)return {checkpoint:input as RetainedCheckpoint};
  const snapshot=wire.fields(input as DocumentRoomSnapshot,'checkpoint,epoch,key,phase,protocol,revision');
  if(snapshot.phase==='frozen')throw new Error('Authority admission refused: room is frozen.');
  if(snapshot.key!==admission.authority.key||snapshot.protocol!=='retained'||snapshot.phase!=='active'||typeof snapshot.epoch!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(snapshot.epoch)||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<0)throw new Error('Invalid or incompatible authority admission metadata.');
  if(previous&&snapshot.epoch!==previous.epoch)throw new Error('Authority epoch changed; preserve the pending draft and replace the session explicitly.');
  if(previous&&snapshot.revision<previous.revision)throw new Error('Authority admission revision regressed; cached snapshot refused.');
  return {checkpoint:snapshot.checkpoint as RetainedCheckpoint,reference:Object.freeze({key:snapshot.key,epoch:snapshot.epoch,revision:snapshot.revision,protocol:'retained'})};
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
export async function prepareRetainedAdmission(document:Y.Doc,checkpoint:RetainedCheckpoint,schema:Schema,schemaVersion:string,room:string,structured?:Omit<YjsStructuredAttributesOptions,'map'>):Promise<{readonly document:Node;readonly identity:string;install(origin:unknown):void}> {
  let incomingMap:string|undefined;
  const incoming=await validateRetainedRoomCheckpoint(checkpoint,schema,schemaVersion,(source,_base,name)=>{incomingMap=retainedStructuredMap(source,name);});
  if(incoming.manifest.room!==room)throw new Error('Admission checkpoint belongs to another namespace.');
  wire.assertIdle(document);assertRetainedWireData(document);
  const before=Y.encodeStateAsUpdate(document),roots=wire.roots(document),guid=document.guid,gc=document.gc;
  if(before.length>64*1024*1024)throw new Error('Admission client exceeds checkpoint bounds.');
  const inventory=new Map(roots.map(root=>[root.name,root]));
  for(const root of incoming.manifest.roots){const local=inventory.get(root.name);if(local&&local.kind!==root.kind&&local.kind!=='unresolved'&&root.kind!=='unresolved')throw new Error('Admission shared-root types conflict.');if(!local||local.kind==='unresolved')inventory.set(root.name,root);}
  const mergedRoots=wire.copyRoots([...inventory.values()]),staged=wire.load(before,mergedRoots,guid);
  try{
    Y.applyUpdate(staged,incoming.update);
    staged.gc=gc;
    if(staged.store.pendingStructs||staged.store.pendingDs)throw new Error('Admission has unresolved shared dependencies.');
    if(retainedStructuredMap(staged,room)!==incomingMap)throw new Error('Admission changed the saved structured attribute map.');
    const verified=await captureRetainedCheckpoint(staged,schema,schemaVersion,room);
    if(verified.manifest.roomId!==incoming.manifest.roomId)throw new Error('Admission conflicts with the local room identity; both sources preserved.');
    const stagedUpdate=Y.encodeStateAsUpdate(staged);
    const reader=new RetainedDocumentStore(staged,room,schema,()=>{throw new Error('Admission reader cannot allocate identities.');});let value:Node;
    try{value=projectRetainedRoomAttributes(staged,reader.read(),room,structured);}finally{reader.destroy();}
    wire.assertUnchanged(staged,stagedUpdate,verified.manifest.roots);
    let installed=false;
    return Object.freeze({document:value,identity:incoming.manifest.roomId,install(origin:unknown){
      if(installed)throw new Error('Admission candidate already installed.');
      wire.assertUnchanged(document,before,roots);
      if(document.guid!==guid||document.gc!==gc)throw new Error('Admission client options changed during validation.');
      installed=true;declare(document,mergedRoots);Y.applyUpdate(document,incoming.update,origin);
    }});
  }finally{staged.destroy();}
}
