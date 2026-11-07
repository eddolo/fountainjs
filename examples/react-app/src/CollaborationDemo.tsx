import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import {
  CoreExtension, canRedoCollaboration, canUndoCollaboration, composeExtensions, createEditor,
  defineExtension, getCollaborationState, replaceCollaborationAdapter, selectText, toggleQuote,
} from 'fountainjs-editor';
import { InMemoryCommentsStore, createCommentThread, createCommentsExtension, getCommentsState } from 'fountainjs-editor/comments';
import {
  createRetainedYjsCollaborationExtension, RetainedYjsCollaborationAdapter,
} from 'fountainjs-editor/experimental/yjs-retained';
import { FountainComposer, useFountain, useFountainState } from 'fountainjs-editor/react';
import { FountainComments } from 'fountainjs-editor/react/comments';
import { defineStructuredAttribute, insertStructuredAttributeItems, setStructuredAttribute } from 'fountainjs-editor/structured-attributes';
import type { YjsAwareness } from 'fountainjs-editor/yjs';

class DemoAwarenessHub {
  readonly states = new Map<number, Record<string, unknown>>();
  readonly clients = new Map<number, DemoAwareness>();
  private paused = false;
  private readonly empty = new Map<number, Record<string, unknown>>();

  visibleStates() { return this.paused ? this.empty : this.states; }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.emit();
  }

  create(clientID: number): DemoAwareness {
    const awareness = new DemoAwareness(this, clientID);
    this.clients.set(clientID, awareness);
    this.states.set(clientID, {});
    return awareness;
  }

  emit(): void { this.clients.forEach((client) => client.emit()); }
}

class DemoAwareness implements YjsAwareness {
  private readonly listeners = new Set<(...args: any[]) => void>();
  constructor(private readonly hub: DemoAwarenessHub, readonly clientID: number) {}
  getLocalState(): Record<string, unknown> | null { return this.hub.states.get(this.clientID) ?? null; }
  getStates(): Map<number, Record<string, unknown>> { return this.hub.visibleStates(); }
  setLocalStateField(field: string, value: unknown): void {
    const next = { ...(this.getLocalState() ?? {}) };
    if (value === null) delete next[field];
    else next[field] = value;
    this.hub.states.set(this.clientID, next);
    this.hub.emit();
  }
  on(_event: 'change' | 'update', listener: (...args: any[]) => void): void { this.listeners.add(listener); }
  off(_event: 'change' | 'update', listener: (...args: any[]) => void): void { this.listeners.delete(listener); }
  emit(): void { this.listeners.forEach((listener) => listener()); }
}

const collaborationSettingsExtension = defineExtension({
  name: 'collaboration-settings-demo',
  nodes: {
    collaboration_settings: {
      group: 'block',
      atom: true,
      attrs: {
        nodeId: { validate: (value) => typeof value === 'string' && value.length > 0 },
        config: { validate: (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value)) },
      },
      toDOM: (node) => {
        const config = node.attrs.config as { title?: string; layout?: { columns?: number; compact?: boolean } };
        return ['aside', { 'data-collaboration-settings': '' },
          ['strong', {}, config.title ?? 'Shared settings'],
          ['span', {}, `${config.layout?.columns ?? 1} columns · ${config.layout?.compact ? 'compact' : 'comfortable'}`],
        ];
      },
    },
  },
});

const collaborationSettingsDefinition = defineStructuredAttribute({
  nodeType: 'collaboration_settings',
  attribute: 'config',
  root: 'object',
});

const collaborationStructuredAttributes = Object.freeze({
  definitions: Object.freeze([collaborationSettingsDefinition]),
});

const collaborationSettingsNode = {
  type: 'collaboration_settings',
  attrs: {
    nodeId: 'shared-launch-settings',
    config: {
      title: 'Shared launch settings',
      layout: { columns: 2, compact: false },
      filters: [{ field: 'status', value: 'open' }],
    },
  },
} as const;

type DemoRoom = 'launch' | 'planning';
const ada = { id: 'ada', name: 'Ada', color: '#6d4aff' };
const grace = { id: 'grace', name: 'Grace', color: '#d23877' };

function roomContent(room: DemoRoom) {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [
        { type: 'text', text: room === 'launch' ? 'Shared launch note' : 'Shared planning agenda' },
      ] },
      { type: 'paragraph', content: [
        { type: 'text', text: room === 'launch'
          ? 'Edit either side. Text, blocks, selections, and undo remain author-aware.'
          : 'Edit either side. Plan the milestones here. Each room keeps its own collaborative document when you switch away.' },
      ] },
      room === 'launch' ? collaborationSettingsNode : {
        ...collaborationSettingsNode,
        attrs: {
          nodeId: 'shared-planning-settings',
          config: { ...collaborationSettingsNode.attrs.config, title: 'Shared planning settings' },
        },
      },
    ],
  } as const;
}

function createSession(room: DemoRoom) {
  const leftDocument = new Y.Doc();
  const rightDocument = new Y.Doc();
  const awareness = new DemoAwarenessHub();
  const content = roomContent(room);
  const seed = composeExtensions([CoreExtension, collaborationSettingsExtension, createRetainedYjsCollaborationExtension({
    document: leftDocument, user: ada, structuredAttributes: collaborationStructuredAttributes,
  })]);
  const editor = createEditor({ schema: seed.schema, plugins: seed.plugins, content });
  try {
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument));
  } finally {
    editor.destroy();
  }

  const sendLeft = (update: Uint8Array, origin: unknown) => {
    if (origin !== rightDocument) Y.applyUpdate(rightDocument, update, leftDocument);
  };
  const sendRight = (update: Uint8Array, origin: unknown) => {
    if (origin !== leftDocument) Y.applyUpdate(leftDocument, update, rightDocument);
  };
  let connected = false;
  const connectTransport = () => {
    if (connected) return;
    connected = true;
    leftDocument.on('update', sendLeft);
    rightDocument.on('update', sendRight);
  };
  const disconnectTransport = () => {
    if (!connected) return;
    connected = false;
    leftDocument.off('update', sendLeft);
    rightDocument.off('update', sendRight);
  };
  const resume = () => {
    const left = Y.encodeStateAsUpdate(leftDocument, Y.encodeStateVector(rightDocument));
    const right = Y.encodeStateAsUpdate(rightDocument, Y.encodeStateVector(leftDocument));
    connectTransport();
    Y.applyUpdate(rightDocument, left, leftDocument);
    Y.applyUpdate(leftDocument, right, rightDocument);
    awareness.setPaused(false);
  };

  return { leftDocument, rightDocument, awareness, content, connectTransport, disconnectTransport, resume };
}

function authorOptions(session: ReturnType<typeof createSession>, user: typeof ada | typeof grace) {
  const document = user === ada ? session.leftDocument : session.rightDocument;
  return { document, user, awareness: session.awareness.create(document.clientID), structuredAttributes: collaborationStructuredAttributes };
}

export default function CollaborationDemo() {
  const room = useMemo(() => {
    const sessions = { launch: createSession('launch'), planning: createSession('planning') };
    const comments = new InMemoryCommentsStore();
    const kit = (author: typeof ada | typeof grace) => composeExtensions([
      CoreExtension,
      collaborationSettingsExtension,
      createRetainedYjsCollaborationExtension(authorOptions(sessions.launch, author)),
      createCommentsExtension({ adapter: () => comments.createAdapter(), user: { id: author.id, name: author.name } }),
    ]);
    return { sessions, leftKit: kit(ada), rightKit: kit(grace) };
  }, []);
  const [activeRoom, setActiveRoom] = useState<DemoRoom>('launch');
  const [paused, setPaused] = useState(false);
  const left = useFountain({ schema: room.leftKit.schema, plugins: room.leftKit.plugins, content: room.sessions.launch.content });
  const right = useFountain({ schema: room.rightKit.schema, plugins: room.rightKit.plugins, content: room.sessions.launch.content });
  const leftState = useFountainState(left);
  const rightState = useFountainState(right);

  useEffect(() => {
    room.sessions.launch.connectTransport();
    room.sessions.planning.connectTransport();
    return () => {
      room.sessions.launch.disconnectTransport();
      room.sessions.planning.disconnectTransport();
    };
  }, [room]);

  const switchRoom = () => {
    const nextRoom = activeRoom === 'launch' ? 'planning' : 'launch';
    const session = room.sessions[nextRoom];
    const leftOpened = replaceCollaborationAdapter(left, new RetainedYjsCollaborationAdapter(authorOptions(session, ada)));
    const rightOpened = replaceCollaborationAdapter(right, new RetainedYjsCollaborationAdapter(authorOptions(session, grace)));
    if (leftOpened && rightOpened) setActiveRoom(nextRoom);
  };

  const toggleSync = () => {
    const session = room.sessions[activeRoom];
    if (paused) session.resume();
    else {
      session.disconnectTransport();
      session.awareness.setPaused(true);
    }
    setPaused(!paused);
  };

  const seededComment = useRef(false);
  useEffect(() => {
    if (seededComment.current) return;
    seededComment.current = true;
    selectText(right, [1, 0], 0, 16);
    void createCommentThread(right, {
      threadId: 'demo-thread-review',
      commentId: 'demo-comment-grace',
      content: 'Could we make the provider boundary even clearer?',
    });
  }, [right]);

  const leftCollaboration = getCollaborationState(left);
  const rightCollaboration = getCollaborationState(right);
  const leftComments = getCommentsState(left);
  const rightComments = getCommentsState(right);
  const leftSettingsPath = leftState?.doc.content.findIndex((node) => node.type.name === 'collaboration_settings') ?? -1;
  const rightSettingsPath = rightState?.doc.content.findIndex((node) => node.type.name === 'collaboration_settings') ?? -1;
  const leftSettings = leftSettingsPath >= 0
    ? leftState?.doc.child(leftSettingsPath).attrs.config as { layout?: { columns?: number; compact?: boolean }; filters?: unknown[] }
    : undefined;
  const rightSettings = rightSettingsPath >= 0
    ? rightState?.doc.child(rightSettingsPath).attrs.config as { layout?: { columns?: number; compact?: boolean }; filters?: unknown[] }
    : undefined;
  return (
    <section className="collaboration-demo" id="collaboration">
      <div className="collaboration-demo__intro">
        <div><span>REAL-TIME COLLABORATION</span><h2>Two editors. <span className="keep-together">One convergent</span> document.</h2></div>
        <div>
          <p>This preview runs the experimental retained Yjs adapter with two in-memory peers. Each room has its own document. Type or select on either side and watch the other follow.</p>
          <p><strong>No FountainJS server or account is required.</strong> Transport, authentication, room access, and persistence stay replaceable.</p>
        </div>
      </div>
      <div className="collaboration-demo__note">
        <span><b>Try it:</b> edit both documents, select a phrase to reveal the peer cursor, then use each author’s undo.</span>
        <span className="collaboration-demo__room"><strong>Room: {activeRoom === 'launch' ? 'Launch' : 'Planning'}</strong><button onClick={switchRoom} disabled={paused}>Switch both editors to {activeRoom === 'launch' ? 'Planning' : 'Launch'} room</button><button onClick={toggleSync}>{paused ? 'Resume document sync' : 'Pause document sync'}</button></span>
        <small aria-live="polite">{paused
          ? 'Document sync and peer cursors are paused. You can edit either copy. Resume to merge before switching rooms.'
          : 'Try an offline merge. Pause, type in a paragraph as Ada, then put the same paragraph in a quote as Grace. Resume to see both changes.'}</small>
      </div>
      <div className="collaboration-demo__editors">
        <article data-collaboration-editor="ada">
          <header><span><i style={{ background: '#6d4aff' }} />Ada</span><code>{paused ? 'sync paused' : leftCollaboration?.status ?? 'connecting'}</code></header>
          <FountainComposer editor={left} showToolbar={false} ariaLabel="Ada collaborative editor" placeholder="Ada writes here…" />
          <div className="collaboration-demo__editor-footer">
            <span>{leftState?.doc.textContent.length ?? 0} characters · {leftCollaboration?.presences.length ?? 0} peer · {leftComments?.threads.length ?? 0} threads</span>
            <div><button disabled={!canUndoCollaboration(left)} onClick={() => room.leftKit.commands.undoCollaboration?.(left)}>Undo Ada</button><button disabled={!canRedoCollaboration(left)} onClick={() => room.leftKit.commands.redoCollaboration?.(left)}>Redo</button></div>
          </div>
        </article>
        <article data-collaboration-editor="grace">
          <header><span><i style={{ background: '#d23877' }} />Grace</span><code>{paused ? 'sync paused' : rightCollaboration?.status ?? 'connecting'}</code></header>
          <FountainComposer editor={right} showToolbar={false} ariaLabel="Grace collaborative editor" placeholder="Grace writes here…" />
          <div className="collaboration-demo__editor-footer">
            <span>{rightState?.doc.textContent.length ?? 0} characters · {rightCollaboration?.presences.length ?? 0} peer · {rightComments?.threads.length ?? 0} threads</span>
            <div><button onMouseDown={(event) => event.preventDefault()} onClick={() => toggleQuote(right)}>Toggle quote</button><button disabled={!canUndoCollaboration(right)} onClick={() => room.rightKit.commands.undoCollaboration?.(right)}>Undo Grace</button><button disabled={!canRedoCollaboration(right)} onClick={() => room.rightKit.commands.redoCollaboration?.(right)}>Redo</button></div>
          </div>
        </article>
      </div>
      <div className="collaboration-demo__structured" role="region" aria-label="Granular collaborative settings">
        <div>
          <span>NESTED CRDT ATTRIBUTES</span>
          <h3>Change separate fields. Keep both changes.</h3>
          <p>The visible card is ordinary Fountain JSON. Its selected <code>config</code> attribute is mirrored into nested Y.Map and Y.Array values, so peers editing different settings do not overwrite the whole object.</p>
        </div>
        <article>
          <strong>Ada’s controls</strong>
          <span>{leftSettings?.layout?.columns ?? 0} columns · {leftSettings?.filters?.length ?? 0} filters</span>
          <div>
            <button onClick={() => leftSettingsPath >= 0 && setStructuredAttribute(left, [leftSettingsPath], collaborationSettingsDefinition, ['layout', 'columns'], Math.min(6, (leftSettings?.layout?.columns ?? 1) + 1))}>Add a column</button>
            <button onClick={() => leftSettingsPath >= 0 && insertStructuredAttributeItems(left, [leftSettingsPath], collaborationSettingsDefinition, ['filters'], leftSettings?.filters?.length ?? 0, [{ field: 'owner', value: 'ada' }])}>Add owner filter</button>
          </div>
        </article>
        <article>
          <strong>Grace’s controls</strong>
          <span>{rightSettings?.layout?.compact ? 'Compact' : 'Comfortable'} · {rightSettings?.filters?.length ?? 0} filters</span>
          <div>
            <button onClick={() => rightSettingsPath >= 0 && setStructuredAttribute(right, [rightSettingsPath], collaborationSettingsDefinition, ['layout', 'compact'], !rightSettings?.layout?.compact)}>Toggle density</button>
            <button onClick={() => rightSettingsPath >= 0 && insertStructuredAttributeItems(right, [rightSettingsPath], collaborationSettingsDefinition, ['filters'], rightSettings?.filters?.length ?? 0, [{ field: 'priority', value: 'high' }])}>Add priority filter</button>
          </div>
        </article>
      </div>
      <div className="collaboration-demo__comments">
        <div>
          <span>THREADED COMMENTS</span>
          <h3>Discussion is portable too.</h3>
          <p>The document, comment store, and interface are separate modules. This demo shares the same thread across both editors; select content to add an inline or block thread, reply, react, resolve, archive, or reattach an orphan.</p>
          <p>The included in-memory adapter powers this page. Production apps replace it with REST, a database, a CRDT, or another authenticated store—and enforce permissions there.</p>
        </div>
        <FountainComments editor={left} title="Shared review" onError={(error) => console.error(error)} />
      </div>
      <div className="collaboration-demo__boundary">
        <code>fountainjs-editor/experimental/yjs-retained</code>
        <span>CRDT document + nested attributes + relative positions + local-origin undo</span>
        <code>fountainjs-editor/comments</code>
        <span>Mapped anchors + storage operations + permissions</span>
        <span>Your provider</span>
        <span>Your auth and storage</span>
      </div>
    </section>
  );
}
