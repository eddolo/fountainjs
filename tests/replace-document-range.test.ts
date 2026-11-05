import { expect, it } from 'vitest';
import { CoreSchemaSpec, ReplaceRangeStep, Schema, StarterKit, resolveDocumentPoint, textPointToPosition, type Node, type NodeJSON } from '../src';

const schema = new Schema(StarterKit.schema);
const p = (...text: string[]): NodeJSON => ({ type: 'paragraph', content: text.map(text => ({ type: 'text', text })) });
const q = (...content: NodeJSON[]): NodeJSON => ({ type: 'blockquote', content });
const image: NodeJSON = { type: 'image_super', attrs: { src: '/figure.png', alt: 'Figure' } };
const make = (...content: NodeJSON[]) => schema.nodeFromJSON({ type: 'doc', attrs: { audit: 'Root metadata' }, content });

it('replaces a partial paragraph through a trailing whole image', () => {
  const before = make(p('Left'), image), step = new ReplaceRangeStep(3, 8, 'X');
  const after = step.apply(before);
  expect(after.toJSON()).toEqual(make(p('LeX')).toJSON());
  expect(step.getMap(before).map(8)).toBe(5);
  expect(step.getInsertionPosition(before)).toBe(4);
  expect(resolveDocumentPoint(after, 4)).toMatchObject({ kind: 'text', path: [0, 0], offset: 3 });
});

it('replaces a gap through partial text without merging the untouched preceding paragraph', () => {
  const before = make(p('Before'), image, p('Right'), p('After'));
  const end = textPointToPosition(before, [2, 0], 3), step = new ReplaceRangeStep(8, end, 'X');
  const after = step.apply(before);
  expect(after.toJSON()).toEqual(make(p('Before'), p('X', 'ht'), p('After')).toJSON());
  expect(after.child(0)).toBe(before.child(0));
  expect(after.child(2)).toBe(before.child(3));
  expect(step.getMap(before).map(textPointToPosition(before, [2, 0], 4))).toBe(textPointToPosition(after, [1, 1], 1));
  expect(resolveDocumentPoint(after, step.getInsertionPosition(before), -1)).toMatchObject({ kind: 'text', path: [1, 0], offset: 1 });
  expect(resolveDocumentPoint(after, step.getInsertionPosition(before), 1)).toMatchObject({ kind: 'text', path: [1, 1], offset: 0 });
});

it.each(['X', ''])('replaces gap-to-gap blocks without joining either closed neighbor (%s)', text => {
  const before = make(p('Before'), image, image, p('After'));
  const step = new ReplaceRangeStep(8, 12, text), after = step.apply(before);
  expect(after.toJSON()).toEqual(make(p('Before'), ...(text ? [p('X')] : []), p('After')).toJSON());
  expect(after.child(0)).toBe(before.child(0));
  expect(after.child(after.childCount - 1)).toBe(before.child(3));
  expect(step.getMap(before).map(before.nodeSize - 2)).toBe(after.nodeSize - 2);
});

it.each(['X', ''])('replaces an atom-only document with a valid editable result (%s)', text => {
  const before = make(image, image), step = new ReplaceRangeStep(0, 4, text), after = step.apply(before);
  expect(after.toJSON()).toEqual(make(p(text)).toJSON());
  expect(step.getMap(before).map(4)).toBe(after.nodeSize - 2);
  expect(resolveDocumentPoint(after, step.getInsertionPosition(before))).toMatchObject({ kind: 'text', offset: text.length });
});

it('fits a nested insertion gap through outside text while keeping preceding quote paragraphs intact', () => {
  const before = make(q(p('Kept'), image), p('Right'), p('After'));
  const end = textPointToPosition(before, [1, 0], 3), step = new ReplaceRangeStep(7, end, 'X');
  const after = step.apply(before);
  expect(after.toJSON()).toEqual(make(q(p('Kept'), p('X', 'ht')), p('After')).toJSON());
  expect(after.child(0).child(0)).toBe(before.child(0).child(0));
  expect(step.getMap(before).map(textPointToPosition(before, [1, 0], 4))).toBe(textPointToPosition(after, [0, 1, 1], 1));
});

it('does not join into an untouched paragraph beyond a gap inside a quote', () => {
  const before = make(p('Left'), q(image, p('After')), p('Final'));
  const step = new ReplaceRangeStep(3, 9, 'X'), after = step.apply(before);
  expect(after.toJSON()).toEqual(make(p('LeX'), q(p('After')), p('Final')).toJSON());
  expect(after.child(1).child(0)).toBe(before.child(1).child(1));
  expect(step.getMap(before).map(textPointToPosition(before, [1, 1, 0], 2))).toBe(textPointToPosition(after, [1, 0, 0], 2));
});

const inlineSchema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
  chip: { inline: true, group: 'inline', atom: true, attrs: { value: { default: 'Chip' } } },
} });
const chip = { type: 'chip' };
const inline = (...content: NodeJSON[]) => inlineSchema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph', content }] });

it('inserts at an exact inline-atom boundary and maps both unselected atoms', () => {
  const before = inline(chip, chip), step = new ReplaceRangeStep(3, 3, 'X');
  const after = step.apply(before);
  expect(after.toJSON()).toEqual(inline(chip, { type: 'text', text: 'X' }, chip).toJSON());
  expect(after.child(0).child(0)).toBe(before.child(0).child(0));
  expect(after.child(0).child(2)).toBe(before.child(0).child(1));
  expect(step.getMap(before).map(3, -1)).toBe(3);
  expect(step.getMap(before).map(3, 1)).toBe(4);
  expect(resolveDocumentPoint(after, step.getInsertionPosition(before))).toMatchObject({ kind: 'text', path: [0, 1], offset: 1 });
});

it('materializes a zero-size inline caret without moving any document positions', () => {
  const before = inline(chip, chip), step = new ReplaceRangeStep(3, 3);
  const after = step.apply(before);
  expect(after.toJSON()).toEqual(inline(chip, { type: 'text', text: '' }, chip).toJSON());
  expect(step.getMap(before).ranges).toEqual([]);
  expect(step.getInsertionPosition(before)).toBe(3);
});

it('deletes a complete inline atom while keeping its closed neighbor and a caret', () => {
  const before = inline(chip, chip), step = new ReplaceRangeStep(1, 3);
  const after = step.apply(before);
  expect(after.toJSON()).toEqual(inline({ type: 'text', text: '' }, chip).toJSON());
  expect(after.child(0).child(1)).toBe(before.child(0).child(1));
  expect(step.getMap(before).map(before.nodeSize - 2)).toBe(after.nodeSize - 2);
});

it('inserts at a marked-leaf boundary using one resolved text point', () => {
  const before = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('ab'), schema.text('cd', [schema.mark('strong')])])]);
  const after = new ReplaceRangeStep(3, 3, 'X').apply(before);
  expect(after.child(0).content.map(node => [node.text, node.marks.map(mark => mark.type.name)]))
    .toEqual([['ab', []], ['Xcd', ['strong']]]);
});

it('preserves a partially selected grid and fills an insertion at a cell block boundary', () => {
  const cell = (...content: NodeJSON[]): NodeJSON => ({ type: 'table_cell', content });
  const before = make({ type: 'table', content: [{ type: 'table_row', content: [cell(image, p('Left')), cell(p('Right')), cell(p('After'))] }] });
  // The first cell's content starts after table/row/cell opening units.
  const to = textPointToPosition(before, [0, 0, 1, 0, 0], 3), step = new ReplaceRangeStep(3, to, 'X');
  const after = step.apply(before);
  schema.validate(after);
  expect(after.child(0).child(0).childCount).toBe(3);
  expect(after.child(0).child(0).content.map(node => node.textContent)).toEqual(['X', 'ht', 'After']);
  expect(step.getMap(before).map(textPointToPosition(before, [0, 0, 2, 0, 0], 2)))
    .toBe(textPointToPosition(after, [0, 0, 2, 0, 0], 2));
});

it('keeps required custom container content when replacing from its first block boundary', () => {
  const custom = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
    pair: { group: 'block', content: 'paragraph paragraph' },
  } });
  const before = custom.nodeFromJSON({ type: 'doc', content: [{ type: 'pair', content: [p('Left'), p('Selected')] }, p('Right'), p('After')] });
  const step = new ReplaceRangeStep(1, textPointToPosition(before, [1, 0], 3), 'X'), after = step.apply(before);
  custom.validate(after);
  expect(after.child(0).childCount).toBe(2);
  expect(after.child(0).textContent).toBe('X');
  expect(after.child(1).textContent).toBe('ht');
  expect(after.child(2)).toBe(before.child(2));
});

it('rejects opaque interiors and reversed/outside ranges before changing any model', () => {
  const before = inline(chip, chip);
  for (const [from, to] of [[2, 3], [1, 4], [0, 10]]) expect(() => new ReplaceRangeStep(from, to, 'X').apply(before)).toThrow();
  expect(() => new ReplaceRangeStep(3, 1)).toThrow(RangeError);
  expect(before.child(0).childCount).toBe(2);
});

it('maps every surviving text unit over a matrix of legal mixed endpoints', () => {
  const before = make(p('Alpha'), image, q(p('Bravo'), image), p('Charlie'));
  const points = [];
  for (let position = 0; position <= before.nodeSize - 2; position += 1) {
    try { points.push(resolveDocumentPoint(before, position)); } catch { /* Opaque interiors are deliberately invalid. */ }
  }
  let count = 0;
  const units = (node: Node, before = 0, root = true): { position: number; value: string }[] => {
    if (node.isText) return Array.from({ length: node.nodeSize }, (_, offset) => ({ position: before + offset, value: node.text![offset]! }));
    let position = before + (root ? 0 : 1);
    return node.content.flatMap(child => { const result = units(child, position, false); position += child.nodeSize; return result; });
  };
  const oldUnits = units(before);
  for (const a of points) for (const b of points) {
    if (a.position >= b.position || a.kind === 'text' && b.kind === 'text') continue;
    const step = new ReplaceRangeStep(a.position, b.position, 'X'), after = step.apply(before), map = step.getMap(before);
    const newUnits = new Map(units(after).map(unit => [unit.position, unit.value]));
    const expected = oldUnits.filter(unit => unit.position < a.position).map(unit => unit.value).join('') + 'X'
      + oldUnits.filter(unit => unit.position >= b.position).map(unit => unit.value).join('');
    expect(units(after).map(unit => unit.value).join('')).toBe(expected);
    for (const unit of oldUnits) if (unit.position < a.position || unit.position >= b.position) {
      expect(newUnits.get(map.map(unit.position, 1)), `${a.position}..${b.position} retained ${unit.position}`).toBe(unit.value);
    }
    expect(map.map(before.nodeSize - 2)).toBe(after.nodeSize - 2);
    count += 1;
  }
  expect(count).toBe(245);
});
