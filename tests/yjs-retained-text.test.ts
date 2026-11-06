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
function peers(value = 'Alpha', reverseIDs?: boolean) {
  const leftDoc = new Y.Doc(), leftOrigin = {}, rightOrigin = {};
  if (reverseIDs !== undefined) leftDoc.clientID = reverseIDs ? 202 : 101;
  const left = new RetainedTextStore(leftDoc, 'candidate-text', leftOrigin);
  left.create('stream', 'first', [{ text: value }]);
  const rightDoc = new Y.Doc(); if (reverseIDs !== undefined) rightDoc.clientID = reverseIDs ? 101 : 202;
  Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc));
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

for (const reverse of [false, true]) it.each([false, true])(`does not resurrect a removed mark from a concurrent format snapshot (reverse exchange: ${reverse}, reverse IDs: %s)`, reverseIDs => {
  const pair = peers('Alpha', reverseIDs);
  try {
    pair.left.format('first', 0, 5, { strong: '{}' }); pair.sync();
    pair.left.format('first', 1, 4, { strong: null }); pair.right.format('first', 1, 4, { em: '{}' }); pair.sync(reverse);
    expect(pair.left.project('first').runs).toEqual(pair.right.project('first').runs);
    const middle = pair.left.project('first').runs.filter(run => run.attributes?.em);
    expect(middle.map(run => run.text).join('')).toBe('lph');
    expect(middle.every(run => !run.attributes?.strong)).toBe(true);
  } finally { pair.destroy(); }
});

it.each([false, true])('preserves both independently styled insertions when a third peer deletes all original text (reverse IDs: %s)', reverseIDs => {
  const pair = peers('Alpha', reverseIDs), document = new Y.Doc();
  Y.applyUpdate(document, Y.encodeStateAsUpdate(pair.leftDoc), 'seed');
  const third = new RetainedTextStore(document, 'candidate-text');
  try {
    pair.left.insert('first', 2, 'X', { strong: '{}' }); pair.right.insert('first', 2, 'Y', { em: '{}' }); third.delete('first', 0, 5);
    const updates = [pair.leftDoc, pair.rightDoc, document].map(doc => Y.encodeStateAsUpdate(doc));
    for (const doc of [pair.leftDoc, pair.rightDoc, document]) for (const update of updates) Y.applyUpdate(doc, update, 'peer');
    const runs = pair.left.project('first').runs;
    expect(runs).toEqual(pair.right.project('first').runs); expect(runs).toEqual(third.project('first').runs);
    expect(runs.map(run => run.text).join('').split('').sort().join('')).toBe('XY');
    expect(runs.find(run => run.text.includes('X'))?.attributes).toEqual({ strong: '{}' });
    expect(runs.find(run => run.text.includes('Y'))?.attributes).toEqual({ em: '{}' });
  } finally { third.destroy(); document.destroy(); pair.destroy(); }
});

it('retains opaque format strings exactly and rejects oversized snapshots before writing', () => {
  const pair = peers();
  try {
    const source = JSON.stringify({ source: '\u200b\\alpha\n"quoted"', attrs: JSON.parse('{"__proto__":"data"}') });
    pair.left.insert('first', 2, 'X', { format: source }); pair.sync();
    expect(pair.left.project('first').runs.find(run => run.text === 'X')?.attributes).toEqual({ format: source });
    const state = Y.encodeStateVector(pair.leftDoc);
    expect(() => pair.left.insert('first', 0, 'bad', { a: '\u0000'.repeat(400_000) })).toThrow('provenance is too large');
    expect(Y.encodeStateVector(pair.leftDoc)).toEqual(state);
  } finally { pair.destroy(); }
});

it.each(['missing', 'invalid', 'missing-fields'] as const)('refuses %s provenance without overwriting the raw shared state', kind => {
  const pair = peers();
  try {
    const text = pair.leftDoc.getMap('candidate-text:texts').get('stream') as Y.Text;
    text.format(1, 1, { '$f': kind === 'missing' ? null : kind === 'invalid' ? '{"id":"bad","attributes":{}}' : '{"id":"1:2","unknown":{}}' });
    const state = Y.encodeStateVector(pair.leftDoc), original = text.toDelta();
    expect(() => pair.left.project('first')).toThrow(/provenance/);
    expect(Y.encodeStateVector(pair.leftDoc)).toEqual(state); expect(text.toDelta()).toEqual(original);
  } finally { pair.destroy(); }
});

it.each([1, 2])('refuses provisional text codec %s instead of silently converting its existing data', version => {
  const document = new Y.Doc();
  try {
    document.getMap('candidate-text:metadata').set('version', `fountain-retained-text/${version}`);
    const state = Y.encodeStateVector(document);
    expect(() => new RetainedTextStore(document, 'candidate-text')).toThrow('Unsupported');
    expect(Y.encodeStateVector(document)).toEqual(state);
  } finally { document.destroy(); }
});

it('shares one local style definition across insertions and keeps it available through author undo/redo', () => {
  const pair = peers('Alpha', false);
  const manager = new Y.UndoManager([...pair.left.scope], { trackedOrigins: new Set([pair.leftOrigin]), captureTimeout: 0 });
  try {
    pair.left.insert('first', 2, 'X', { strong: '{}' }); pair.left.insert('first', 3, 'Y', { strong: '{}' });
    const definitions = pair.leftDoc.getMap('candidate-text:styles'); expect(definitions.size).toBe(2);
    const original = pair.left.project('first'); pair.sync();
    manager.undo(); manager.undo(); expect(plain(pair.left, 'first')).toBe('Alpha'); expect(definitions.size).toBe(2);
    manager.redo(); manager.redo(); pair.sync(true);
    expect(pair.left.project('first')).toEqual(original); expect(pair.right.project('first')).toEqual(original);
    expect(definitions.size).toBe(2);
  } finally { manager.destroy(); pair.destroy(); }
});

it('uses distinct definition identities for multiple controllers on the same Y.Doc', () => {
  const pair = peers('Alpha', false), second = new RetainedTextStore(pair.leftDoc, 'candidate-text');
  try {
    pair.left.insert('first', 0, 'X', { strong: '{}' }); second.insert('first', 0, 'Y', { em: '{}' }); pair.sync();
    expect(pair.left.project('first').runs).toEqual(second.project('first').runs);
    expect(pair.left.project('first').runs.find(run => run.text === 'X')?.attributes).toEqual({ strong: '{}' });
    expect(pair.left.project('first').runs.find(run => run.text === 'Y')?.attributes).toEqual({ em: '{}' });
  } finally { second.destroy(); pair.destroy(); }
});

it.each(['missing', 'malformed'] as const)('invalidates decoded styles after a %s shared definition change without repairing it', kind => {
  const pair = peers();
  try {
    pair.left.project('first'); const definitions = pair.leftDoc.getMap('candidate-text:styles'), key = [...definitions.keys()][0];
    if (kind === 'missing') definitions.delete(key); else definitions.set(key, '"not a format object"');
    const state = Y.encodeStateVector(pair.leftDoc), original = definitions.toJSON();
    expect(() => pair.left.project('first')).toThrow(); expect(Y.encodeStateVector(pair.leftDoc)).toEqual(state); expect(definitions.toJSON()).toEqual(original);
  } finally { pair.destroy(); }
});

it('does not let the adjacent-run cache bypass validation of a changed wire field', () => {
  const pair = peers();
  try {
    pair.left.insert('first', 0, 'X', { strong: '{}' }); pair.left.insert('first', 1, 'Y', { strong: '{}' });
    const text = pair.leftDoc.getMap('candidate-text:texts').get('stream') as Y.Text;
    text.format(2, 1, { strong: null, prototype: 'null' });
    expect(() => pair.left.project('first')).toThrow('Invalid retained text attribute');
  } finally { pair.destroy(); }
});

it('keeps literal null/false strings distinct from a format-removal value', () => {
  const pair = peers();
  try {
    pair.left.insert('first', 2, 'X', { literalFalse: 'false', literalNull: 'null', quoted: '"quoted"' });
    expect(pair.left.project('first').runs.find(run => run.text === 'X')?.attributes).toEqual({ literalFalse: 'false', literalNull: 'null', quoted: '"quoted"' });
    pair.left.format('first', 2, 3, { literalFalse: null }); pair.sync();
    expect(pair.right.project('first').runs.find(run => run.text === 'X')?.attributes).toEqual({ literalNull: 'null', quoted: '"quoted"' });
  } finally { pair.destroy(); }
});

it('reopens compact definitions, removals and relative anchors from a Yjs V2 saved update', () => {
  const pair = peers(), document = new Y.Doc(); let reopened: RetainedTextStore | undefined;
  try {
    pair.left.insert('first', 2, '😀', { strong: '{}' }); pair.left.split('first', 'second', 4);
    pair.left.format('first', 2, 4, { strong: null, em: '{}' });
    const anchor = JSON.parse(JSON.stringify(pair.left.relative('first', 4, -1)));
    Y.applyUpdateV2(document, Y.encodeStateAsUpdateV2(pair.leftDoc));
    reopened = new RetainedTextStore(document, 'candidate-text');
    expect(reopened.partitions('stream')).toEqual(pair.left.partitions('stream'));
    expect(reopened.resolve(anchor)).toEqual(pair.left.resolve(anchor));
  } finally { reopened?.destroy(); document.destroy(); pair.destroy(); }
});

it.each([{ reference: [101, 1, 999_999] }, { reference: [101, -1, 0] }, { reference: [101, 1] }])('rejects an invalid compact reference $reference without a default-style fallback', ({ reference }) => {
  const pair = peers('Alpha', false);
  try {
    const text = pair.leftDoc.getMap('candidate-text:texts').get('stream') as Y.Text;
    text.format(1, 1, { '$f': reference }); const state = Y.encodeStateVector(pair.leftDoc);
    expect(() => pair.left.project('first')).toThrow(/provenance/); expect(Y.encodeStateVector(pair.leftDoc)).toEqual(state);
  } finally { pair.destroy(); }
});

it.each([1, 7, 19, 31, 47, 73])('preserves each local text/style operation during a deterministic offline edit sequence (seed %s)', seed => {
  const pair = peers('Alpha', seed % 4 === 1); let state = seed;
  const random = (limit: number) => { state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0; return state % limit; };
  const cells = (store: RetainedTextStore, id: string) => store.project(id).runs.flatMap(run =>
    run.text.split('').map(text => ({ text, attributes: { ...run.attributes } as Record<string, string> })));
  try {
    for (let round = 0; round < 4; round++) {
      for (const [who, store] of [['left', pair.left], ['right', pair.right]] as const) for (let index = 0; index < 10; index++) {
        const parts = store.partitions('stream'), at = random(parts.length), id = parts[at].id, before = cells(store, id);
        const from = random(before.length + 1), to = from + random(before.length - from + 1), operation = random(5);
        if (operation === 0) {
          const format: Record<string, string> = random(2) ? { strong: '{}' } : { em: '{}' }, text = who === 'left' ? 'L' : 'R';
          store.insert(id, from, text, format); before.splice(from, 0, { text, attributes: format });
          expect(cells(store, id)).toEqual(before);
        } else if (operation === 1) {
          store.delete(id, from, to); before.splice(from, to - from); expect(cells(store, id)).toEqual(before);
        } else if (operation === 2) {
          const key = random(2) ? 'strong' : 'em', value = random(2) ? '{}' : null;
          store.format(id, from, to, { [key]: value });
          for (const cell of before.slice(from, to)) { if (value === null) delete cell.attributes[key]; else cell.attributes[key] = value; }
          expect(cells(store, id)).toEqual(before);
        } else if (operation === 3 && parts.length < 8) {
          const next = `${who}-${round}-${index}`; store.split(id, next, from);
          expect(cells(store, id)).toEqual(before.slice(0, from)); expect(cells(store, next)).toEqual(before.slice(from));
        } else if (at + 1 < parts.length) {
          const next = parts[at + 1].id, expected = [...before, ...cells(store, next)]; store.join(id, next); expect(cells(store, id)).toEqual(expected);
        }
      }
      pair.sync(round % 2 === 1); expect(pair.left.partitions('stream')).toEqual(pair.right.partitions('stream'));
    }
  } finally { pair.destroy(); }
});

it.each([false, true])('projects a private split boundary that inherited concurrent formatting (reverse exchange: %s)', reverse => {
  const pair = peers();
  try {
    pair.left.split('first', 'second', 3); pair.right.format('first', 0, 5, { strong: '{}' }); pair.sync(reverse);
    expect(['first', 'second'].map(id => plain(pair.left, id))).toEqual(['Alp', 'ha']);
    expect(pair.left.partitions('stream')).toEqual(pair.right.partitions('stream'));
    for (const id of ['first', 'second']) expect(pair.left.project(id).runs.every(run => run.attributes?.strong === '{}')).toBe(true);
  } finally { pair.destroy(); }
});

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

it('updates text operations inside a single transaction and refuses reads after destroy', () => {
  const pair = peers();
  try {
    pair.leftDoc.transact(() => {
      pair.left.split('first', 'second', 2); pair.left.insert('second', 0, 'X'); pair.left.format('second', 0, 1, { strong: '{}' });
      expect(plain(pair.left, 'first')).toBe('Al'); expect(plain(pair.left, 'second')).toBe('Xpha');
      pair.left.delete('second', 1, 2); expect(plain(pair.left, 'second')).toBe('Xha');
      pair.left.join('first', 'second'); expect(plain(pair.left, 'first')).toBe('AlXha');
      pair.left.format('first', 2, 3, { strong: null });
      expect(pair.left.project('first').runs.some(run => run.attributes?.strong)).toBe(false);
      expect(pair.left.has('second')).toBe(false);
    }, pair.leftOrigin);
    pair.sync(); expect(pair.left.partitions('stream')).toEqual(pair.right.partitions('stream'));
    pair.left.destroy(); pair.left.destroy(); expect(() => pair.left.project('first')).toThrow('destroyed');
  } finally { pair.destroy(); }
});

it('reads direct shared edits made between projections inside a caller-owned transaction', () => {
  const pair = peers();
  try {
    expect(plain(pair.left, 'first')).toBe('Alpha');
    const text = pair.leftDoc.getMap('candidate-text:texts').get('stream') as Y.Text;
    const format = text.toDelta().find((operation: { insert?: unknown }) => typeof operation.insert === 'string')!.attributes;
    pair.leftDoc.transact(() => {
      text.insert(3, 'X', format);
      expect(plain(pair.left, 'first')).toBe('AlXpha');
      text.delete(3, 1);
      expect(plain(pair.left, 'first')).toBe('Alpha');
    });
  } finally { pair.destroy(); }
});

it('projects requested partitions across streams without emitting shared transactions or retaining a stale batch', () => {
  const pair = peers();
  try {
    pair.left.split('first', 'second', 2);
    pair.left.create('other-stream', 'other', [{ text: 'Ω', attributes: { strong: '{}' } }]);
    const transactions: Y.Transaction[] = [];
    const record = (transaction: Y.Transaction) => transactions.push(transaction);
    pair.leftDoc.on('afterTransaction', record);
    const first = pair.left.projectMany(['second', 'other', 'first', 'second']);
    expect([...first].map(([id, value]) => [id, value.runs.map(run => run.text).join('')])).toEqual([
      ['second', 'pha'], ['other', 'Ω'], ['first', 'Al'],
    ]);
    expect(transactions).toEqual([]);
    pair.leftDoc.off('afterTransaction', record);
    const text = pair.leftDoc.getMap('candidate-text:texts').get('stream') as Y.Text;
    const format = text.toDelta().find((operation: { insert?: unknown }) => typeof operation.insert === 'string')!.attributes;
    pair.leftDoc.transact(() => {
      text.insert(2, 'X', format);
      expect(pair.left.projectMany(['first']).get('first')!.runs.map(run => run.text).join('')).toBe('AXl');
      expect(first.get('first')!.runs.map(run => run.text).join('')).toBe('Al');
      expect(() => pair.left.projectMany(['missing'])).toThrow('Unknown');
    });
  } finally { pair.destroy(); }
});

it('refuses a pending malformed style definition without repairing it or poisoning later batch reads', () => {
  const pair = peers();
  try {
    pair.left.projectMany(['first']);
    const styles = pair.leftDoc.getMap('candidate-text:styles'), key = [...styles.keys()][0], original = styles.get(key);
    pair.leftDoc.transact(() => {
      styles.set(key, '"invalid format"');
      const state = Y.encodeStateVector(pair.leftDoc);
      expect(() => pair.left.projectMany(['first'])).toThrow();
      expect(Y.encodeStateVector(pair.leftDoc)).toEqual(state);
      expect(styles.get(key)).toBe('"invalid format"');
      styles.set(key, original);
      expect(plain(pair.left, 'first')).toBe('Alpha');
    });
  } finally { pair.destroy(); }
});

it.each(['owners', 'texts', 'styles'])('retains the global %s bound during an open transaction and a subsequent read', container => {
  const document = new Y.Doc(), store = new RetainedTextStore(document, 'bounds');
  try {
    const map = document.getMap(`bounds:${container}`);
    document.transact(() => {
      for (let index = 0; index <= 100_000; index++) map.set(`entry-${index}`, true);
      const state = Y.encodeStateVector(document);
      expect(() => store.projectMany([])).toThrow(container === 'styles' ? 'Too many retained style definitions' : 'Retained text pool is too large');
      expect(Y.encodeStateVector(document)).toEqual(state);
    });
    expect(() => store.projectMany([])).toThrow();
  } finally { store.destroy(); document.destroy(); }
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
