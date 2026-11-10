// @vitest-environment node

import { afterEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, composeExtensions, createEditor, getCollaborationState, insertText,
  reconnectCollaboration, undoCollaboration, type NodeJSON } from '../src';
import { createYjsCollaborationExtension } from '../src/yjs';
import { createYjsCollaborationExtension as legacy } from '../src/yjs/legacy';
import { createRetainedYjsCollaborationExtension } from '../src/yjs/retained-adapter';
import { captureRetainedCheckpoint } from '../src/yjs/retained-checkpoint';

const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });
const user = { id: 'author', name: 'Author', color: '#7048e8' };
const content = (text: string): NodeJSON => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
function doc() { const value = new Y.Doc(); cleanup.push(() => value.destroy()); return value; }
function editor(document: Y.Doc, text: string, factory = createYjsCollaborationExtension,
  extra: Partial<Parameters<typeof createYjsCollaborationExtension>[0]> = {}) {
  const kit = composeExtensions([CoreExtension, factory({ ...extra, document, user })]);
  const value = createEditor({ schema: kit.schema, plugins: kit.plugins, content: content(text) });
  cleanup.push(() => value.destroy());
  return value;
}

it.each([
  { name: 'default', factory: createYjsCollaborationExtension, autoConnect: true },
  { name: 'default', factory: createYjsCollaborationExtension, autoConnect: false },
  { name: 'experimental', factory: createRetainedYjsCollaborationExtension, autoConnect: true },
  { name: 'experimental', factory: createRetainedYjsCollaborationExtension, autoConnect: false },
])('$name never seeds a fresh provider client into an existing legacy remote (autoConnect=$autoConnect)', ({ factory, autoConnect }) => {
  const remote = doc(), saved = editor(remote, 'Stored legacy document', legacy);
  const local = doc(), remoteBytes = Y.encodeStateAsUpdate(remote), localBytes = Y.encodeStateAsUpdate(local);
  // Some provider implementations subscribe before connect. Even a locally
  // generated seed must be absent, not merely withheld by provider.connect().
  const eagerForward = vi.fn((update: Uint8Array) => Y.applyUpdate(remote, update, 'eager-provider'));
  local.on('update', eagerForward);
  const provider = { connect: vi.fn(() => {
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local), 'provider');
    Y.applyUpdate(local, Y.encodeStateAsUpdate(remote), 'provider');
  }), disconnect: vi.fn() };
  const opened = editor(local, 'Private draft', factory, { provider, autoConnect });
  if (!autoConnect) {
    expect(getCollaborationState(opened)?.status).toBe('disconnected');
    expect(reconnectCollaboration(opened)).toBe(false);
  }
  expect(getCollaborationState(opened)?.status).toBe('error');
  expect(getCollaborationState(opened)?.error?.message).toContain('before admission');
  expect(opened.getText()).toBe('Private draft');
  expect(insertText(opened, 'Unsent ')).toBe(true);
  const privateDraft = opened.getJSON();
  expect(reconnectCollaboration(opened)).toBe(false);
  expect(getCollaborationState(opened)?.status).toBe('error');
  expect(opened.getJSON()).toEqual(privateDraft);
  expect(undoCollaboration(opened)).toBe(false);
  expect(provider.connect).not.toHaveBeenCalled();
  expect(eagerForward).not.toHaveBeenCalled();
  expect(Y.encodeStateAsUpdate(local)).toEqual(localBytes);
  expect(Y.encodeStateAsUpdate(remote)).toEqual(remoteBytes);
  expect(getCollaborationState(saved)?.status).toBe('connected');
  expect(saved.getText()).toBe('Stored legacy document');
});

it('starts a fresh provider client only after its retained checkpoint has been admitted', async () => {
  const remote = doc(), source = editor(remote, 'Authoritative retained document');
  const checkpoint = await captureRetainedCheckpoint(remote, source.state.schema, 'provider-init-v1');
  const local = doc(), before = Y.encodeStateAsUpdate(local);
  let allow!: () => void;
  const waiting = new Promise<void>(resolve => { allow = resolve; });
  const provider = { connect: vi.fn(() => {
    expect(local.getXmlFragment('fountain').length).toBe(1);
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local), 'provider');
    Y.applyUpdate(local, Y.encodeStateAsUpdate(remote), 'provider');
  }) };
  const opened = editor(local, 'Local template', createYjsCollaborationExtension, {
    provider, admission: { schemaVersion: 'provider-init-v1', load: async () => { await waiting; return checkpoint; } },
  });
  expect(getCollaborationState(opened)?.status).toBe('connecting');
  expect(Y.encodeStateAsUpdate(local)).toEqual(before);
  expect(provider.connect).not.toHaveBeenCalled();
  allow();
  await vi.waitFor(() => expect(getCollaborationState(opened)?.status).toBe('connected'));
  expect(provider.connect).toHaveBeenCalledOnce();
  expect(opened.getJSON()).toEqual(source.getJSON());
  expect(remote.getXmlFragment('fountain').length).toBe(1);
});

it('keeps host-managed initialized retained rooms usable with a disconnected provider', () => {
  const remote = doc(), source = editor(remote, 'Already prepared room'), local = doc();
  Y.applyUpdate(local, Y.encodeStateAsUpdate(remote));
  const provider = { connect: vi.fn() };
  const opened = editor(local, 'Unused template', createYjsCollaborationExtension, { provider });
  expect(getCollaborationState(opened)?.status).toBe('connected');
  expect(provider.connect).toHaveBeenCalledOnce();
  expect(opened.getJSON()).toEqual(source.getJSON());
});
