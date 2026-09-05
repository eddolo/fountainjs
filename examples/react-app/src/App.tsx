import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import {
  AIController,
  BubbleMenuExtension,
  ClipboardHistoryExtension,
  CoreExtension,
  HTMLExporter,
  JSONExporter,
  MarkdownExporter,
  MediaExtension,
  FloatingMenuExtension,
  SyntaxHighlightExtension,
  TableEditingExtension,
  composeExtensions,
  createAIAdapter,
  defineExtension,
  historyPlugin,
  canRedoCollaboration,
  canUndoCollaboration,
  getCollaborationState,
  isMarkActive,
  insertNode as demoInsertNode,
  markdownShortcutsPlugin,
  replaceCollaborationAdapter,
  selectText,
  setBlockType,
  toggleMark,
  type AssetUploadHandler,
  type FountainMenuService,
} from 'fountainjs-editor';
import {
  YjsCollaborationAdapter,
  createYjsCollaborationExtension,
  type YjsAwareness,
} from 'fountainjs-editor/yjs';
import {
  defineStructuredAttribute,
  insertStructuredAttributeItems,
  setStructuredAttribute,
} from 'fountainjs-editor/structured-attributes';
import {
  InMemoryCommentsStore,
  createCommentThread,
  createCommentsExtension,
  getCommentsState,
} from 'fountainjs-editor/comments';
import {
  EmojiExtension,
  TypographyExtension,
  createCharacterCountExtension,
  createMentionExtension,
  createSlashCommandExtension,
  type CharacterCountService,
  type EmojiItem,
  type EmojiService,
  type MentionItem,
  type MentionService,
  type SlashCommandService,
} from 'fountainjs-editor/document-utilities';
import {
  FountainAIReview,
  FountainBubbleMenu,
  FountainCharacterCount,
  FountainComposer,
  FountainFloatingMenu,
  FountainSlashCommandMenu,
  FountainSuggestionMenu,
  Navigator,
  useFountain,
  useFountainState,
  type FountainEditorHandle,
} from 'fountainjs-editor/react';
import { FountainComments } from 'fountainjs-editor/react/comments';
import {
  addTrackedNodeAttributeChange,
  addTrackedReplacement,
  createTrackedChangesExtension,
  dispatchTrackedTransaction,
  setTrackedChangesUser,
} from 'fountainjs-editor/tracked-changes';
import { FountainTrackedChanges } from 'fountainjs-editor/react/tracked-changes';
import { InMemoryVersionProvider, VersionController } from 'fountainjs-editor/versions';
import { FountainVersions } from 'fountainjs-editor/react/versions';
import { DetailsExtension, insertDetails } from 'fountainjs-editor/details';
import { RubyExtension, setRuby } from 'fountainjs-editor/ruby';
import { SitePageLink } from './SitePageLink';
import 'fountainjs-editor/styles.css';

const initialContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Try FountainJS in this document.' }] },
    { type: 'paragraph', content: [
      { type: 'text', text: 'Select text, type across paragraphs, and use the toolbar. This is the ' },
      { type: 'text', text: 'real npm package', marks: [{ type: 'strong' }] },
      { type: 'text', text: ', not a picture or a scripted mock-up.' },
    ] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What you can test here' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Insert lists, tables, images, media, callouts, and collapsible sections. Then switch between Markdown, HTML, and JSON output on the right.' }] },
    { type: 'paragraph', content: [
      { type: 'text', text: 'Ruby pronunciation is document data: ' },
      { type: 'ruby', attrs: { rt: 'とうきょう' }, content: [{ type: 'text', text: '東京', marks: [{ type: 'strong' }] }] },
      { type: 'text', text: '. Click or focus the reading above the word to edit it.' },
    ] },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The editor stores your document as portable JSON on the backend you choose.' }] }] },
    { type: 'details', attrs: { open: false }, content: [
      { type: 'details_summary', content: [{ type: 'text', text: 'Open this collapsible section' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Its summary and body are editable document content, not a pasted widget.' }] },
    ] },
    { type: 'code_block', attrs: { language: 'typescript', lineNumbers: true }, content: [{ type: 'text', text: "const kit = composeExtensions([\n  CoreExtension, history, callout, myIntegration\n]);\nconst editor = createEditor({ schema: kit.schema, plugins: kit.plugins });" }] },
  ],
} as const;

const demoAdapter = createAIAdapter(async (request, { signal }) => {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const source = request.input.trim();
  const replacement = request.action === 'shorten'
    ? source.split(/\s+/).slice(0, Math.max(4, Math.ceil(source.split(/\s+/).length * 0.6))).join(' ').replace(/[,:;]$/, '') + '.'
    : request.action === 'expand'
      ? `${source.replace(/[.!?]$/, '')}—with clearer intent, stronger structure, and no loss of the author’s voice.`
      : request.action === 'fix-grammar'
        ? `${source.charAt(0).toUpperCase()}${source.slice(1).replace(/\s+/g, ' ').replace(/[.!?]?$/, '.')}`
        : source === 'Try FountainJS in this document.'
          ? 'Edit this document to test FountainJS directly in your browser.'
          : `Make it unmistakably clear: ${source.charAt(0).toLowerCase()}${source.slice(1)}`;
  return {
    replacement,
    explanation: 'This local demo adapter returns a deterministic proposal. A production app supplies its own model or MCP adapter.',
    model: 'local-demo (no network)',
  };
});

const demoAssetUpload: AssetUploadHandler = async (file, { kind, signal, reportProgress }) => {
  reportProgress(.25);
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, 260);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('Upload cancelled', 'AbortError'));
    }, { once: true });
  });
  reportProgress(1);
  if (kind === 'audio') return {
    src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3',
    title: file.name.replace(/\.[^.]+$/, ''),
    caption: 'Uploaded through the local demo adapter.',
  };
  if (kind === 'video') return {
    src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    title: file.name.replace(/\.[^.]+$/, ''),
    caption: 'Uploaded through the local demo adapter.',
  };
  return {
    src: './demo-media.svg',
    name: file.name,
    description: 'Uploaded through the local demo adapter.',
  };
};

const calloutExtension = defineExtension({
  name: 'callout',
  nodes: {
    callout: {
      group: 'block',
      content: 'inline*',
      attrs: { tone: { default: 'idea' } },
      parseDOM: [{
        tag: 'aside[data-fountain-callout]',
        getAttrs: (element) => ({ tone: element.dataset.tone ?? 'idea' }),
      }],
      toDOM: (node) => ['aside', {
        className: 'demo-callout',
        'data-fountain-callout': '',
        'data-tone': node.attrs.tone,
      }, 0],
    },
  },
  commands: {
    insertCallout: (editor, text = 'A custom node supplied by the demo extension.') => {
      const node = editor.state.schema.node('callout', { tone: 'idea' }, [editor.state.schema.text(text)]);
      return demoInsertNode(editor, node);
    },
  },
});

const mentionExtension = createMentionExtension({
  suggestions: [
    {
      char: '@',
      kind: 'person',
      items: ({ query }) => [
        { id: 'ada', label: 'Ada Lovelace', kind: 'person' },
        { id: 'grace', label: 'Grace Hopper', kind: 'person' },
        { id: 'margaret', label: 'Margaret Hamilton', kind: 'person' },
      ].filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
    },
    {
      char: '#',
      kind: 'topic',
      items: ({ query }) => [
        { id: 'editor-platform', label: 'editor-platform', kind: 'topic' },
        { id: 'release', label: 'release', kind: 'topic' },
      ].filter((item) => item.label.includes(query.toLowerCase())),
    },
  ],
});

const characterCountExtension = createCharacterCountExtension({ limit: 5_000 });
const slashCommandExtension = createSlashCommandExtension({
  items: [{
    id: 'callout',
    label: 'Callout',
    description: 'Insert the custom block supplied by this demo extension.',
    aliases: ['notice', 'aside'],
    icon: '✦',
    group: 'Product',
    run: ({ editor }) => calloutExtension.commands?.insertCallout?.(editor) ?? false,
  }],
});

const demoKit = composeExtensions([
  CoreExtension,
  MediaExtension,
  mentionExtension,
  EmojiExtension,
  characterCountExtension,
  TypographyExtension,
  slashCommandExtension,
  BubbleMenuExtension,
  FloatingMenuExtension,
  defineExtension({ name: 'history', plugins: [historyPlugin] }),
  defineExtension({ name: 'markdown-shortcuts', plugins: [markdownShortcutsPlugin] }),
  SyntaxHighlightExtension,
  TableEditingExtension,
  ClipboardHistoryExtension,
  DetailsExtension,
  RubyExtension,
  calloutExtension,
  defineExtension({ name: 'ai-review', services: { adapter: demoAdapter } }),
]);

type ExportFormat = 'markdown' | 'html' | 'json';

const competitors = [
  {
    name: 'ProseMirror + Tiptap',
    maturity: 'Battle-tested ProseMirror engine plus Tiptap’s mature product and developer layer.',
    architecture: 'Low-level schema, transactions, plugins, and DOM view with extensions, framework bindings, UI, and optional services above them.',
    fit: 'Choose the combined stack for its production history, ecosystem depth, hosted services, and commercial support.',
    href: 'https://github.com/eddolo/fountainjs/blob/master/docs/PROSEMIRROR_COMPARISON.md',
  },
  {
    name: 'Plate',
    maturity: 'Powerful React/Slate framework with composable plugins and polished examples.',
    architecture: 'React-first components and composable Slate plugins.',
    fit: 'Choose it for a React-first stack and a broad ready-made feature set.',
    href: 'https://platejs.org/docs',
  },
  {
    name: 'BlockNote',
    maturity: 'Excellent out-of-the-box React block editor experience.',
    architecture: 'React-first block editor; advanced usage can mount the editor without React.',
    fit: 'Choose it when a Notion-like block UI is the priority.',
    href: 'https://www.blocknotejs.org/docs',
  },
  {
    name: 'FountainJS',
    maturity: 'Early-beta TypeScript editor library with working DOM, Web Component, and React interfaces.',
    architecture: 'Ready-made editing, review, collaboration, and versioning modules with one public extension API.',
    fit: 'Choose it when you want the capabilities in one public MIT package and control over framework, storage, and services.',
    href: 'https://github.com/eddolo/fountainjs',
  },
] as const;

class DemoAwarenessHub {
  readonly states = new Map<number, Record<string, unknown>>();
  readonly clients = new Map<number, DemoAwareness>();

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
  getStates(): Map<number, Record<string, unknown>> { return this.hub.states; }
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

function CollaborationDemo() {
  const room = useMemo(() => {
    const createSession = () => {
      const leftDocument = new Y.Doc();
      const rightDocument = new Y.Doc();
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
      const destroyTransport = () => {
        if (!connected) return;
        connected = false;
        leftDocument.off('update', sendLeft);
        rightDocument.off('update', sendRight);
      };
      connectTransport();
      return {
        leftDocument,
        rightDocument,
        awareness: new DemoAwarenessHub(),
        connectTransport,
        destroyTransport,
      };
    };
    const sessions = {
      launch: createSession(),
      planning: createSession(),
    } as const;
    const initial = sessions.launch;
    const comments = new InMemoryCommentsStore();
    const leftExtension = createYjsCollaborationExtension({
      document: initial.leftDocument,
      awareness: initial.awareness.create(initial.leftDocument.clientID),
      user: { id: 'ada', name: 'Ada', color: '#6d4aff' },
      structuredAttributes: collaborationStructuredAttributes,
    });
    const rightExtension = createYjsCollaborationExtension({
      document: initial.rightDocument,
      awareness: initial.awareness.create(initial.rightDocument.clientID),
      user: { id: 'grace', name: 'Grace', color: '#d23877' },
      structuredAttributes: collaborationStructuredAttributes,
    });
    const leftComments = createCommentsExtension({
      adapter: () => comments.createAdapter(),
      user: { id: 'ada', name: 'Ada' },
    });
    const rightComments = createCommentsExtension({
      adapter: () => comments.createAdapter(),
      user: { id: 'grace', name: 'Grace' },
    });
    return {
      sessions,
      leftKit: composeExtensions([CoreExtension, collaborationSettingsExtension, leftExtension, leftComments]),
      rightKit: composeExtensions([CoreExtension, collaborationSettingsExtension, rightExtension, rightComments]),
    };
  }, []);
  const [activeRoom, setActiveRoom] = useState<keyof typeof room.sessions>('launch');
  const collaborativeContent = useMemo(() => ({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Shared launch note' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Edit either side. Text, blocks, selections, and undo remain author-aware.' }] },
      collaborationSettingsNode,
    ],
  } as const), []);
  const initializedRooms = useRef(new Set<keyof typeof room.sessions>(['launch']));
  const left = useFountain({
    schema: room.leftKit.schema,
    plugins: room.leftKit.plugins,
    content: collaborativeContent,
  });
  const right = useFountain({
    schema: room.rightKit.schema,
    plugins: room.rightKit.plugins,
    content: collaborativeContent,
  });
  const leftState = useFountainState(left);
  const rightState = useFountainState(right);

  useEffect(() => {
    room.sessions.launch.connectTransport();
    room.sessions.planning.connectTransport();
    return () => {
      room.sessions.launch.destroyTransport();
      room.sessions.planning.destroyTransport();
    };
  }, [room]);

  const switchRoom = () => {
    const nextRoom = activeRoom === 'launch' ? 'planning' : 'launch';
    const session = room.sessions[nextRoom];
    replaceCollaborationAdapter(left, new YjsCollaborationAdapter({
      document: session.leftDocument,
      awareness: session.awareness.create(session.leftDocument.clientID),
      user: { id: 'ada', name: 'Ada', color: '#6d4aff' },
      structuredAttributes: collaborationStructuredAttributes,
    }));
    replaceCollaborationAdapter(right, new YjsCollaborationAdapter({
      document: session.rightDocument,
      awareness: session.awareness.create(session.rightDocument.clientID),
      user: { id: 'grace', name: 'Grace', color: '#d23877' },
      structuredAttributes: collaborationStructuredAttributes,
    }));
    if (!initializedRooms.current.has(nextRoom)) {
      const heading = left.state.doc.childCount > 0 ? left.state.doc.child(0).textContent : '';
      const paragraph = left.state.doc.childCount > 1 ? left.state.doc.child(1).textContent : '';
      const keepsDemoShape = left.state.doc.childCount >= 2 && heading.length > 0 && paragraph.startsWith('Edit either side.');
      if (nextRoom === 'planning' && keepsDemoShape) {
        left.dispatch(left.state.createTransaction()
          .replaceText([0, 0], 0, heading.length, 'Shared planning agenda')
          .replaceText([1, 0], 'Edit either side.'.length, paragraph.length, ' Plan the milestones here. Each room keeps its own collaborative document when you switch away.'));
      } else {
        const content = nextRoom === 'planning'
          ? {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Shared planning agenda' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Edit either side. Plan the milestones here. Each room keeps its own collaborative document when you switch away.' }] },
              collaborationSettingsNode,
            ],
          } as const
          : collaborativeContent;
        const document = left.state.schema.nodeFromJSON(content);
        left.dispatch(left.state.createTransaction().replace(0, left.state.doc.childCount, document.content));
      }
      initializedRooms.current.add(nextRoom);
    }
    setActiveRoom(nextRoom);
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
          <p>This page links two separate Yjs documents in memory. Type or select on either side and watch the other follow. The same adapter accepts a WebSocket, WebRTC, managed, or offline provider chosen by the host application.</p>
          <p><strong>No FountainJS server or account is required.</strong> Transport, authentication, room access, and persistence stay replaceable.</p>
        </div>
      </div>
      <div className="collaboration-demo__note">
        <span><b>Try it:</b> edit both documents, select a phrase to reveal the peer cursor, then use each author’s undo.</span>
        <span className="collaboration-demo__room"><strong>Room: {activeRoom === 'launch' ? 'Launch' : 'Planning'}</strong><button onClick={switchRoom}>Switch both editors to {activeRoom === 'launch' ? 'Planning' : 'Launch'} room</button></span>
        <small>The editor views stay mounted while both Yjs documents and provider sessions are replaced.</small>
      </div>
      <div className="collaboration-demo__editors">
        <article data-collaboration-editor="ada">
          <header><span><i style={{ background: '#6d4aff' }} />Ada</span><code>{leftCollaboration?.status ?? 'connecting'}</code></header>
          <FountainComposer editor={left} showToolbar={false} ariaLabel="Ada collaborative editor" placeholder="Ada writes here…" />
          <div className="collaboration-demo__editor-footer">
            <span>{leftState?.doc.textContent.length ?? 0} characters · {leftCollaboration?.presences.length ?? 0} peer · {leftComments?.threads.length ?? 0} threads</span>
            <div><button disabled={!canUndoCollaboration(left)} onClick={() => room.leftKit.commands.undoCollaboration?.(left)}>Undo Ada</button><button disabled={!canRedoCollaboration(left)} onClick={() => room.leftKit.commands.redoCollaboration?.(left)}>Redo</button></div>
          </div>
        </article>
        <article data-collaboration-editor="grace">
          <header><span><i style={{ background: '#d23877' }} />Grace</span><code>{rightCollaboration?.status ?? 'connecting'}</code></header>
          <FountainComposer editor={right} showToolbar={false} ariaLabel="Grace collaborative editor" placeholder="Grace writes here…" />
          <div className="collaboration-demo__editor-footer">
            <span>{rightState?.doc.textContent.length ?? 0} characters · {rightCollaboration?.presences.length ?? 0} peer · {rightComments?.threads.length ?? 0} threads</span>
            <div><button disabled={!canUndoCollaboration(right)} onClick={() => room.rightKit.commands.undoCollaboration?.(right)}>Undo Grace</button><button disabled={!canRedoCollaboration(right)} onClick={() => room.rightKit.commands.redoCollaboration?.(right)}>Redo</button></div>
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
        <code>fountainjs-editor/yjs</code>
        <span>CRDT document + nested attributes + relative positions + local-origin undo</span>
        <code>fountainjs-editor/comments</code>
        <span>Mapped anchors + storage operations + permissions</span>
        <span>Your provider</span>
        <span>Your auth and storage</span>
      </div>
    </section>
  );
}

function TrackedChangesDemo() {
  const kit = useMemo(() => {
    let identifier = 0;
    const tracked = createTrackedChangesExtension({
      user: { id: 'ada', name: 'Ada Lovelace', color: '#6d4aff' },
      idFactory: () => `live-review-${++identifier}`,
    });
    return composeExtensions([CoreExtension, tracked]);
  }, []);
  const content = useMemo(() => ({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'A review workflow people can trust' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Every product deserves editing tools that reveal intent clearly.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Try typing, replacing, formatting, or deleting anything in this document.' }] },
    ],
  } as const), []);
  const editor = useFountain({ schema: kit.schema, plugins: kit.plugins, content });
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    addTrackedNodeAttributeChange(editor, [0], { level: 2, align: 'center' }, 'Center the review heading');
    addTrackedReplacement(editor, [1, 0], 6, 13, 'team', 'Make the audience more specific');
    setTrackedChangesUser(editor, { id: 'grace', name: 'Grace Hopper', color: '#d23877' });
    const note = editor.state.schema.node('blockquote', {}, [
      editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Portable suggestions travel with the document; the host still owns access control.')]),
    ]);
    dispatchTrackedTransaction(editor, (transaction) => transaction.replace(editor.state.doc.childCount, editor.state.doc.childCount, [note]), 'Add the architecture boundary');
    setTrackedChangesUser(editor, { id: 'you', name: 'You', color: '#187a50' });
  }, [editor]);

  return <section className="tracked-demo" id="review">
    <div className="tracked-demo__intro">
      <div><span>TRACKED CHANGES</span><h2>Edit freely.<br />Decide explicitly.</h2></div>
      <div><p>This is the real optional tracking module. Suggested text, formatting, attributes, atoms, tables, and structural edits keep their author and can be accepted or rejected individually, by range, by author, or in batches.</p><p><strong>Try it now:</strong> type or delete in the document, select a review card, filter the list, and make a decision. The complete text stays inspectable.</p></div>
    </div>
    <div className="tracked-demo__workspace">
      <article className="tracked-demo__editor">
        <header><span>Review document</span><code>portable FountainJSON</code></header>
        <FountainComposer editor={editor} showToolbar={false} ariaLabel="Tracked changes demo editor" placeholder="Write a suggestion…" />
      </article>
      <aside><FountainTrackedChanges editor={editor} title="Review suggestions" onError={(error) => console.error(error)} /></aside>
    </div>
    <div className="tracked-demo__boundary"><code>fountainjs-editor/tracked-changes</code><span>Framework-neutral state + decisions</span><code>fountainjs-editor/react/tracked-changes</code><span>Optional review panel</span><span>Yjs-compatible</span><span>No hosted service required</span></div>
  </section>;
}

function VersionHistoryDemo() {
  const kit = useMemo(() => composeExtensions([
    CoreExtension,
    defineExtension({ name: 'version-demo-history', plugins: [historyPlugin] }),
  ]), []);
  const content = useMemo(() => ({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Launch brief' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'The first complete draft explains the launch in plain language.' }] },
    ],
  } as const), []);
  const editor = useFountain({ schema: kit.schema, plugins: kit.plugins, content });
  const provider = useMemo(() => new InMemoryVersionProvider(), []);
  const controller = useMemo(() => {
    let identifier = 0;
    return new VersionController({
      editor,
      provider,
      documentId: 'live-version-demo',
      user: { id: 'you', name: 'You' },
      idFactory: (kind) => `live-${kind}-${++identifier}`,
      autoLoad: false,
    });
  }, [editor, provider]);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    void (async () => {
      await controller.save({ name: 'First complete draft — nothing hidden after an ellipsis' });
      editor.dispatch(editor.state.createTransaction()
        .replaceText([1, 0], 0, editor.state.doc.child(1).textContent.length, 'The reviewed draft explains the launch, audience, and release decision in plain language.')
        .replace(editor.state.doc.childCount, editor.state.doc.childCount, [
          editor.state.schema.node('paragraph', {}, [editor.state.schema.text('The final checklist is included for everyone.')]),
        ]));
      await controller.save({ name: 'Team review with the complete descriptive name visible' });
      editor.dispatch(editor.state.createTransaction().replaceText(
        [1, 0],
        4,
        12,
        'current working',
      ));
    })().catch((error) => console.error(error));
  }, [controller, editor]);

  return <section className="versions-demo" id="versions">
    <div className="versions-demo__intro">
      <div><span>VERSION HISTORY</span><h2>Save a draft.<br />Keep working.<br />Restore safely.</h2></div>
      <div>
        <p>Name important document states, compare any two versions, preview the exact saved JSON, and restore an older draft.</p>
        <p><strong>Try it:</strong> edit the document, compare a saved version with the current text, preview it, or press Restore twice to confirm. FountainJS saves the current work as a backup before replacing it.</p>
      </div>
    </div>
    <div className="versions-demo__workspace">
      <article className="versions-demo__editor">
        <header><span>Current document</span><code>edit this text</code></header>
        <FountainComposer editor={editor} showToolbar={false} ariaLabel="Version history demo editor" placeholder="Write here…" />
      </article>
      <aside><FountainVersions controller={controller} title="Saved versions" onError={(error) => console.error(error)} /></aside>
    </div>
    <div className="versions-demo__boundary"><code>fountainjs-editor/versions</code><span>Public MIT module</span><span>Your storage provider</span><span>Exact comparison</span><span>Backup-first restore</span></div>
  </section>;
}

function App() {
  const editor = useFountain({
    schema: demoKit.schema,
    content: initialContent,
    plugins: demoKit.plugins,
  });
  const state = useFountainState(editor);
  const editorHandle = useRef<FountainEditorHandle>(null);
  const aiController = useMemo(() => new AIController(editor, demoAdapter), [editor]);
  const mentionController = useMemo(
    () => (demoKit.services.mentions as MentionService).getController(editor),
    [editor],
  );
  const emojiController = useMemo(
    () => (demoKit.services.emoji as EmojiService).getController(editor),
    [editor],
  );
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [copied, setCopied] = useState(false);
  const [compactToolbar, setCompactToolbar] = useState(false);

  const output = useMemo(() => {
    if (!state) return '';
    if (format === 'html') return HTMLExporter.export(state, { document: false });
    if (format === 'json') return JSONExporter.export(state);
    return MarkdownExporter.export(state);
  }, [format, state]);

  const characterCount = demoKit.services.characterCount as CharacterCountService;
  const words = characterCount.words(editor);
  const blocks = state?.doc.childCount ?? 0;

  const addBlock = (kind: 'quote' | 'task' | 'table' | 'details' | 'callout') => {
    if (kind === 'callout') demoKit.commands.insertCallout?.(editor);
    else if (kind === 'details') insertDetails(editor, { summary: 'Click to edit this summary', open: true });
    else if (kind === 'quote') demoKit.commands.insertQuote?.(editor, 'A thought worth keeping…');
    else if (kind === 'task') demoKit.commands.insertList?.(editor, 'task', ['Review the document', 'Publish when ready']);
    else demoKit.commands.insertTable?.(editor, { rows: 3, columns: 2, headerRow: true });
  };

  const copy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="FountainJS home"><span>F</span> FountainJS</a>
        <nav aria-label="Primary navigation"><SitePageLink href="#top" current>Home</SitePageLink><a className="site-section-link" href="#what">What it is</a><a className="site-section-link" href="#open-source">Open source</a><a className="site-section-link" href="#playground">Live demo</a><a className="site-section-link" href="#collaboration">Collaboration</a><a className="site-section-link" href="#review">Review</a><a className="site-section-link" href="#versions">Versions</a><SitePageLink href="./demos.html">10 demos</SitePageLink><SitePageLink href="./developers.html">Developers</SitePageLink></nav>
        <a className="install-pill" href="https://www.npmjs.com/package/fountainjs-editor">npm i fountainjs-editor</a>
      </header>

      <section className="hero" id="top">
        <div className="hero__eyebrow"><i /> Open source · MIT · early beta</div>
        <h1>
          <span>Build a rich-text editor.</span>
          <span>Use any framework.</span>
          <em>Extend every layer.</em>
        </h1>
        <p>FountainJS is a TypeScript library for adding a full-featured editor to a website or web app. It already includes rich text, images, tables, comments, tracked changes, collaboration, and version history. Use it with React, Vue, Svelte, Angular, plain JavaScript, or a Web Component; store the document JSON on any backend.</p>
        <div className="hero__actions"><a className="primary" href="#playground">Edit the live demo ↓</a><a className="secondary" href="https://www.npmjs.com/package/fountainjs-editor">Install from npm</a></div>
        <div className="promise-strip"><span>One npm package</span><span>React, Vue, Svelte, Angular</span><span>Portable JSON</span><span>No required cloud</span><span>MIT licensed</span></div>
      </section>

      <section className="definition" id="what">
        <div className="definition__lead">
          <span>PLAIN ENGLISH</span>
          <h2>It is code you add to your app—not another writing app.</h2>
        </div>
        <div className="definition__answer">
          <p className="big-answer">Your users get a familiar document editor. Your developers get the library, source code, and extension points needed to fit it into a real product.</p>
          <p>FountainJS runs in the browser. Choose the plain DOM API, Web Component, or React components; Vue, Svelte, Angular, and other frameworks can use the same Web Component or DOM API. Documents are portable JSON, so a backend written in Python, Go, Ruby, PHP, Java, or another language can store and process them.</p>
          <div className="definition__parts">
            <article><b>01</b><h3>Working features included</h3><p>Start with normal writing, media, tables, export, collaboration, comments, change review, and versions instead of rebuilding basics.</p></article>
            <article><b>02</b><h3>Use your current stack</h3><p>Embed it in React or use the DOM/Web Component interfaces from Vue, Svelte, Angular, plain JavaScript, and other frontend tools.</p></article>
            <article><b>03</b><h3>Change what your product needs</h3><p>Add a block, command, format, toolbar, storage provider, or service without maintaining a fork of the editor.</p></article>
          </div>
        </div>
      </section>

      <section className="open-source" id="open-source">
        <div className="open-source__lead"><span>WHAT OPEN SOURCE MEANS HERE</span><h2>The editor belongs in your product—not behind ours.</h2><p>“Open source” describes what you can inspect, own, change, and run. It does not pretend that databases, servers, storage, or third-party models cost nothing.</p></div>
        <div className="open-source__grid">
          <article><b>01</b><h3>Public source and MIT terms</h3><p>The engine, optional modules, types, tests, and documentation are public. The MIT license allows commercial use, modification, forks, redistribution, and private product code.</p></article>
          <article><b>02</b><h3>No Fountain feature paywall</h3><p>A capability only counts in this project when it ships through the public package. There is no private extension registry, paid editor tier, or license key that unlocks document features.</p></article>
          <article><b>03</b><h3>No required Fountain cloud</h3><p>Use the editor locally and connect your own database, files, authentication, collaboration transport, conversion service, or AI provider through replaceable interfaces.</p></article>
          <article><b>04</b><h3>You choose infrastructure costs</h3><p>Your hosting or chosen third-party services may charge you. Those are application decisions, not hidden requirements imposed by FountainJS; local and self-hosted implementations remain valid.</p></article>
        </div>
        <p className="open-source__boundary"><strong>Practical test:</strong> you can install the package, inspect every counted capability, run it without a Fountain account, replace external providers, and continue from a fork if this project disappears.</p>
      </section>

      <section className="capabilities">
        <div className="capabilities__heading"><span>IN THE PACKAGE TODAY</span><h2>The features people expect from a serious editor.</h2><p>These capabilities work now and ship in the public npm package. Import only the modules you need.</p></div>
        <div className="capabilities__grid">
          <article><b>01</b><h3>Rich writing</h3><p>Multi-paragraph and cross-block selection, headings, alignment, links, foreground/background colour, font family, font size, line height, marks, mentions, emoji, smart typography, live counts, slash commands, find/replace, undo/redo, paste, and IME input.</p></article>
          <article><b>02</b><h3>Structured blocks</h3><p>Bullet and numbered lists, task lists, code blocks, dividers, collapsible details, nested document structures, tables, and custom block types.</p></article>
          <article><b>03</b><h3>Production images</h3><p>Use block or inline images, editable captions, alt text, alignment, responsive sources, replacement, and accessible resizing. Upload tasks map through edits and expose progress, cancel, retry, and errors while storage remains yours.</p></article>
          <article><b>04</b><h3>Portable formats</h3><p>Lossless JSON plus Markdown, safe HTML, and plain-text boundaries for storage, APIs, publishing pipelines, search, and any backend language.</p></article>
          <article><b>05</b><h3>Any interface</h3><p>Use plain DOM, the standards-based Web Component, React bindings, or create another framework adapter over the same editor and immutable state.</p></article>
          <article><b>06</b><h3>Open extension contract</h3><p>Add nodes, marks, commands, plugins, formats, UI, collaboration providers, analytics, AI, or application services without forking the core.</p></article>
          <article><b>07</b><h3>Collaboration and review</h3><p>Optional Yjs synchronization, relative presence, author-local undo, threaded comments, and tracked changes with portable metadata and explicit decisions.</p></article>
          <article><b>08</b><h3>Named version history</h3><p>Save manual or automatic versions, preview exact content, compare text, structure, formatting, and attributes, then restore with a backup of current work.</p></article>
        </div>
      </section>

      <section className="flow" id="modularity">
        <div className="flow__title"><span>HOW MODULARITY WORKS</span><h2>Start with a working editor. <span className="keep-together">Change only</span> what you need.</h2></div>
        <ol>
          <li><b>1</b><strong>Install it</strong><span>Start with the supplied editor and a document that already supports common rich content.</span></li>
          <li><b>2</b><strong>Choose features</strong><span>Import collaboration, comments, tracked changes, versions, AI, or other optional modules only when you use them.</span></li>
          <li><b>3</b><strong>Customize behavior</strong><span>Add your own content blocks, commands, keyboard rules, formats, or product services through the same extension API.</span></li>
          <li><b>4</b><strong>Connect your interface</strong><span>Use React components, the Web Component, plain DOM controls, or build a small adapter for another framework.</span></li>
          <li><b>5</b><strong>Store it anywhere</strong><span>Keep portable JSON in your database and connect your own media, authentication, collaboration, or AI providers.</span></li>
        </ol>
      </section>

      <section className="playground" id="playground">
        <div className="section-heading"><div><span>LIVE PLAYGROUND</span><h2>Try the actual package in your browser.</h2></div><p>{words} words · {blocks} blocks · local demo adapter</p></div>
        <div className="demo-note"><b>Try it:</b> select text and open <strong>Text styles</strong> to change its family, size, line height, foreground, and background. Insert a collapsible section, or click the reading above <strong>東京</strong> to edit its ruby annotation. Hover or tap a block for move controls. Start an empty line with <kbd>/</kbd> for commands; type <kbd>@a</kbd>, <kbd>#re</kbd>, or <kbd>:rock</kbd> for suggestions. Typography converts <kbd>--</kbd>, <kbd>...</kbd>, arrows, fractions, and quotes as you type.</div>
        <div className="studio">
          <aside className="studio__outline"><Navigator editor={editor} /><div className="outline-tip">Markdown shortcuts<br /><kbd>##</kbd> heading · <kbd>-</kbd> list · <kbd>&gt;</kbd> quote</div></aside>
          <div className="studio__canvas">
            <div className="quick-insert" aria-label="Insert rich content">
              <span>Insert</span>
              <button onClick={() => addBlock('quote')}>❝ Quote</button>
              <button onClick={() => addBlock('task')}>☑ Tasks</button>
              <button onClick={() => addBlock('table')}>▦ Table</button>
              <button onClick={() => addBlock('details')}>▸ Details</button>
              <button onClick={() => setRuby(editor, 'reading')}>あ Ruby</button>
              <button onClick={() => addBlock('callout')}>✦ Callout</button>
              <button
                className="toolbar-profile"
                aria-pressed={compactToolbar}
                onClick={() => setCompactToolbar((current) => !current)}
              >{compactToolbar ? 'Show full toolbar' : 'Use compact toolbar'}</button>
            </div>
            <FountainComposer
              ref={editorHandle}
              editor={editor}
              placeholder="Start writing…"
              blockHandles
              assetUpload={demoAssetUpload}
              toolbarProps={compactToolbar ? {
                toolbarLabel: 'Compact writing toolbar',
                groups: ['marks', 'block-types', 'history'],
                actionOrder: { marks: ['highlight', 'bold', 'italic', 'underline'] },
                hiddenActions: ['strike', 'inline-code', 'subscript', 'superscript', 'link', 'unlink', 'text-color', 'clear-text-color'],
                groupLabels: { marks: 'Essential formatting' },
                actionLabels: { bold: 'Strong emphasis' },
              } : undefined}
            />
            <FountainBubbleMenu
              editor={editor}
              service={demoKit.services.bubbleMenu as FountainMenuService}
              anchorElement={editorHandle.current?.view?.dom}
            >
              <button type="button" aria-label="Bold selection" aria-pressed={isMarkActive(editor, 'strong')} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleMark(editor, 'strong')}><b>B</b></button>
              <button type="button" aria-label="Italic selection" aria-pressed={isMarkActive(editor, 'em')} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleMark(editor, 'em')}><i>I</i></button>
              <button type="button" aria-label="Underline selection" aria-pressed={isMarkActive(editor, 'underline')} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleMark(editor, 'underline')}><u>U</u></button>
              <button type="button" aria-label="Highlight selection" aria-pressed={isMarkActive(editor, 'highlight')} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleMark(editor, 'highlight')}>Highlight</button>
            </FountainBubbleMenu>
            <FountainFloatingMenu
              editor={editor}
              service={demoKit.services.floatingMenu as FountainMenuService}
              anchorElement={editorHandle.current?.view?.dom}
            >
              <button type="button" aria-label="Use paragraph" onMouseDown={(event) => event.preventDefault()} onClick={() => setBlockType(editor, 'paragraph')}>Text</button>
              <button type="button" aria-label="Use heading 1" onMouseDown={(event) => event.preventDefault()} onClick={() => setBlockType(editor, 'heading', { level: 1 })}>H1</button>
              <button type="button" aria-label="Use heading 2" onMouseDown={(event) => event.preventDefault()} onClick={() => setBlockType(editor, 'heading', { level: 2 })}>H2</button>
            </FountainFloatingMenu>
            <FountainSlashCommandMenu
              editor={editor}
              service={demoKit.services.slashCommands as SlashCommandService}
              anchorElement={editorHandle.current?.view?.dom}
            />
            <FountainSuggestionMenu<MentionItem>
              controller={mentionController}
              label="Mention a person or topic"
              anchorElement={editorHandle.current?.view?.dom}
              renderItem={(item) => <><b>{item.label}</b><small>{item.kind}</small></>}
            />
            <FountainSuggestionMenu<EmojiItem>
              controller={emojiController}
              label="Choose an emoji"
              anchorElement={editorHandle.current?.view?.dom}
              renderItem={(item) => <><b className="suggestion-emoji">{item.emoji}</b><span>{item.label}</span></>}
            />
            <FountainCharacterCount editor={editor} service={characterCount} />
          </div>
          <aside className="studio__tools">
            <div className="module-stack"><span>COMPOSED FOR THIS DEMO</span><div>{demoKit.extensions.map((extension) => <code key={extension.name}>{extension.name}</code>)}</div></div>
            <section className="studio__export">
              <div className="export-head"><strong>Live document output</strong><button onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button></div>
              <div className="format-tabs">{(['markdown', 'html', 'json'] as ExportFormat[]).map((item) => <button type="button" key={item} className={format === item ? 'active' : ''} onClick={() => setFormat(item)}>{item}</button>)}</div>
              <pre><code>{output}</code></pre>
            </section>
            <details className="optional-ai"><summary>Optional AI review example</summary><FountainAIReview controller={aiController} title="Optional AI module" /></details>
          </aside>
        </div>
      </section>

      <CollaborationDemo />

      <TrackedChangesDemo />

      <VersionHistoryDemo />

      <section className="comparison" id="compare">
        <div className="comparison__intro"><span>HONEST COMPARISON</span><h2>FountainJS versus the complete ProseMirror + Tiptap stack.</h2><p>ProseMirror supplies Tiptap’s engine; Tiptap supplies the higher-level developer and product layer. FountainJS independently builds both responsibilities into one open-source project: its own engine plus native editing, review, collaboration, format, and UI modules. The older stack still has much greater production history and ecosystem scale.</p></div>
        <div className="comparison__table" role="table" aria-label="Rich text editor comparison">
          {competitors.map((item) => <a key={item.name} href={item.href} className="comparison__row" role="row">
            <strong role="cell">{item.name}</strong><span role="cell">{item.maturity}</span><span role="cell">{item.architecture}</span><span role="cell">{item.fit}</span><i aria-hidden="true">↗</i>
          </a>)}
        </div>
        <div className="truth-cards">
          <article className="is-good"><span>FountainJS is a fit when…</span><p>You need a capable editor across multiple frontend surfaces, want extensions to stay host-controlled, and prefer portable JSON, open interfaces, and MIT licensing.</p></article>
          <article><span>Choose a mature alternative when…</span><p>You need a much larger extension market, years of physical-device deployment evidence, or commercial support today.</p></article>
        </div>
        <p className="comparison__detail"><a href="https://github.com/eddolo/fountainjs/blob/master/docs/PROSEMIRROR_COMPARISON.md">Read the one-to-one full-stack comparison →</a></p>
      </section>

      <section className="architecture">
        <div><span>THE EXTENSION CONTRACT</span><h2>Add anything. Replace any layer you own.</h2></div>
        <div className="architecture__code"><pre><code>{`const callout = defineExtension({
  name: 'callout',
  nodes: { callout: calloutSpec },
  commands: { toggleCallout },
  formats: { myFormat },
  services: { analytics }
})

const kit = composeExtensions([
  CoreExtension,
  history,
  callout
])`}</code></pre></div>
        <ul><li><b>DOM first</b><span>The core editor and view do not import React or another UI framework.</span></li><li><b>Web standard</b><span>Register &lt;fountain-editor&gt; once and consume it from any Custom-Element-capable framework.</span></li><li><b>Open modules</b><span>Nodes, marks, plugins, commands, formats, and services share one composition contract.</span></li><li><b>Optional AI</b><span>The review controller and MCP adapter are example modules—not dependencies or the product identity.</span></li></ul>
      </section>

      <section className="closing"><p>npm install fountainjs-editor</p><h2 aria-label="Build the editor your product needs. Nothing more. Nothing locked in."><span className="closing__sentence"><span className="closing__phrase">Build the editor</span>{' '}<span className="closing__phrase">your product needs.</span></span><span className="closing__sentence"><span className="closing__phrase">Nothing more.</span>{' '}<span className="closing__phrase">Nothing locked in.</span></span></h2><div className="closing__actions"><a href="./demos.html">Explore 10 working demos →</a><a href="./developers.html">Read the developer guide →</a><a href="https://github.com/eddolo/fountainjs">GitHub ↗</a></div></section>
      <footer><span>FountainJS · Built by Paolo Cappuccini</span><span>MIT · TypeScript · Open source</span></footer>
    </main>
  );
}

export default App;
