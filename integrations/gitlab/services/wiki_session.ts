import {
  COLLABORATION_REMOTE_META, Plugin, RangeSelection, createCollaborationExtension, selectionAtPosition,
  textPointToPosition, type AnySelection, type CollaborationAdapterContext, type CollaborationLocalUpdate,
  type CollaborationPresence, type Node, type NodeJSON,
} from 'fountainjs-editor';
import type * as Y from 'yjs';
import { openGitLabWikiRoom, type GitLabWikiProvider, type GitLabWikiWire } from './wiki_room_document';

type StockNode = {check():void; toJSON():NodeJSON};
type Cursor = {anchor:Y.RelativePosition; head:Y.RelativePosition};
export interface GitLabWikiOptions {
  provider: GitLabWikiProvider & {
    identityFor(id:number): {id:number;name:string} | null;
    awareness: {
      getStates(): Map<number,{cursor?: Cursor}>;
      setLocalStateField(name:string,value:unknown):void;
      on(event:'change',fn:()=>void):void;
      off(event:'change',fn:()=>void):void;
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
  constructor(private readonly loadOptions:()=>Promise<GitLabWikiOptions>, private readonly notify:(error:unknown)=>void) {}

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

  async join(loadSeed:(signal:AbortSignal)=>Promise<Node>) {
    if (!this.context) throw new Error('GitLab wiki editor is unavailable.');
    if (this.binding) { this.assertCurrent(this.context.editor.state.doc); return; }
    this.controller?.abort();
    const controller = this.controller = new AbortController();
    const options = await this.loadOptions();
    controller.signal.throwIfAborted();
    this.options = options;
    const {provider,wire} = options;
    const {binding} = await openGitLabWikiRoom(provider,this.context.editor.state.schema,wire,
      () => loadSeed(controller.signal),{signal:controller.signal});
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

  assertCurrent(doc:Node) {
    if (this.failure) throw this.failure;
    if (this.binding && !this.options.provider.connected) throw new Error('GITLAB_WIKI_DISCONNECTED');
    if (!this.binding || !this.binding.read().eq(doc)) throw new Error('The current GitLab wiki draft is unavailable.');
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
  private refresh() {
    if (!this.binding || !this.context) return;
    try {
      const doc = this.binding.read();
      this.indexText();
      const a = this.cursor && this.absolute(this.cursor.anchor), h = this.cursor && this.absolute(this.cursor.head);
      const selection = a != null && h != null ? (a === h ? selectionAtPosition(doc,a) : new RangeSelection(doc,a,h)) : undefined;
      this.failure = undefined;
      this.context.applyRemoteDocument(doc,{origin:this.options.provider,selection});
      if (!this.context.editor.state.doc.eq(doc)) throw new Error('The editor refused the shared GitLab wiki draft.');
      this.presences();
    } catch (error) { this.failure = error; this.notify(error); }
  }
  private changed = (_events:unknown,transaction:Y.Transaction) => {
    if (transaction.origin === this.origin) this.indexText();
    else this.refresh();
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
  private presences = () => {
    if (!this.binding || !this.context) return;
    const {provider,colorFor} = this.options;
    const users:CollaborationPresence[] = [];
    for (const [client,state] of provider.awareness.getStates()) {
      if (client === provider.doc.clientID) continue;
      const peer = provider.identityFor(client);
      if (!peer) continue;
      let anchor, head;
      try {
        if (state.cursor) { anchor = this.absolute(state.cursor.anchor); head = this.absolute(state.cursor.head); }
      } catch { /* A peer with an unresolvable cursor still appears in the presence list. */ }
      users.push({clientId:String(client),user:{id:String(peer.id),name:peer.name,color:colorFor(peer.id)},
        selection:anchor != null && head != null ? {anchor,head} : undefined});
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
      if (this.cursor) this.options.provider.awareness.setLocalStateField('cursor',null);
    }
    this.history?.destroy();
    this.binding = undefined; this.fragment = undefined; this.context = undefined;
    this.history = undefined; this.cursor = undefined; this.spans = []; this.failure = undefined;
  }
}
