import { expect, it } from 'vitest';
import { CoreSchemaSpec, MarkdownExporter, createEditor, createHistoryPlugin, undo, redo } from '../src';

it.each([false, true])('updates link attributes without reversing existing link/bold nesting (range=%s)', range => {
  const editor = createEditor({ schema: CoreSchemaSpec, plugins: [createHistoryPlugin()], content: {
    type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'one', marks: [{ type: 'link', attrs: { href: '/old' } }] },
      { type: 'text', text: 'two', marks: [{ type: 'link', attrs: { href: '/old' } }, { type: 'strong' }] },
    ] }],
  } });
  try {
    const before = editor.getJSON(), transaction = editor.createTransaction();
    const mark = editor.state.schema.mark('link', { href: '/new' });
    if (range) transaction.addMarkRange([0, 0], 0, [0, 1], 3, mark);
    else transaction.addMark([0, 1], 0, 3, mark);
    expect(editor.dispatch(transaction)).toBe(true);
    expect(editor.state.doc.child(0).child(1).marks.map(value => value.type.name)).toEqual(['link', 'strong']);
    expect(MarkdownExporter.export(editor.state)).toBe(range ? '[one**two**](/new)' : '[one](/old)[**two**](/new)');
    expect(undo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(redo(editor)).toBe(true);
    expect(editor.state.doc.child(0).child(1).marks.map(value => value.type.name)).toEqual(['link', 'strong']);
  } finally { editor.destroy(); }
});

it('retains the order of existing marks when appending a new mark type', () => {
  const editor = createEditor({ schema: CoreSchemaSpec, content: { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'Text', marks: [{ type: 'strong' }, { type: 'em' }] },
  ] }] } });
  try {
    expect(editor.dispatch(editor.createTransaction().addMark([0, 0], 0, 4, editor.state.schema.mark('link', { href: '/new' })))).toBe(true);
    expect(editor.state.doc.child(0).child(0).marks.map(value => value.type.name)).toEqual(['strong', 'em', 'link']);
  } finally { editor.destroy(); }
});
