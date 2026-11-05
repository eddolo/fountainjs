import { expect, it } from 'vitest';
import { CoreExtension, CoreSchemaSpec, HTMLAnchorExtension, ReplaceTextRangeStep, Schema, Selection, StarterKit, composeExtensions,
  createEditor, createHistoryPlugin, deleteSelection, insertText, redo, textPointToPosition, undo,
  type Node as FountainNode, type NodeJSON } from '../src';
import { getTextLeaves } from '../src/core/transaction/path';

const p = (text: string): NodeJSON => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const quote = (...content: NodeJSON[]): NodeJSON => ({ type: 'blockquote', content });
const item = (...content: NodeJSON[]): NodeJSON => ({ type: 'list_item', content });
const list = (...content: NodeJSON[]): NodeJSON => ({ type: 'bullet_list', content });
const image: NodeJSON = { type: 'image_super', attrs: { src: '/selected.png', alt: 'Selected image' } };
function splitReplacementFragments(node: NodeJSON): NodeJSON {
  return { ...node, ...(node.content ? { content: node.content.flatMap(child => child.type === 'text' && child.text === 'LeXht'
    ? [{ type: 'text', text: 'LeX' }, { type: 'text', text: 'ht' }] : [splitReplacementFragments(child)]) } : {}) };
}
const examples = [
  { name: 'quote to paragraph', content: [quote(p('Left'), image), image, p('Right')], start: [0, 0, 0], end: [2, 0],
    expected: [quote(p('LeXht'))] },
  { name: 'paragraph to quote', content: [p('Left'), image, quote(image, p('Right'), p('Tail'))], start: [0, 0], end: [2, 1, 0],
    expected: [p('LeXht'), quote(p('Tail'))] },
  { name: 'different quotes', content: [quote(p('Left'), image), image, quote(image, p('Right'), p('Tail'))], start: [0, 0, 0], end: [2, 1, 0],
    expected: [quote(p('LeXht'), p('Tail'))] },
  { name: 'quote to list', content: [quote(p('Left'), image), list(item(image, p('Right')), item(p('Tail')))], start: [0, 0, 0], end: [1, 0, 1, 0],
    expected: [quote(p('LeXht')), list(item(p('Tail')))] },
  { name: 'list to quote', content: [list(item(p('Left'), image)), quote(image, p('Right'), p('Tail'))], start: [0, 0, 0, 0], end: [1, 1, 0],
    expected: [list(item(p('LeXht'))), quote(p('Tail'))] },
  { name: 'list items', content: [list(item(p('Left'), image), item(image, p('Right'), p('Tail')), item(p('Last')))],
    start: [0, 0, 0, 0], end: [0, 1, 1, 0], expected: [list(item(p('LeXht'), p('Tail')), item(p('Last')))] },
  { name: 'nested unequal depths', content: [quote(quote(p('Left'), image)), p('Right')], start: [0, 0, 0, 0], end: [1, 0],
    expected: [quote(quote(p('LeXht')))] },
];

function nodeAt(doc: FountainNode, path: readonly number[]): FountainNode {
  return path.reduce((node, index) => node.child(index), doc);
}

it.each(examples)('joins a $name range, removes selected figures and retains outside content through undo', example => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: {
    type: 'doc', content: [p('Before'), ...example.content, p('After')],
  } });
  try {
    const start = [example.start[0]! + 1, ...example.start.slice(1)], end = [example.end[0]! + 1, ...example.end.slice(1)];
    const before = editor.state.doc;
    // Like the existing sibling step, keep the start and suffix fragments
    // distinct, even when their marks happen to be equal.
    const expected = editor.state.schema.nodeFromJSON(splitReplacementFragments({ type: 'doc', content: [p('Before'), ...example.expected, p('After')] }));
    const step = new ReplaceTextRangeStep(start, 2, end, 3, 'X');
    const result = step.apply(before), map = step.getMap(before);
    expect(result.toJSON()).toEqual(expected.toJSON());
    expect(map.map(before.nodeSize - 2)).toBe(result.nodeSize - 2);
    expect(map.map(textPointToPosition(before, [before.childCount - 1, 0], 2)))
      .toBe(textPointToPosition(result, [result.childCount - 1, 0], 2));
    // The unselected suffix retains its exact coordinates, not just an endpoint
    // clamped to the nearest surviving text. Both associations must agree.
    const suffixPath: number[] = [];
    result.descendants((node, path) => { if (node.isText && node.text === 'ht') suffixPath.push(...path); });
    expect(suffixPath.length).toBeGreaterThan(0);
    for (const association of [-1, 1] as const) {
      const oldPoint = textPointToPosition(before, end, 4), newPoint = textPointToPosition(result, suffixPath, 1);
      expect(map.map(oldPoint, association)).toBe(newPoint);
      expect(map.invert().map(newPoint, association)).toBe(oldPoint);
    }
    expect(result.child(0)).toBe(before.child(0));
    expect(result.child(result.childCount - 1)).toBe(before.child(before.childCount - 1));
    editor.dispatch(editor.createTransaction().setSelection(Selection.range(start, 2, end, 3)));
    expect(insertText(editor, 'X')).toBe(true);
    expect(editor.state.doc.eq(expected)).toBe(true);
    expect(editor.state.selection).toMatchObject({ path: start, from: 3, to: 3 });
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.eq(before)).toBe(true);
    expect(redo(editor)).toBe(true);
    expect(editor.state.doc.eq(expected)).toBe(true);
  } finally { editor.destroy(); }
});

it('maps surviving inline-wrapper structure rather than claiming that its tokens were deleted', () => {
  const kit = composeExtensions([CoreExtension, HTMLAnchorExtension]);
  const editor = createEditor({ schema: kit.schema, content: { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'html_anchor', attrs: { id: 'left' }, content: [{ type: 'text', text: 'Left' }] },
    { type: 'html_anchor', attrs: { id: 'right' }, content: [{ type: 'text', text: 'Right' }] },
  ] }, p('After')] } });
  try {
    const before = editor.state.doc;
    const step = new ReplaceTextRangeStep([0, 0, 0], 2, [0, 1, 0], 3, 'X');
    const after = step.apply(before), map = step.getMap(before);
    expect(after.child(0).content.map(node => node.attrs.id)).toEqual(['left', 'right']);
    expect(after.child(0).textContent).toBe('LeXht');
    expect(map.map(before.nodeSize - 2)).toBe(after.nodeSize - 2);
    expect(map.map(textPointToPosition(before, [0, 1, 0], 4))).toBe(textPointToPosition(after, [0, 1, 0], 1));
    expect(map.map(textPointToPosition(before, [1, 0], 2))).toBe(textPointToPosition(after, [1, 0], 2));
  } finally { editor.destroy(); }
});

it('retains a partial table grid and maps all unselected cell content accurately', () => {
  const cell = (...content: NodeJSON[]): NodeJSON => ({ type: 'table_cell', content });
  const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [
    { type: 'table', content: [{ type: 'table_row', content: [cell(p('Left'), image), cell(image, p('Right')), cell(p('Tail'))] }] }, p('After'),
  ] } });
  try {
    const before = editor.state.doc;
    const start = [0, 0, 0, 0, 0], end = [0, 0, 1, 1, 0];
    const step = new ReplaceTextRangeStep(start, 2, end, 3, 'X');
    const after = step.apply(before), map = step.getMap(before);
    expect(after.child(0).child(0).childCount).toBe(3);
    expect(after.child(0).child(0).content.map(node => node.textContent)).toEqual(['LeX', 'ht', 'Tail']);
    expect(nodeAt(after, [0, 0, 0]).childCount).toBe(1);
    expect(nodeAt(after, [0, 0, 1]).childCount).toBe(1);
    for (const [oldPath, newPath, oldOffset, newOffset] of [
      [end, [0, 0, 1, 0, 0], 4, 1], [[0, 0, 2, 0, 0], [0, 0, 2, 0, 0], 2, 2], [[1, 0], [1, 0], 2, 2],
    ] as const) expect(map.map(textPointToPosition(before, oldPath, oldOffset)))
      .toBe(textPointToPosition(after, newPath, newOffset));
    expect(map.map(before.nodeSize - 2)).toBe(after.nodeSize - 2);
    editor.state.schema.validate(after);
  } finally { editor.destroy(); }
});

it.each([[4, 0, 'LeftX', 'Right'], [0, 5, 'X', '']])('inserts at exact text endpoints while retaining inline-wrapper identity (%s..%s)', (from, to, left, right) => {
  const kit = composeExtensions([CoreExtension, HTMLAnchorExtension]);
  const editor = createEditor({ schema: kit.schema, content: { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'html_anchor', attrs: { id: 'left' }, content: [{ type: 'text', text: 'Left' }] },
    { type: 'html_anchor', attrs: { id: 'right' }, content: [{ type: 'text', text: 'Right' }] },
  ] }] } });
  try {
    const before = editor.state.doc;
    const step = new ReplaceTextRangeStep([0, 0, 0], from as number, [0, 1, 0], to as number, 'X');
    const after = step.apply(before), map = step.getMap(before);
    expect(after.child(0).content.map(node => [node.attrs.id, node.textContent])).toEqual([['left', left], ['right', right]]);
    if (to === 0) expect(map.map(textPointToPosition(before, [0, 1, 0], 2))).toBe(textPointToPosition(after, [0, 1, 0], 2));
    expect(map.map(before.nodeSize - 2)).toBe(after.nodeSize - 2);
  } finally { editor.destroy(); }
});

it('joins boundary-only deletion and retains the first block attributes and suffix marks', () => {
  const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [
    quote({ type: 'paragraph', attrs: { align: 'right' }, content: [{ type: 'text', text: 'Left', marks: [{ type: 'strong' }] }] }),
    image, { type: 'paragraph', content: [{ type: 'text', text: 'Right', marks: [{ type: 'em' }] }] },
  ] } });
  try {
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0, 0], 4, [2, 0], 0)));
    expect(deleteSelection(editor)).toBe(true);
    const block = editor.state.doc.child(0).child(0);
    expect(block.attrs.align).toBe('right');
    expect(block.content.map(node => [node.text, node.marks.map(mark => mark.type.name)])).toEqual([
      ['Left', ['strong']], ['Right', ['em']],
    ]);
    expect(editor.state.doc.childCount).toBe(1);
  } finally { editor.destroy(); }
});

it('keeps custom required container shape when a joined cut would violate its schema', () => {
  const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
    pair: { group: 'block', content: 'paragraph paragraph', attrs: { label: { default: 'Pair' } } },
  } });
  const before = schema.nodeFromJSON({ type: 'doc', content: [
    { type: 'pair', content: [p('Left'), p('Selected')] }, p('Right'), p('After'),
  ] });
  const step = new ReplaceTextRangeStep([0, 0, 0], 2, [1, 0], 3, 'X');
  const after = step.apply(before), map = step.getMap(before);
  schema.validate(after);
  expect(after.child(0).type.name).toBe('pair');
  expect(after.child(0).attrs.label).toBe('Pair');
  expect(after.child(0).childCount).toBe(2);
  expect(after.child(0).textContent).toBe('LeX');
  expect(after.child(1).textContent).toBe('ht');
  expect(map.map(textPointToPosition(before, [2, 0], 2))).toBe(textPointToPosition(after, [2, 0], 2));
  expect(map.map(before.nodeSize - 2)).toBe(after.nodeSize - 2);
});

it('does not apply the first quote attributes to the unselected tail of a different quote', () => {
  const editor = createEditor({ schema: StarterKit.schema, content: { type: 'doc', content: [
    { ...quote(p('Left')), attrs: { dir: 'ltr' } }, { ...quote(p('Right'), p('Tail')), attrs: { dir: 'rtl' } },
  ] } });
  try {
    const before = editor.state.doc;
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0, 0], 2, [1, 0, 0], 3)));
    expect(insertText(editor, 'X')).toBe(true);
    expect(editor.state.doc.content.map(node => [node.type.name, node.attrs.dir, node.textContent]))
      .toEqual([['blockquote', 'ltr', 'LeXht'], ['blockquote', 'rtl', 'Tail']]);
    expect(editor.state.doc.child(1).child(0)).toBe(before.child(1).child(1));
    const map = new ReplaceTextRangeStep([0, 0, 0], 2, [1, 0, 0], 3, 'X').getMap(before);
    expect(map.map(textPointToPosition(before, [1, 1, 0], 2))).toBe(textPointToPosition(editor.state.doc, [1, 0, 0], 2));
  } finally { editor.destroy(); }
});

it('preserves every unselected text unit and maps it to its actual new position across ordered nested ranges', () => {
  const schema = new Schema(StarterKit.schema);
  const doc = schema.nodeFromJSON({ type: 'doc', content: [p('Alpha'), quote(p('Bravo'), image, p('Charlie')),
    list(item(p('Delta'), p('Echo')), item(p('Foxtrot'))), p('Golf')] });
  const leaves = getTextLeaves(doc);
  let checked = 0;
  for (let a = 0; a < leaves.length; a += 1) for (let b = a + 1; b < leaves.length; b += 1) {
    const left = leaves[a]!, right = leaves[b]!;
    for (const [from, to] of [[2, 3], [left.node.nodeSize, 0], [0, right.node.nodeSize]]) {
      const step = new ReplaceTextRangeStep(left.path, from, right.path, to, 'X');
      const after = step.apply(doc), map = step.getMap(doc), result = getTextLeaves(after);
      schema.validate(after);
      const expected = leaves.slice(0, a).map(leaf => leaf.node.text).join('') + left.node.text!.slice(0, from) + 'X'
        + right.node.text!.slice(to) + leaves.slice(b + 1).map(leaf => leaf.node.text).join('');
      expect(result.map(leaf => leaf.node.text).join('')).toBe(expected);
      const start = textPointToPosition(doc, left.path, from), end = textPointToPosition(doc, right.path, to);
      for (const leaf of leaves) for (let offset = 0; offset < leaf.node.nodeSize; offset += 1) {
        const oldPosition = textPointToPosition(doc, leaf.path, offset);
        if (oldPosition >= start && oldPosition < end) continue;
        const mapped = map.map(oldPosition, 1);
        const owner = result.find(candidate => {
          const position = textPointToPosition(after, candidate.path, 0);
          return mapped >= position && mapped < position + candidate.node.nodeSize;
        });
        expect(owner, `unselected character ${leaf.path}:${offset}`).toBeDefined();
        expect(owner!.node.text![mapped - textPointToPosition(after, owner!.path, 0)]).toBe(leaf.node.text![offset]);
      }
      expect(map.map(doc.nodeSize - 2)).toBe(after.nodeSize - 2);
      checked += 1;
    }
  }
  expect(checked).toBe(63);
});
