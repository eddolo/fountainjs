// @vitest-environment node

import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, GapSelection, RangeSelection, Selection, composeExtensions, createEditor,
  getCollaborationState, insertText, redoCollaboration, setBlockType, setTextAlignment, undoCollaboration, type NodeJSON } from '../src';
import { createYjsCollaborationExtension, type YjsAwareness } from '../src/yjs';

const p = (text: string): NodeJSON => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const content: NodeJSON = { type: 'doc', content: [p('Alpha'),
  { type: 'image_super', attrs: { src: '/figure.png', alt: 'Figure' } }] };

function peers(source: NodeJSON = content) {
  const states = new Map<number, Record<string, unknown>>();
  const listeners = new Set<() => void>();
  const create = (ydoc: Y.Doc, id: string) => {
    const awareness: YjsAwareness = {
      clientID: ydoc.clientID,
      getLocalState: () => states.get(ydoc.clientID) ?? null,
      getStates: () => states,
      setLocalStateField: (field, value) => {
        states.set(ydoc.clientID, { ...states.get(ydoc.clientID), [field]: value });
        listeners.forEach(listener => listener());
      },
      on: (_event, listener) => { listeners.add(listener); },
      off: (_event, listener) => { listeners.delete(listener); },
    };
    const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({
      document: ydoc, awareness, presenceThrottleMs: 0, captureTimeout: 0,
      user: { id, name: id, color: '#a855f7' },
    })]);
    return createEditor({ schema: kit.schema, plugins: kit.plugins, content: source });
  };
  const leftDocument = new Y.Doc();
  const left = create(leftDocument, 'left');
  const rightDocument = new Y.Doc();
  Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'initial-sync');
  const right = create(rightDocument, 'right');
  return { left, right, leftDocument, rightDocument, states, sync: () => {
    const leftUpdate = Y.encodeStateAsUpdate(leftDocument), rightUpdate = Y.encodeStateAsUpdate(rightDocument);
    Y.applyUpdate(leftDocument, rightUpdate, 'right-peer');
    Y.applyUpdate(rightDocument, leftUpdate, 'left-peer');
  }, destroy: () => { left.destroy(); right.destroy(); leftDocument.destroy(); rightDocument.destroy(); } };
}

it.each([false, true])('preserves mixed range direction, presence and endpoints through remote edits (backward: %s)', backward => {
  const pair = peers();
  try {
    const { left, right } = pair;
    left.dispatch(left.createTransaction().setSelection(new RangeSelection(left.state.doc, backward ? 9 : 2, backward ? 2 : 9)));
    expect(getCollaborationState(right)?.presences[0]?.selection).toEqual({ anchor: backward ? 9 : 2, head: backward ? 2 : 9 });
    right.dispatch(right.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    expect(insertText(right, 'ZZ')).toBe(true);
    pair.sync();
    expect(left.getJSON()).toEqual(right.getJSON());
    expect(left.state.selection).toMatchObject({ kind: 'range', anchor: backward ? 11 : 4, head: backward ? 4 : 11 });
    expect(getCollaborationState(right)?.presences[0]?.selection).toEqual({ anchor: backward ? 11 : 4, head: backward ? 4 : 11 });
  } finally { pair.destroy(); }
});

it('keeps a text caret collapsed when a remote edit lands at exactly the same position', () => {
  const pair = peers();
  try {
    pair.left.dispatch(pair.left.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    pair.right.dispatch(pair.right.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(insertText(pair.right, 'Z')).toBe(true);
    pair.sync();
    expect(pair.left.state.doc.child(0).textContent).toBe('AlZpha');
    expect(pair.left.state.selection).toMatchObject({ kind: 'text', path: [0, 0], from: 3, to: 3 });
    expect(getCollaborationState(pair.right)?.presences[0]?.selection).toEqual({ anchor: 4, head: 4 });
  } finally { pair.destroy(); }
});

it.each([-1, 1] as const)('preserves a gap caret and its association across a remote block insertion (%s)', association => {
  const pair = peers();
  try {
    pair.left.dispatch(pair.left.createTransaction().setSelection(new GapSelection(pair.left.state.doc, 9, association)));
    const added = pair.right.state.schema.nodeFromJSON(p('Tail'));
    pair.right.dispatch(pair.right.createTransaction().replace(2, 2, [added]));
    pair.sync();
    const position = association < 0 ? 9 : 15;
    expect(pair.left.state.selection).toMatchObject({ kind: 'gap', position, association });
    expect(getCollaborationState(pair.right)?.presences[0]?.selection).toEqual({ anchor: position, head: position });
  } finally { pair.destroy(); }
});

it('restores a backward text-to-image range on collaborative undo while retaining remote text', () => {
  const pair = peers();
  try {
    const { left, right } = pair;
    left.dispatch(left.createTransaction().setSelection(new RangeSelection(left.state.doc, 9, 2)));
    expect(insertText(left, 'X')).toBe(true);
    pair.sync();
    right.dispatch(right.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    expect(insertText(right, 'R')).toBe(true);
    pair.sync();
    expect(undoCollaboration(left)).toBe(true);
    expect(left.state.doc.child(0).textContent).toBe('RAlpha');
    expect(left.state.doc.child(1).type.name).toBe('image_super');
    expect(left.state.selection).toMatchObject({ kind: 'range', anchor: 10, head: 3 });
    expect(redoCollaboration(left)).toBe(true);
    expect(left.state.doc.childCount).toBe(1);
    expect(left.state.doc.child(0).textContent).toBe('RAX');
    pair.sync();
    expect(left.getJSON()).toEqual(right.getJSON());
  } finally { pair.destroy(); }
});

it('runs model, schema, range transactions, extensions and collaboration without browser globals', () => {
  expect(typeof globalThis.document).toBe('undefined');
  expect(typeof globalThis.window).toBe('undefined');
  expect(typeof globalThis.MutationObserver).toBe('undefined');
  const pair = peers();
  try {
    pair.left.dispatch(pair.left.createTransaction().setSelection(new RangeSelection(pair.left.state.doc, 2, 9)));
    expect(insertText(pair.left, 'Server replacement')).toBe(true);
    pair.sync();
    expect(pair.left.state.doc.childCount).toBe(1);
    expect(pair.left.getJSON()).toEqual(pair.right.getJSON());
    expect(pair.left.state.schema.validate(pair.left.state.doc)).toBeUndefined();
  } finally { pair.destroy(); }
});

it('tracks a structural caret between inline atoms through a remote insertion', () => {
  const pair = peers({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'hard_break' }, { type: 'hard_break' }] }] });
  try {
    pair.left.dispatch(pair.left.createTransaction().setSelection(new RangeSelection(pair.left.state.doc, 3, 3)));
    pair.right.dispatch(pair.right.createTransaction().replaceRange(1, 1, 'Z'));
    pair.sync();
    expect(pair.left.state.selection).toMatchObject({ kind: 'range', anchor: 4, head: 4 });
    expect(getCollaborationState(pair.right)?.presences[0]?.selection).toEqual({ anchor: 4, head: 4 });
  } finally { pair.destroy(); }
});

it('tracks an insertion gap inside a retained quote, rather than anchoring it at the document root', () => {
  const pair = peers({ type: 'doc', content: [{ type: 'blockquote', content: content.content }] });
  try {
    pair.left.dispatch(pair.left.createTransaction().setSelection(new GapSelection(pair.left.state.doc, 10, -1)));
    const quote = pair.right.state.doc.child(0);
    pair.right.dispatch(pair.right.createTransaction().replaceNode([0], [quote.copy([
      ...quote.content, pair.right.state.schema.nodeFromJSON(p('Tail')),
    ])]));
    pair.sync();
    expect(pair.left.state.selection).toMatchObject({ kind: 'gap', position: 10, parentPath: [0], index: 2, association: -1 });
    expect(getCollaborationState(pair.right)?.presences[0]?.selection).toEqual({ anchor: 10, head: 10 });
  } finally { pair.destroy(); }
});

it.each([false, true])('retains peer caret/range positions through a remote text-block type change (range: %s)', range => {
  const pair = peers();
  try {
    const { left, right } = pair;
    const selection = range ? new RangeSelection(left.state.doc, 9, 3) : Selection.cursor([0, 0], 2);
    left.dispatch(left.createTransaction().setSelection(selection));
    right.dispatch(right.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    expect(setBlockType(right, 'heading', { level: 2 })).toBe(true);
    pair.sync();
    expect(left.state.doc.child(0).type.name).toBe('heading');
    expect(left.state.selection.eq(selection)).toBe(true);
    expect(getCollaborationState(right)?.presences[0]?.selection).toEqual(range ? { anchor: 9, head: 3 } : { anchor: 3, head: 3 });
  } finally { pair.destroy(); }
});

it('merges an offline character insertion with a concurrent heading conversion without dropping text', () => {
  const pair = peers();
  try {
    pair.left.dispatch(pair.left.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    pair.right.dispatch(pair.right.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    expect(insertText(pair.left, 'X')).toBe(true);
    expect(setBlockType(pair.right, 'heading', { level: 2 })).toBe(true);
    pair.sync();
    expect(pair.left.getJSON()).toEqual(pair.right.getJSON());
    expect(pair.left.state.doc.child(0).type.name).toBe('heading');
    expect(pair.left.state.doc.child(0).textContent).toBe('AlXpha');
    expect(pair.left.state.doc.child(1).type.name).toBe('image_super');
  } finally { pair.destroy(); }
});

it('retains shared text through an attribute/type/text command chain with concurrent offline typing', () => {
  const pair = peers();
  try {
    pair.left.dispatch(pair.left.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    pair.right.dispatch(pair.right.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    expect(insertText(pair.left, 'L')).toBe(true);
    const root = pair.rightDocument.getXmlFragment('fountain').get(0) as Y.XmlElement;
    const shared = root.get(0);
    expect(pair.right.runCommandBatch(() => setTextAlignment(pair.right, 'center')
      && setBlockType(pair.right, 'heading', { level: 2 }) && insertText(pair.right, 'R'))).toBe(true);
    expect(root.get(0)).toBe(shared);
    pair.sync();
    expect(pair.left.getJSON()).toEqual(pair.right.getJSON());
    expect(pair.left.state.doc.child(0).type.name).toBe('heading');
    expect(pair.left.state.doc.child(0).attrs.align).toBe('center');
    expect(pair.left.state.doc.child(0).textContent).toBe('RAlLpha');
  } finally { pair.destroy(); }
});

it('retains the changed shared block on the large-document greedy alignment path', () => {
  const pair = peers({ type: 'doc', content: Array.from({ length: 600 }, (_, index) => p(`Block ${index}`)) });
  try {
    pair.left.dispatch(pair.left.createTransaction().setSelection(Selection.cursor([599, 0], 2)));
    pair.right.dispatch(pair.right.createTransaction().setSelection(Selection.cursor([599, 0], 0)));
    const root = pair.rightDocument.getXmlFragment('fountain').get(0) as Y.XmlElement;
    const shared = root.get(599);
    expect(insertText(pair.left, 'X')).toBe(true);
    expect(setBlockType(pair.right, 'heading', { level: 2 })).toBe(true);
    expect(root.get(599)).toBe(shared);
    pair.sync();
    expect(pair.left.getJSON()).toEqual(pair.right.getJSON());
    expect(pair.left.state.doc.child(599).type.name).toBe('heading');
    expect(pair.left.state.doc.child(599).textContent).toBe('BlXock 599');
    expect(pair.left.state.doc.child(0).type.name).toBe('paragraph');
  } finally { pair.destroy(); }
});

it('does not infer conversion identity from equal text during an unrelated node replacement', () => {
  const pair = peers();
  try {
    const root = pair.rightDocument.getXmlFragment('fountain').get(0) as Y.XmlElement;
    const shared = root.get(0);
    const replacement = pair.right.state.schema.nodeFromJSON({ type: 'heading', attrs: { level: 2, id: 'new-entity' }, content: [{ type: 'text', text: 'Alpha' }] });
    pair.right.dispatch(pair.right.createTransaction().replaceNode([0], [replacement]));
    expect(root.get(0)).not.toBe(shared);
    pair.sync();
    expect(pair.left.getJSON()).toEqual(pair.right.getJSON());
    expect(pair.left.state.doc.child(0).attrs.id).toBe('new-entity');
  } finally { pair.destroy(); }
});

it('undoes and redoes local heading conversion without undoing a remote character insertion', () => {
  const pair = peers();
  try {
    pair.left.dispatch(pair.left.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    pair.right.dispatch(pair.right.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    expect(insertText(pair.left, 'X')).toBe(true);
    expect(setBlockType(pair.right, 'heading', { level: 2 })).toBe(true);
    pair.sync();
    expect(undoCollaboration(pair.right)).toBe(true);
    pair.sync();
    expect(pair.left.getJSON()).toEqual(pair.right.getJSON());
    expect(pair.left.state.doc.child(0).type.name).toBe('paragraph');
    expect(pair.left.state.doc.child(0).textContent).toBe('AlXpha');
    expect(redoCollaboration(pair.right)).toBe(true);
    pair.sync();
    expect(pair.left.getJSON()).toEqual(pair.right.getJSON());
    expect(pair.left.state.doc.child(0).type.name).toBe('heading');
    expect(pair.left.state.doc.child(0).textContent).toBe('AlXpha');
  } finally { pair.destroy(); }
});
