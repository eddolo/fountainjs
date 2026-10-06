import { describe, expect, it } from 'vitest';
import { Schema, positionToTextPoint } from '../src/headless';
import type { Node, SchemaSpec } from '../src/core/schema';

const spec: SchemaSpec = { nodes: { doc: { content: 'block*' }, text: { inline: true, group: 'inline' },
  p: { group: 'block', content: 'inline*' }, atom: { group: 'inline', inline: true, atom: true },
  media: { group: 'block', atom: true }, nest: { group: 'block', content: 'block*' } }, marks: { strong: {} } };
const schema = new Schema(spec);
const p = (text: string[]) => schema.node('p', {}, text.map((value, index) => schema.text(value, index % 2 ? [schema.mark('strong')] : [])));

// Independent full-table oracle retains the old exhaustive semantics. Test
// code deliberately prioritizes clarity, not the production streaming approach.
function reference(doc: Node, position: number, association: number) {
  const leaves: { path: number[]; from: number; to: number }[] = [];
  const visit = (node: Node, path: number[], before: number, root = false) => {
    if (node.isText) { leaves.push({ path, from: before, to: before + node.text!.length }); return; }
    let at = before + (root ? 0 : 1);
    node.content.forEach((child, index) => { visit(child, [...path, index], at); at += child.nodeSize; });
  };
  visit(doc, [], 0, true);
  if (!leaves.length) throw new Error('The document does not contain an editable text position.');
  const interior = leaves.find(leaf => leaf.from < position && position < leaf.to);
  const endpoints = leaves.filter(leaf => leaf.from === position || leaf.to === position);
  const selected = interior ?? (association < 0 ? endpoints[0] : endpoints.at(-1))
    ?? (association < 0 ? [...leaves].reverse().find(leaf => leaf.to <= position) ?? leaves[0]
      : leaves.find(leaf => leaf.from >= position) ?? leaves.at(-1))!;
  return { path: selected.path, offset: Math.max(0, Math.min(position - selected.from, selected.to - selected.from)) };
}

describe('streaming structural text point resolution', () => {
  it('matches the exhaustive oracle at every position in nested, empty and atomic documents', () => {
    const candidates = [p([]), p(['']), p(['a']), p(['', '', '']), p(['ab', '', 'cd']), p(['', 'x', '']),
      schema.node('media'), schema.node('p', {}, [schema.node('atom')]),
      schema.node('nest', {}, [p(['nested']), schema.node('media'), p(['', 'tail'])]),
      schema.node('p', {}, [schema.text('a'), schema.node('atom'), schema.text('b')])];
    const docs = [schema.node('doc'), schema.text('root'), schema.text('')];
    for (const left of candidates) for (const right of candidates) docs.push(schema.node('doc', {}, [left, right]));
    for (const middle of candidates) docs.push(schema.node('doc', {}, [p(['first']), middle, p(['last'])]));
    for (const doc of docs) for (let position = 0; position <= doc.nodeSize + 4; position++) {
      for (const association of [-1, 1] as const) {
        let expected;
        try { expected = reference(doc, position, association); }
        catch (error) { expect(() => positionToTextPoint(doc, position, association)).toThrow((error as Error).message); continue; }
        expect(positionToTextPoint(doc, position, association)).toEqual(expected);
      }
    }
  });

  it('keeps validation and no-editable-text refusal intact', () => {
    const doc = schema.node('doc', {}, [p(['text'])]);
    for (const invalid of [-1, Infinity, NaN, 0.5]) expect(() => positionToTextPoint(doc, invalid)).toThrow('Invalid document position');
    for (const doc of [schema.node('doc'), schema.node('doc', {}, [schema.node('media')]), schema.node('doc', {}, [p([])])]) {
      expect(() => positionToTextPoint(doc, 0)).toThrow('does not contain an editable text position');
    }
  });

  it('does not create path iterators per leaf for a 10,000-block lookup', () => {
    const doc = schema.node('doc', {}, Array.from({ length: 10_000 }, () => p(['first', '', 'last'])));
    const iterator = Array.prototype[Symbol.iterator];
    let allocations = 0;
    let points;
    Array.prototype[Symbol.iterator] = function () { allocations++; return iterator.call(this); };
    try { points = [positionToTextPoint(doc, 2), positionToTextPoint(doc, doc.nodeSize + 10, -1)]; }
    finally { Array.prototype[Symbol.iterator] = iterator; }
    expect(allocations).toBe(0);
    expect(points).toEqual([{ path: [0, 0], offset: 1 }, { path: [9999, 2], offset: 4 }]);
    expect(Object.isFrozen(points[0].path)).toBe(true);
    expect(Object.isFrozen(points[1].path)).toBe(true);
    expect(points[0].path).not.toBe(points[1].path);
  });

  it('keeps positive association on the final empty endpoint without jumping blocks', () => {
    const doc = schema.node('doc', {}, [p(['a', '', '', 'b']), p(['next'])]);
    expect(positionToTextPoint(doc, 2, -1)).toEqual({ path: [0, 0], offset: 1 });
    expect(positionToTextPoint(doc, 2, 1)).toEqual({ path: [0, 3], offset: 0 });
    expect(positionToTextPoint(doc, 3, 1)).toEqual({ path: [0, 3], offset: 1 });
  });
});
