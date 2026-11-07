// @vitest-environment node
import { expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { AllSelection, CellSelection, CoreExtension, GapSelection, NodeSelection, Plugin, RangeSelection, Selection, composeExtensions, createEditor,
  canRedoCollaboration, canUndoCollaboration, createCollaborationExtension, defineExtension, disconnectCollaboration, getCollaborationState, insertText, reconnectCollaboration,
  redoCollaboration, replaceCollaborationAdapter, splitBlock, setMark, toggleList, toggleQuote, undoCollaboration, moveBlock,
  type NodeJSON } from '../src';
import { createYjsCollaborationExtension, type YjsAwareness, type YjsCollaborationExtensionOptions, type YjsProvider } from '../src/yjs';
import { createRetainedYjsCollaborationExtension, RetainedYjsCollaborationAdapter } from '../src/yjs/retained-adapter';
import { defineStructuredAttribute, setStructuredAttribute } from '../src/structured-attributes';
import { retainedNameKey } from '../src/yjs/retained-nodes';
import { createStableNodeIdsExtension, inspectStableNodeIds } from '../src/node-ids';
import { createTrailingEditableBlockExtension } from '../src';

for(const kind of ['duplicate','divider'] as const)it(`keeps an authored ${kind} undoable when history-neutral repairs are appended locally`,()=>{
  const document=new Y.Doc(),kit=composeExtensions([CoreExtension,createStableNodeIdsExtension(),createTrailingEditableBlockExtension(),createRetainedYjsCollaborationExtension({document,captureTimeout:0,user:{id:'author',name:'Author',color:'#7048e8'}})]);
  const editor=createEditor({schema:kit.schema,plugins:kit.plugins,content:{type:'doc',content:[{type:'paragraph',attrs:{nodeId:'intro'},content:[{type:'text',text:'Original'}]}]}});
  try{
    const initial=editor.getJSON(),node=kind==='duplicate'?editor.state.doc.child(0):editor.state.schema.node('horizontal_rule');
    expect(editor.dispatch(editor.createTransaction().replace(1,1,[node]))).toBe(true);expect(inspectStableNodeIds(editor.state.doc)).toEqual([]);
    const authored=editor.getJSON();expect(undoCollaboration(editor)).toBe(true);expect(editor.getJSON()).toEqual(initial);
    expect(redoCollaboration(editor)).toBe(true);expect(editor.getJSON()).toEqual(authored);expect(getCollaborationState(editor)?.status).toBe('connected');
  }finally{editor.destroy();document.destroy();}
});

for(const reverse of [false,true])it(`rebroadcasts remote stable-ID repairs without replaying the inbound document (reverse: ${reverse})`,()=>{
  const base:NodeJSON={type:'doc',content:[{type:'paragraph',attrs:{nodeId:'shared-id'},content:[{type:'text',text:'Shared'}]}]};
  const legacyDoc=new Y.Doc(),stableDoc=new Y.Doc();
  const make=(document:Y.Doc,stable:boolean)=>{const kit=composeExtensions([CoreExtension,...(stable?[createStableNodeIdsExtension()]:[]),createRetainedYjsCollaborationExtension({document,captureTimeout:0,user:{id:stable?'stable':'plain',name:'Author',color:'#a855f7'}})]);return createEditor({schema:kit.schema,plugins:kit.plugins,content:base});};
  const plain=make(legacyDoc,false);Y.applyUpdate(stableDoc,Y.encodeStateAsUpdate(legacyDoc));const stable=make(stableDoc,true);
  const sync=()=>{const a=Y.encodeStateAsUpdate(legacyDoc),b=Y.encodeStateAsUpdate(stableDoc);if(reverse){Y.applyUpdate(stableDoc,a);Y.applyUpdate(legacyDoc,b);}else{Y.applyUpdate(legacyDoc,b);Y.applyUpdate(stableDoc,a);}};
  try{
    expect(plain.dispatch(plain.createTransaction().replace(1,1,[plain.state.doc.child(0)]))).toBe(true);
    sync();sync();expect(plain.getJSON()).toEqual(stable.getJSON());expect(inspectStableNodeIds(stable.state.doc)).toEqual([]);
    expect(stable.state.doc.child(0).attrs.nodeId).toBe('shared-id');expect(stable.state.doc.child(1).attrs.nodeId).toMatch(/^fjs-/);
    expect(getCollaborationState(stable)?.status).toBe('connected');expect(getCollaborationState(plain)?.status).toBe('connected');
    expect(undoCollaboration(stable)).toBe(false);
    expect(undoCollaboration(plain)).toBe(true);sync();sync();expect(plain.getJSON()).toEqual(stable.getJSON());expect(stable.state.doc.childCount).toBe(1);
    expect(redoCollaboration(plain)).toBe(true);sync();sync();expect(plain.getJSON()).toEqual(stable.getJSON());expect(inspectStableNodeIds(stable.state.doc)).toEqual([]);
  }finally{plain.destroy();stable.destroy();legacyDoc.destroy();stableDoc.destroy();}
});

const source: NodeJSON = { type: 'doc', attrs: { audit: 'root' }, content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] }, { type: 'image_super', attrs: { src: '/figure.png', alt: 'Figure' } },
] };
function peers(content = source, extensions: Parameters<typeof composeExtensions>[0] = [CoreExtension], options: Partial<YjsCollaborationExtensionOptions> = {}) {
  const states = new Map<number, Record<string, unknown>>(), listeners = new Set<() => void>();
  const create = (document: Y.Doc, id: string) => {
    const awareness: YjsAwareness = { clientID: document.clientID,
      getStates: () => states, getLocalState: () => states.get(document.clientID) ?? null,
      setLocalStateField: (key, value) => { states.set(document.clientID, { ...states.get(document.clientID), [key]: value }); listeners.forEach(listener => listener()); },
      on: (_event, listener) => { listeners.add(listener); }, off: (_event, listener) => { listeners.delete(listener); },
    };
    const kit = composeExtensions([...extensions, createRetainedYjsCollaborationExtension({ ...options, document, awareness, presenceThrottleMs: 0, captureTimeout: 0,
      user: { id, name: id, color: '#a855f7' } })]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
    expect(getCollaborationState(editor)?.status).toBe('connected'); return editor;
  };
  const leftDoc = new Y.Doc(), left = create(leftDoc, 'left'), rightDoc = new Y.Doc();
  Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc), 'seed'); const right = create(rightDoc, 'right');
  return { left, right, leftDoc, rightDoc, states, listeners, sync: (reverse = false) => {
    const a = Y.encodeStateAsUpdate(leftDoc), b = Y.encodeStateAsUpdate(rightDoc);
    if (reverse) { Y.applyUpdate(rightDoc, a, 'peer'); Y.applyUpdate(leftDoc, b, 'peer'); }
    else { Y.applyUpdate(leftDoc, b, 'peer'); Y.applyUpdate(rightDoc, a, 'peer'); }
    expect(getCollaborationState(left)?.status, getCollaborationState(left)?.error?.message).toBe('connected');
    expect(getCollaborationState(right)?.status, getCollaborationState(right)?.error?.message).toBe('connected');
    expect(left.getJSON()).toEqual(right.getJSON());
  }, destroy: () => { left.destroy(); right.destroy(); leftDoc.destroy(); rightDoc.destroy(); } };
}

for(const reverse of [false,true])it(`preserves a history-neutral shared update through author undo/redo (reverse: ${reverse})`,()=>{
  const pair=peers();try{
    pair.left.dispatch(pair.left.createTransaction().setNodeAttrs([0],{review:'first'}).setMeta('addToHistory',false));pair.sync(reverse);
    expect(undoCollaboration(pair.left)).toBe(false);
    pair.left.dispatch(pair.left.createTransaction().setSelection(Selection.cursor([0,0],2)));expect(insertText(pair.left,'X')).toBe(true);
    pair.left.dispatch(pair.left.createTransaction().setNodeAttrs([0],{review:'second'}).setMeta('addToHistory',false));pair.sync(reverse);
    expect(undoCollaboration(pair.left)).toBe(true);pair.sync(reverse);
    expect(pair.left.state.doc.child(0).textContent).toBe('Alpha');expect(pair.left.state.doc.child(0).attrs.review).toBe('second');
    expect(redoCollaboration(pair.left)).toBe(true);pair.sync(reverse);
    expect(pair.left.state.doc.child(0).textContent).toBe('AlXpha');expect(pair.left.state.doc.child(0).attrs.review).toBe('second');
  }finally{pair.destroy();}
});

for (const reverse of [false, true]) it('reflects observer metadata without undoing it with the author edit (reverse exchange: ' + reverse + ')', () => {
  const pair = peers();
  try {
    let written = false;
    const observer = () => {
      if (!written) { written = true; pair.leftDoc.getMap('fountain-nodes:root').set('attr:' + retainedNameKey('observer'), 'true'); }
    };
    pair.leftDoc.on('afterTransaction', observer);
    pair.left.dispatch(pair.left.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(insertText(pair.left, 'X')).toBe(true);
    expect(pair.left.state.doc.attrs.observer).toBe(true);
    pair.sync(reverse); expect(pair.right.state.doc.attrs.observer).toBe(true);
    expect(undoCollaboration(pair.left)).toBe(true); pair.sync(reverse);
    expect(pair.left.state.doc.child(0).textContent).toBe('Alpha'); expect(pair.left.state.doc.attrs.observer).toBe(true);
    expect(redoCollaboration(pair.left)).toBe(true); pair.sync(reverse);
    expect(pair.left.state.doc.child(0).textContent).toBe('AlXpha'); expect(pair.left.state.doc.attrs.observer).toBe(true);
    pair.leftDoc.off('afterTransaction', observer);
  } finally { pair.destroy(); }
});

for (const reverse of [false, true]) it.each([false, true])(`retains a reordered sibling list, peer typing and author history (concurrent: %s, reverse exchange: ${reverse})`, concurrent => {
  const content: NodeJSON = { ...source, content: [...['Alpha','Beta','Gamma','Delta'].map(text => ({ type: 'paragraph', content: [{ type: 'text', text }] })), source.content![1]] };
  const pair = peers(content);
  try {
    expect(moveBlock(pair.left, 0, 3)).toBe(true);
    if (concurrent) { pair.right.dispatch(pair.right.createTransaction().setSelection(Selection.cursor([0, 0], 2))); expect(insertText(pair.right, 'X')).toBe(true); }
    pair.sync(reverse);
    expect(pair.left.state.doc.content.slice(0,4).map(node=>node.textContent)).toEqual(['Beta','Gamma','Delta',concurrent?'AlXpha':'Alpha']);
    expect(pair.left.state.doc.attrs).toEqual({audit:'root'}); expect(pair.left.state.doc.child(4).type.name).toBe('image_super');
    expect(undoCollaboration(pair.left)).toBe(true); pair.sync(reverse);
    expect(pair.left.state.doc.content.slice(0,4).map(node=>node.textContent)).toEqual([concurrent?'AlXpha':'Alpha','Beta','Gamma','Delta']);
    expect(redoCollaboration(pair.left)).toBe(true); pair.sync(reverse);
    expect(pair.left.state.doc.content.slice(0,4).map(node=>node.textContent)).toEqual(['Beta','Gamma','Delta',concurrent?'AlXpha':'Alpha']);
  } finally {pair.destroy();}
});

for (const reverse of [false, true]) it('retains peer edits in other immutable paragraphs and untouched rich content (reverse exchange: ' + reverse + ')', () => {
  const content: NodeJSON = { ...source, content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Beta' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Gam', marks: [{ type: 'strong' }] }, { type: 'text', text: 'ma' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Delta' }] }, source.content![1],
  ] };
  const pair = peers(content);
  try {
    const rich = pair.left.getJSON().content![2], image = pair.left.getJSON().content![4];
    pair.left.dispatch(pair.left.createTransaction().setSelection(Selection.cursor([1, 0], 2)));
    expect(insertText(pair.left, 'X')).toBe(true);
    pair.right.dispatch(pair.right.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(insertText(pair.right, 'Z')).toBe(true);
    pair.right.dispatch(pair.right.createTransaction().setSelection(Selection.cursor([3, 0], 3)));
    expect(insertText(pair.right, 'Y')).toBe(true);
    pair.sync(reverse);
    const final = pair.left.getJSON();
    expect(pair.left.state.doc.content.slice(0, 4).map(node => node.textContent)).toEqual(['AlZpha', 'BeXta', 'Gamma', 'DelYta']);
    expect(final.content![2]).toEqual(rich); expect(final.content![4]).toEqual(image);
    expect(undoCollaboration(pair.left)).toBe(true); pair.sync(reverse);
    expect(pair.left.state.doc.content.slice(0, 4).map(node => node.textContent)).toEqual(['AlZpha', 'Beta', 'Gamma', 'DelYta']);
    expect(redoCollaboration(pair.left)).toBe(true); pair.sync(reverse); expect(pair.left.getJSON()).toEqual(final);
  } finally { pair.destroy(); }
});

for (const reverse of [false, true]) it.each(['quote', 'bullet', 'ordered', 'task', 'mark', 'split'] as const)(
  `retains offline typing through the actual collaboration lifecycle and %s (reverse exchange: ${reverse})`, kind => {
    const pair = peers();
    try {
      const image = pair.left.state.doc.child(1).toJSON();
      pair.left.dispatch(pair.left.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
      expect(insertText(pair.left, 'X')).toBe(true);
      pair.right.dispatch(pair.right.createTransaction().setSelection(kind === 'mark' ? Selection.range([0, 0], 1, [0, 0], 4) : Selection.cursor([0, 0], 3)));
      expect(kind === 'quote' ? toggleQuote(pair.right) : kind === 'mark' ? setMark(pair.right, 'strong')
        : kind === 'split' ? splitBlock(pair.right) : toggleList(pair.right, kind)).toBe(true);
      pair.sync(reverse);
      if (kind === 'split') expect(pair.left.state.doc.content.slice(0, 2).map(node => node.textContent)).toEqual(['AlXp', 'ha']);
      else expect(pair.left.state.doc.child(0).textContent).toBe('AlXpha');
      expect(pair.left.state.doc.content.at(-1)!.toJSON()).toEqual(image); expect(pair.left.state.doc.attrs).toEqual({ audit: 'root' });
      expect(undoCollaboration(pair.right)).toBe(true); pair.sync(reverse);
      expect(pair.left.state.doc.child(0).type.name).toBe('paragraph'); expect(pair.left.state.doc.child(0).textContent).toBe('AlXpha');
      expect(redoCollaboration(pair.right)).toBe(true); pair.sync(reverse);
    } finally { pair.destroy(); }
  });

it.each([false, true])('retains mixed range direction and awareness through remote text insertion (backward: %s)', backward => {
  const pair = peers();
  try {
    pair.left.dispatch(pair.left.createTransaction().setSelection(new RangeSelection(pair.left.state.doc, backward ? 9 : 2, backward ? 2 : 9)));
    expect(getCollaborationState(pair.right)?.presences[0]?.selection).toEqual({ anchor: backward ? 9 : 2, head: backward ? 2 : 9 });
    pair.right.dispatch(pair.right.createTransaction().setSelection(Selection.cursor([0, 0], 0))); expect(insertText(pair.right, 'ZZ')).toBe(true); pair.sync();
    expect(pair.left.state.selection).toMatchObject({ kind: 'range', anchor: backward ? 11 : 4, head: backward ? 4 : 11 });
    expect(getCollaborationState(pair.right)?.presences[0]?.selection).toEqual({ anchor: backward ? 11 : 4, head: backward ? 4 : 11 });
  } finally { pair.destroy(); }
});

it.each([-1, 1] as const)('retains a root gap and its insertion association (%s)', association => {
  const pair = peers();
  try {
    pair.left.dispatch(pair.left.createTransaction().setSelection(new GapSelection(pair.left.state.doc, 9, association)));
    pair.right.dispatch(pair.right.createTransaction().replace(2, 2, [pair.right.state.schema.nodeFromJSON({ type: 'paragraph', content: [{ type: 'text', text: 'Tail' }] })])); pair.sync();
    expect(pair.left.state.selection).toMatchObject({ kind: 'gap', position: association < 0 ? 9 : 15, association });
  } finally { pair.destroy(); }
});

it.each(['node', 'all'] as const)('retains a complete %s selection through remote edits', kind => {
  const pair = peers();
  try {
    pair.left.dispatch(pair.left.createTransaction().setSelection(kind === 'node' ? new NodeSelection(pair.left.state.doc, [1]) : new AllSelection(pair.left.state.doc)));
    pair.right.dispatch(pair.right.createTransaction().insertText([0, 0], 0, 'ZZ')); pair.sync();
    expect(pair.left.state.selection.kind).toBe(kind);
    if (kind === 'node') expect(pair.left.state.selection).toMatchObject({ nodePath: [1], structuralFrom: 9, structuralTo: 11 });
  } finally { pair.destroy(); }
});

it('retains a cell selection when another peer inserts a block before its table', () => {
  const pair = peers({ type: 'doc', content: [{ type: 'table', content: [{ type: 'table_row', content: [
    { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
    { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
  ] }] }] });
  try {
    pair.left.dispatch(pair.left.createTransaction().setSelection(new CellSelection(pair.left.state.doc, [0, 0, 0], [0, 0, 1])));
    pair.right.dispatch(pair.right.createTransaction().replace(0, 0, [pair.right.state.schema.nodeFromJSON({ type: 'paragraph', content: [{ type: 'text', text: 'Before' }] })])); pair.sync();
    expect(pair.left.state.selection).toMatchObject({ kind: 'cell', anchorCellPath: [1, 0, 0], headCellPath: [1, 0, 1] });
  } finally { pair.destroy(); }
});

it.each([-1, 1] as const)('retains a gap at the beginning with association %s', association => {
  const pair = peers();
  try {
    pair.left.dispatch(pair.left.createTransaction().setSelection(new GapSelection(pair.left.state.doc, 0, association)));
    pair.right.dispatch(pair.right.createTransaction().replace(0, 0, [pair.right.state.schema.nodeFromJSON({ type: 'paragraph', content: [{ type: 'text', text: 'Tail' }] })])); pair.sync();
    expect(pair.left.state.selection).toMatchObject({ kind: 'gap', position: association < 0 ? 0 : 6, association });
  } finally { pair.destroy(); }
});

it('retains a gap inside a copied quote owner while a peer appends a block', () => {
  const pair = peers({ type: 'doc', content: [{ type: 'blockquote', content: source.content }] });
  try {
    pair.left.dispatch(pair.left.createTransaction().setSelection(new GapSelection(pair.left.state.doc, 10, -1)));
    const quote = pair.right.state.doc.child(0);
    pair.right.dispatch(pair.right.createTransaction().replaceNode([0], [quote.copy([...quote.content,
      pair.right.state.schema.nodeFromJSON({ type: 'paragraph', content: [{ type: 'text', text: 'Tail' }] }),
    ])])); pair.sync();
    expect(pair.left.state.selection).toMatchObject({ kind: 'gap', position: 10, parentPath: [0], index: 2, association: -1 });
  } finally { pair.destroy(); }
});

it.each([false, true])('skips redundant format history after a peer deletes the last authored character (reverse: %s)', reverse => {
  const pair = peers();
  const { left, right } = pair;
  const select = (offset: number) => left.dispatch(left.createTransaction().setSelection(Selection.cursor([0, 0], offset)));
  try {
    select(2);
    expect(insertText(left, 'X')).toBe(true);
    select(5);
    expect(insertText(left, 'Y')).toBe(true);
    pair.sync(reverse);
    right.dispatch(right.createTransaction().replaceText([0, 0], 5, 6, ''));
    pair.sync(reverse);

    select(0);
    expect(undoCollaboration(left)).toBe(true);
    pair.sync(reverse);
    expect(left.state.doc.child(0).textContent).toBe('Alpha');
    expect(left.state.selection).toMatchObject({ path: [0, 0], from: 2, to: 2 });
    expect(canUndoCollaboration(left)).toBe(false);

    expect(redoCollaboration(left)).toBe(true);
    pair.sync(reverse);
    expect(left.state.doc.child(0).textContent).toBe('AlXpha');
    expect(left.state.selection).toMatchObject({ path: [0, 0], from: 3, to: 3 });
    expect(canRedoCollaboration(left)).toBe(false);
    expect(redoCollaboration(left)).toBe(false);
  } finally { pair.destroy(); }
});

it('leaves the caret and redo empty when only redundant format history remains', () => {
  const pair = peers();
  const { left, right } = pair;
  try {
    left.dispatch(left.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    expect(insertText(left, 'X')).toBe(true);
    pair.sync();
    right.dispatch(right.createTransaction().replaceText([0, 0], 2, 3, ''));
    pair.sync();
    left.dispatch(left.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    expect(undoCollaboration(left)).toBe(false);
    pair.sync();
    expect(left.state.doc.child(0).textContent).toBe('Alpha');
    expect(left.state.selection).toMatchObject({ path: [0, 0], from: 0, to: 0 });
    expect(canUndoCollaboration(left)).toBe(false);
    expect(canRedoCollaboration(left)).toBe(false);
  } finally { pair.destroy(); }
});

it('restores a backward range on author undo while retaining a remote insertion', () => {
  const pair = peers();
  try {
    pair.left.dispatch(pair.left.createTransaction().setSelection(new RangeSelection(pair.left.state.doc, 9, 2)));
    expect(insertText(pair.left, 'X')).toBe(true); pair.sync();
    pair.right.dispatch(pair.right.createTransaction().setSelection(Selection.cursor([0, 0], 0))); expect(insertText(pair.right, 'R')).toBe(true); pair.sync();
    expect(undoCollaboration(pair.left)).toBe(true);
    expect(pair.left.state.doc.child(0).textContent).toBe('RAlpha'); expect(pair.left.state.doc.child(1).type.name).toBe('image_super');
    expect(pair.left.state.selection).toMatchObject({ kind: 'range', anchor: 10, head: 3 }); pair.sync();
    expect(redoCollaboration(pair.left)).toBe(true); pair.sync(); expect(pair.left.state.doc.child(0).textContent).toBe('RAX');
  } finally { pair.destroy(); }
});

it('keeps legacy documents untouched and reports an incompatible room', () => {
  const document = new Y.Doc(), user = { id: 'test', name: 'Test', color: '#a855f7' };
  const oldKit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, user })]);
  const legacy = createEditor({ schema: oldKit.schema, plugins: oldKit.plugins, content: source });
  const original = Y.encodeStateVector(document), fragment = document.getXmlFragment('fountain').toString();
  const kit = composeExtensions([CoreExtension, createRetainedYjsCollaborationExtension({ document, user })]);
  const next = createEditor({ schema: kit.schema, plugins: kit.plugins, content: source });
  try {
    expect(getCollaborationState(next)?.status).toBe('error'); expect(getCollaborationState(next)?.error?.message).toContain('original shared data preserved');
    expect(Y.encodeStateVector(document)).toEqual(original); expect(document.getXmlFragment('fountain').toString()).toBe(fragment);
    expect(legacy.getJSON()).toEqual(next.getJSON());
  } finally { legacy.destroy(); next.destroy(); document.destroy(); }
});

it('uses no browser globals for the connected adapter and removes awareness subscriptions on destroy', () => {
  const pair = peers();
  expect(typeof globalThis.document).toBe('undefined'); expect(typeof globalThis.window).toBe('undefined'); expect(pair.listeners.size).toBe(2);
  pair.left.destroy(); pair.right.destroy(); expect(pair.listeners.size).toBe(0);
  pair.leftDoc.destroy(); pair.rightDoc.destroy();
});

it('merges separate nested structured attributes and undoes only the author field', () => {
  const definition = defineStructuredAttribute({ nodeType: 'structured_panel', attribute: 'config', root: 'object' });
  const panel = defineExtension({ name: 'test-panel', nodes: { structured_panel: { group: 'block', atom: true } } });
  const pair = peers({ type: 'doc', content: [{ type: 'structured_panel', attrs: { nodeId: 'panel-1', config: { layout: { columns: 2, compact: false } } } }] },
    [CoreExtension, panel], { structuredAttributes: { definitions: [definition] } });
  try {
    expect(setStructuredAttribute(pair.left, [0], definition, ['layout', 'columns'], 4)).toBe(true);
    expect(setStructuredAttribute(pair.right, [0], definition, ['layout', 'compact'], true)).toBe(true); pair.sync();
    expect(pair.left.state.doc.child(0).attrs.config).toEqual({ layout: { columns: 4, compact: true } });
    expect(undoCollaboration(pair.left)).toBe(true); pair.sync(true);
    expect(pair.left.state.doc.child(0).attrs.config).toEqual({ layout: { columns: 2, compact: true } });
    expect(redoCollaboration(pair.left)).toBe(true); pair.sync();
    expect(pair.left.state.doc.child(0).attrs.config).toEqual({ layout: { columns: 4, compact: true } });
  } finally { pair.destroy(); }
});

function standalone(document: Y.Doc, text: string, provider?: YjsProvider) {
  const adapter = new RetainedYjsCollaborationAdapter({ document, provider, user: { id: 'test', name: 'Test', color: '#a855f7' } });
  const kit = composeExtensions([CoreExtension, createCollaborationExtension({ adapter: () => adapter })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } });
  return { adapter, editor };
}

it('retires an old provider and shared document when replacing the adapter on the same editor', () => {
  const firstDoc = new Y.Doc(), secondDoc = new Y.Doc(), firstListeners = new Set<(value: string | { status?: string }) => void>();
  const firstProvider: YjsProvider = { connect: vi.fn(), disconnect: vi.fn(), on: (_event, listener) => { firstListeners.add(listener); }, off: (_event, listener) => { firstListeners.delete(listener); } };
  const secondProvider: YjsProvider = { connect: vi.fn(), disconnect: vi.fn() };
  const first = standalone(firstDoc, 'First', firstProvider), seed = standalone(secondDoc, 'Second'); seed.editor.destroy();
  const staleStatus = [...firstListeners][0];
  try {
    const replacement = new RetainedYjsCollaborationAdapter({ document: secondDoc, provider: secondProvider, user: { id: 'test', name: 'Test', color: '#a855f7' } });
    expect(replaceCollaborationAdapter(first.editor, replacement)).toBe(true); expect(first.editor.getText()).toBe('Second');
    expect(firstProvider.disconnect).toHaveBeenCalledTimes(1); expect(firstListeners.size).toBe(0); expect(secondProvider.connect).toHaveBeenCalledTimes(1);
    staleStatus('disconnected'); expect(getCollaborationState(first.editor)?.status).toBe('connected');
    const oldPeer = standalone(firstDoc, 'Unused');
    try { oldPeer.editor.dispatch(oldPeer.editor.createTransaction().insertText([0, 0], 0, 'Old ')); expect(first.editor.getText()).toBe('Second'); }
    finally { oldPeer.editor.destroy(); }
    const newPeer = standalone(secondDoc, 'Unused');
    try { newPeer.editor.dispatch(newPeer.editor.createTransaction().insertText([0, 0], 0, 'Fresh ')); expect(first.editor.getText()).toBe('Fresh Second'); }
    finally { newPeer.editor.destroy(); }
  } finally { first.editor.destroy(); firstDoc.destroy(); secondDoc.destroy(); }
  expect(secondProvider.disconnect).toHaveBeenCalledTimes(1);
});

it('does not revive a disconnected session after its pending provider connection resolves', async () => {
  const document = new Y.Doc(); let resolve!: () => void;
  const provider: YjsProvider = { connect: vi.fn(() => new Promise<void>(done => { resolve = done; })), disconnect: vi.fn() };
  const { editor } = standalone(document, 'Pending', provider);
  try {
    expect(getCollaborationState(editor)?.status).toBe('connecting'); expect(disconnectCollaboration(editor)).toBe(true);
    resolve(); await Promise.resolve(); await Promise.resolve();
    expect(getCollaborationState(editor)?.status).toBe('disconnected'); expect(provider.disconnect).toHaveBeenCalledTimes(1);
  } finally { editor.destroy(); document.destroy(); }
});

it('coalesces awareness changes and cancels the retired timer through reconnect', () => {
  vi.useFakeTimers();
  const document = new Y.Doc(), states = new Map<number, Record<string, unknown>>(), listeners = new Set<() => void>();
  const write = vi.fn((field: string, value: unknown) => { states.set(document.clientID, { [field]: value }); });
  const awareness: YjsAwareness = { clientID: document.clientID, getLocalState: () => states.get(document.clientID) ?? null, getStates: () => states,
    setLocalStateField: write, on: (_event, listener) => { listeners.add(listener); }, off: (_event, listener) => { listeners.delete(listener); } };
  const kit = composeExtensions([CoreExtension, createRetainedYjsCollaborationExtension({ document, awareness, presenceThrottleMs: 32, user: { id: 'test', name: 'Test', color: '#a855f7' } })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: source });
  try {
    const initial = write.mock.calls.length;
    for (const offset of [1, 2, 3, 4]) editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], offset)));
    expect(write).toHaveBeenCalledTimes(initial); vi.advanceTimersByTime(32); expect(write).toHaveBeenCalledTimes(initial + 1);
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 1)));
    expect(reconnectCollaboration(editor)).toBe(true); const after = write.mock.calls.length;
    vi.advanceTimersByTime(64); expect(write).toHaveBeenCalledTimes(after); expect(listeners.size).toBe(1);
  } finally { editor.destroy(); document.destroy(); vi.useRealTimers(); }
  expect(listeners.size).toBe(0);
});

it('makes an older adapter refuse a retained room without overwriting it', () => {
  const document = new Y.Doc(), fresh = standalone(document, 'Retained'), state = Y.encodeStateVector(document);
  const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, user: { id: 'old', name: 'Old', color: '#a855f7' } })]);
  const old = createEditor({ schema: kit.schema, plugins: kit.plugins, content: source });
  try { expect(getCollaborationState(old)?.status).toBe('error'); expect(Y.encodeStateVector(document)).toEqual(state); expect(fresh.editor.getText()).toBe('Retained'); }
  finally { old.destroy(); fresh.editor.destroy(); document.destroy(); }
});

it.each(['retained', 'legacy'] as const)('preserves a local draft after a malformed %s update is repaired by a peer', kind => {
  const document = new Y.Doc(), peer = new Y.Doc();
  const factory = kind === 'legacy' ? createYjsCollaborationExtension : createRetainedYjsCollaborationExtension;
  const listeners = new Set<(status: string | { status?: string }) => void>();
  const provider: YjsProvider = { connect: vi.fn(), disconnect: vi.fn(),
    on: (_event, listener) => { listeners.add(listener); }, off: (_event, listener) => { listeners.delete(listener); } };
  const kit = composeExtensions([CoreExtension, factory({ document, provider, captureTimeout: 0, user: { id: 'local', name: 'Local', color: '#7048e8' } })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: source });
  try {
    editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'Shared '));
    expect(canUndoCollaboration(editor)).toBe(true);
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(document));
    const receive = () => Y.applyUpdate(document, Y.encodeStateAsUpdate(peer, Y.encodeStateVector(document)), 'remote-provider');
    const block = kind === 'legacy' ? (peer.getXmlFragment('fountain').get(0) as Y.XmlElement).get(0) as Y.XmlElement : undefined;
    const attrs = peer.getMap('fountain-nodes:root');
    const attribute = 'attr:' + retainedNameKey('bad');
    if (block) block.setAttribute('fountain:type', 'unknown');
    else attrs.set(attribute, '{');
    receive();
    expect(getCollaborationState(editor)).toMatchObject({ status: 'error', error: { recoverable: true } });
    expect(canUndoCollaboration(editor)).toBe(false);
    expect(undoCollaboration(editor)).toBe(false);
    const invalid = Y.encodeStateAsUpdate(document);
    for (const listener of listeners) listener('connected');
    expect(getCollaborationState(editor)?.status).toBe('error');
    editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'Local draft '));
    expect(Y.encodeStateAsUpdate(document)).toEqual(invalid);
    if (block) block.setAttribute('fountain:type', 'paragraph');
    else attrs.delete(attribute);
    receive();
    expect(editor.state.doc.child(0).textContent).toBe('Local draft Shared Alpha');
    expect(getCollaborationState(editor)?.error?.message).toContain('Preserve the local draft');
    const repaired = Y.encodeStateAsUpdate(document);
    expect(reconnectCollaboration(editor)).toBe(false);
    expect(provider.connect).toHaveBeenCalledTimes(1);
    expect(Y.encodeStateAsUpdate(document)).toEqual(repaired);
  } finally { editor.destroy(); document.destroy(); peer.destroy(); }
});

it.each(['retained', 'legacy'] as const)('stops %s synchronization when a host rejects a remote transaction', kind => {
  const document = new Y.Doc(), peer = new Y.Doc();
  const factory = kind === 'legacy' ? createYjsCollaborationExtension : createRetainedYjsCollaborationExtension;
  const make = (document: Y.Doc, guarded = false) => {
    const kit = composeExtensions([CoreExtension, factory({ document, user: { id: 'author', name: 'Author', color: '#7048e8' } })]);
    const filter = new Plugin({ filterTransaction: transaction => transaction.getMeta('fountain$collaborationRemote') !== true });
    return createEditor({ schema: kit.schema, plugins: guarded ? [...kit.plugins, filter] : kit.plugins, content: source });
  };
  const editor = make(document, true);
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(document));
  const remote = make(peer);
  try {
    remote.dispatch(remote.createTransaction().insertText([0, 0], 0, 'Remote '));
    Y.applyUpdate(document, Y.encodeStateAsUpdate(peer, Y.encodeStateVector(document)), 'remote-provider');
    expect(editor.state.doc.child(0).textContent).toBe('Alpha');
    expect(getCollaborationState(editor)?.error?.message).toContain('Preserve the local draft');
    const rejected = Y.encodeStateAsUpdate(document);
    editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'Private '));
    expect(editor.state.doc.child(0).textContent).toBe('Private Alpha');
    expect(Y.encodeStateAsUpdate(document)).toEqual(rejected);
  } finally { editor.destroy(); remote.destroy(); document.destroy(); peer.destroy(); }
});

it.each(['retained', 'legacy'] as const)('detects conflicting offline initialization against a %s peer without discarding either root', kind => {
  const leftDoc = new Y.Doc(), rightDoc = new Y.Doc(), left = standalone(leftDoc, 'Left');
  const extension = kind === 'retained' ? createRetainedYjsCollaborationExtension : createYjsCollaborationExtension;
  const kit = composeExtensions([CoreExtension, extension({ document: rightDoc, user: { id: 'right', name: 'Right', color: '#a855f7' } })]);
  const right = createEditor({ schema: kit.schema, plugins: kit.plugins, content: source });
  try {
    const a = Y.encodeStateAsUpdate(leftDoc), b = Y.encodeStateAsUpdate(rightDoc);
    Y.applyUpdate(leftDoc, b, 'peer'); Y.applyUpdate(rightDoc, a, 'peer');
    expect(getCollaborationState(left.editor)?.status).toBe('error'); expect(getCollaborationState(right)?.status).toBe('error');
    expect(leftDoc.getXmlFragment('fountain').length).toBe(2); expect(rightDoc.getXmlFragment('fountain').length).toBe(2);
    expect(left.editor.getText()).toBe('Left'); expect(right.getJSON()).toMatchObject({ content: source.content });
    if (kind === 'legacy') {
      const state = Y.encodeStateVector(rightDoc), roots = rightDoc.getXmlFragment('fountain').toString();
      right.dispatch(right.createTransaction().insertText([0, 0], 0, 'Local draft '));
      expect(getCollaborationState(right)?.error?.message).toContain('refusing legacy writes');
      expect(Y.encodeStateVector(rightDoc)).toEqual(state); expect(rightDoc.getXmlFragment('fountain').toString()).toBe(roots);
    }
  } finally { left.editor.destroy(); right.destroy(); leftDoc.destroy(); rightDoc.destroy(); }
});

it.each(['retained', 'legacy'] as const)('keeps an established %s editor fenced after a mixed room appears to recover', kind => {
  const localDoc = new Y.Doc(), foreignDoc = new Y.Doc();
  const make = (document: Y.Doc, protocol: 'legacy' | 'retained', id: string) => {
    const extension = protocol === 'legacy' ? createYjsCollaborationExtension : createRetainedYjsCollaborationExtension;
    const kit = composeExtensions([CoreExtension, extension({document, captureTimeout:0, user:{id,name:id,color:'#7048e8'}})]);
    return createEditor({schema:kit.schema, plugins:kit.plugins, content:source});
  };
  const local = make(localDoc, kind, 'Local'), foreign = make(foreignDoc, kind === 'legacy' ? 'retained' : 'legacy', 'Foreign');
  try {
    local.dispatch(local.createTransaction().insertText([0,0], 0, 'Saved '));
    expect(canUndoCollaboration(local)).toBe(true);
    Y.applyUpdate(localDoc, Y.encodeStateAsUpdate(foreignDoc), 'wrong room');
    expect(getCollaborationState(local)?.status).toBe('error');
    const mixed = Y.encodeStateAsUpdate(localDoc);
    expect(canUndoCollaboration(local)).toBe(false);
    expect(undoCollaboration(local)).toBe(false);
    expect(redoCollaboration(local)).toBe(false);
    local.dispatch(local.createTransaction().insertText([0,0], 0, 'Draft '));
    expect(local.state.doc.child(0).textContent).toBe('Draft Saved Alpha');
    expect(Y.encodeStateAsUpdate(localDoc)).toEqual(mixed);

    // Removing the wrong root does not reconcile the editor's private draft.
    const fragment = localDoc.getXmlFragment('fountain');
    const own = kind === 'legacy' ? 'fountain-node' : 'fountain-retained-room';
    fragment.delete(fragment.toArray().findIndex(root => (root as Y.XmlElement).nodeName !== own), 1);
    const repaired = Y.encodeStateAsUpdate(localDoc);
    expect(getCollaborationState(local)?.status).toBe('error');
    expect(local.state.doc.child(0).textContent).toBe('Draft Saved Alpha');
    reconnectCollaboration(local);
    expect(getCollaborationState(local)?.status).toBe('error');
    expect(local.state.doc.child(0).textContent).toBe('Draft Saved Alpha');
    expect(Y.encodeStateAsUpdate(localDoc)).toEqual(repaired);
  } finally { local.destroy(); foreign.destroy(); localDoc.destroy(); foreignDoc.destroy(); }
});
