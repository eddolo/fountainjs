// @vitest-environment node
import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { RetainedNodeStore, type RetainedNodeProjection } from '../src/yjs/retained-nodes';

const factory = (prefix: string) => { let value = 0; return () => `${prefix}-${value++}`; };
const flatten = (node: RetainedNodeProjection): readonly RetainedNodeProjection[] => [node, ...node.content.flatMap(flatten)];
function peers() {
  const leftDoc = new Y.Doc(), rightDoc = new Y.Doc(), leftOrigin = {}, rightOrigin = {};
  const left = new RetainedNodeStore(leftDoc, 'candidate-nodes', factory('left'), leftOrigin);
  const paragraph = left.create({ type: 'paragraph', attrs: { nodeId: 'original-block', label: 'Alpha', owner: 'Ada', custom: { source: ['keep', 12, true] } } });
  const a = left.create({ type: 'callout', attrs: { title: 'A' } }), b = left.create({ type: 'blockquote', attrs: { title: 'B' } });
  Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc));
  const right = new RetainedNodeStore(rightDoc, 'candidate-nodes', factory('right'), rightOrigin);
  return { leftDoc, rightDoc, leftOrigin, rightOrigin, left, right, paragraph, a, b,
    sync: (reverse = false) => {
      const updateA = Y.encodeStateAsUpdate(leftDoc), updateB = Y.encodeStateAsUpdate(rightDoc);
      if (reverse) { Y.applyUpdate(rightDoc, updateA, 'peer'); Y.applyUpdate(leftDoc, updateB, 'peer'); }
      else { Y.applyUpdate(leftDoc, updateB, 'peer'); Y.applyUpdate(rightDoc, updateA, 'peer'); }
    }, destroy: () => { leftDoc.destroy(); rightDoc.destroy(); },
  };
}

it.each([false, true])('preserves concurrent metadata on the same record through reparenting (reverse exchange: %s)', reverse => {
  const pair = peers();
  try {
    const record = pair.rightDoc.getMap('candidate-nodes:nodes').get(pair.paragraph);
    pair.left.move(pair.paragraph, pair.a, 0); pair.right.setAttribute(pair.paragraph, 'owner', 'Grace'); pair.sync(reverse);
    const projected = pair.left.project(); expect(projected).toEqual(pair.right.project()); expect(projected.issues).toEqual([]);
    const parent = projected.root.content.find(node => node.id === pair.a)!;
    expect(parent.content[0]).toMatchObject({ id: pair.paragraph, attrs: { nodeId: 'original-block', owner: 'Grace', custom: { source: ['keep', 12, true] } } });
    expect(pair.rightDoc.getMap('candidate-nodes:nodes').get(pair.paragraph)).toBe(record);
  } finally { pair.destroy(); }
});

it.each([false, true])('chooses one placement after concurrent moves without duplicating the node (reverse exchange: %s)', reverse => {
  const pair = peers();
  try {
    pair.left.move(pair.paragraph, pair.a, 0); pair.right.move(pair.paragraph, pair.b, 0); pair.sync(reverse);
    const left = pair.left.project(), right = pair.right.project(); expect(left).toEqual(right); expect(left.issues).toEqual([]);
    expect(flatten(left.root).filter(node => node.id === pair.paragraph)).toHaveLength(1);
    expect(left.root.content.filter(parent => parent.content.some(node => node.id === pair.paragraph))).toHaveLength(1);
  } finally { pair.destroy(); }
});

it.each([false, true])('projects concurrent parent cycles deterministically without repair writes or dropping nodes (reverse exchange: %s)', reverse => {
  const pair = peers();
  try {
    pair.left.move(pair.a, pair.b, 0); pair.right.move(pair.b, pair.a, 0); pair.sync(reverse);
    const before = Y.encodeStateVector(pair.leftDoc), left = pair.left.project(), right = pair.right.project();
    expect(left).toEqual(right); expect(Y.encodeStateVector(pair.leftDoc)).toEqual(before);
    expect(left.issues).toEqual([{ kind: 'cycle-lifted', id: [pair.a, pair.b].sort().at(-1) }]);
    expect(flatten(left.root).map(node => node.id).sort()).toEqual(['root', pair.paragraph, pair.a, pair.b].sort());
  } finally { pair.destroy(); }
});

it.each(['paragraph', 'heading', 'bullet_list', 'table', 'image_super', 'custom_widget'])(
  'retains opaque %s metadata and descendants while its parent changes', type => {
    const pair = peers();
    try {
      const block = pair.left.create({ type, attrs: { source: { exact: '\\alpha + β', items: [1, 2] } }, marks: [{ type: 'test_mark', attrs: { value: 'retained' } }] });
      const child = pair.left.create({ type: 'text_partition', attrs: { partition: 'stream-part' } }, block);
      pair.sync(); pair.left.move(block, pair.a, 0); pair.right.setAttribute(child, 'annotation', 'peer change'); pair.sync();
      const actual = flatten(pair.left.project().root).find(node => node.id === block)!;
      expect(actual).toMatchObject({ type, attrs: { source: { exact: '\\alpha + β', items: [1, 2] } },
        marks: [{ type: 'test_mark', attrs: { value: 'retained' } }], content: [{ id: child, attrs: { partition: 'stream-part', annotation: 'peer change' } }] });
      expect(pair.left.project()).toEqual(pair.right.project());
    } finally { pair.destroy(); }
  });

it('merges concurrent initial documents through stable named root containers', () => {
  const a = new Y.Doc(), b = new Y.Doc();
  try {
    const left = new RetainedNodeStore(a, 'init', factory('left')), right = new RetainedNodeStore(b, 'init', factory('right'));
    const x = left.create({ type: 'paragraph', attrs: { label: 'Left' } }), y = right.create({ type: 'paragraph', attrs: { label: 'Right' } });
    const updateA = Y.encodeStateAsUpdate(a), updateB = Y.encodeStateAsUpdate(b); Y.applyUpdate(a, updateB); Y.applyUpdate(b, updateA);
    expect(left.project()).toEqual(right.project());
    expect(left.project().root.content.map(node => node.id).sort()).toEqual([x, y].sort());
    expect(left.project().issues).toEqual([]);
  } finally { a.destroy(); b.destroy(); }
});

it('merges independent attribute fields and retains the peer update during author-scoped move undo/redo', () => {
  const pair = peers(), undo = new Y.UndoManager([...pair.left.scope], { trackedOrigins: new Set([pair.leftOrigin]), captureTimeout: 0 });
  try {
    pair.left.move(pair.paragraph, pair.a, 0); pair.right.setAttribute(pair.paragraph, 'owner', 'Grace'); pair.sync();
    expect(undo.undo()).toBeTruthy(); pair.sync();
    expect(pair.left.project().root.content[0]).toMatchObject({ id: pair.paragraph, attrs: { owner: 'Grace' } });
    expect(undo.redo()).toBeTruthy(); pair.sync();
    expect(pair.left.project().root.content.find(node => node.id === pair.a)!.content[0]).toMatchObject({ id: pair.paragraph, attrs: { owner: 'Grace' } });
    expect(pair.left.project()).toEqual(pair.right.project());
  } finally { undo.destroy(); pair.destroy(); }
});

it('retains record identity during type and mark changes while merging another attribute field', () => {
  const pair = peers();
  try {
    const record = pair.leftDoc.getMap('candidate-nodes:nodes').get(pair.paragraph);
    pair.left.setType(pair.paragraph, 'heading'); pair.left.setMarks(pair.paragraph, [{ type: 'test_mark' }]);
    pair.right.setAttribute(pair.paragraph, 'owner', 'Grace'); pair.sync();
    expect(pair.leftDoc.getMap('candidate-nodes:nodes').get(pair.paragraph)).toBe(record);
    expect(pair.left.project().root.content[0]).toMatchObject({ type: 'heading', marks: [{ type: 'test_mark' }], attrs: { owner: 'Grace' } });
    expect(pair.left.project()).toEqual(pair.right.project());
  } finally { pair.destroy(); }
});

it('keeps deletion ownership through a concurrent move and restores peer metadata on undo', () => {
  const pair = peers(), undo = new Y.UndoManager([...pair.left.scope], { trackedOrigins: new Set([pair.leftOrigin]), captureTimeout: 0 });
  try {
    pair.left.remove(pair.paragraph); pair.right.move(pair.paragraph, pair.b, 0); pair.right.setAttribute(pair.paragraph, 'owner', 'Grace'); pair.sync();
    expect(flatten(pair.left.project().root).some(node => node.id === pair.paragraph)).toBe(false);
    expect(undo.undo()).toBeTruthy(); pair.sync();
    expect(pair.left.project().root.content.find(node => node.id === pair.b)!.content[0]).toMatchObject({ id: pair.paragraph, attrs: { owner: 'Grace' } });
    expect(pair.left.project()).toEqual(pair.right.project());
  } finally { undo.destroy(); pair.destroy(); }
});

it('rejects malformed metadata, cycles, bounds and bad identity factories before shared mutation', () => {
  const pair = peers();
  try {
    const before = Y.encodeStateVector(pair.leftDoc);
    expect(() => pair.left.move(pair.a, pair.a, 0)).toThrow('cycle');
    expect(() => pair.left.create({ type: 'paragraph', attrs: { invalid: NaN } })).toThrow();
    expect(() => pair.left.create({ type: 'paragraph' }, pair.a, 3)).toThrow();
    expect(() => pair.left.setAttribute(pair.paragraph, '__proto__', 'bad')).toThrow();
    expect(() => pair.left.setAttribute(pair.paragraph, 'sparse', new Array(2))).toThrow('sparse');
    expect(() => pair.left.setAttribute(pair.paragraph, 'symbols', { [Symbol()]: 'lost' })).toThrow('symbol');
    expect(Y.encodeStateVector(pair.leftDoc)).toEqual(before);
    const broken = new RetainedNodeStore(pair.leftDoc, 'candidate-nodes', () => 'repeated-id');
    expect(() => broken.create({ type: 'paragraph' })).toThrow('distinct');
    expect(Y.encodeStateVector(pair.leftDoc)).toEqual(before);
  } finally { pair.destroy(); }
});

it('renders a duplicated active placement once and reports it without destructive repair', () => {
  const pair = peers();
  try {
    const references = pair.leftDoc.getArray('candidate-nodes:root-children');
    references.push([references.get(0)]);
    const state = Y.encodeStateVector(pair.leftDoc), projected = pair.left.project();
    expect(flatten(projected.root).filter(node => node.id === pair.paragraph)).toHaveLength(1);
    expect(projected.issues).toEqual([{ kind: 'duplicate-reference', id: pair.paragraph }]);
    expect(Y.encodeStateVector(pair.leftDoc)).toEqual(state);
  } finally { pair.destroy(); }
});

it('does not overwrite a future representation version', () => {
  const pair = peers();
  try {
    pair.left.metadata.set('version', 'future-format'); const before = Y.encodeStateVector(pair.leftDoc);
    expect(() => pair.left.project()).toThrow('Unsupported');
    expect(() => new RetainedNodeStore(pair.leftDoc, 'candidate-nodes', factory('unused'))).toThrow('Unsupported');
    expect(Y.encodeStateVector(pair.leftDoc)).toEqual(before);
  } finally { pair.destroy(); }
});

it('reopens a moved structured record from saved shared state without depending on process objects', () => {
  const pair = peers(), document = new Y.Doc();
  try {
    pair.left.move(pair.paragraph, pair.a, 0); pair.left.setAttribute(pair.paragraph, 'owner', 'Grace');
    Y.applyUpdate(document, Y.encodeStateAsUpdate(pair.leftDoc));
    const reopened = new RetainedNodeStore(document, 'candidate-nodes', factory('reopened'));
    expect(reopened.project()).toEqual(pair.left.project());
    const added = reopened.create({ type: 'paragraph', attrs: { label: 'New session' } });
    expect(reopened.project().root.content.some(node => node.id === added)).toBe(true);
  } finally { document.destroy(); pair.destroy(); }
});

it('projects concurrent attribute fields in a deterministic order for document equality and hashing', () => {
  const pair = peers();
  try {
    pair.left.setAttribute(pair.paragraph, 'zeta', 'left'); pair.right.setAttribute(pair.paragraph, 'alpha', 'right'); pair.sync();
    expect(pair.left.project()).toEqual(pair.right.project());
    expect(JSON.stringify(pair.left.project().root)).toBe(JSON.stringify(pair.right.project().root));
  } finally { pair.destroy(); }
});
