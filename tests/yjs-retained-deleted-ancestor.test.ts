// @vitest-environment node
import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, Selection, composeExtensions, createEditor, getCollaborationState, insertText, redoCollaboration,
  splitBlock, undoCollaboration, type NodeJSON } from '../src';
import { createRetainedYjsCollaborationExtension } from '../src/yjs/retained-adapter';
import { RetainedNodeStore } from '../src/yjs/retained-nodes';
import { captureRetainedCheckpoint, restoreRetainedCheckpoint } from '../src/yjs/retained-checkpoint';

const paragraph = (text: string): NodeJSON => ({ type: 'paragraph', content: [{ type: 'text', text }] });

for (const kind of ['quote', 'nested quote', 'list'] as const) for (const reverse of [false, true]) {
  it(`keeps an offline split below a deleted ${kind} recoverable through author undo and reopen (${reverse})`, async () => {
    const block: NodeJSON = kind === 'list'
      ? { type: 'bullet_list', content: [{ type: 'list_item', content: [paragraph('Alpha')] }] }
      : { type: 'blockquote', content: [kind === 'nested quote' ? { type: 'blockquote', content: [paragraph('Alpha')] } : paragraph('Alpha')] };
    const path = kind === 'quote' ? [0, 0, 0] : [0, 0, 0, 0];
    const source: NodeJSON = { type: 'doc', content: [block, paragraph('Survivor')] };
    const a = new Y.Doc(), b = new Y.Doc();
    a.clientID = reverse ? 202 : 101; b.clientID = reverse ? 101 : 202;
    const make = (document: Y.Doc, id: string) => {
      const kit = composeExtensions([CoreExtension, createRetainedYjsCollaborationExtension({ document, captureTimeout: 0,
        user: { id, name: id, color: '#a855f7' } })]);
      return createEditor({ schema: kit.schema, plugins: kit.plugins, content: source });
    };
    const left = make(a, 'left'); Y.applyUpdate(b, Y.encodeStateAsUpdate(a)); const right = make(b, 'right');
    const records = new Map(a.getMap('fountain-nodes:nodes'));
    let reopened: Awaited<ReturnType<typeof restoreRetainedCheckpoint>> | undefined;
    let reopenedEditor: ReturnType<typeof make> | undefined;
    const sync = () => {
      const updates = [Y.encodeStateAsUpdate(a), Y.encodeStateAsUpdate(b)];
      if (reverse) updates.reverse();
      for (const doc of [a, b, ...(reopened ? [reopened.document] : [])]) for (const update of updates) Y.applyUpdate(doc, update, 'peer');
      for (const editor of [left, right, ...(reopenedEditor ? [reopenedEditor] : [])]) {
        const state = getCollaborationState(editor);
        expect(state?.status, state?.error?.message).toBe('connected'); expect(editor.getJSON()).toEqual(left.getJSON());
      }
      for (const [id, record] of records) expect(a.getMap('fountain-nodes:nodes').get(id)).toBe(record);
    };
    const hidden = () => { sync(); expect(left.state.doc.childCount).toBe(1); expect(left.state.doc.textContent).toBe('Survivor'); };
    try {
      expect(left.dispatch(left.createTransaction().replace(0, 1, []))).toBe(true);
      right.dispatch(right.createTransaction().setSelection(Selection.cursor(path, 2))); expect(splitBlock(right)).toBe(true);
      expect(insertText(right, 'X')).toBe(true);
      expect(right.state.doc.child(0).textContent).toBe('AlXpha');
      hidden();
      const checkpoint = await captureRetainedCheckpoint(a, left.state.schema, 'deleted-ancestor-audit');
      reopened = await restoreRetainedCheckpoint(checkpoint, left.state.schema, 'deleted-ancestor-audit');
      reopenedEditor = make(reopened.document, 'reopened'); hidden();
      expect(undoCollaboration(left)).toBe(true); sync(); expect(left.state.doc.child(0).textContent).toBe('AlXpha');
      expect(redoCollaboration(left)).toBe(true); hidden();
      expect(undoCollaboration(right)).toBe(true); hidden();
      expect(undoCollaboration(right)).toBe(true); hidden();
      expect(undoCollaboration(left)).toBe(true); sync(); expect(left.state.doc.child(0).textContent).toBe('Alpha');
      expect(redoCollaboration(right)).toBe(true); sync(); expect(left.state.doc.child(0).textContent).toBe('Alpha');
      expect(redoCollaboration(right)).toBe(true); sync(); expect(left.state.doc.child(0).textContent).toBe('AlXpha');
    } finally { reopenedEditor?.destroy(); reopened?.document.destroy(); left.destroy(); right.destroy(); a.destroy(); b.destroy(); }
  });
}

it.each(['unknown parent', 'missing live reference', 'malformed placement'] as const)('does not excuse a genuine orphan with %s', kind => {
  const document = new Y.Doc(); let sequence = 0;
  const store = new RetainedNodeStore(document, 'orphan', () => `local-${sequence++}`);
  try {
    const parent = store.create({ type: 'blockquote' });
    const child = store.create({ type: 'paragraph' }, parent);
    store.remove(parent);
    const placements = document.getMap('orphan:placements');
    if (kind === 'unknown parent') placements.set(child, { parent: 'missing-parent', token: 'missing-token' });
    if (kind === 'malformed placement') placements.set(child, { parent, token: 42 });
    if (kind === 'missing live reference') {
      const record = document.getMap('orphan:nodes').get(parent) as Y.Map<unknown>;
      (record.get('children') as Y.Array<unknown>).delete(0, 1);
    }
    if (kind === 'malformed placement') expect(() => store.project()).toThrow('Invalid retained placement.');
    else expect(store.project().issues).toContainEqual({ kind: 'unattached', id: child });
  } finally { document.destroy(); }
});

it.each([false, true])('keeps a peer split recoverable when the parent insertion is undone (%s)', async reverse => {
  const a = new Y.Doc(), b = new Y.Doc();
  const make = (document: Y.Doc, id: string) => {
    const kit = composeExtensions([CoreExtension, createRetainedYjsCollaborationExtension({ document, captureTimeout: 0,
      user: { id, name: id, color: '#a855f7' } })]);
    return createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content: [paragraph('Survivor')] } });
  };
  const left = make(a, 'left'); Y.applyUpdate(b, Y.encodeStateAsUpdate(a)); const right = make(b, 'right');
  let reopened: Awaited<ReturnType<typeof restoreRetainedCheckpoint>> | undefined;
  let reopenedEditor: ReturnType<typeof make> | undefined;
  const sync = () => {
    const updates = [Y.encodeStateAsUpdate(a), Y.encodeStateAsUpdate(b)]; if (reverse) updates.reverse();
    for (const document of [a, b, ...(reopened ? [reopened.document] : [])]) for (const update of updates) Y.applyUpdate(document, update, 'peer');
    for (const editor of [left, right, ...(reopenedEditor ? [reopenedEditor] : [])]) {
      expect(getCollaborationState(editor)?.status, getCollaborationState(editor)?.error?.message).toBe('connected');
      expect(editor.getJSON()).toEqual(left.getJSON());
    }
    expect(left.getJSON()).toEqual(right.getJSON());
  };
  try {
    const quote = left.state.schema.nodeFromJSON({ type: 'blockquote', content: [paragraph('Alpha')] });
    expect(left.dispatch(left.createTransaction().replace(0, 0, [quote]))).toBe(true); sync();
    const allocations = [...a.getMap('fountain-nodes:nodes'), ...a.getMap('fountain-text:texts')];
    expect(undoCollaboration(left)).toBe(true);
    right.dispatch(right.createTransaction().setSelection(Selection.cursor([0, 0, 0], 2))); expect(splitBlock(right)).toBe(true);
    expect(insertText(right, 'X')).toBe(true); sync(); expect(left.state.doc.textContent).toBe('Survivor');
    const checkpoint = await captureRetainedCheckpoint(a, left.state.schema, 'inserted-parent-audit');
    reopened = await restoreRetainedCheckpoint(checkpoint, left.state.schema, 'inserted-parent-audit');
    reopenedEditor = make(reopened.document, 'reopened'); sync();
    expect(redoCollaboration(left)).toBe(true); sync(); expect(left.state.doc.child(0).textContent).toBe('AlXpha');
    for (const [id, allocation] of allocations) expect(a.getMap('fountain-nodes:nodes').get(id) ?? a.getMap('fountain-text:texts').get(id)).toBe(allocation);
    expect(undoCollaboration(left)).toBe(true); sync(); expect(left.state.doc.textContent).toBe('Survivor');
    expect(undoCollaboration(right)).toBe(true); sync(); expect(left.state.doc.textContent).toBe('Survivor');
    expect(undoCollaboration(right)).toBe(true); sync(); expect(left.state.doc.textContent).toBe('Survivor');
    expect(redoCollaboration(left)).toBe(true); sync(); expect(left.state.doc.child(0).textContent).toBe('Alpha');
    expect(redoCollaboration(right)).toBe(true); sync(); expect(left.state.doc.child(0).textContent).toBe('Alpha');
    expect(redoCollaboration(right)).toBe(true); sync(); expect(left.state.doc.child(0).textContent).toBe('AlXpha');
  } finally { reopenedEditor?.destroy(); reopened?.document.destroy(); left.destroy(); right.destroy(); a.destroy(); b.destroy(); }
});
