// @vitest-environment node
import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, Mapping, Schema, Selection, composeExtensions, createEditor, getCollaborationState, indentListItem,
  insertText, toggleList, redoCollaboration, undoCollaboration, type NodeJSON } from '../src';
import { RestructureChildrenStep } from '../src/core/transaction/restructure-children-step';
import { planRetainedNodeStarts, planRetainedText } from '../src/yjs/retained-mapping';
import { RetainedDocumentStore } from '../src/yjs/retained-document';
import { createYjsCollaborationExtension } from '../src/yjs';

it.each(['copy', 'fresh', 'ambiguous'] as const)('retains a restructured container only for an unambiguous authored copy (%s)', kind => {
  const schema = new Schema(composeExtensions([CoreExtension]).schema);
  const paragraph = schema.node('paragraph', {}, [schema.text('Alpha')]);
  const quote = schema.node('blockquote', {}, [paragraph]);
  const before = schema.node('doc', {}, [quote]);
  const copied = quote.copy([paragraph, schema.node('paragraph', {}, [schema.text('Beta')])]);
  const content = kind === 'copy' ? [copied] : kind === 'fresh'
    ? [schema.node('blockquote', {}, copied.content)] : [copied, quote.copy([schema.node('paragraph', {}, [schema.text('Gamma')])])];
  const step = new RestructureChildrenStep([], 0, [quote], content);
  const after = step.apply(before), mapping = new Mapping([step.getMap(before)]);
  const retained = planRetainedNodeStarts(before, after, mapping);
  if (kind === 'copy') expect(retained).toContainEqual({ before: [0], after: [0] });
  else expect(retained.filter(entry => entry.before.length === 1)).toEqual([]);
  // Container provenance does not make new text inherit old character identity.
  const text = planRetainedText(before, after, mapping);
  expect(text.retained).toEqual([{ before: { path: [0, 0, 0], from: 0, to: 5 }, after: { path: [0, 0, 0], from: 0, to: 5 } }]);
  expect(text.inserted.map(entry => after.child(entry.path[0]!).child(entry.path[1]!).child(0).text)).toEqual(kind === 'ambiguous' ? ['Beta', 'Gamma'] : ['Beta']);
});

it.each([false, true])('keeps one original list through independent offline indents, typing and author undo (%s)', reverse => {
  const p = (text: string): NodeJSON => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  const item = (text: string, fixed = false): NodeJSON => ({ type: 'list_item', ...(fixed ? { attrs: { dir: 'ltr' } } : {}), content: [p(text)] });
  const content: NodeJSON = { type: 'doc', content: [{ type: 'ordered_list', attrs: { dir: 'auto', start: 0 }, content: [
    item('שלום anchor'), item('First parent', true), item('English first'), item('Second parent', true), item('English second'),
  ] }] };
  const a = new Y.Doc(), b = new Y.Doc(); a.clientID = reverse ? 202 : 101; b.clientID = reverse ? 101 : 202;
  const make = (document: Y.Doc, id: string) => {
    const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, captureTimeout: 0,
      user: { id, name: id, color: '#a855f7' } })]);
    return createEditor({ schema: kit.schema, plugins: kit.plugins, content });
  };
  const left = make(a, 'left'); Y.applyUpdate(b, Y.encodeStateAsUpdate(a)); const right = make(b, 'right');
  const reader = new RetainedDocumentStore(a, 'fountain', left.state.schema, () => { throw new Error('Read only'); });
  reader.read(); const listId = reader.identity([0]), parentId = reader.identity([0, 1]);
  const sync = () => {
    const updates = [Y.encodeStateAsUpdate(a), Y.encodeStateAsUpdate(b)]; if (reverse) updates.reverse();
    for (const document of [a, b]) for (const update of updates) Y.applyUpdate(document, update, 'peer');
    for (const editor of [left, right]) expect(getCollaborationState(editor)?.status, getCollaborationState(editor)?.error?.message).toBe('connected');
    expect(left.getJSON()).toEqual(right.getJSON()); expect(left.state.doc.childCount).toBe(1);
    expect(left.state.doc.child(0).child(0).textContent).toBe('שלום anchor');
    reader.read(); expect(reader.identity([0])).toBe(listId); expect(reader.identity([0, 1])).toBe(parentId);
  };
  try {
    left.dispatch(left.createTransaction().setSelection(Selection.cursor([0, 2, 0, 0], 0))); expect(indentListItem(left)).toBe(true);
    right.dispatch(right.createTransaction().setSelection(Selection.cursor([0, 2, 0, 0], 7))); expect(insertText(right, 'X')).toBe(true);
    right.dispatch(right.createTransaction().setSelection(Selection.cursor([0, 4, 0, 0], 0))); expect(indentListItem(right)).toBe(true);
    sync(); expect(left.state.doc.child(0).childCount).toBe(3);
    expect(left.state.doc.child(0).child(1).textContent).toBe('First parentEnglishX first');
    expect(left.state.doc.child(0).child(2).textContent).toBe('Second parentEnglish second');
    expect(undoCollaboration(left)).toBe(true); sync(); expect(left.state.doc.child(0).childCount).toBe(4);
    expect(left.state.doc.child(0).child(2).textContent).toBe('EnglishX first');
    expect(redoCollaboration(left)).toBe(true); sync(); expect(left.state.doc.child(0).childCount).toBe(3);
    expect(left.state.doc.child(0).child(1).textContent).toBe('First parentEnglishX first');
  } finally { reader.destroy(); left.destroy(); right.destroy(); a.destroy(); b.destroy(); }
});

it.each([false, true])('retains concurrent text while changing one mixed-list item kind and undoing (%s)', reverse => {
  const content: NodeJSON = { type: 'doc', content: [{ type: 'task_list', content: [
    { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] }] },
    { type: 'task_item', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Done' }] }] },
  ] }] };
  const a = new Y.Doc(), b = new Y.Doc(); a.clientID = reverse ? 202 : 101; b.clientID = reverse ? 101 : 202;
  const make = (document: Y.Doc, id: string) => {
    const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, captureTimeout: 0,
      user: { id, name: id, color: '#a855f7' } })]);
    return createEditor({ schema: kit.schema, plugins: kit.plugins, content });
  };
  const left = make(a, 'left'); Y.applyUpdate(b, Y.encodeStateAsUpdate(a)); const right = make(b, 'right');
  const reader = new RetainedDocumentStore(a, 'fountain', left.state.schema, () => { throw new Error('Read only'); });
  reader.read(); const listId = reader.identity([0]), paragraphId = reader.identity([0, 0, 0]);
  const sync = () => {
    const updates = [Y.encodeStateAsUpdate(a), Y.encodeStateAsUpdate(b)]; if (reverse) updates.reverse();
    for (const document of [a, b]) for (const update of updates) Y.applyUpdate(document, update, 'peer');
    for (const editor of [left, right]) expect(getCollaborationState(editor)?.status, getCollaborationState(editor)?.error?.message).toBe('connected');
    expect(left.getJSON()).toEqual(right.getJSON());
    expect(left.state.doc.child(0).child(0).textContent).toBe('AlXpha');
    expect(left.state.doc.child(0).child(1).attrs.checked).toBe(true);
    reader.read(); expect(reader.identity([0])).toBe(listId); expect(reader.identity([0, 0, 0])).toBe(paragraphId);
  };
  try {
    left.dispatch(left.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0], 2))); expect(toggleList(left, 'task')).toBe(true);
    right.dispatch(right.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0], 2))); expect(insertText(right, 'X')).toBe(true);
    sync(); expect(left.state.doc.child(0).child(0).type.name).toBe('task_item');
    expect(undoCollaboration(left)).toBe(true); sync(); expect(left.state.doc.child(0).child(0).type.name).toBe('list_item');
    expect(redoCollaboration(left)).toBe(true); sync(); expect(left.state.doc.child(0).child(0).type.name).toBe('task_item');
  } finally { reader.destroy(); left.destroy(); right.destroy(); a.destroy(); b.destroy(); }
});
