// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { CoreSchemaSpec, Node, Schema, createEditor } from '../src';
import { replaceNodeAtPath } from '../src/core/transaction/path';

describe('immutable node sizes and shared-document equality', () => {
  it('reuses a snapshot size and recomputes only changed descendants', () => {
    const schema = new Schema(CoreSchemaSpec);
    const doc = schema.node('doc', {}, Array.from({ length: 100 }, () =>
      schema.node('paragraph', {}, [schema.text('abc')])));
    const getter = vi.spyOn(Node.prototype, 'nodeSize', 'get');
    try {
      expect(doc.nodeSize).toBe(502);
      expect(getter).toHaveBeenCalledTimes(201);
      getter.mockClear();
      expect(doc.nodeSize).toBe(502);
      expect(getter).toHaveBeenCalledTimes(1);
      const edited = replaceNodeAtPath(doc, [99, 0], schema.text('abcdef'));
      getter.mockClear();
      expect(edited.nodeSize).toBe(505);
      // Root, 100 children, and the changed text; shared paragraphs don't
      // traverse their descendants again. The old snapshot remains intact.
      expect(getter).toHaveBeenCalledTimes(102);
      getter.mockClear();
      expect(doc.nodeSize).toBe(502);
      expect(edited.nodeSize).toBe(505);
      expect(getter).toHaveBeenCalledTimes(2);
    } finally { getter.mockRestore(); }
  });

  it('handles zero-length text, nested structure, marks and opaque mutable attributes', () => {
    const schema = new Schema(CoreSchemaSpec);
    const empty = schema.text('');
    expect(empty.nodeSize).toBe(0);
    expect(empty.nodeSize).toBe(0);
    const date = new Date('2020-01-01');
    const nested = schema.node('blockquote', { hostDate: date }, [schema.node('paragraph', {}, [
      schema.text('ab', [schema.mark('em')]), schema.node('hard_break'), schema.text('c'),
    ])]);
    expect(nested.nodeSize).toBe(9);
    date.setFullYear(2026);
    expect(nested.nodeSize).toBe(9);
    expect(nested.withAttrs({ other: 'metadata' }).nodeSize).toBe(9);
    expect(nested.child(0).child(0).withMarks([]).nodeSize).toBe(2);
  });

  it.each([0, 49, 99])('detects text, marks and attribute changes at sibling %s without equating different trees', index => {
    const schema = new Schema(CoreSchemaSpec);
    const doc = schema.node('doc', {}, Array.from({ length: 100 }, () =>
      schema.node('paragraph', {}, [schema.text('original')])));
    for (const replacement of [schema.node('paragraph', {}, [schema.text('changed')]),
      schema.node('paragraph', {}, [schema.text('original', [schema.mark('em')])]),
      doc.child(index).withAttrs({ align: 'right' })]) {
      const edited = replaceNodeAtPath(doc, [index], replacement);
      expect(doc.eq(edited)).toBe(false);
      expect(edited.eq(doc)).toBe(false);
    }
    expect(doc.eq(schema.nodeFromJSON(doc.toJSON()))).toBe(true);
    expect(doc.eq(doc.copy(doc.content.slice(0, -1)))).toBe(false);
    const reordered = [...doc.content];
    reordered[0] = schema.node('paragraph', {}, [schema.text('different')]);
    expect(doc.eq(doc.copy(reordered))).toBe(false);
    expect(doc.eq(new Schema(CoreSchemaSpec).nodeFromJSON(doc.toJSON()))).toBe(false);
  });

  it('retains no-op and net-zero transaction behaviour with fresh equal nodes', () => {
    const editor = createEditor({ schema: CoreSchemaSpec, content: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'text' }] },
    ] } });
    try {
      const original = editor.state;
      expect(editor.dispatch(editor.createTransaction().replaceDocument(editor.state.schema.nodeFromJSON(editor.getJSON())))).toBe(false);
      expect(editor.state).toBe(original);
      const netZero = editor.createTransaction().insertText([0, 0], 4, '!').replaceText([0, 0], 4, 5, '');
      expect(netZero.docChanged).toBe(false);
      expect(editor.dispatch(netZero)).toBe(false);
      expect(editor.state).toBe(original);
    } finally { editor.destroy(); }
  });
});
