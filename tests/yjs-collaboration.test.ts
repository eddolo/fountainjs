// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
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
): Editor {
  const collaboration = createYjsCollaborationExtension({ document: ydoc, user });
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

describe('optional Yjs collaboration adapter', () => {
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

  it('deterministically repairs simultaneous empty-document initialization', () => {
    const leftDocument = new Y.Doc();
    const left = createCollaborativeEditor(leftDocument, ada, document('Left seed'));
    const rightDocument = new Y.Doc();
    const right = createCollaborativeEditor(rightDocument, linus, document('Right seed'));

    sync(leftDocument, rightDocument);
    expect(left.getJSON()).toEqual(right.getJSON());
    expect(['Left seed', 'Right seed']).toContain(left.getText());
    expect(leftDocument.getXmlFragment('fountain').length).toBe(1);
    expect(rightDocument.getXmlFragment('fountain').length).toBe(1);
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

  it('fails closed on malformed remote trees and owns provider lifecycle', async () => {
    const ydoc = new Y.Doc();
    const provider: YjsProvider = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };
    const adapter = new YjsCollaborationAdapter({ document: ydoc, provider, user: ada });
    const collaboration = createCollaborationExtension({ adapter: () => adapter });
    const kit = composeExtensions([CoreExtension, collaboration]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: document('Safe') });
    expect(provider.connect).toHaveBeenCalledTimes(1);

    const root = ydoc.getXmlFragment('fountain').get(0) as Y.XmlElement;
    ydoc.transact(() => root.setAttribute('fountain:type', 'unknown'), 'hostile-peer');
    expect(editor.getText()).toBe('Safe');
    expect(getCollaborationState(editor)).toMatchObject({
      status: 'error', error: { recoverable: true },
    });

    editor.destroy();
    expect(provider.disconnect).toHaveBeenCalledTimes(1);
  });

  it('moves one live editor to a new Y.Doc and provider without observing the retired document', () => {
    const firstDocument = new Y.Doc();
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

    const sharedText = (ydoc: Y.Doc) => {
      const root = ydoc.getXmlFragment('fountain').get(0) as Y.XmlElement;
      const block = root.get(0) as Y.XmlElement;
      const leaf = block.get(0) as Y.XmlElement;
      return leaf.get(0) as Y.XmlText;
    };
    firstDocument.transact(() => sharedText(firstDocument).insert(0, 'Stale '), 'old-provider');
    expect(editor.getText()).toBe('Second');
    secondDocument.transact(() => sharedText(secondDocument).insert(0, 'Fresh '), 'new-provider');
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
    })).toThrow(/awareness field/);
    expect(() => new YjsCollaborationAdapter({
      document: new Y.Doc(), user: ada, captureTimeout: Number.NaN,
    })).toThrow(/capture timeout/);
    expect(() => new YjsCollaborationAdapter({
      document: new Y.Doc(), user: ada, presenceThrottleMs: 1_001,
    })).toThrow(/presence throttle/);
  });

  it('coalesces presence bursts and never duplicates listeners across reconnect cycles', () => {
    vi.useFakeTimers();
    try {
      const network = new AwarenessNetwork();
      const ydoc = new Y.Doc();
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
