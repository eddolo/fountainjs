// @vitest-environment node
import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, Selection, composeExtensions, createEditor, getCollaborationState,
  redoCollaboration, splitBlock, undoCollaboration, type NodeJSON } from '../src';
import { createYjsCollaborationExtension } from '../src/yjs';
import { retainedNameKey } from '../src/yjs/retained-nodes';

const paragraph = (text: string): NodeJSON => ({ type: 'paragraph', content: [{ type: 'text', text }] });

it.each([false, true].flatMap(nested => [0, 2, 5].map(offset => ({ nested, offset }))))(
  'keeps an untouched empty sibling native identity through split/undo/redo (nested: $nested, offset: $offset)', ({ nested, offset }) => {
  const document = new Y.Doc();
  const empty: NodeJSON = { type: 'paragraph', attrs: { source: 'empty paragraph' }, content: [
    { type: 'text', text: '', attrs: { source: 'untouched-empty' }, marks: [{ type: 'em' }] },
  ] };
  const blocks = [paragraph('Alpha'), empty];
  const content: NodeJSON = { type: 'doc', content: nested
    ? [{ type: 'bullet_list', content: [{ type: 'list_item', content: blocks }] }] : blocks };
  const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, captureTimeout: 0,
    user: { id: 'author', name: 'Author', color: '#7048e8' } })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content });
  const nodes = document.getMap('fountain-nodes:nodes'), placements = document.getMap('fountain-nodes:placements');
  const owners = document.getMap('fountain-text:owners'), texts = document.getMap('fountain-text:texts');
  const [id, record] = [...nodes].find(([, node]) => node instanceof Y.Map
    && node.get(`attr:${retainedNameKey('source')}`) === '"untouched-empty"')! as [string, Y.Map<unknown>];
  const placement = placements.get(id), parent = nodes.get((placement as { parent: string }).parent) as Y.Map<unknown>;
  const originalLayout = record.get('textLayout'), stream = owners.get(id), originalText = texts.get(stream as string);
  const original = editor.getJSON(), mutations: string[][] = [];
  const observe = (event: Y.YMapEvent<unknown>) => { mutations.push([...event.keysChanged]); };
  record.observe(observe);
  const unchanged = () => {
    expect(getCollaborationState(editor)?.status, getCollaborationState(editor)?.error?.message).toBe('connected');
    expect(nodes.get(id)).toBe(record);
    expect(placements.get(id)).toEqual(placement);
    expect(record.get('textLayout')).toEqual(originalLayout);
    expect(owners.get(id)).toBe(stream);
    expect(texts.get(stream as string)).toBe(originalText);
    expect((parent.get('children') as Y.Array<{ id: string }>).toArray().map(entry => entry.id)).toEqual([id]);
    expect(mutations, 'An unrelated split must not rewrite the empty sibling layout or attributes').toEqual([]);
  };
  try {
    unchanged();
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor(nested ? [0, 0, 0, 0] : [0, 0], offset)));
    expect(splitBlock(editor)).toBe(true); unchanged();
    const split = editor.getJSON();
    expect(undoCollaboration(editor)).toBe(true); unchanged(); expect(editor.getJSON()).toEqual(original);
    expect(redoCollaboration(editor)).toBe(true); unchanged(); expect(editor.getJSON()).toEqual(split);
  } finally { record.unobserve(observe); editor.destroy(); document.destroy(); }
});
