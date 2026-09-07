import { expect, it } from 'vitest';
import { CoreSchemaSpec, Schema, Selection, StepMap, mapSelection, positionToTextPoint, textPointToPosition } from '../src';

const schema = new Schema(CoreSchemaSpec);
const paragraph = (value: string) => schema.node('paragraph', {}, [schema.text(value)]);

it.each([-1, 1] as const)('keeps exact text endpoints across structural gaps with association %s', association => {
  const doc = schema.node('doc', {}, [paragraph('First'), schema.node('blockquote', {}, [paragraph('Quoted')]), paragraph('Last')]);
  for (const [path, length] of [[[0, 0], 5], [[1, 0, 0], 6], [[2, 0], 4]] as const) {
    for (const offset of [0, length]) {
      const position = textPointToPosition(doc, path, offset);
      expect(positionToTextPoint(doc, position, association)).toEqual({ path, offset });
    }
  }
});

it.each([-1, 1] as const)('retains association at adjoining marked leaves with association %s', association => {
  const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('a'), schema.text('b', [schema.mark('strong')])])]);
  const boundary = textPointToPosition(doc, [0, 0], 1);
  expect(positionToTextPoint(doc, boundary, association)).toEqual(association < 0
    ? { path: [0, 0], offset: 1 } : { path: [0, 1], offset: 0 });
});

it('does not move a caret or range at a block endpoint for an unrelated append', () => {
  const before = schema.node('doc', {}, [paragraph('Keep here')]);
  const after = before.copy([...before.content, paragraph('Elsewhere')]);
  const map = new StepMap([before.child(0).nodeSize, 0, after.child(1).nodeSize]);
  for (const selection of [Selection.cursor([0, 0], 9), Selection.range([0, 0], 0, [0, 0], 9)]) {
    expect(mapSelection(selection, before, after, map).eq(selection)).toBe(true);
  }
});

it('still uses association to recover positions genuinely between blocks', () => {
  const doc = schema.node('doc', {}, [paragraph('a'), paragraph('b')]);
  const between = doc.child(0).nodeSize;
  expect(positionToTextPoint(doc, between, -1)).toEqual({ path: [0, 0], offset: 1 });
  expect(positionToTextPoint(doc, between, 1)).toEqual({ path: [1, 0], offset: 0 });
});
