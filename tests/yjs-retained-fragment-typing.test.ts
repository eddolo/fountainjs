// @vitest-environment node
import { expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, EditorState, Selection, composeExtensions, createEditor, createHistoryPlugin,
  splitBlock, undo, type Transaction } from '../src';
import { ReplaceTextStep } from '../src/core/transaction/replace-text-step';
import { RetainedDocumentStore } from '../src/yjs/retained-document';

class GeneralTextStep extends ReplaceTextStep {
  override apply(document: Parameters<ReplaceTextStep['apply']>[0]) { return super.apply(document); }
}

function fixture(kind: 'split' | 'format' = 'split') {
  const document = new Y.Doc(); document.clientID = 101;
  const kit = composeExtensions([CoreExtension]);
  let sequence = 0, latest: Transaction | undefined;
  const editor = createEditor({ schema: kit.schema, plugins: [createHistoryPlugin({ newGroupDelay: 0 })],
    content: { type: 'doc', attrs: { retain: 'root metadata' }, content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'AlphaOmega' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Untouched', marks: [{ type: 'em' }] }] },
    ] }, onUpdate: (_state, transaction) => { if (transaction.docChanged) latest = transaction; } });
  const store = new RetainedDocumentStore(document, 'fragments', editor.state.schema, () => `fragment-${sequence++}`);
  store.seed(editor.state.doc);
  if (kind === 'split') {
    // An ordinary split followed by model-history undo retains the two physical
    // text partitions while projecting the original single visible leaf again.
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 5)));
    expect(splitBlock(editor)).toBe(true); store.apply(latest!);
    expect(undo(editor)).toBe(true); store.apply(latest!);
  } else {
    editor.dispatch(editor.createTransaction().addMarkRange([0, 0], 0, [0, 0], 5, editor.state.schema.mark('strong'))); store.apply(latest!);
    editor.dispatch(editor.createTransaction().removeMarkRange([0, 0], 0, [0, 0], 5, editor.state.schema.marks.strong)); store.apply(latest!);
  }
  const model = store.read();
  expect(model.toJSON()).toEqual(editor.getJSON());
  expect(model.child(0).childCount).toBe(kind === 'split' ? 1 : 2);
  const parent = store.identity([0])!, fields = store.nodes.childrenOf(parent);
  expect(fields).toHaveLength(kind === 'split' ? 2 : 1);
  if (kind === 'split') {
    expect(store.text.project(fields[0]).runs.map(run => run.text).join('')).toBe('Alpha');
    expect(store.text.project(fields[1]).runs.map(run => run.text).join('')).toBe('Omega');
  } else expect(store.text.project(fields[0]).runs.map(run => run.text)).toEqual(['Alpha', 'Omega']);
  const history = new Y.UndoManager([...store.scope], { captureTimeout: 0 });
  return { document, editor, store, history, fields, parent,
    transaction: () => EditorState.create({ schema: editor.state.schema, doc: store.read() }).createTransaction(),
    destroy: () => { history.destroy(); store.destroy(); editor.destroy(); document.destroy(); } };
}

it.each(['X', '👩‍💻e\u0301\u200B'])('appends %j to the final wire run without structural reconciliation', text => {
  const direct = fixture('format'), general = fixture('format'), resolve = vi.spyOn(direct.store.text, 'resolve');
  try {
    const before = direct.store.read().toJSON(), identity = direct.store.identity([0]);
    const earlier = direct.store.textAnchor([0, 0], 2, 1), trailing = direct.store.textAnchor([0, 1], 5, 1);
    const a = direct.transaction().step(new ReplaceTextStep([0, 1], 5, 5, text));
    const b = general.transaction().step(new GeneralTextStep([0, 1], 5, 5, text));
    expect(direct.store.apply(a).toJSON()).toEqual(a.doc.toJSON()); general.store.apply(b);
    expect(resolve).not.toHaveBeenCalled();
    expect(Y.encodeStateAsUpdate(direct.document)).toEqual(Y.encodeStateAsUpdate(general.document));
    expect(direct.store.identity([0])).toBe(identity);
    expect(direct.store.resolveTextAnchor(earlier)).toEqual({ path: [0, 0], offset: 2 });
    expect(direct.store.resolveTextAnchor(trailing)).toEqual({ path: [0, 1], offset: 5 + text.length });
    for (const pair of [direct, general]) { expect(pair.history.undo()).not.toBeNull(); expect(pair.store.read().toJSON()).toEqual(before); }
    expect(Y.encodeStateAsUpdate(direct.document)).toEqual(Y.encodeStateAsUpdate(general.document));
    for (const pair of [direct, general]) { expect(pair.history.redo()).not.toBeNull(); expect(pair.store.read().toJSON()).toEqual(a.doc.toJSON()); }
    expect(Y.encodeStateAsUpdate(direct.document)).toEqual(Y.encodeStateAsUpdate(general.document));
  } finally { resolve.mockRestore(); direct.destroy(); general.destroy(); }
});

it.each([
  { name: 'partial run prefix', path: [0, 1], from: 0, to: 0, text: 'X' },
  { name: 'partial run interior', path: [0, 1], from: 2, to: 2, text: 'X' },
  { name: 'partial run deletion', path: [0, 1], from: 1, to: 3, text: '' },
  { name: 'following model leaf', path: [0, 0], from: 5, to: 5, text: 'X' },
])('leaves $name to the general path', row => {
  const direct = fixture('format'), general = fixture('format'), resolve = vi.spyOn(direct.store.text, 'resolve');
  try {
    const a = direct.transaction().step(new ReplaceTextStep(row.path, row.from, row.to, row.text));
    const b = general.transaction().step(new GeneralTextStep(row.path, row.from, row.to, row.text));
    expect(direct.store.apply(a).toJSON()).toEqual(a.doc.toJSON()); general.store.apply(b);
    expect(resolve).toHaveBeenCalled();
    expect(Y.encodeStateAsUpdate(direct.document)).toEqual(Y.encodeStateAsUpdate(general.document));
  } finally { resolve.mockRestore(); direct.destroy(); general.destroy(); }
});

it.each([
  { name: 'ambiguous shared boundary', from: 5, to: 5, text: 'X' },
  { name: 'cross-partition replacement', from: 3, to: 7, text: 'X' },
])('keeps $name on the general path', row => {
  const direct = fixture(), general = fixture(), resolve = vi.spyOn(direct.store.text, 'resolve');
  try {
    const a = direct.transaction().step(new ReplaceTextStep([0, 0], row.from, row.to, row.text));
    const b = general.transaction().step(new GeneralTextStep([0, 0], row.from, row.to, row.text));
    expect(direct.store.apply(a).toJSON()).toEqual(a.doc.toJSON()); general.store.apply(b);
    expect(resolve).toHaveBeenCalled();
    expect(Y.encodeStateAsUpdate(direct.document)).toEqual(Y.encodeStateAsUpdate(general.document));
  } finally { resolve.mockRestore(); direct.destroy(); general.destroy(); }
});

it('keeps later appends native after additional formatting fragments the physical stream again', () => {
  const direct = fixture('format'), general = fixture('format'), resolve = vi.spyOn(direct.store.text, 'resolve');
  try {
    for (let cycle = 0; cycle < 3; cycle++) {
      const leaf = direct.store.read().child(0).childCount - 1, path = [0, leaf];
      for (const character of ' xyz') {
        const offset = direct.store.read().child(0).child(leaf).nodeSize;
        const a = direct.transaction().step(new ReplaceTextStep(path, offset, offset, character));
        const b = general.transaction().step(new GeneralTextStep(path, offset, offset, character));
        resolve.mockClear();
        expect(direct.store.apply(a).toJSON()).toEqual(a.doc.toJSON()); general.store.apply(b);
        expect(resolve).not.toHaveBeenCalled();
        expect(Y.encodeStateAsUpdate(direct.document)).toEqual(Y.encodeStateAsUpdate(general.document));
      }
      for (const pair of [direct, general]) {
        pair.store.apply(pair.transaction().addMarkRange(path, 0, path, 2, pair.editor.state.schema.mark('strong')));
        pair.store.apply(pair.transaction().removeMarkRange(path, 0, path, 2, pair.editor.state.schema.marks.strong));
      }
      expect(Y.encodeStateAsUpdate(direct.document)).toEqual(Y.encodeStateAsUpdate(general.document));
    }
  } finally { resolve.mockRestore(); direct.destroy(); general.destroy(); }
});

it('does not reuse the append projection when a foreign write changes another stream', () => {
  const pair = fixture('format'), insert = pair.store.text.insert.bind(pair.store.text);
  try {
    const sibling = pair.store.nodes.childrenOf(pair.store.identity([1])!)[0];
    pair.store.text.insert = (...args) => { insert(...args); pair.store.text.delete(sibling, 0, 1); };
    const transaction = pair.transaction().insertText([0, 1], 5, 'X');
    expect(() => pair.store.apply(transaction)).toThrow('Retained transaction changed the native document shape.');
    expect(pair.store.read().child(1).textContent).toBe('ntouched');
  } finally { pair.destroy(); }
});
