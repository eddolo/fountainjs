import { expect, it } from 'vitest';
import { CoreExtension, ReplaceDocumentStep, Selection, Mapping, StepMap, composeExtensions, createEditor, createHistoryPlugin,
  setMark, splitBlock, toggleList, toggleQuote, undo, type Transaction } from '../src';
import { planRetainedText } from '../src/yjs/retained-mapping';

function fixture(text = 'Alpha') {
  const kit = composeExtensions([CoreExtension]);
  const transactions: Transaction[] = [];
  const editor = createEditor({ schema: kit.schema, plugins: [createHistoryPlugin()], content: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text }] }, { type: 'image_super', attrs: { src: '/figure.png', alt: 'Figure' } },
  ] }, onUpdate: (_state, transaction) => { if (transaction.docChanged) transactions.push(transaction); } });
  const plan = () => {
    const transaction = transactions.at(-1)!;
    return planRetainedText(transaction.originalDoc, transaction.doc, transaction.mapping);
  };
  return { editor, transactions, plan };
}

it('retains unique unchanged text identities in an opted-in child splice, but not an explicit document replacement', () => {
  const {editor}=fixture();try{const before=editor.state.doc,after=before.copy([...before.content].reverse()),mapping=new Mapping([new StepMap([0,before.nodeSize-2,after.nodeSize-2])]);
    const plan=planRetainedText(before,after,mapping,true);expect(plan).toEqual({retained:[{before:{path:[0,0],from:0,to:5},after:{path:[1,0],from:0,to:5}}],removed:[],inserted:[]});
    expect(planRetainedText(before,after,mapping).retained).toEqual([]);
  }finally{editor.destroy()}
});

it('does not infer retained ownership from equal-looking newly constructed nodes', () => {
  const {editor}=fixture();try{const before=editor.state.doc,after=editor.state.schema.nodeFromJSON(before.toJSON()),mapping=new Mapping([new StepMap([0,before.nodeSize-2,after.nodeSize-2])]);expect(planRetainedText(before,after,mapping,true).retained).toEqual([])}finally{editor.destroy()}
});

it('refuses ambiguous repeated text-object occurrences rather than guessing an owner', () => {
  const {editor}=fixture();try{const schema=editor.state.schema,text=schema.text('Same'),before=schema.node('doc',{},[schema.node('paragraph',{},[text]),schema.node('paragraph',{},[text])]),after=before.copy([...before.content].reverse());
    expect(before.child(0).child(0)).toBe(before.child(1).child(0));const mapping=new Mapping([new StepMap([0,before.nodeSize-2,after.nodeSize-2])]);expect(planRetainedText(before,after,mapping,true).retained).toEqual([]);
  }finally{editor.destroy()}
});

it('does not override an explicit partial character replacement using a reused text object', () => {
  const {editor}=fixture();try{const before=editor.state.doc,plan=planRetainedText(before,before,new Mapping([new StepMap([2,2,2])]),true);expect(plan.removed).toEqual([{path:[0,0],from:1,to:3}]);expect(plan.inserted).toEqual([{path:[0,0],from:1,to:3}]);expect(plan.retained).toHaveLength(2)}finally{editor.destroy()}
});

it.each(['quote', 'bullet', 'ordered', 'task'] as const)('maps actual retained characters through %s wrapping without inferring identity from text', kind => {
  const { editor, plan } = fixture();
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(kind === 'quote' ? toggleQuote(editor) : toggleList(editor, kind)).toBe(true);
    const result = plan();
    expect(result.removed).toEqual([]); expect(result.inserted).toEqual([]);
    expect(result.retained).toEqual([{ before: { path: [0, 0], from: 0, to: 5 },
      after: { path: kind === 'quote' ? [0, 0, 0] : [0, 0, 0, 0], from: 0, to: 5 } }]);
  } finally { editor.destroy(); }
});

it('retains one original sequence across the three leaves produced by a partial mark', () => {
  const { editor, plan } = fixture();
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0], 1, [0, 0], 4)));
    expect(setMark(editor, 'strong')).toBe(true);
    const result = plan();
    expect(result.removed).toEqual([]); expect(result.inserted).toEqual([]);
    expect(result.retained.map(slice => [slice.before.from, slice.before.to, slice.after.path])).toEqual([
      [0, 1, [0, 0]], [1, 4, [0, 1]], [4, 5, [0, 2]],
    ]);
  } finally { editor.destroy(); }
});

it('maps split and exact compound undo back onto the same original character intervals', () => {
  const { editor, plan } = fixture();
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 3)));
    expect(splitBlock(editor)).toBe(true);
    expect(plan()).toEqual({ removed: [], inserted: [], retained: [
      { before: { path: [0, 0], from: 0, to: 3 }, after: { path: [0, 0], from: 0, to: 3 } },
      { before: { path: [0, 0], from: 3, to: 5 }, after: { path: [1, 0], from: 0, to: 2 } },
    ] });
    expect(undo(editor)).toBe(true);
    expect(plan()).toEqual({ removed: [], inserted: [], retained: [
      { before: { path: [0, 0], from: 0, to: 3 }, after: { path: [0, 0], from: 0, to: 3 } },
      { before: { path: [1, 0], from: 0, to: 2 }, after: { path: [0, 0], from: 3, to: 5 } },
    ] });
  } finally { editor.destroy(); }
});

it('distinguishes deleted and inserted units in duplicate text and a multi-map transaction', () => {
  const { editor, plan } = fixture('aaaaaa');
  try {
    editor.dispatch(editor.createTransaction().insertText([0, 0], 2, 'X').replaceText([0, 0], 0, 1, ''));
    expect(plan()).toEqual({ removed: [{ path: [0, 0], from: 0, to: 1 }], inserted: [{ path: [0, 0], from: 1, to: 2 }], retained: [
      { before: { path: [0, 0], from: 1, to: 2 }, after: { path: [0, 0], from: 0, to: 1 } },
      { before: { path: [0, 0], from: 2, to: 6 }, after: { path: [0, 0], from: 2, to: 6 } },
    ] });
  } finally { editor.destroy(); }
});

it('does not reuse equal-looking text after an explicit whole-document replacement', () => {
  const { editor, plan } = fixture();
  try {
    const document = editor.state.schema.nodeFromJSON(editor.getJSON());
    // A changed root forces a genuine replacement, even with identical text.
    editor.dispatch(editor.createTransaction().replaceDocument(document.withAttrs({ audit: 'new root' })));
    // Metadata-only replacement truthfully has an identity map.
    expect(plan().retained).toHaveLength(1);
    editor.dispatch(editor.createTransaction().replaceDocument(document.copy([...document.content].reverse())));
    expect(plan().retained).toEqual([]);
  } finally { editor.destroy(); }
});

it('rejects an untruthful identity map instead of matching new characters by similarity', () => {
  const { editor, transactions, plan } = fixture();
  try {
    const before = editor.state.doc, after = before.copy([before.child(0).copy([editor.state.schema.text('Other')]), before.child(1)]);
    class InvalidIdentityStep extends ReplaceDocumentStep { override getMaps() { return []; } }
    editor.dispatch(editor.createTransaction().step(new InvalidIdentityStep(after)));
    expect(transactions).toHaveLength(1); expect(plan).toThrow('claim changed text was retained');
  } finally { editor.destroy(); }
});

it('rejects a size-changing custom operation that supplies no positional changes', () => {
  const { editor, plan } = fixture();
  try {
    const before = editor.state.doc, paragraph = editor.state.schema.nodeFromJSON({ type: 'paragraph', content: [{ type: 'text', text: 'Tail' }] });
    class InvalidSizeStep extends ReplaceDocumentStep { override getMaps() { return []; } }
    editor.dispatch(editor.createTransaction().step(new InvalidSizeStep(before.copy([...before.content, paragraph]))));
    expect(plan).toThrow('target document size');
  } finally { editor.destroy(); }
});
