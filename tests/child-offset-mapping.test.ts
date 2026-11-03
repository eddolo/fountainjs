import { afterEach, describe, expect, it, vi } from 'vitest';
import { Node, Schema, Selection, Transform, createEditor, createHistoryPlugin, undo, redo,
  textPointToPosition, nodeRangeAtPath, topLevelPosition } from '../src/headless';

const schema = new Schema({ nodes: {
  doc: { content: 'block*' }, text: { group: 'inline', inline: true },
  paragraph: { group: 'block', content: 'inline*' },
  quote: { group: 'block', content: 'block*' },
  media: { group: 'block', atom: true },
}, marks: { strong: {} } });
const paragraph = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
const document = (count = 160) => schema.node('doc', { retained: 'metadata' }, Array.from({ length: count }, (_, index) =>
  index % 11 === 0 ? schema.node('quote', {}, [paragraph(`nested ${index} 😀`), schema.node('media')])
    : index % 7 === 0 ? schema.node('media')
      : schema.node('paragraph', {}, [schema.text(''), schema.text(`p${index}😀`, [schema.mark('strong')])])));

// Independent structural traversal: no nodeSize getter or production mapper.
const size = (node: Node): number => node.isText ? node.text!.length : 2 + node.content.reduce((sum, child) => sum + size(child), 0);
function ranges(doc: Node) {
  const result: Array<{ node: Node; path: number[]; from: number }> = [];
  const visit = (node: Node, path: number[], from: number) => {
    result.push({ node, path, from });
    let next = from + (path.length ? 1 : 0);
    for (let index = 0; index < node.childCount; index++) {
      const child = node.child(index);
      visit(child, [...path, index], next);
      next += size(child);
    }
  };
  visit(doc, [], 0);
  return result;
}
function verify(doc: Node) {
  let prefix = 0;
  for (let index = 0; index <= doc.childCount; index++) {
    expect(topLevelPosition(doc, index)).toBe(prefix);
    if (index < doc.childCount) prefix += size(doc.child(index));
  }
  // Reverse and forward accesses exercise the shared checkpoint in both directions.
  const expected = ranges(doc);
  for (const entry of [...expected].reverse().concat(expected)) {
    expect(nodeRangeAtPath(doc, entry.path)).toEqual({ from: entry.from, to: entry.from + size(entry.node) - (entry.path.length ? 0 : 2) });
    if (entry.node.isText) {
      for (const offset of [0, entry.node.text!.length]) expect(textPointToPosition(doc, entry.path, offset)).toBe(entry.from + offset);
    }
  }
}

afterEach(() => vi.restoreAllMocks());
describe('bounded shared-prefix position mapping', () => {
  it('matches structural traversal for wide mixed documents and empty/marked text', () => { verify(document()); });

  it('handles wide nested containers and copies narrowed to small or empty documents', () => {
    const wide = schema.node('quote', {}, document().content);
    const before = schema.node('doc', {}, [paragraph('lead'), wide, paragraph('trail')]);
    const after = new Transform(before).insertText([1, 150, 1], 0, 'nested change ').doc;
    verify(after); verify(before);
    const root = document();
    topLevelPosition(root, 150);
    verify(root.copy(root.content.slice(0, 32)));
    verify(root.copy([]));
    verify(root);
  });

  it('populates a copied prefix even when the old map is first queried after the copy', () => {
    const before = schema.node('doc', {}, Array.from({ length: 4096 }, (_, i) => paragraph(`p${i}`)));
    const after = before.copy([...before.content.slice(0, -1), paragraph('changed')]);
    const expected = before.content.slice(0, -1).reduce((sum, node) => sum + size(node), 0) + 1;
    expect(textPointToPosition(before, [4095, 0], 0)).toBe(expected);
    const getter = vi.spyOn(Node.prototype, 'nodeSize', 'get');
    expect(textPointToPosition(after, [4095, 0], 0)).toBe(expected);
    expect(getter.mock.calls.length).toBeLessThan(10);
  });

  it('keeps positions correct across branches with shorter and longer shared prefixes', () => {
    const base = document(200);
    topLevelPosition(base, 195);
    const branch = (index: number, label: string) => base.copy(base.content.map((node, at) => at === index ? paragraph(label) : node));
    const left = branch(80, 'short');
    const right = branch(170, 'much longer branch content');
    const grandchild = left.copy(left.content.map((node, at) => at === 120 ? paragraph('grandchild') : node));
    for (const doc of [right, grandchild, base, left, base, right]) verify(doc);
  });

  it('never shares the changed suffix when old/new versions are interleaved', () => {
    const before = document();
    const after = before.copy([...before.content.slice(0, 100), paragraph('larger replacement suffix'), ...before.content.slice(101)]);
    for (const index of [159, 100, 130, 5, 160, 64, 159]) {
      for (const doc of [before, after, before]) {
        expect(topLevelPosition(doc, index)).toBe(doc.content.slice(0, index).reduce((sum, node) => sum + size(node), 0));
      }
    }
  });

  it('handles insertion, deletion, reordering and replacement at every prefix boundary', () => {
    let doc = document(180);
    const saved: Node[] = [doc];
    for (const index of [0, 63, 64, 65, 90, 179]) {
      const content = [...doc.content];
      content.splice(index, 0, paragraph(`insert ${index}`));
      doc = doc.copy(content); saved.push(doc);
      const changed = [...doc.content];
      changed.splice(index, 2, schema.node('media'));
      doc = doc.copy(changed); saved.push(doc);
    }
    doc = doc.copy([...doc.content.slice(1), doc.child(0)]); saved.push(doc);
    for (const snapshot of saved.reverse()) verify(snapshot);
  });

  it('does not retain mutable input arrays or alter metadata when copying', () => {
    const before = document();
    const supplied = [...before.content];
    const after = before.copy(supplied);
    supplied.splice(0, supplied.length, paragraph('outside mutation'));
    expect(after.attrs).toEqual(before.attrs);
    expect(Object.isFrozen(after.content)).toBe(true);
    expect(after.toJSON()).toEqual(before.toJSON());
    verify(after); verify(before);
  });

  it('keeps independently replaced documents and repeated child identities separate', () => {
    const repeated = paragraph('shared');
    const first = schema.node('doc', {}, Array(200).fill(repeated));
    const second = schema.nodeFromJSON(first.toJSON());
    const edited = new Transform(second).insertText([150, 0], 0, 'new ').doc;
    verify(first); verify(edited); verify(second);
  });

  it('preserves selection/history when a prefix changes before a tail cursor', () => {
    const doc = schema.node('doc', { retained: 'history' }, Array.from({ length: 200 }, (_, i) => paragraph(`p${i}`)));
    const editor = createEditor({ schema: schema.spec, content: doc.toJSON(), plugins: [createHistoryPlugin()] });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([199, 0], 2)));
    topLevelPosition(editor.state.doc, 199);
    const before = editor.state.doc;
    editor.dispatch(editor.state.createTransaction().insertText([100, 0], 0, 'prefix '));
    expect(editor.state.selection).toEqual(Selection.cursor([199, 0], 2));
    verify(editor.state.doc);
    const after = editor.state.doc;
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(before.toJSON());
    verify(editor.state.doc);
    expect(redo(editor)).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(after.toJSON());
    verify(editor.state.doc);
    editor.destroy();
  });

  it('retains invalid path/index/offset rejection', () => {
    const doc = document();
    for (const index of [-1, 0.5, doc.childCount + 1, Infinity]) expect(() => topLevelPosition(doc, index)).toThrow(RangeError);
    expect(() => nodeRangeAtPath(doc, [doc.childCount])).toThrow(RangeError);
    expect(() => textPointToPosition(doc, [1, 1], -1)).toThrow(RangeError);
    expect(() => textPointToPosition(doc, [1, 1], 1000)).toThrow(RangeError);
  });
});
