// @vitest-environment node

import { afterEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, composeExtensions, createEditor, disconnectCollaboration, getCollaborationState,
  reconnectCollaboration, type NodeJSON } from '../src';
import { createYjsCollaborationExtension, type YjsAwareness, type YjsProvider } from '../src/yjs';
import { createYjsCollaborationExtension as legacy } from '../src/yjs/legacy';
import { createRetainedYjsCollaborationExtension as retained } from '../src/yjs/retained-adapter';
import { captureRetainedCheckpoint } from '../src/yjs/retained-checkpoint';

const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });
const user = { id: 'author', name: 'Author', color: '#7048e8' };
const content: NodeJSON = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Room content' }] }] };
const factories = [
  { name: 'default', factory: createYjsCollaborationExtension },
  { name: 'retained', factory: retained },
  { name: 'explicit legacy', factory: legacy },
];
function document() { const value = new Y.Doc(); cleanup.push(() => value.destroy()); return value; }
function editor(options: Parameters<typeof createYjsCollaborationExtension>[0], factory = createYjsCollaborationExtension) {
  const kit = composeExtensions([CoreExtension, factory(options)]);
  const value = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
  cleanup.push(() => value.destroy());
  return value;
}
function awareness(clientID: number) {
  const listeners = new Set<(...args: any[]) => void>();
  const states = new Map<number, Record<string, unknown>>();
  const value: YjsAwareness = {
    clientID, getStates: () => states, getLocalState: () => states.get(clientID) ?? null,
    setLocalStateField: (field, value) => { states.set(clientID, { ...states.get(clientID), [field]: value }); },
    on: (_event, listener) => { listeners.add(listener); },
    off: (_event, listener) => { listeners.delete(listener); },
  };
  return { ...value, listeners };
}
function provider(clientID: number) {
  const listeners = new Set<(event: { status?: string } | string) => void>();
  const value = {
    awareness: awareness(clientID), listeners, connect: vi.fn(), disconnect: vi.fn(),
    on: vi.fn<NonNullable<YjsProvider['on']>>((_event, listener) => { listeners.add(listener); }),
    off: vi.fn<NonNullable<YjsProvider['off']>>((_event, listener) => { listeners.delete(listener); }),
  };
  return value;
}

it.each(factories)('$name owns its original room, provider and explicit awareness after caller options are reused', ({ factory }) => {
  const original = document(), unrelated = document();
  editor({ document: original, user }, factory).destroy();
  const connected = provider(original.clientID), replacement = provider(unrelated.clientID);
  const off = vi.spyOn(original, 'off');
  const options = { document: original, user, provider: connected, awareness: connected.awareness };
  const opened = editor(options, factory);
  expect(getCollaborationState(opened)?.status).toBe('connected');
  expect(connected.connect).toHaveBeenCalledOnce();
  expect(connected.listeners.size).toBe(1);
  expect(connected.awareness.listeners.size).toBe(1);

  // A host can reuse a plain JavaScript configuration object for another room.
  // Existing sessions must not follow those later property assignments.
  options.document = unrelated; options.provider = replacement; options.awareness = replacement.awareness;
  expect(disconnectCollaboration(opened)).toBe(true);
  expect(connected.disconnect).toHaveBeenCalledOnce();
  expect(connected.listeners.size).toBe(0);
  expect(connected.awareness.listeners.size).toBe(0);
  expect(connected.awareness.getLocalState()?.fountain).toBeNull();
  if (factory !== legacy) expect(off).toHaveBeenCalledWith('afterTransaction', expect.any(Function));
  expect(replacement.disconnect).not.toHaveBeenCalled();
  expect(replacement.off).not.toHaveBeenCalled();
  expect(replacement.awareness.getLocalState()).toBeNull();
  expect(unrelated.share.size).toBe(0);

  expect(reconnectCollaboration(opened)).toBe(true);
  expect(getCollaborationState(opened)?.status).toBe('connected');
  expect(connected.connect).toHaveBeenCalledTimes(2);
  expect(replacement.connect).not.toHaveBeenCalled();
  expect(opened.getText()).toBe('Room content');
});

it.each(factories)('$name removes the awareness listener it attached even if a provider replaces its awareness property', ({ factory }) => {
  const shared = document();
  editor({ document: shared, user }, factory).destroy();
  const transport = provider(shared.clientID), originalAwareness = transport.awareness;
  const opened = editor({ document: shared, user, provider: transport }, factory);
  expect(originalAwareness.listeners.size).toBe(1);
  transport.awareness = awareness(shared.clientID);
  expect(disconnectCollaboration(opened)).toBe(true);
  expect(originalAwareness.listeners.size).toBe(0);
  expect(originalAwareness.getLocalState()?.fountain).toBeNull();
  expect(transport.awareness.getLocalState()).toBeNull();
});

it.each(factories.filter(item => item.name !== 'explicit legacy'))('$name never installs an awaited checkpoint into a subsequently substituted options.document', async ({ factory }) => {
  const authoritative = document(), source = editor({ document: authoritative, user });
  const checkpoint = await captureRetainedCheckpoint(authoritative, source.state.schema, 'options-owner-v1');
  const local = document(), unrelated = document(), before = Y.encodeStateAsUpdate(unrelated);
  const connected = provider(local.clientID), replacement = provider(unrelated.clientID);
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const options = {
    document: local, user, provider: connected,
    admission: { schemaVersion: 'options-owner-v1', load: async () => { await waiting; return checkpoint; } },
  };
  const opened = editor(options, factory);
  expect(getCollaborationState(opened)?.status).toBe('connecting');
  options.document = unrelated; options.provider = replacement;
  release();
  await vi.waitFor(() => expect(getCollaborationState(opened)?.status).toBe('connected'));
  expect(opened.getJSON()).toEqual(source.getJSON());
  expect(local.getXmlFragment('fountain').length).toBe(1);
  expect(Y.encodeStateAsUpdate(unrelated)).toEqual(before);
  expect(connected.connect).toHaveBeenCalledOnce();
  expect(replacement.connect).not.toHaveBeenCalled();
});
