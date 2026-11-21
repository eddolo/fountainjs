import {
  COLLABORATION_REMOTE_META, Plugin, RangeSelection, createCollaborationExtension, selectionAtPosition,
  textPointToPosition, type AnySelection, type CollaborationAdapterContext, type CollaborationLocalUpdate,
  type CollaborationPresence, type Node, type NodeJSON,
} from 'fountainjs-editor';
import type * as Y from 'yjs';
import { openGitLabWikiRoom, sameWikiDocument, type GitLabWikiProvider, type GitLabWikiWire } from './wiki_room_document';

type StockNode = {check():void; toJSON():NodeJSON};
type Cursor = {anchor:Y.RelativePosition; head:Y.RelativePosition};
export interface GitLabWikiOptions {
  provider: GitLabWikiProvider & {
    identityFor(id:number): {id:number;name:string} | null;
    awareness: {
      getStates(): Map<number,{cursor?: Cursor; fountainWikiFiles?: unknown}>;
      setLocalStateField(name:string,value:unknown):void;
      on(event:'change',fn:(change?:{added:readonly number[]})=>void):void;
      off(event:'change',fn:(change?:{added:readonly number[]})=>void):void;
    };
  };
  wire: GitLabWikiWire<StockNode> & {types: typeof Y};
  colorFor(id:number):string;
}

export class GitLabWikiSession {
  private context?: CollaborationAdapterContext;
  private binding?: Awaited<ReturnType<typeof openGitLabWikiRoom>>['binding'];
  private controller?: AbortController;
  private history?: Y.UndoManager;
  private fragment?: Y.XmlFragment;
  private cursor?: Cursor;
  private spans: {text:Y.XmlText;start:number}[] = [];
  private failure?: unknown;
  private readonly origin = {};
  private options!:GitLabWikiOptions;
  private localFiles: readonly string[] = [];
  private uploadBatch = 0;
  private peerFiles: readonly string[] = [];
  constructor(private readonly loadOptions:()=>Promise<GitLabWikiOptions>, private readonly notify:(error:unknown)=>void,
    private readonly onPeerFiles:(names:readonly string[])=>void) {}

  extension() {
    const extension = createCollaborationExtension({adapter:() => this});
    const guard = new Plugin({filterTransaction:tr => {
      if (!tr.docChanged || tr.getMeta(COLLABORATION_REMOTE_META)) return true;
      try {
        if (this.failure || !this.binding) throw this.failure ?? new Error('GitLab wiki is still joining.');
        this.binding.prepare(tr.originalDoc,tr.doc);
        return true;
      } catch (error) { this.notify(error); return false; }
    }});
    return {...extension,plugins:[guard,...(extension.plugins ?? [])]};
  }
  connect(context:CollaborationAdapterContext) { this.context = context; }

  async join(loadSeed:(signal:AbortSignal)=>Promise<Node>, readSavedSource = false) {
    if (!this.context) throw new Error('GitLab wiki editor is unavailable.');
    if (this.binding) { this.assertCurrent(this.context.editor.state.doc); return; }
    this.controller?.abort();
    const controller = this.controller = new AbortController();
    const options = await this.loadOptions();
    controller.signal.throwIfAborted();
    this.options = options;
    const {provider,wire} = options;
    // A late join must also know the saved Markdown when its link definitions live outside the shared XML.
    // Only the elected seeder passes the resulting document to the provider.
    let saved: Promise<Node> | undefined;
    const read = () => saved ??= loadSeed(controller.signal);
    const {binding} = await openGitLabWikiRoom(provider,this.context.editor.state.schema,wire,read,{signal:controller.signal});
    if (readSavedSource) binding.rememberFenceSources(await read());
    controller.signal.throwIfAborted();
    this.fragment = provider.doc.getXmlFragment('default');
    this.binding = binding;
    this.history = new wire.types.UndoManager(this.fragment,{trackedOrigins:new Set([this.origin])});
    this.fragment.observeDeep(this.changed);
    provider.awareness.on('change',this.presences);
    this.refresh();
    this.assertCurrent(this.context.editor.state.doc);
    this.publishSelection(this.context.editor.state.doc,this.context.editor.state.selection);
    this.presences();
  }

  fenceSpelling(node:Node, path:readonly number[]) { return this.binding?.fenceSpelling(node,path); }

  assertCurrent(doc:Node) {
    if (this.failure) throw this.failure;
    if (this.binding && !this.options.provider.connected) throw new Error('GITLAB_WIKI_DISCONNECTED');
    if (!this.binding || !sameWikiDocument(this.binding.read(),doc)) throw new Error('The current GitLab wiki draft is unavailable.');
  }
  private indexText() {
    const spans: typeof this.spans = [];
    const visit = (container:Y.XmlFragment, start:number):number => {
      let offset = start;
      for (const item of container.toArray()) {
        if (item instanceof this.options.wire.types.XmlText) {
          spans.push({text:item,start:offset});
          offset += item.length;
        } else if (item instanceof this.options.wire.types.XmlElement) offset = visit(item,offset+1)+1;
      }
      return offset;
    };
    if (this.fragment) visit(this.fragment,0);
    this.spans = spans;
  }
  private absolute(point:Y.RelativePosition):number | undefined {
    const {types} = this.options.wire;
    const resolved = types.createAbsolutePositionFromRelativePosition(point,this.options.provider.doc);
    const span = resolved && this.spans.find(entry => Object.is(entry.text,resolved.type));
    return span && resolved ? span.start + resolved.index : undefined;
  }
  // The old text index identifies the original positions in this Yjs transaction.
  // Applying the observed deltas keeps pending attachment targets in unrelated text alive.
  private remoteChange(events: readonly Y.YEvent<any>[], doc: Node) {
    const state = this.context!.editor.state;
    if (state.doc.eq(doc) || !events.length) return;
    if (events.length === 1 && events[0].target instanceof this.options.wire.types.XmlText) {
      const event = events[0] as Y.YTextEvent;
      const span = this.spans.find(entry => entry.text === event.target);
      if (span && event.delta.every(op => !op.attributes && (op.retain !== undefined || op.delete !== undefined || typeof op.insert === 'string'))) {
        const tr = state.createTransaction();
        let position = span.start;
        try {
          for (const op of event.delta) {
            if (op.retain !== undefined) position += op.retain;
            else if (op.delete !== undefined) tr.replaceRange(position,position + op.delete);
            else if (typeof op.insert === 'string') {
              tr.replaceRange(position,position,op.insert);
              position += op.insert.length;
            }
          }
          if (tr.doc.eq(doc)) return tr;
        } catch { /* Some text boundaries need a structural change. */ }
      }
    }
    // A nested change may update marks or several text runs in a block. Only replace
    // blocks identified by the shared fragment; a changed root needs a full refresh.
    const blocks = new Set<number>();
    if (doc.childCount !== state.doc.childCount) return;
    for (const event of events) {
      const index = event.path[0];
      if (typeof index !== 'number' || index < 0 || index >= doc.childCount) return;
      blocks.add(index);
    }
    const tr = state.createTransaction();
    for (const index of blocks) {
      if (!state.doc.child(index).eq(doc.child(index))) tr.replaceNode([index],[doc.child(index)]);
    }
    if (tr.doc.eq(doc)) return tr;
  }
  private refresh(events: readonly Y.YEvent<any>[] = []) {
    if (!this.binding || !this.context) return;
    try {
      const doc = this.binding.read();
      const change = this.remoteChange(events,doc);
      this.indexText();
      const a = this.cursor && this.absolute(this.cursor.anchor), h = this.cursor && this.absolute(this.cursor.head);
      const selection = a != null && h != null ? (a === h ? selectionAtPosition(doc,a) : new RangeSelection(doc,a,h)) : undefined;
      this.failure = undefined;
      const options = {origin:this.options.provider,selection};
      if (change) this.context.applyRemoteTransaction(change,options);
      else this.context.applyRemoteDocument(doc,options);
      if (!this.context.editor.state.doc.eq(doc)) throw new Error('The editor refused the shared GitLab wiki draft.');
      this.presences();
    } catch (error) { this.failure = error; this.notify(error); }
  }
  private changed = (events:Y.YEvent<any>[],transaction:Y.Transaction) => {
    if (transaction.origin === this.origin) this.indexText();
    else this.refresh(events);
  };
  onLocalUpdate({before,document}:CollaborationLocalUpdate) {
    try { this.binding?.apply(before,document,this.origin); }
    catch (error) { this.failure = error; this.notify(error); throw error; }
  }
  onLocalSelection(doc:Node,selection:AnySelection) { this.publishSelection(doc,selection); }
  private publishSelection(doc:Node,selection:AnySelection) {
    if (!this.binding || this.failure) return;
    const relative = (position:number) => {
      const span = this.spans.find(entry => position >= entry.start && position <= entry.start + entry.text.length);
      return span && this.options.wire.types.createRelativePositionFromTypeIndex(span.text,position-span.start);
    };
    let cursor:Cursor | undefined;
    if (selection.kind === 'range' || selection.kind === 'text') {
      try {
        const a = selection.kind === 'range' ? selection.anchor : textPointToPosition(doc,selection.path,selection.from);
        const h = selection.kind === 'range' ? selection.head : textPointToPosition(doc,selection.endPath,selection.to);
        const anchor = relative(a), head = relative(h);
        if (anchor && head) cursor = {anchor,head};
      } catch { /* Empty blocks have no shared text position. */ }
    }
    const same = this.options.wire.types.compareRelativePositions;
    if (this.cursor && cursor && same(this.cursor.anchor,cursor.anchor) && same(this.cursor.head,cursor.head)) return;
    if (!this.cursor && !cursor) return;
    this.cursor = cursor;
    this.options.provider.awareness.setLocalStateField('cursor',cursor ?? null);
  }
  publishFiles(names: readonly string[]) {
    if (!this.binding || (names.length === this.localFiles.length && names.every((name,i) => name === this.localFiles[i]))) return;
    const doc = this.options.provider.doc;
    // Only the batch number is replayed to late joiners. Names and progress stay in live presence.
    if (Boolean(names.length) !== Boolean(this.localFiles.length)) {
      const pending = doc.getMap<number>('fountainWikiPendingUploads');
      const client = String(doc.clientID);
      if (names.length) pending.set(client,++this.uploadBatch);
      else pending.delete(client);
    }
    this.localFiles = names;
    // The original bytes and the uploader's progress belong to that browser.
    this.options.provider.awareness.setLocalStateField('fountainWikiFiles',names.length ? names : null);
  }
  private presences = (change?:{added:readonly number[]}) => {
    if (!this.binding || !this.context) return;
    const {provider,colorFor} = this.options;
    // GitLab replays room edits to late joiners, but only broadcasts presence to current subscribers.
    if (this.localFiles.length && change?.added.some(id => id !== provider.doc.clientID && provider.identityFor(id)))
      provider.awareness.setLocalStateField('fountainWikiFiles',this.localFiles);
    const users:CollaborationPresence[] = [];
    const files:string[] = [];
    for (const [client,state] of provider.awareness.getStates()) {
      if (client === provider.doc.clientID) continue;
      const peer = provider.identityFor(client);
      if (!peer) continue;
      if (Array.isArray(state.fountainWikiFiles) && state.fountainWikiFiles.length <= 1000) {
        for (const name of state.fountainWikiFiles)
          if (typeof name === 'string' && name.length > 0 && name.length <= 1024) files.push(name);
      }
      let anchor, head;
      try {
        if (state.cursor) { anchor = this.absolute(state.cursor.anchor); head = this.absolute(state.cursor.head); }
      } catch { /* A peer with an unresolvable cursor still appears in the presence list. */ }
      users.push({clientId:String(client),user:{id:String(peer.id),name:peer.name,color:colorFor(peer.id)},
        selection:anchor != null && head != null ? {anchor,head} : undefined});
    }
    if (files.length !== this.peerFiles.length || files.some((name,i) => name !== this.peerFiles[i])) {
      this.peerFiles = files;
      this.onPeerFiles(files);
    }
    this.context.setPresences(users);
  };
  canUndo() { return !this.failure && Boolean(this.history?.canUndo()); }
  canRedo() { return !this.failure && Boolean(this.history?.canRedo()); }
  undo() { return this.canUndo() && Boolean(this.history?.undo()); }
  redo() { return this.canRedo() && Boolean(this.history?.redo()); }
  stopCapturing() { this.history?.stopCapturing(); }
  disconnect() {
    this.controller?.abort();
    if (this.binding) {
      this.options.provider.awareness.off('change',this.presences);
      this.fragment?.unobserveDeep(this.changed);
      this.publishFiles([]);
      if (this.cursor) this.options.provider.awareness.setLocalStateField('cursor',null);
    }
    if (this.peerFiles.length) { this.peerFiles = []; this.onPeerFiles([]); }
    this.history?.destroy();
    this.binding = undefined; this.fragment = undefined; this.context = undefined;
    this.history = undefined; this.cursor = undefined; this.spans = []; this.failure = undefined;
  }
}
