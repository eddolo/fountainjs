// @vitest-environment node

import { expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, Selection, canUndoCollaboration, composeExtensions, createEditor,
  getCollaborationState, insertText, reconnectCollaboration, undoCollaboration, type NodeJSON } from '../src';
import { YjsCollaborationAdapter, createYjsCollaborationExtension, type YjsCollaborationExtensionOptions } from '../src/yjs';
import { createYjsCollaborationExtension as createLegacyYjsCollaborationExtension } from '../src/yjs/legacy';
import { captureRetainedCheckpoint, restoreRetainedCheckpoint } from '../src/yjs/retained-checkpoint';

const user = { id: 'author', name: 'Author', color: '#7048e8' };
const content = (text: string): NodeJSON => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const make = (document: Y.Doc, text: string, options: Partial<YjsCollaborationExtensionOptions> = {},
  factory = createYjsCollaborationExtension) => {
  const kit = composeExtensions([CoreExtension, factory({ ...options, document, user })]);
  return createEditor({ schema: kit.schema, plugins: kit.plugins, content: content(text) });
};
const type = (editor: ReturnType<typeof make>, text: string) => {
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
  expect(insertText(editor, text)).toBe(true);
};

it('the default adapter creates a versioned retained room and reopens its checkpoint without a DOM', async () => {
  expect(typeof globalThis.document).toBe('undefined');
  expect(typeof globalThis.window).toBe('undefined');
  const doc = new Y.Doc(), editor = make(doc, 'Default document');
  try {
    expect(getCollaborationState(editor)?.status).toBe('connected');
    const gate = doc.getXmlFragment('fountain').get(0) as Y.XmlElement;
    expect(gate.nodeName).toBe('fountain-retained-room');
    expect(gate.getAttribute('format')).toBe('fountain-retained-document/3');
    type(editor, 'Saved ');
    const checkpoint = await captureRetainedCheckpoint(doc, editor.state.schema, 'adoption-v1');
    const restored = await restoreRetainedCheckpoint(checkpoint, editor.state.schema, 'adoption-v1');
    const reopened = make(restored.document, 'Unused seed');
    try {
      expect(getCollaborationState(reopened)?.status).toBe('connected');
      expect(reopened.getJSON()).toEqual(editor.getJSON());
      expect(canUndoCollaboration(reopened)).toBe(false);
    } finally { reopened.destroy(); restored.document.destroy(); }
  } finally { editor.destroy(); doc.destroy(); }
});

it('the default refuses existing XML bytes before starting transport and preserves the private draft', () => {
  const doc = new Y.Doc(), legacy = make(doc, 'Saved XML document', {}, createLegacyYjsCollaborationExtension);
  legacy.destroy();
  const before = Y.encodeStateAsUpdate(doc), provider = { connect: vi.fn(), disconnect: vi.fn() };
  const editor = make(doc, 'Private draft', { provider });
  try {
    expect(getCollaborationState(editor)?.status).toBe('error');
    expect(getCollaborationState(editor)?.error?.message).toContain('original shared data preserved');
    expect(editor.getText()).toBe('Private draft');
    expect(provider.connect).not.toHaveBeenCalled();
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    type(editor, 'Unsent ');
    expect(editor.getText()).toBe('Unsent Private draft');
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    expect(undoCollaboration(editor)).toBe(false);
  } finally { editor.destroy(); doc.destroy(); }
});

it('the explicit legacy entry still opens embedded XML without replacing its native fragment', () => {
  const doc = new Y.Doc(), fragment = new Y.XmlFragment();
  doc.getMap('workspace').set('body', fragment);
  const legacy = make(doc, 'Embedded XML document', { fragment }, createLegacyYjsCollaborationExtension);
  legacy.destroy();
  const before = Y.encodeStateAsUpdate(doc);
  expect(() => new YjsCollaborationAdapter({ document: doc, fragment, user })).toThrow(/named root fragment/);
  expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  const reopened = make(doc, 'Unused draft', { fragment }, createLegacyYjsCollaborationExtension);
  try {
    expect(getCollaborationState(reopened)?.status).toBe('connected');
    expect(reopened.getText()).toBe('Embedded XML document');
    expect(doc.getMap('workspace').get('body')).toBe(fragment);
    type(reopened, 'Updated ');
    expect(reopened.getText()).toBe('Updated Embedded XML document');
  } finally { reopened.destroy(); doc.destroy(); }
});

it('late legacy updates stop the default session without overwriting its draft or re-enabling shared history', () => {
  const doc = new Y.Doc(), editor = make(doc, 'Retained document');
  const legacyDoc = new Y.Doc(), legacy = make(legacyDoc, 'Legacy document', {}, createLegacyYjsCollaborationExtension);
  const repair = new Y.Doc();
  try {
    type(editor, 'Before conflict. ');
    expect(canUndoCollaboration(editor)).toBe(true);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(legacyDoc), 'legacy-provider');
    expect(getCollaborationState(editor)?.status).toBe('error');
    expect(editor.getText()).toBe('Before conflict. Retained document');
    const conflicted = Y.encodeStateAsUpdate(doc);
    type(editor, 'Private. ');
    expect(editor.getText()).toBe('Private. Before conflict. Retained document');
    expect(Y.encodeStateAsUpdate(doc)).toEqual(conflicted);
    expect(undoCollaboration(editor)).toBe(false);
    Y.applyUpdate(repair, conflicted);
    const fragment = repair.getXmlFragment('fountain');
    const legacyIndex = fragment.toArray().findIndex(value => value instanceof Y.XmlElement && value.nodeName === 'fountain-node');
    expect(legacyIndex).toBeGreaterThanOrEqual(0);
    fragment.delete(legacyIndex, 1);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(repair), 'root-repair');
    const repaired = Y.encodeStateAsUpdate(doc);
    reconnectCollaboration(editor);
    expect(getCollaborationState(editor)?.status).toBe('error');
    expect(editor.getText()).toBe('Private. Before conflict. Retained document');
    expect(canUndoCollaboration(editor)).toBe(false);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(repaired);
  } finally { editor.destroy(); legacy.destroy(); doc.destroy(); legacyDoc.destroy(); repair.destroy(); }
});

it('the default refuses a checkpoint for another namespace before transport or seeding', async () => {
  const source = new Y.Doc(), seed = make(source, 'Authoritative source');
  const target = new Y.Doc(), provider = { connect: vi.fn(), disconnect: vi.fn() };
  try {
    const checkpoint = await captureRetainedCheckpoint(source, seed.state.schema, 'adoption-v1');
    const before = Y.encodeStateAsUpdate(target);
    const editor = make(target, 'Unsynced draft', { fragmentName: 'another-room', provider,
      admission: { schemaVersion: 'adoption-v1', load: () => checkpoint } });
    try {
      await vi.waitFor(() => expect(getCollaborationState(editor)?.status).toBe('error'));
      expect(getCollaborationState(editor)?.error?.message).toContain('another namespace');
      expect(editor.getText()).toBe('Unsynced draft');
      expect(provider.connect).not.toHaveBeenCalled();
      expect(Y.encodeStateAsUpdate(target)).toEqual(before);
    } finally { editor.destroy(); }
  } finally { seed.destroy(); source.destroy(); target.destroy(); }
});

it.each(['', ' ', 'nested/room'])('the default rejects an invalid named namespace before writing (%j)', fragmentName => {
  const doc = new Y.Doc(), before = Y.encodeStateAsUpdate(doc);
  try {
    expect(() => new YjsCollaborationAdapter({ document: doc, user, fragmentName })).toThrow(/named root fragment/);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  } finally { doc.destroy(); }
});

it('an empty-looking default room with unresolved update dependencies is never initialized over', () => {
  const source = new Y.Doc(), seed = make(source, 'Existing source');
  const target = new Y.Doc(), provider = { connect: vi.fn(), disconnect: vi.fn() };
  const updates: Uint8Array[] = [];
  try {
    source.on('update', value => updates.push(value));
    type(seed, 'Remote ');
    expect(updates.length).toBeGreaterThan(0);
    updates.forEach(update => Y.applyUpdate(target, update));
    expect(target.store.pendingStructs).not.toBeNull();
    const before = Y.encodeStateAsUpdate(target), editor = make(target, 'Local draft', { provider });
    try {
      expect(getCollaborationState(editor)?.status).toBe('error');
      expect(getCollaborationState(editor)?.error?.message).toContain('unresolved update dependencies');
      expect(editor.getText()).toBe('Local draft');
      expect(provider.connect).not.toHaveBeenCalled();
      expect(Y.encodeStateAsUpdate(target)).toEqual(before);
    } finally { editor.destroy(); }
  } finally { seed.destroy(); source.destroy(); target.destroy(); }
});
