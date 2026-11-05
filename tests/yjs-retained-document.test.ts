// @vitest-environment node
import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, MathExtension, ReplaceDocumentStep, Selection, composeExtensions, createEditor, createHistoryPlugin, defineExtension, setMark, splitBlock, toggleList, toggleQuote, undo, redo,
  type NodeJSON, type Transaction } from '../src';
import { RetainedDocumentStore } from '../src/yjs/retained-document';

const factory = (prefix: string) => { let index = 0; return () => `${prefix}-${index++}`; };
const source: NodeJSON = { type: 'doc', attrs: { audit: { keep: true } }, content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
  { type: 'image_super', attrs: { src: '/figure.png', alt: 'Figure' } },
] };
function fixture(content: NodeJSON = source, clientID = 101, extensions: Parameters<typeof composeExtensions>[0] = [CoreExtension]) {
  const kit = composeExtensions(extensions), doc = new Y.Doc();
  doc.clientID = clientID;
  const transactions: Transaction[] = [];
  const editor = createEditor({ schema: kit.schema, content, plugins: [createHistoryPlugin({ newGroupDelay: 0 })], onUpdate: (_state, transaction) => {
    if (transaction.docChanged) transactions.push(transaction);
  } });
  const store = new RetainedDocumentStore(doc, 'candidate', editor.state.schema, factory('left'));
  store.seed(editor.state.doc);
  return { doc, editor, store, transactions, apply: () => store.apply(transactions.at(-1)!),
    destroy: () => { editor.destroy(); store.destroy(); doc.destroy(); } };
}
function peers(content = source, reverseIDs = false) {
  const left = fixture(content, reverseIDs ? 202 : 101), doc = new Y.Doc();
  doc.clientID = reverseIDs ? 101 : 202;
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(left.doc));
  const kit = composeExtensions([CoreExtension]), transactions: Transaction[] = [];
  const editor = createEditor({ schema: kit.schema, content: left.editor.getJSON(), onUpdate: (_state, transaction) => {
    if (transaction.docChanged) transactions.push(transaction);
  } });
  const store = new RetainedDocumentStore(doc, 'candidate', editor.state.schema, factory('right'));
  store.read();
  return { left, right: { doc, editor, store, apply: () => store.apply(transactions.at(-1)!) }, sync: (reverse: boolean) => {
    const a = Y.encodeStateAsUpdate(left.doc), b = Y.encodeStateAsUpdate(doc);
    if (reverse) { Y.applyUpdate(doc, a, 'peer'); Y.applyUpdate(left.doc, b, 'peer'); }
    else { Y.applyUpdate(left.doc, b, 'peer'); Y.applyUpdate(doc, a, 'peer'); }
  }, destroy: () => { left.destroy(); editor.destroy(); store.destroy(); doc.destroy(); } };
}

it('round-trips the exact native model, including adjacent identical leaves, empty leaves and inert metadata keys', () => {
  const attrs = JSON.parse('{"__proto__":{"preserved":true},"constructor":"data","":"empty-name","\\ud800":"unpaired-key"}');
  const pair = fixture({ type: 'doc', attrs, content: [{ type: 'paragraph', content: [
    { type: 'text', text: '', attrs }, { type: 'text', text: 'A\u200b😀', marks: [{ type: 'strong' }] },
    { type: 'text', text: 'B', marks: [{ type: 'strong' }] }, { type: 'text', text: '' },
    { type: 'hard_break' }, { type: 'text', text: 'C', attrs },
  ] }, source.content![1]] });
  try {
    expect(pair.store.read().toJSON()).toEqual(pair.editor.getJSON());
    const saved = new Y.Doc();
    try {
      Y.applyUpdate(saved, Y.encodeStateAsUpdate(pair.doc));
      const reopened = new RetainedDocumentStore(saved, 'candidate', pair.editor.state.schema, factory('reopened'));
      try { expect(reopened.read().toJSON()).toEqual(pair.editor.getJSON()); } finally { reopened.destroy(); }
    } finally { saved.destroy(); }
    expect(({} as Record<string, unknown>).preserved).toBeUndefined();
    expect(typeof globalThis.document).toBe('undefined');
  } finally { pair.destroy(); }
});

it.each(['quote', 'bullet', 'ordered', 'task', 'mark', 'split'] as const)('retains native history shapes through %s undo and redo', kind => {
  const pair = fixture();
  try {
    const original = pair.editor.getJSON();
    pair.editor.dispatch(pair.editor.createTransaction().setSelection(kind === 'mark'
      ? Selection.range([0, 0], 1, [0, 0], 4) : Selection.cursor([0, 0], 3)));
    expect(kind === 'quote' ? toggleQuote(pair.editor) : kind === 'mark' ? setMark(pair.editor, 'strong')
      : kind === 'split' ? splitBlock(pair.editor) : toggleList(pair.editor, kind)).toBe(true);
    const changed = pair.apply().toJSON();
    expect(undo(pair.editor)).toBe(true); expect(pair.apply().toJSON()).toEqual(original);
    expect(redo(pair.editor)).toBe(true); expect(pair.apply().toJSON()).toEqual(changed);
  } finally { pair.destroy(); }
});

it.each(['quote', 'bullet', 'ordered', 'task', 'mark', 'split'] as const)('applies the actual %s transaction without changing native model structure', kind => {
  const pair = fixture();
  try {
    pair.editor.dispatch(pair.editor.createTransaction().setSelection(kind === 'mark'
      ? Selection.range([0, 0], 1, [0, 0], 4) : Selection.cursor([0, 0], 3)));
    expect(kind === 'quote' ? toggleQuote(pair.editor) : kind === 'mark' ? setMark(pair.editor, 'strong')
      : kind === 'split' ? splitBlock(pair.editor) : toggleList(pair.editor, kind)).toBe(true);
    expect(pair.apply().toJSON()).toEqual(pair.editor.getJSON());
  } finally { pair.destroy(); }
});

for (const reverse of [false, true]) it.each(['quote', 'bullet', 'ordered', 'task', 'mark', 'split'] as const)(
  `retains offline peer typing through actual %s commands (reverse exchange: ${reverse})`, kind => {
    const pair = peers();
    try {
      pair.left.editor.dispatch(pair.left.editor.createTransaction().insertText([0, 0], 2, 'X')); pair.left.apply();
      pair.right.editor.dispatch(pair.right.editor.createTransaction().setSelection(kind === 'mark'
        ? Selection.range([0, 0], 1, [0, 0], 4) : Selection.cursor([0, 0], 3)));
      expect(kind === 'quote' ? toggleQuote(pair.right.editor) : kind === 'mark' ? setMark(pair.right.editor, 'strong')
        : kind === 'split' ? splitBlock(pair.right.editor) : toggleList(pair.right.editor, kind)).toBe(true);
      pair.right.apply(); pair.sync(reverse);
      const left = pair.left.store.read(), right = pair.right.store.read();
      expect(left.toJSON()).toEqual(right.toJSON());
      if (kind === 'split') expect(left.content.slice(0, 2).map(node => node.textContent)).toEqual(['AlXp', 'ha']);
      else expect(left.child(0).textContent).toBe('AlXpha');
      expect(left.content.at(-1)!.toJSON()).toEqual(pair.left.editor.state.schema.nodeFromJSON(source.content![1]).toJSON());
      expect(left.attrs).toEqual(source.attrs);
    } finally { pair.destroy(); }
  });

it.each([0, 5])('retains an explicit empty side when splitting at %s', offset => {
  const pair = fixture();
  try {
    pair.editor.dispatch(pair.editor.createTransaction().setSelection(Selection.cursor([0, 0], offset)));
    expect(splitBlock(pair.editor)).toBe(true);
    expect(pair.apply().toJSON()).toEqual(pair.editor.getJSON());
  } finally { pair.destroy(); }
});

it('types into an existing empty stream, deletes all text, then types again', () => {
  const pair = fixture({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] });
  try {
    for (const [from, to, text] of [[0, 0, 'Alpha'], [0, 5, ''], [0, 0, 'Again']] as const) {
      pair.editor.dispatch(pair.editor.createTransaction().replaceText([0, 0], from, to, text));
      expect(pair.apply().toJSON()).toEqual(pair.editor.getJSON());
    }
  } finally { pair.destroy(); }
});

it('preserves both peers first typing into the same initially empty text stream', () => {
  const pair = peers({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] });
  try {
    for (const [peer, text] of [[pair.left, 'Ada'], [pair.right, 'Grace']] as const) {
      peer.editor.dispatch(peer.editor.createTransaction().insertText([0, 0], 0, text)); peer.apply();
    }
    pair.sync(false); const left = pair.left.store.read(), right = pair.right.store.read();
    expect(left.toJSON()).toEqual(right.toJSON());
    expect(left.textContent).toContain('Ada'); expect(left.textContent).toContain('Grace');
  } finally { pair.destroy(); }
});

it('retains unseen peer typing when all locally observed characters are deleted', () => {
  const pair = peers();
  try {
    pair.left.editor.dispatch(pair.left.editor.createTransaction().insertText([0, 0], 2, 'X')); pair.left.apply();
    pair.right.editor.dispatch(pair.right.editor.createTransaction().replaceText([0, 0], 0, 5, '')); pair.right.apply();
    pair.sync(false);
    expect(pair.left.store.read().child(0).textContent).toBe('X');
    expect(pair.left.store.read().toJSON()).toEqual(pair.right.store.read().toJSON());
  } finally { pair.destroy(); }
});

it('retains character formats when typing is undone and redone after a concurrent full deletion', () => {
  const pair = peers(), manager = new Y.UndoManager([...pair.left.store.scope], { captureTimeout: 0 });
  try {
    pair.left.editor.dispatch(pair.left.editor.createTransaction().insertText([0, 0], 2, 'X')); pair.left.apply();
    pair.right.editor.dispatch(pair.right.editor.createTransaction().replaceText([0, 0], 0, 5, '')); pair.right.apply();
    pair.sync(false); const original = pair.left.store.read().toJSON();
    manager.undo(); pair.sync(false); expect(pair.left.store.read().child(0).textContent).toBe('');
    manager.redo(); pair.sync(true); expect(pair.left.store.read().toJSON()).toEqual(original);
    expect(pair.right.store.read().toJSON()).toEqual(original);
  } finally { manager.destroy(); pair.destroy(); }
});

for (const reverse of [false, true]) it.each([false, true])(`preserves the actual mixed-leaf insertion style after full deletion (reverse exchange: ${reverse}, reverse IDs: %s)`, reverseIDs => {
  const pair = peers({ type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'AA' }, { type: 'text', text: 'BBBB', attrs: { source: 'middle' }, marks: [{ type: 'em' }] },
    { type: 'text', text: 'CC', marks: [{ type: 'strong' }] },
  ] }] }, reverseIDs);
  try {
    pair.left.editor.dispatch(pair.left.editor.createTransaction().insertText([0, 1], 2, 'Z\u200b😀')); pair.left.apply();
    pair.right.editor.dispatch(pair.right.editor.createTransaction().replaceRange(1, 9, '')); pair.right.apply(); pair.sync(reverse);
    const state = Y.encodeStateVector(pair.left.doc), left = pair.left.store.read(), right = pair.right.store.read();
    expect(left.toJSON()).toEqual(right.toJSON()); expect(left.child(0).textContent).toBe('Z\u200b😀');
    expect(left.child(0).child(0).attrs).toEqual({ source: 'middle' });
    expect(left.child(0).child(0).marks.map(mark => mark.type.name)).toEqual(['em']);
    expect(Y.encodeStateVector(pair.left.doc)).toEqual(state);
    expect(JSON.stringify(left.toJSON())).not.toContain('"$f":');
    const saved = new Y.Doc();
    try {
      Y.applyUpdate(saved, Y.encodeStateAsUpdate(pair.left.doc));
      const reopened = new RetainedDocumentStore(saved, 'candidate', pair.left.editor.state.schema, factory('reopened'));
      try { expect(reopened.read().toJSON()).toEqual(left.toJSON()); } finally { reopened.destroy(); }
    } finally { saved.destroy(); }
  } finally { pair.destroy(); }
});

it.each(['bullet', 'ordered', 'task'] as const)('splits a nested %s item with marked leaves and following blocks intact', kind => {
  const pair = fixture({ type: 'doc', content: [{ type: `${kind}_list`, content: [{
    type: kind === 'task' ? 'task_item' : 'list_item', attrs: { checked: true, audit: 'item' }, content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Earlier' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'AA' }, { type: 'text', text: 'Alpha', marks: [{ type: 'em' }] }, { type: 'text', text: 'ZZ' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Tail' }] },
    ],
  }] }, source.content![1]] });
  try {
    pair.editor.dispatch(pair.editor.createTransaction().setSelection(Selection.cursor([0, 0, 1, 1], 2)));
    expect(splitBlock(pair.editor)).toBe(true); expect(pair.apply().toJSON()).toEqual(pair.editor.getJSON());
    expect(undo(pair.editor)).toBe(true); expect(pair.apply().toJSON()).toEqual(pair.editor.getJSON());
  } finally { pair.destroy(); }
});

it('round-trips tables, inline and display math, code and an extension-defined structured widget without a DOM', () => {
  const widget = defineExtension({ name: 'candidate-widget', nodes: { lab_widget: { group: 'block', atom: true } } });
  const pair = fixture({ type: 'doc', attrs: { metadata: { title: 'Lab report', revision: 7 } }, content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Result ' }, { type: 'inline_math', attrs: { latex: 'x^2' } }] },
    { type: 'math_block', attrs: { latex: '\\int_0^1 x\\,dx=\\frac12', label: 'eq-result' } },
    { type: 'table', content: [{ type: 'table_row', content: [{ type: 'table_cell', content: [
      { type: 'paragraph', content: [{ type: 'text', text: '42', marks: [{ type: 'strong' }] }] },
    ] }] }] },
    { type: 'code_block', attrs: { language: 'lean' }, content: [{ type: 'text', text: 'example : 1 + 1 = 2 := by decide' }] },
    { type: 'lab_widget', attrs: { nodeId: 'lab-42', settings: { measured: [12, 19], owner: 'Ada' } } }, source.content![1],
  ] }, 101, [CoreExtension, MathExtension, widget]);
  try {
    expect(pair.store.read().toJSON()).toEqual(pair.editor.getJSON());
    const saved = new Y.Doc();
    try {
      Y.applyUpdate(saved, Y.encodeStateAsUpdate(pair.doc));
      const reopened = new RetainedDocumentStore(saved, 'candidate', pair.editor.state.schema, factory('reopened'));
      try { expect(reopened.read().toJSON()).toEqual(pair.editor.getJSON()); } finally { reopened.destroy(); }
    } finally { saved.destroy(); }
  } finally { pair.destroy(); }
});

it('refuses a later untruthful map before writing an earlier valid edit', () => {
  const pair = fixture();
  try {
    const transaction = pair.editor.createTransaction().insertText([0, 0], 2, 'X');
    class InvalidIdentityStep extends ReplaceDocumentStep { override getMaps() { return []; } }
    transaction.step(new InvalidIdentityStep(transaction.doc.copy([
      transaction.doc.child(0).copy([pair.editor.state.schema.text('Other!')]), transaction.doc.child(1),
    ])));
    const state = Y.encodeStateVector(pair.doc), original = pair.store.read().toJSON();
    expect(() => pair.store.apply(transaction)).toThrow('claim changed text was retained');
    expect(Y.encodeStateVector(pair.doc)).toEqual(state); expect(pair.store.read().toJSON()).toEqual(original);
  } finally { pair.destroy(); }
});

it('rejects overlong metadata names before changing shared state', () => {
  const pair = fixture();
  try {
    const transaction = pair.editor.createTransaction().replaceDocument(pair.editor.state.doc.withAttrs({ ['x'.repeat(201)]: true }));
    const state = Y.encodeStateVector(pair.doc);
    expect(() => pair.store.apply(transaction)).toThrow('storage bounds'); expect(Y.encodeStateVector(pair.doc)).toEqual(state);
  } finally { pair.destroy(); }
});

it.each(['quote', 'mark', 'split'] as const)('undoes and redoes only the local %s operation after peer typing', kind => {
  const pair = peers(), manager = new Y.UndoManager([...pair.right.store.scope], { captureTimeout: 0 });
  try {
    pair.left.editor.dispatch(pair.left.editor.createTransaction().insertText([0, 0], 2, 'X')); pair.left.apply();
    pair.right.editor.dispatch(pair.right.editor.createTransaction().setSelection(kind === 'mark'
      ? Selection.range([0, 0], 1, [0, 0], 4) : Selection.cursor([0, 0], 3)));
    expect(kind === 'quote' ? toggleQuote(pair.right.editor) : kind === 'mark' ? setMark(pair.right.editor, 'strong') : splitBlock(pair.right.editor)).toBe(true);
    pair.right.apply(); pair.sync(false);
    const changed = pair.right.store.read().toJSON();
    manager.undo(); pair.sync(true);
    expect(pair.right.store.read().child(0).textContent).toBe('AlXpha');
    expect(pair.right.store.read().child(0).type.name).toBe('paragraph');
    expect(pair.right.store.read().toJSON()).toEqual(pair.left.store.read().toJSON());
    manager.redo(); pair.sync(false);
    expect(pair.right.store.read().toJSON()).toEqual(changed);
    expect(pair.right.store.read().toJSON()).toEqual(pair.left.store.read().toJSON());
  } finally { manager.destroy(); pair.destroy(); }
});

for (const reverse of [false, true]) it.each([false, true])(`orders concurrent cuts by shared text boundaries (reverse exchange: ${reverse}, reverse IDs: %s)`, reverseIDs => {
  const pair = peers(source, reverseIDs);
  try {
    for (const [peer, offset] of [[pair.left, 2], [pair.right, 4]] as const) {
      peer.editor.dispatch(peer.editor.createTransaction().setSelection(Selection.cursor([0, 0], offset)));
      expect(splitBlock(peer.editor)).toBe(true); peer.apply();
    }
    pair.sync(reverse); const left = pair.left.store.read(), right = pair.right.store.read();
    expect(left.toJSON()).toEqual(right.toJSON());
    expect(left.content.slice(0, 3).map(node => node.textContent)).toEqual(['Al', 'ph', 'a']);
  } finally { pair.destroy(); }
});
