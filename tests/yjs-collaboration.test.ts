// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createRetainedYjsCollaborationExtension } from '../src/yjs/retained-adapter';
import { YjsCollaborationAdapter as LegacyYjsCollaborationAdapter, createYjsCollaborationExtension as createLegacyYjsCollaborationExtension } from '../src/yjs/legacy';
import {
  CoreExtension,
  Selection,
  canRedoCollaboration,
  canUndoCollaboration,
  composeExtensions,
  createCollaborationExtension,
  createEditor,
  disconnectCollaboration,
  getCollaborationAdapter,
  getCollaborationState,
  insertText,
  reconnectCollaboration,
  replaceCollaborationAdapter,
  redoCollaboration,
  setNodeAttributes,
  undoCollaboration,
  type CollaborationUser,
  type Editor,
  type NodeJSON,
} from '../src';
import {
  YjsCollaborationAdapter,
  createYjsCollaborationExtension,
  type YjsAwareness,
  type YjsProvider,
} from '../src/yjs';

function paragraph(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] } as const;
}

function document(...values: string[]) {
  return { type: 'doc', content: values.map(paragraph) } as const;
}

const ada: CollaborationUser = { id: 'ada', name: 'Ada', color: '#a855f7' };
const linus: CollaborationUser = { id: 'linus', name: 'Linus', color: '#10b981' };

function sync(left: Y.Doc, right: Y.Doc): void {
  const leftUpdate = Y.encodeStateAsUpdate(left);
  const rightUpdate = Y.encodeStateAsUpdate(right);
  Y.applyUpdate(left, rightUpdate, 'right-peer');
  Y.applyUpdate(right, leftUpdate, 'left-peer');
}

function createCollaborativeEditor(
  ydoc: Y.Doc,
  user: CollaborationUser,
  content: NodeJSON = document('Alpha'),
  createExtension = createYjsCollaborationExtension,
): Editor {
  const collaboration = createExtension({ document: ydoc, user });
  const kit = composeExtensions([CoreExtension, collaboration]);
  return createEditor({ schema: kit.schema, plugins: kit.plugins, content });
}

class AwarenessNetwork {
  readonly states = new Map<number, Record<string, unknown>>();
  readonly clients = new Set<MemoryAwareness>();

  create(clientID: number): MemoryAwareness {
    const awareness = new MemoryAwareness(this, clientID);
    this.clients.add(awareness);
    this.states.set(clientID, {});
    return awareness;
  }

  emit(): void { this.clients.forEach((client) => client.emit()); }
}

class MemoryAwareness implements YjsAwareness {
  private readonly listeners = new Set<(...args: any[]) => void>();
  writes = 0;

  constructor(private readonly network: AwarenessNetwork, readonly clientID: number) {}

  getLocalState(): Record<string, unknown> | null {
    return this.network.states.get(this.clientID) ?? null;
  }

  getStates(): Map<number, Record<string, unknown>> { return this.network.states; }

  setLocalStateField(field: string, value: unknown): void {
    this.writes += 1;
    const next = { ...(this.getLocalState() ?? {}) };
    if (value === null) delete next[field];
    else next[field] = value;
    this.network.states.set(this.clientID, next);
    this.network.emit();
  }

  on(_event: 'change' | 'update', listener: (...args: any[]) => void): void { this.listeners.add(listener); }
  off(_event: 'change' | 'update', listener: (...args: any[]) => void): void { this.listeners.delete(listener); }
  emit(): void { this.listeners.forEach((listener) => listener()); }
  get listenerCount(): number { return this.listeners.size; }
}

it.each([
  { name: 'default adapter', createExtension: createYjsCollaborationExtension },
  { name: 'retained adapter', createExtension: createRetainedYjsCollaborationExtension },
  { name: 'explicit legacy adapter', createExtension: createLegacyYjsCollaborationExtension },
])('$name does not publish a queued older cursor after a newer cursor has been sent', ({ createExtension }) => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  const ydoc = new Y.Doc();
  const awareness = new AwarenessNetwork().create(ydoc.clientID);
  const kit = composeExtensions([CoreExtension, createExtension({ document: ydoc, awareness, user: ada, presenceThrottleMs: 32 })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: document('Alpha') });
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 1)));
    expect(awareness.writes).toBe(1);
    // The clock passed the throttle window before the queued timer ran.
    vi.setSystemTime(1_032);
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 4)));
    expect(awareness.writes).toBe(2);
    const latest = awareness.getLocalState();
    vi.advanceTimersByTime(32);
    expect(awareness.writes).toBe(2);
    expect(awareness.getLocalState()).toEqual(latest);
  } finally {
    editor.destroy();
    ydoc.destroy();
    vi.useRealTimers();
  }
});

describe('optional Yjs collaboration adapter', () => {
  it('synchronizes marks carried by inline atom nodes', () => {
    const content: NodeJSON = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'inline_image',
          attrs: { src: '/status.png', alt: 'Status' },
          marks: [{ type: 'link', attrs: { href: '/details', title: 'Details', target: '_self' } }],
        }],
      }],
    };
    const leftDocument = new Y.Doc();
    const left = createCollaborativeEditor(leftDocument, ada, content);
    const rightDocument = new Y.Doc();
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'initial-sync');
    const right = createCollaborativeEditor(rightDocument, linus, content);

    expect(right.getJSON()).toEqual(left.getJSON());
    expect(right.state.doc.child(0).child(0).marks[0]?.type.name).toBe('link');
  });

  it('converges concurrent offline text edits at character granularity', () => {
    const leftDocument = new Y.Doc();
    const left = createCollaborativeEditor(leftDocument, ada);
    const rightDocument = new Y.Doc();
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'initial-sync');
    const right = createCollaborativeEditor(rightDocument, linus);

    left.dispatch(left.state.createTransaction().setSelection(Selection.cursor([0, 0], 1)));
    right.dispatch(right.state.createTransaction().setSelection(Selection.cursor([0, 0], 4)));
    expect(insertText(left, 'X')).toBe(true);
    expect(insertText(right, 'Y')).toBe(true);

    sync(leftDocument, rightDocument);
    expect(left.getJSON()).toEqual(right.getJSON());
    expect(left.getText()).toContain('X');
    expect(left.getText()).toContain('Y');
  });

  it('applies text-only remote deltas without rebuilding the full JSON tree', () => {
    const leftDocument = new Y.Doc();
    const left = createCollaborativeEditor(leftDocument, ada, document(...Array.from({ length: 250 }, (_, index) => `Line ${index}`)));
    const rightDocument = new Y.Doc();
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'initial-sync');
    const right = createCollaborativeEditor(rightDocument, linus, left.getJSON());
    const rebuild = vi.spyOn(right.state.schema, 'nodeFromJSON');

    left.dispatch(left.state.createTransaction().setSelection(Selection.cursor([249, 0], 8)));
    expect(insertText(left, '!')).toBe(true);
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'text-peer');

    expect(right.state.doc.child(249).textContent).toBe('Line 249!');
    expect(rebuild).not.toHaveBeenCalled();
  });

  it('retains the explicit legacy policy for simultaneous empty-document initialization', () => {
    const leftDocument = new Y.Doc();
    const left = createCollaborativeEditor(leftDocument, ada, document('Left seed'), createLegacyYjsCollaborationExtension);
    const rightDocument = new Y.Doc();
    const right = createCollaborativeEditor(rightDocument, linus, document('Right seed'), createLegacyYjsCollaborationExtension);

    sync(leftDocument, rightDocument);
    expect(left.getJSON()).toEqual(right.getJSON());
    expect(['Left seed', 'Right seed']).toContain(left.getText());
    expect(leftDocument.getXmlFragment('fountain').length).toBe(1);
    expect(rightDocument.getXmlFragment('fountain').length).toBe(1);
  });

  it.each([undefined, true, false])('default keeps both independent roots and local edits regardless of the legacy policy (%s)', preserveConcurrentRoots => {
    const leftDoc = new Y.Doc(), rightDoc = new Y.Doc(), merged = new Y.Doc();
    const make = (ydoc: Y.Doc, user: CollaborationUser) => {
      const collaboration = createYjsCollaborationExtension({ document: ydoc, user, preserveConcurrentRoots });
      const kit = composeExtensions([CoreExtension, collaboration]);
      return createEditor({ schema: kit.schema, plugins: kit.plugins, content: document('Common template') });
    };
    const left = make(leftDoc, ada), right = make(rightDoc, linus);
    try {
      left.dispatch(left.createTransaction().insertText([0, 0], 0, 'Ada: '));
      right.dispatch(right.createTransaction().insertText([0, 0], 0, 'Linus: '));
      Y.applyUpdate(merged, Y.encodeStateAsUpdate(leftDoc));
      Y.applyUpdate(merged, Y.encodeStateAsUpdate(rightDoc));
      const bytes = Y.encodeStateAsUpdate(merged);
      sync(leftDoc, rightDoc);
      for (const [ydoc, editor] of [[leftDoc, left], [rightDoc, right]] as const) {
        expect(ydoc.getXmlFragment('fountain').length).toBe(2);
        expect(Y.encodeStateAsUpdate(ydoc)).toEqual(bytes);
        expect(getCollaborationState(editor)?.error?.message).toContain('conflicting collaboration room');
        expect(canUndoCollaboration(editor)).toBe(false);
        expect(undoCollaboration(editor)).toBe(false);
      }
      left.dispatch(left.createTransaction().insertText([0, 0], 0, 'Local only. '));
      expect(left.getText()).toBe('Local only. Ada: Common template');
      expect(right.getText()).toBe('Linus: Common template');
      expect(Y.encodeStateAsUpdate(leftDoc)).toEqual(bytes);
      // An older peer may have deleted one root. Its update does not grant it
      // permission to replace the local draft held by the conflicted editor.
      merged.getXmlFragment('fountain').delete(1, 1);
      Y.applyUpdate(leftDoc, Y.encodeStateAsUpdate(merged), 'older-peer');
      expect(leftDoc.getXmlFragment('fountain').length).toBe(1);
      expect(left.getText()).toBe('Local only. Ada: Common template');
      expect(getCollaborationState(left)?.status).toBe('error');
      reconnectCollaboration(left);
      expect(getCollaborationState(left)?.status).toBe('error');
      expect(left.getText()).toBe('Local only. Ada: Common template');
    } finally { left.destroy(); right.destroy(); leftDoc.destroy(); rightDoc.destroy(); merged.destroy(); }
  });

  it('refuses an already conflicted room before starting its provider', () => {
    const first = new Y.Doc(), second = new Y.Doc();
    const a = createCollaborativeEditor(first, ada, document('First draft'));
    const b = createCollaborativeEditor(second, linus, document('Second draft'));
    a.destroy(); b.destroy();
    Y.applyUpdate(first, Y.encodeStateAsUpdate(second));
    const bytes = Y.encodeStateAsUpdate(first);
    const provider = { connect: vi.fn(), disconnect: vi.fn() };
    const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document: first, user: ada, provider, preserveConcurrentRoots: true })]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: document('Unsynced draft') });
    try {
      expect(getCollaborationState(editor)?.status).toBe('error');
      expect(editor.getText()).toBe('Unsynced draft');
      expect(provider.connect).not.toHaveBeenCalled();
      expect(Y.encodeStateAsUpdate(first)).toEqual(bytes);
    } finally { editor.destroy(); first.destroy(); second.destroy(); }
  });

  it('preserves block identities while concurrent structural insertions converge', () => {
    const leftDocument = new Y.Doc();
    const left = createCollaborativeEditor(leftDocument, ada, document('One', 'Two'));
    const rightDocument = new Y.Doc();
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'initial-sync');
    const right = createCollaborativeEditor(rightDocument, linus, document('One', 'Two'));

    const leftMiddle = left.state.schema.nodeFromJSON(paragraph('Middle'));
    const rightEnd = right.state.schema.nodeFromJSON(paragraph('End'));
    left.dispatch(left.state.createTransaction().replace(1, 1, [leftMiddle]));
    right.dispatch(right.state.createTransaction().replace(2, 2, [rightEnd]));
    sync(leftDocument, rightDocument);

    expect(left.getJSON()).toEqual(right.getJSON());
    expect(left.state.doc.content.map((node) => node.textContent)).toEqual(['One', 'Middle', 'Two', 'End']);
  });

  it('merges independent attributes on the same retained node', () => {
    const content = {
      type: 'doc',
      content: [{ type: 'image_super', attrs: { src: '/cover.png', alt: 'Original', title: 'Original title' } }],
    } as const;
    const leftDocument = new Y.Doc();
    const left = createCollaborativeEditor(leftDocument, ada, content);
    const rightDocument = new Y.Doc();
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'initial-sync');
    const right = createCollaborativeEditor(rightDocument, linus, content);

    expect(setNodeAttributes(left, [0], { alt: 'Left alternative' })).toBe(true);
    expect(setNodeAttributes(right, [0], { title: 'Right title' })).toBe(true);
    sync(leftDocument, rightDocument);

    expect(left.getJSON()).toEqual(right.getJSON());
    expect(left.state.doc.child(0).attrs).toMatchObject({
      alt: 'Left alternative', title: 'Right title',
    });
  });

  it('tracks remote selections as relative positions and removes departed collaborators', () => {
    const network = new AwarenessNetwork();
    const leftDocument = new Y.Doc();
    const leftAwareness = network.create(leftDocument.clientID);
    const left = (() => {
      const collaboration = createYjsCollaborationExtension({
        document: leftDocument, awareness: leftAwareness, user: ada, presenceThrottleMs: 0,
      });
      const kit = composeExtensions([CoreExtension, collaboration]);
      return createEditor({ schema: kit.schema, plugins: kit.plugins, content: document('Alpha') });
    })();
    const rightDocument = new Y.Doc();
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'initial-sync');
    const rightAwareness = network.create(rightDocument.clientID);
    const right = (() => {
      const collaboration = createYjsCollaborationExtension({
        document: rightDocument, awareness: rightAwareness, user: linus, presenceThrottleMs: 0,
      });
      const kit = composeExtensions([CoreExtension, collaboration]);
      return createEditor({ schema: kit.schema, plugins: kit.plugins, content: document('Alpha') });
    })();

    left.dispatch(left.state.createTransaction().setSelection(Selection.range([0, 0], 1, [0, 0], 4)));
    expect(getCollaborationState(right)?.presences).toMatchObject([{
      clientId: String(leftDocument.clientID),
      user: { id: 'ada', name: 'Ada' },
      selection: { anchor: 2, head: 5 },
    }]);

    right.dispatch(right.state.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    insertText(right, 'Z');
    sync(leftDocument, rightDocument);
    expect(getCollaborationState(right)?.presences[0]?.selection).toEqual({ anchor: 3, head: 6 });

    expect(disconnectCollaboration(left)).toBe(true);
    expect(getCollaborationState(right)?.presences).toEqual([]);
  });

  it('undoes only local CRDT changes, preserves remote work, and restores selection', () => {
    const leftDocument = new Y.Doc();
    const left = createCollaborativeEditor(leftDocument, ada);
    const rightDocument = new Y.Doc();
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'initial-sync');
    const right = createCollaborativeEditor(rightDocument, linus);

    left.dispatch(left.state.createTransaction().setSelection(Selection.cursor([0, 0], 1)));
    insertText(left, 'X');
    sync(leftDocument, rightDocument);
    right.dispatch(right.state.createTransaction().setSelection(Selection.cursor([0, 0], right.getText().length)));
    insertText(right, 'Y');
    sync(leftDocument, rightDocument);

    expect(canUndoCollaboration(left)).toBe(true);
    expect(undoCollaboration(left)).toBe(true);
    expect(left.getText()).toBe('AlphaY');
    expect(left.state.selection).toMatchObject({ path: [0, 0], from: 1, to: 1 });
    expect(canRedoCollaboration(left)).toBe(true);
    expect(redoCollaboration(left)).toBe(true);
    expect(left.getText()).toBe('AXlphaY');
  });

  it.each([
    { name: 'default retained', Adapter: YjsCollaborationAdapter, attribute: 'format', factory: createYjsCollaborationExtension },
    { name: 'explicit legacy', Adapter: LegacyYjsCollaborationAdapter, attribute: 'fountain:type', factory: createLegacyYjsCollaborationExtension },
  ])('$name fails closed on malformed remote trees and owns provider lifecycle', async ({ Adapter, attribute, factory }) => {
    const ydoc = new Y.Doc();
    createCollaborativeEditor(ydoc, ada, document('Safe'), factory).destroy();
    const provider: YjsProvider = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };
    const adapter = new Adapter({ document: ydoc, provider, user: ada });
    const collaboration = createCollaborationExtension({ adapter: () => adapter });
    const kit = composeExtensions([CoreExtension, collaboration]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: document('Safe') });
    expect(provider.connect).toHaveBeenCalledTimes(1);

    const root = ydoc.getXmlFragment('fountain').get(0) as Y.XmlElement;
    ydoc.transact(() => root.setAttribute(attribute, 'unknown'), 'hostile-peer');
    expect(editor.getText()).toBe('Safe');
    expect(getCollaborationState(editor)).toMatchObject({
      status: 'error', error: { recoverable: true },
    });

    editor.destroy();
    expect(provider.disconnect).toHaveBeenCalledTimes(1);
  });

  it('moves one live editor to a new Y.Doc and provider without observing the retired document', () => {
    const firstDocument = new Y.Doc();
    createCollaborativeEditor(firstDocument, ada, document('First')).destroy();
    const firstStatus = new Set<(event: { status?: string } | string) => void>();
    const firstProvider: YjsProvider = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      on: (_event, listener) => { firstStatus.add(listener); },
      off: (_event, listener) => { firstStatus.delete(listener); },
    };
    const firstAdapter = new YjsCollaborationAdapter({ document: firstDocument, provider: firstProvider, user: ada });
    const collaboration = createCollaborationExtension({ adapter: () => firstAdapter });
    const kit = composeExtensions([CoreExtension, collaboration]);
    const editor = createEditor({
      schema: kit.schema, plugins: kit.plugins, content: document('First'),
    });

    const secondDocument = new Y.Doc();
    const seed = createCollaborativeEditor(secondDocument, linus, document('Second'));
    seed.destroy();
    const secondStatus = new Set<(event: { status?: string } | string) => void>();
    const secondProvider: YjsProvider = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      on: (_event, listener) => { secondStatus.add(listener); },
      off: (_event, listener) => { secondStatus.delete(listener); },
    };
    const secondAdapter = new YjsCollaborationAdapter({ document: secondDocument, provider: secondProvider, user: ada });

    expect(replaceCollaborationAdapter(editor, secondAdapter)).toBe(true);
    expect(getCollaborationAdapter(editor)).toBe(secondAdapter);
    expect(editor.getText()).toBe('Second');
    expect(firstProvider.disconnect).toHaveBeenCalledTimes(1);
    expect(firstStatus.size).toBe(0);
    expect(secondProvider.connect).toHaveBeenCalledTimes(1);
    expect(secondStatus.size).toBe(1);

    const insertFromPeer = (ydoc: Y.Doc, value: string) => {
      const peerDoc = new Y.Doc();
      Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(ydoc));
      const peer = createCollaborativeEditor(peerDoc, linus);
      try {
        peer.dispatch(peer.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
        expect(insertText(peer, value)).toBe(true);
        Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(peerDoc), 'provider');
      } finally { peer.destroy(); peerDoc.destroy(); }
    };
    insertFromPeer(firstDocument, 'Stale ');
    expect(editor.getText()).toBe('Second');
    insertFromPeer(secondDocument, 'Fresh ');
    expect(editor.getText()).toBe('Fresh Second');

    editor.destroy();
    expect(secondProvider.disconnect).toHaveBeenCalledTimes(1);
    expect(secondStatus.size).toBe(0);
  });

  it('rejects unsafe local identity and adapter configuration', () => {
    expect(() => new YjsCollaborationAdapter({
      document: new Y.Doc(),
      user: { id: 'bad id', name: 'Bad\nName', color: 'red' },
    })).toThrow(/valid local user identity/);
    expect(() => new YjsCollaborationAdapter({
      document: new Y.Doc(), user: ada, awarenessField: '../unsafe',
    })).toThrow(/awareness options/);
    expect(() => new YjsCollaborationAdapter({
      document: new Y.Doc(), user: ada, captureTimeout: Number.NaN,
    })).toThrow(/timing.*options/);
    expect(() => new YjsCollaborationAdapter({
      document: new Y.Doc(), user: ada, presenceThrottleMs: 1_001,
    })).toThrow(/timing.*options/);
  });

  it('coalesces presence bursts and never duplicates listeners across reconnect cycles', () => {
    vi.useFakeTimers();
    try {
      const network = new AwarenessNetwork();
      const ydoc = new Y.Doc();
      createCollaborativeEditor(ydoc, ada).destroy();
      const awareness = network.create(ydoc.clientID);
      const statusListeners = new Set<(event: { status?: string } | string) => void>();
      const provider: YjsProvider = {
        awareness,
        connect: vi.fn(),
        disconnect: vi.fn(),
        on: (_event, listener) => { statusListeners.add(listener); },
        off: (_event, listener) => { statusListeners.delete(listener); },
      };
      const collaboration = createYjsCollaborationExtension({
        document: ydoc,
        provider,
        user: ada,
        presenceThrottleMs: 32,
      });
      const kit = composeExtensions([CoreExtension, collaboration]);
      const editor = createEditor({
        schema: kit.schema, plugins: kit.plugins, content: document('Alpha'),
      });

      expect(awareness.writes).toBe(1);
      expect(awareness.listenerCount).toBe(1);
      expect(statusListeners.size).toBe(1);
      for (let offset = 1; offset <= 5; offset += 1) {
        editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], offset)));
      }
      expect(awareness.writes).toBe(1);
      vi.advanceTimersByTime(31);
      expect(awareness.writes).toBe(1);
      vi.advanceTimersByTime(1);
      expect(awareness.writes).toBe(2);

      editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 5)));
      vi.advanceTimersByTime(100);
      expect(awareness.writes).toBe(2);

      for (let cycle = 0; cycle < 20; cycle += 1) {
        expect(reconnectCollaboration(editor)).toBe(true);
        expect(awareness.listenerCount).toBe(1);
        expect(statusListeners.size).toBe(1);
      }
      expect(provider.connect).toHaveBeenCalledTimes(21);
      expect(provider.disconnect).toHaveBeenCalledTimes(20);

      editor.destroy();
      expect(awareness.listenerCount).toBe(0);
      expect(statusListeners.size).toBe(0);
      expect(provider.disconnect).toHaveBeenCalledTimes(21);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
