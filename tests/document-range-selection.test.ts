import { expect, it } from 'vitest';
import { CoreSchemaSpec, GapSelection, RangeSelection, Schema, Selection, StarterKit, StepMap, createEditor,
  createHistoryPlugin, mapSelection, redo, resolveDocumentPoint, selectionAtPosition, setMark, undo } from '../src';

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const image = { type: 'image_super', attrs: { src: '/figure.png', alt: 'Figure' } };
const schema = new Schema(StarterKit.schema);
const doc = schema.nodeFromJSON({ type: 'doc', content: [p('ab'), image,
  { type: 'blockquote', content: [p('cd')] }, p('ef')] });

it.each([
  [0, { kind: 'boundary', parentPath: [], index: 0 }],
  [1, { kind: 'text', path: [0, 0], offset: 0 }],
  [2, { kind: 'text', path: [0, 0], offset: 1 }],
  [3, { kind: 'text', path: [0, 0], offset: 2 }],
  [4, { kind: 'boundary', parentPath: [], index: 1 }],
  [5, { kind: 'boundary', parentPath: [1], index: 0 }], // Editable image-caption content.
  [6, { kind: 'boundary', parentPath: [], index: 2 }],
  [7, { kind: 'boundary', parentPath: [2], index: 0 }],
  [8, { kind: 'text', path: [2, 0, 0], offset: 0 }],
  [10, { kind: 'text', path: [2, 0, 0], offset: 2 }],
  [11, { kind: 'boundary', parentPath: [2], index: 1 }],
  [12, { kind: 'boundary', parentPath: [], index: 3 }],
  [16, { kind: 'boundary', parentPath: [], index: 4 }],
] as const)('resolves position %s without moving a structural endpoint into nearby text', (position, expected) => {
  const point = resolveDocumentPoint(doc, position);
  expect(point).toEqual({ ...expected, position });
  expect(Object.isFrozen(point)).toBe(true);
  expect(Object.isFrozen(point.kind === 'text' ? point.path : point.parentPath)).toBe(true);
});

it.each([-1, 17, .5, NaN, Infinity])('rejects invalid document position %s', position => {
  expect(() => resolveDocumentPoint(doc, position)).toThrow(RangeError);
  expect(() => new RangeSelection(doc, 0, position)).toThrow(RangeError);
});

it('keeps mixed range direction independently of its ordered text projection', () => {
  const forward = new RangeSelection(doc, 2, 6), backward = new RangeSelection(doc, 6, 2);
  expect(forward.structuralFrom).toBe(2);
  expect(forward.structuralTo).toBe(6);
  expect(forward.backward).toBe(false);
  expect(backward.backward).toBe(true);
  expect(forward.eq(backward)).toBe(false);
  expect(forward.textSelection?.eq(Selection.range([0, 0], 1, [0, 0], 2))).toBe(true);
  expect(backward.textSelection?.eq(forward.textSelection!)).toBe(true);
  expect(Object.isFrozen(forward)).toBe(true);
  expect(Object.isFrozen(forward.textSelection)).toBe(true);
});

it('does not claim editable text when only whole atoms or structural tokens are selected', () => {
  const selected = new RangeSelection(doc, 4, 6);
  expect(selected.textSelection).toBeNull();
  expect(selected.isCollapsed).toBe(false);
  const onlyAtoms = schema.nodeFromJSON({ type: 'doc', content: [image, image] });
  expect(new RangeSelection(onlyAtoms, 0, 4).textSelection).toBeNull();
  expect(new RangeSelection(doc, 3, 4).textSelection).toBeNull();
});

it('uses association to resolve adjoining marked and empty text leaves', () => {
  const document = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('ab'), schema.text('cd', [schema.mark('strong')])])]);
  expect(resolveDocumentPoint(document, 3, -1)).toEqual({ kind: 'text', position: 3, path: [0, 0], offset: 2 });
  expect(resolveDocumentPoint(document, 3, 1)).toEqual({ kind: 'text', position: 3, path: [0, 1], offset: 0 });
  const empty = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text(''), schema.text('ab')])]);
  expect(resolveDocumentPoint(empty, 1, 1)).toMatchObject({ kind: 'text', path: [0, 1], offset: 0 });
  expect(resolveDocumentPoint(empty, 1, -1)).toMatchObject({ kind: 'text', path: [0, 0], offset: 0 });
});

const inlineSchema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
  chip: { group: 'inline', inline: true, atom: true, attrs: { source: { default: 'opaque' } } },
} });
const chip = { type: 'chip' };
const inlineDoc = inlineSchema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph', content: [chip, chip] }] });

it('keeps an exact caret between inline atoms and inside an empty text block', () => {
  const caret = selectionAtPosition(inlineDoc, 3);
  expect(caret).toBeInstanceOf(RangeSelection);
  expect(caret).toMatchObject({ kind: 'range', anchor: 3, head: 3, isCollapsed: true, textSelection: null });
  expect(resolveDocumentPoint(inlineDoc, 3)).toEqual({ kind: 'boundary', position: 3, parentPath: [0], index: 1 });
  const empty = schema.node('doc', {}, [schema.node('paragraph')]);
  expect(selectionAtPosition(empty, 1)).toMatchObject({ kind: 'range', anchor: 1, head: 1, isCollapsed: true });
  expect(selectionAtPosition(doc, 2)).toBeInstanceOf(Selection);
  expect(selectionAtPosition(doc, 4)).toBeInstanceOf(GapSelection);
});

it('treats atom interiors as opaque, without projecting source attributes as editable text', () => {
  expect(() => resolveDocumentPoint(inlineDoc, 2)).toThrow(RangeError);
  const selected = new RangeSelection(inlineDoc, 1, 3);
  expect(selected.textSelection).toBeNull();
  expect(selected.structuralFrom).toBe(1);
  expect(selected.structuralTo).toBe(3);
});

it.each([false, true])('maps both endpoints and direction through outside insertion (backward: %s)', backward => {
  const inserted = schema.nodeFromJSON(p('zz'));
  const after = doc.copy([inserted, ...doc.content]);
  const selection = new RangeSelection(doc, backward ? 6 : 2, backward ? 2 : 6);
  const mapped = mapSelection(selection, doc, after, new StepMap([0, 0, inserted.nodeSize]));
  expect(mapped).toBeInstanceOf(RangeSelection);
  expect(mapped).toMatchObject({ anchor: backward ? 10 : 6, head: backward ? 6 : 10, backward });
  expect((mapped as RangeSelection).textSelection?.path).toEqual([1, 0]);
});

it('collapses a deleted structural range at the actual gap', () => {
  const after = doc.copy([doc.child(0), ...doc.content.slice(2)]);
  const mapped = mapSelection(new RangeSelection(doc, 6, 4), doc, after, new StepMap([4, 2, 0]));
  expect(mapped).toBeInstanceOf(GapSelection);
  expect(mapped).toMatchObject({ position: 4 });
});

it('stores and restores directed structural ranges through document history', () => {
  const editor = createEditor({ schema: StarterKit.schema, content: doc.toJSON(), plugins: [createHistoryPlugin()] });
  try {
    editor.dispatch(editor.createTransaction().setSelection(new RangeSelection(editor.state.doc, 6, 2)));
    expect(editor.state.selection).toMatchObject({ kind: 'range', anchor: 6, head: 2 });
    editor.dispatch(editor.createTransaction().replaceText([0, 0], 0, 1, 'ZZ'));
    expect(editor.state.selection).toMatchObject({ kind: 'range', anchor: 7, head: 3 });
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(doc.toJSON());
    expect(editor.state.selection).toMatchObject({ kind: 'range', anchor: 6, head: 2 });
    expect(redo(editor)).toBe(true);
    expect(editor.state.doc.textContent).toContain('ZZb');
    expect(editor.state.selection).toMatchObject({ kind: 'range', anchor: 7, head: 3 });
  } finally { editor.destroy(); }
});

it('does not format neighboring text through an atom-only range projection', () => {
  const editor = createEditor({ schema: StarterKit.schema, content: doc.toJSON() });
  try {
    editor.dispatch(editor.createTransaction().setSelection(new RangeSelection(editor.state.doc, 4, 6)));
    const before = editor.state.doc;
    expect(setMark(editor, 'strong')).toBe(false);
    expect(editor.state.doc).toBe(before);
  } finally { editor.destroy(); }
});
