// @vitest-environment node
import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { RetainedTextStore } from '../src/yjs/retained-text';

const plain = (store: RetainedTextStore, id: string) => store.project(id).runs.map(run => run.text).join('');

it('merges concurrently initialized pools without replacing either shared container', () => {
  const a = new Y.Doc(), b = new Y.Doc();
  const left = new RetainedTextStore(a, 'concurrent-init'), right = new RetainedTextStore(b, 'concurrent-init');
  try {
    left.create('left-stream', 'left-block', [{ text: 'Left' }]);
    right.create('right-stream', 'right-block', [{ text: 'Right' }]);
    const updateA = Y.encodeStateAsUpdate(a), updateB = Y.encodeStateAsUpdate(b);
    Y.applyUpdate(a, updateB); Y.applyUpdate(b, updateA);
    expect(plain(left, 'left-block')).toBe('Left'); expect(plain(left, 'right-block')).toBe('Right');
    expect(plain(right, 'left-block')).toBe('Left'); expect(plain(right, 'right-block')).toBe('Right');
  } finally { left.destroy(); right.destroy(); a.destroy(); b.destroy(); }
});
function peers(value = 'Alpha') {
  const leftDoc = new Y.Doc(), leftOrigin = {}, rightOrigin = {};
  const left = new RetainedTextStore(leftDoc, 'candidate-text', leftOrigin);
  left.create('stream', 'first', [{ text: value }]);
  const rightDoc = new Y.Doc(); Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc));
  const right = new RetainedTextStore(rightDoc, 'candidate-text', rightOrigin);
  return { leftDoc, rightDoc, left, right, leftOrigin, rightOrigin,
    sync: (reverse = false) => {
      const a = Y.encodeStateAsUpdate(leftDoc), b = Y.encodeStateAsUpdate(rightDoc);
      if (reverse) { Y.applyUpdate(rightDoc, a, 'peer'); Y.applyUpdate(leftDoc, b, 'peer'); }
      else { Y.applyUpdate(leftDoc, b, 'peer'); Y.applyUpdate(rightDoc, a, 'peer'); }
    },
    destroy: () => { left.destroy(); right.destroy(); leftDoc.destroy(); rightDoc.destroy(); },
  };
}

it.each([false, true])('retains character identity through concurrent formatting (reverse exchange: %s)', reverse => {
  const pair = peers();
  try {
    pair.left.insert('first', 2, 'X'); pair.right.format('first', 1, 4, { strong: '{}' }); pair.sync(reverse);
    expect(plain(pair.left, 'first')).toBe('AlXpha');
    expect(pair.left.project('first').runs).toEqual(pair.right.project('first').runs);
    expect(pair.left.project('first').runs.filter(run => run.attributes?.strong).map(run => run.text).join('').replace('X', '')).toBe('lph');
  } finally { pair.destroy(); }
});

it.each([false, true])('keeps offline insertion on its original side of a split (reverse exchange: %s)', reverse => {
  const pair = peers();
  try {
    pair.left.insert('first', 2, 'X'); pair.right.split('first', 'second', 3); pair.sync(reverse);
    expect(['first', 'second'].map(id => plain(pair.left, id))).toEqual(['AlXp', 'ha']);
    expect(pair.left.partitions('stream')).toEqual(pair.right.partitions('stream'));
  } finally { pair.destroy(); }
});

it.each([false, true])('retains independent deletions and duplicate-text identity through splitting (reverse exchange: %s)', reverse => {
  const pair = peers('aaaaaa');
  try {
    pair.left.delete('first', 1, 3); pair.left.insert('first', 1, 'X');
    pair.right.split('first', 'second', 4); pair.sync(reverse);
    expect(['first', 'second'].map(id => plain(pair.left, id))).toEqual(['aXa', 'aa']);
    expect(pair.left.partitions('stream')).toEqual(pair.right.partitions('stream'));
  } finally { pair.destroy(); }
});

it.each([false, true])('partitions concurrent splits exactly once rather than duplicating suffixes (reverse exchange: %s)', reverse => {
  const pair = peers('abcdef');
  try {
    pair.left.split('first', 'left-cut', 2); pair.right.split('first', 'right-cut', 4); pair.sync(reverse);
    expect(pair.left.partitions('stream').map(part => plain(pair.left, part.id))).toEqual(['ab', 'cd', 'ef']);
    expect(pair.left.partitions('stream')).toEqual(pair.right.partitions('stream'));
  } finally { pair.destroy(); }
});

it.each([false, true])('keeps concurrent typing on each side of an existing paragraph boundary (reverse exchange: %s)', reverse => {
  const pair = peers();
  try {
    pair.left.split('first', 'second', 2); pair.sync();
    pair.left.insert('first', 2, 'L'); pair.right.insert('second', 0, 'R'); pair.sync(reverse);
    expect(['first', 'second'].map(id => plain(pair.left, id))).toEqual(['AlL', 'Rpha']);
    expect(pair.left.partitions('stream')).toEqual(pair.right.partitions('stream'));
  } finally { pair.destroy(); }
});

it('keeps repeated empty splits in their actual sequence order and inserts into the chosen empty block', () => {
  const pair = peers();
  try {
    pair.left.split('first', 'second', 0); pair.left.split('first', 'third', 0);
    pair.left.insert('third', 0, 'X'); pair.sync();
    expect(pair.left.partitions('stream').map(part => [part.id, plain(pair.left, part.id)])).toEqual([
      ['first', ''], ['third', 'X'], ['second', 'Alpha'],
    ]);
    expect(pair.left.partitions('stream')).toEqual(pair.right.partitions('stream'));
  } finally { pair.destroy(); }
});

it('uses UTF-16 offsets consistently for astral characters, combining sequences and invisible text', () => {
  const pair = peers('A😀e\u0301\u200BZ');
  try {
    pair.left.split('first', 'second', 3); pair.right.insert('first', 1, 'X'); pair.sync();
    expect(['first', 'second'].map(id => plain(pair.left, id))).toEqual(['AX😀', 'e\u0301\u200BZ']);
  } finally { pair.destroy(); }
});

it('resolves relative carets on both sides of a split without exposing boundary embeds as text', () => {
  const pair = peers();
  try {
    const left = pair.left.relative('first', 3, -1), right = pair.left.relative('first', 3, 1);
    pair.right.split('first', 'second', 3); pair.sync();
    expect(pair.left.resolve(left)).toEqual({ id: 'first', offset: 3, association: -1 });
    expect(pair.left.resolve(right)).toEqual({ id: 'second', offset: 0, association: 1 });
    expect(pair.right.resolve(left)).toEqual(pair.left.resolve(left));
    expect(pair.right.resolve(right)).toEqual(pair.left.resolve(right));
  } finally { pair.destroy(); }
});

it('undoes a split without undoing remote typing, and redoes the boundary on the same text sequence', () => {
  const pair = peers();
  const undo = new Y.UndoManager([...pair.right.scope], { trackedOrigins: new Set([pair.rightOrigin]), captureTimeout: 0 });
  try {
    pair.right.split('first', 'second', 3); pair.left.insert('first', 2, 'X'); pair.sync();
    expect(['first', 'second'].map(id => plain(pair.right, id))).toEqual(['AlXp', 'ha']);
    expect(undo.undo()).toBeTruthy(); pair.sync(); expect(plain(pair.right, 'first')).toBe('AlXpha');
    expect(undo.redo()).toBeTruthy(); pair.sync();
    expect(['first', 'second'].map(id => plain(pair.right, id))).toEqual(['AlXp', 'ha']);
  } finally { undo.destroy(); pair.destroy(); }
});

it('joins adjacent partitions without copying source text and preserves remote typing', () => {
  const pair = peers();
  try {
    pair.left.split('first', 'second', 2); pair.sync();
    const caret = pair.right.relative('second', 1);
    pair.left.join('first', 'second'); pair.right.insert('second', 1, 'X'); pair.sync();
    expect(plain(pair.left, 'first')).toBe('AlpXha');
    expect(pair.left.resolve(caret)).toEqual({ id: 'first', offset: 4, association: 1 });
    expect(pair.left.partitions('stream')).toEqual(pair.right.partitions('stream'));
  } finally { pair.destroy(); }
});

it('updates indexes inside a single transaction and releases observation on destroy', () => {
  const pair = peers();
  try {
    pair.leftDoc.transact(() => {
      pair.left.split('first', 'second', 2); pair.left.insert('second', 0, 'X'); pair.left.format('second', 0, 1, { strong: '{}' });
      expect(plain(pair.left, 'first')).toBe('Al'); expect(plain(pair.left, 'second')).toBe('Xpha');
    }, pair.leftOrigin);
    pair.sync(); expect(pair.left.partitions('stream')).toEqual(pair.right.partitions('stream'));
    pair.left.destroy(); pair.left.destroy(); expect(() => pair.left.project('first')).toThrow('destroyed');
  } finally { pair.destroy(); }
});

it('rejects malformed or incompatible shared values without repairing over them', () => {
  const pair = peers();
  try {
    const before = Y.encodeStateVector(pair.leftDoc);
    expect(() => pair.left.split('first', 'first', 2)).toThrow();
    expect(() => pair.left.insert('first', -1, 'X')).toThrow();
    expect(() => pair.left.format('first', 0, 1, { bad: 12 } as never)).toThrow();
    expect(Y.encodeStateVector(pair.leftDoc)).toEqual(before);
    pair.left.metadata.set('version', 'future-format');
    expect(() => pair.left.project('first')).toThrow('Unsupported');
    expect(() => new RetainedTextStore(pair.leftDoc, 'candidate-text')).toThrow('Unsupported');
    expect(pair.left.metadata.get('version')).toBe('future-format');
  } finally { pair.destroy(); }
});

it('rejects unknown embeds rather than discarding unsupported content', () => {
  const pair = peers();
  try {
    const texts = pair.leftDoc.getMap('candidate-text:texts'), text = texts.get('stream') as Y.Text;
    text.insertEmbed(2, { unsupported: 'preserve me' });
    expect(() => pair.left.project('first')).toThrow('Unknown retained text embed');
    expect(text.toDelta().some((operation: { insert: unknown }) => operation.insert !== null && typeof operation.insert === 'object'
      && 'unsupported' in operation.insert && operation.insert.unsupported === 'preserve me')).toBe(true);
  } finally { pair.destroy(); }
});

it('reopens saved shared state and relative anchors without a browser or local index cache', () => {
  const pair = peers(), document = new Y.Doc();
  let reopened: RetainedTextStore | undefined;
  try {
    pair.left.split('first', 'second', 2); pair.left.format('second', 0, 2, { strong: '{}' });
    pair.left.insert('second', 1, '\u200B');
    const anchor = JSON.parse(JSON.stringify(pair.left.relative('second', 2, -1)));
    Y.applyUpdate(document, Y.encodeStateAsUpdate(pair.leftDoc));
    reopened = new RetainedTextStore(document, 'candidate-text');
    expect(reopened.partitions('stream')).toEqual(pair.left.partitions('stream'));
    expect(reopened.resolve(anchor)).toEqual(pair.left.resolve(anchor));
    expect(plain(reopened, 'second')).toBe('p\u200Bha');
  } finally { reopened?.destroy(); document.destroy(); pair.destroy(); }
});
