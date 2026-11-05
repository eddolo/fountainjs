import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url), format = process.argv[2];
assert.ok(['es', 'cjs'].includes(format));
for (const key of ['window', 'document', 'DOMParser', 'HTMLElement', 'MutationObserver']) assert.equal(key in globalThis, false);
const Y = format === 'es' ? await import('yjs') : require('yjs');
const text = format === 'es' ? await import('./yjs-retained-build-20261105/retained-text.mjs') : require('./yjs-retained-build-20261105/retained-text.cjs');
const nodes = format === 'es' ? await import('./yjs-retained-build-20261105/retained-nodes.mjs') : require('./yjs-retained-build-20261105/retained-nodes.cjs');
const mapping = format === 'es' ? await import('./yjs-retained-build-20261105/retained-mapping.mjs') : require('./yjs-retained-build-20261105/retained-mapping.cjs');
const engine = format === 'es' ? await import('../dist/index.js') : require('../dist/index.cjs');
const schema = new engine.Schema(engine.CoreSchemaSpec), results = [];
const factory = prefix => { let next = 0; return () => `${prefix}-${next++}`; };
const plain = (store, id) => store.project(id).runs.map(run => run.text).join('');
function pair() {
  const a = new Y.Doc(), b = new Y.Doc(), origin = {};
  const leftNodes = new nodes.RetainedNodeStore(a, 'compiled-tree', factory('left'), origin);
  const leftText = new text.RetainedTextStore(a, 'compiled-text', origin);
  const paragraph = leftNodes.create({ type: 'paragraph', attrs: { nodeId: 'stable-alpha', owner: 'Ada', partition: { application: 'owned' } } });
  leftText.create('original-stream', paragraph, [{ text: 'Alpha' }]);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const rightNodes = new nodes.RetainedNodeStore(b, 'compiled-tree', factory('right'), {});
  const rightText = new text.RetainedTextStore(b, 'compiled-text', {});
  const project = (graph, strings) => {
    const snapshot = graph.project(); assert.deepEqual(snapshot.issues, []);
    const visit = node => {
      const attrs = node.attrs ?? {};
      // This fixture gives every paragraph one partition with the same private
      // ID. It does not reserve or strip an application attribute as a pointer.
      const content = node.type === 'paragraph' ? strings.project(node.id).runs.map(run => ({ type: 'text', text: run.text,
        ...(run.attributes ? { marks: Object.entries(run.attributes).map(([type, value]) => ({ type, attrs: JSON.parse(value) })) } : {}) }))
        : node.content.map(visit);
      return { type: node.type, attrs, content: content.length ? content : node.type === 'paragraph' ? [{ type: 'text', text: '' }] : [] };
    };
    const document = schema.nodeFromJSON(visit(snapshot.root)); schema.validate(document); return document;
  };
  return { a, b, origin, leftNodes, rightNodes, leftText, rightText, paragraph,
    sync: reverse => {
      const updateA = Y.encodeStateAsUpdate(a), updateB = Y.encodeStateAsUpdate(b);
      if (reverse) { Y.applyUpdate(b, updateA, 'remote'); Y.applyUpdate(a, updateB, 'remote'); }
      else { Y.applyUpdate(a, updateB, 'remote'); Y.applyUpdate(b, updateA, 'remote'); }
    },
    document: () => { const left = project(leftNodes, leftText), right = project(rightNodes, rightText); assert.deepEqual(left.toJSON(), right.toJSON()); return left; },
    destroy: () => { leftText.destroy(); rightText.destroy(); a.destroy(); b.destroy(); },
  };
}
for (const reverse of [false, true]) for (const kind of ['wrap', 'mark', 'split']) {
  const fixture = pair(), p = fixture.paragraph;
  const undo = new Y.UndoManager([...fixture.leftNodes.scope, ...fixture.leftText.scope], { trackedOrigins: new Set([fixture.origin]), captureTimeout: 0 });
  try {
    fixture.a.transact(() => {
      if (kind === 'wrap') {
        const quote = fixture.leftNodes.create({ type: 'blockquote' }); fixture.leftNodes.move(p, quote, 0);
      } else if (kind === 'mark') fixture.leftText.format(p, 1, 4, { strong: '{}' });
      else {
        const right = fixture.leftNodes.create({ type: 'paragraph', attrs: { nodeId: 'new-right' } }, 'root', 1);
        fixture.leftText.split(p, right, 3);
      }
    }, fixture.origin);
    fixture.rightText.insert(p, 2, 'X'); fixture.rightNodes.setAttribute(p, 'owner', 'Grace'); fixture.sync(reverse);
    const document = fixture.document(); assert.equal(document.textContent, 'AlXpha');
    const paragraph = kind === 'wrap' ? document.child(0).child(0) : document.child(0);
    assert.equal(paragraph.attrs.nodeId, 'stable-alpha'); assert.equal(paragraph.attrs.owner, 'Grace');
    assert.deepEqual(paragraph.attrs.partition, { application: 'owned' });
    if (kind === 'wrap') assert.equal(document.child(0).type.name, 'blockquote');
    if (kind === 'split') assert.deepEqual(document.content.map(node => node.textContent), ['AlXp', 'ha']);
    if (kind === 'mark') assert.ok(paragraph.content.some(node => node.marks.some(mark => mark.type.name === 'strong')));
    assert.ok(undo.undo()); fixture.sync(reverse);
    const undone = fixture.document(); assert.equal(undone.textContent, 'AlXpha'); assert.equal(undone.child(0).attrs.owner, 'Grace');
    assert.equal(plain(fixture.leftText, p), 'AlXpha');
    results.push({ format, reverse, kind, schemaValidated: true, independentTextAndMetadata: true, authorUndoRetainedPeerChanges: true });
  } finally { undo.destroy(); fixture.destroy(); }
}
for (const kind of ['quote', 'mark', 'split', 'insert-delete']) {
  let transaction;
  const editor = engine.createEditor({ schema: engine.CoreSchemaSpec, content: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'aaaaaa' }] },
  ] }, onUpdate: (_state, update) => { if (update.docChanged) transaction = update; } });
  try {
    editor.dispatch(editor.createTransaction().setSelection(kind === 'mark'
      ? engine.Selection.range([0, 0], 1, [0, 0], 5) : engine.Selection.cursor([0, 0], 3)));
    assert.equal(kind === 'quote' ? engine.toggleQuote(editor) : kind === 'mark' ? engine.setMark(editor, 'strong')
      : kind === 'split' ? engine.splitBlock(editor) : editor.dispatch(editor.createTransaction().insertText([0, 0], 2, 'X').replaceText([0, 0], 0, 1, '')), true);
    const plan = mapping.planRetainedText(transaction.originalDoc, transaction.doc, transaction.mapping);
    assert.equal(plan.retained.reduce((sum, slice) => sum + slice.before.to - slice.before.from, 0), kind === 'insert-delete' ? 5 : 6);
    assert.equal(plan.inserted.length, kind === 'insert-delete' ? 1 : 0);
    assert.equal(plan.removed.length, kind === 'insert-delete' ? 1 : 0);
    results.push({ format, kind, actualEngineTransactionPlan: true });
  } finally { editor.destroy(); }
}
for (const key of ['window', 'document', 'DOMParser', 'HTMLElement', 'MutationObserver']) assert.equal(key in globalThis, false);
console.log(JSON.stringify({ compiledCandidateOnly: true, currentAdapterReplaced: false, noDOM: true, cases: results.length, results }));
