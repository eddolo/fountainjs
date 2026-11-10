// @vitest-environment node
import { expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, Selection, composeExtensions, createEditor, getCollaborationState, redoCollaboration, splitBlock, undoCollaboration, type NodeJSON, type Transaction } from '../src';
import { RetainedDocumentStore } from '../src/yjs/retained-document';
import { createYjsCollaborationExtension } from '../src/yjs';

const paragraph = (text: string): NodeJSON => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const marked = (): NodeJSON => ({ type: 'paragraph', content: [
  { type: 'text', text: 'Before ' }, { type: 'text', text: 'marked', marks: [{ type: 'em' }], attrs: { source: 'technical' } },
  { type: 'text', text: ' after' },
] });
const content = (): NodeJSON => ({ type: 'doc', content: [paragraph('Alpha'), ...Array.from({ length: 24 }, marked), paragraph('')] });

function fixture(value: NodeJSON, prefix: string, update?: Uint8Array) {
  const document = new Y.Doc(), kit = composeExtensions([CoreExtension]);
  let sequence = 0, transaction: Transaction | undefined;
  const editor = createEditor({ schema: kit.schema, content: value, onUpdate: (_state, next) => { if (next.docChanged) transaction = next; } });
  const store = new RetainedDocumentStore(document, 'reconcile', editor.state.schema, () => `${prefix}-${sequence++}`);
  if (update) { Y.applyUpdate(document, update); store.read(); } else store.seed(editor.state.doc);
  return { document, editor, store, apply: () => store.apply(transaction!),
    destroy: () => { editor.destroy(); store.destroy(); document.destroy(); } };
}

it.each([0, 2, 5])('does not resolve untouched multi-leaf siblings when splitting at %s', offset => {
  const pair = fixture(content(), 'writer'), original = pair.editor.getJSON();
  const unchanged = pair.store.nodes.childrenOf('root').slice(1);
  const streams = new Set(unchanged.flatMap(id => [...pair.store.nodes.childrenOf(id)]));
  const placements = unchanged.map(id => pair.store.nodes.placementIdentity(id));
  const resolve = vi.spyOn(pair.store.text, 'resolve');
  try {
    pair.editor.dispatch(pair.editor.createTransaction().setSelection(Selection.cursor([0, 0], offset)));
    expect(splitBlock(pair.editor)).toBe(true);
    expect(pair.apply().toJSON()).toEqual(pair.editor.getJSON());
    expect(pair.store.read().toJSON()).toEqual(pair.editor.getJSON());
    expect(pair.store.read().content.slice(2).map(node => node.toJSON())).toEqual(original.content!.slice(1));
    expect(unchanged.map(id => pair.store.nodes.placementIdentity(id))).toEqual(placements);
    // Reconciliation must not perform relative-position resolution for every
    // unchanged marked leaf merely because a different paragraph was split.
    expect(resolve.mock.results.filter(result => result.type === 'return' && result.value && streams.has(result.value.id))).toHaveLength(0);
  } finally { resolve.mockRestore(); pair.destroy(); }
});

it('preserves unchanged nested text groups when an item split moves their ancestor', () => {
  const value: NodeJSON = { type: 'doc', content: [{ type: 'bullet_list', content: [{ type: 'list_item', content: [
    marked(), paragraph('Alpha'), marked(), paragraph(''),
  ] }] }, marked()] };
  const pair = fixture(value, 'nested'), original = pair.editor.getJSON();
  try {
    pair.editor.dispatch(pair.editor.createTransaction().setSelection(Selection.cursor([0, 0, 1, 0], 2)));
    expect(splitBlock(pair.editor)).toBe(true);
    expect(pair.apply().toJSON()).toEqual(pair.editor.getJSON());
    expect(pair.store.read().toJSON()).toEqual(pair.editor.getJSON());
    const items = pair.store.read().child(0).content;
    expect(items[0].child(0).toJSON()).toEqual(original.content![0].content![0].content![0]);
    expect(items[1].child(1).toJSON()).toEqual(original.content![0].content![0].content![2]);
  } finally { pair.destroy(); }
});

it.each([false, true])('keeps offline sibling edits and author undo through selective split reconciliation (reverse: %s)', reverse => {
  const leftDoc = new Y.Doc(), rightDoc = new Y.Doc(); leftDoc.clientID = 101; rightDoc.clientID = 202;
  const make = (document: Y.Doc, id: string) => {
    const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, captureTimeout: 0,
      user: { id, name: id, color: '#a855f7' } })]);
    return createEditor({ schema: kit.schema, plugins: kit.plugins, content: content() });
  };
  const left = make(leftDoc, 'left'); Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc), 'seed'); const right = make(rightDoc, 'right');
  const sync = () => {
    const a = Y.encodeStateAsUpdate(leftDoc), b = Y.encodeStateAsUpdate(rightDoc);
    if (reverse) { Y.applyUpdate(rightDoc, a, 'peer'); Y.applyUpdate(leftDoc, b, 'peer'); }
    else { Y.applyUpdate(leftDoc, b, 'peer'); Y.applyUpdate(rightDoc, a, 'peer'); }
    for (const editor of [left, right]) expect(getCollaborationState(editor)?.status, getCollaborationState(editor)?.error?.message).toBe('connected');
    expect(left.getJSON()).toEqual(right.getJSON());
  };
  try {
    left.dispatch(left.createTransaction().insertText([1, 1], 3, 'X').insertText([25, 0], 0, 'Empty now typed'));
    right.dispatch(right.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(splitBlock(right)).toBe(true); sync();
    const merged = right.getJSON();
    expect(right.state.doc.child(2).child(1).text).toBe('marXked');
    expect(right.state.doc.content.at(-1)!.textContent).toBe('Empty now typed');
    expect(undoCollaboration(right)).toBe(true); sync();
    expect(right.state.doc.child(0).textContent).toBe('Alpha');
    expect(right.state.doc.child(1).child(1).text).toBe('marXked');
    expect(right.state.doc.content.at(-1)!.textContent).toBe('Empty now typed');
    expect(redoCollaboration(right)).toBe(true); sync(); expect(right.getJSON()).toEqual(merged);
  } finally { left.destroy(); right.destroy(); leftDoc.destroy(); rightDoc.destroy(); }
});
