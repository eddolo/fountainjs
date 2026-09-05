// @vitest-environment node

import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import {
  CoreExtension,
  HistoryExtension,
  NodeSelection,
  composeExtensions,
  createEditor,
  insertText,
  moveNode,
  redo,
  undo,
} from '../src';
import {
  STABLE_NODE_ID_REPAIR_META,
  StableNodeIdIndex,
  createStableNodeIdIndex,
  createStableNodeIdsExtension,
  getNodeById,
  getStableNodeIdIndex,
  inspectStableNodeIds,
  nodeById,
  normalizeStableNodeIds,
  normalizeStableNodeIdJSON,
  planStableNodeIdRepairs,
  selectNodeById,
  updateNodeById,
} from '../src/node-ids';

function paragraph(text: string, nodeId?: unknown) {
  return {
    type: 'paragraph',
    ...(nodeId === undefined ? {} : { attrs: { nodeId } }),
    content: [{ type: 'text', text }],
  } as const;
}

function content(...values: ReturnType<typeof paragraph>[]) {
  return { type: 'doc', content: values } as const;
}

function deterministicId({ path, attempt }: { path: readonly number[]; attempt: number }): string {
  return `test-${path.join('-')}-${attempt}`;
}

function editorWithIds(values = content(paragraph('Alpha'), paragraph('Beta'))) {
  const stableIds = createStableNodeIdsExtension({ generateId: deterministicId });
  const kit = composeExtensions([CoreExtension, HistoryExtension, stableIds]);
  return createEditor({ schema: kit.schema, plugins: kit.plugins, content: values });
}

describe('stable node identities', () => {
  it('assigns portable IDs to eligible blocks before the editor is observed', () => {
    const editor = editorWithIds();
    expect(editor.state.doc.content.map((node) => ({
      text: node.textContent,
      id: node.attrs.nodeId,
    }))).toEqual([
      { text: 'Alpha', id: 'test-0-0' },
      { text: 'Beta', id: 'test-1-0' },
    ]);
    expect(editor.state.doc.attrs.nodeId).toBeUndefined();
    expect(editor.state.doc.child(0).child(0).attrs.nodeId).toBeUndefined();
    expect(inspectStableNodeIds(editor.state.doc)).toEqual([]);
    expect(getStableNodeIdIndex(editor)?.size).toBe(2);
  });

  it('provides indexed lookup, update, and node-selection commands without changing identity', () => {
    const editor = editorWithIds();
    const index = getStableNodeIdIndex(editor);
    expect(index).toBeInstanceOf(StableNodeIdIndex);
    expect(index?.get('test-1-0')).toMatchObject({ path: [1], node: editor.state.doc.child(1) });
    expect(getNodeById(editor, 'test-1-0')?.textContent).toBe('Beta');
    expect(nodeById(editor.state.doc, 'test-1-0')?.textContent).toBe('Beta');

    expect(updateNodeById(editor, 'test-1-0', { align: 'center', nodeId: 'hijack' })).toBe(true);
    expect(getNodeById(editor, 'test-1-0')?.attrs).toMatchObject({ align: 'center', nodeId: 'test-1-0' });
    expect(selectNodeById(editor, 'test-1-0')).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((editor.state.selection as NodeSelection).nodePath).toEqual([1]);
    expect(updateNodeById(editor, 'missing', { align: 'right' })).toBe(false);
    expect(selectNodeById(editor, 'missing')).toBe(false);
  });

  it('preserves IDs through text edits and structural moves while updating indexed paths', () => {
    const editor = editorWithIds();
    const alphaId = String(editor.state.doc.child(0).attrs.nodeId);
    expect(insertText(editor, '!')).toBe(true);
    expect(editor.state.doc.child(0).attrs.nodeId).toBe(alphaId);
    expect(moveNode(editor, { fromPath: [0], toParentPath: [], toIndex: 1 })).toBe(true);
    expect(getStableNodeIdIndex(editor)?.get(alphaId)?.path).toEqual([1]);
    expect(getNodeById(editor, alphaId)?.textContent).toBe('!Alpha');
  });

  it('repairs pasted duplicate IDs deterministically and keeps undo as one user action', () => {
    const editor = editorWithIds(content(paragraph('Original', 'shared-id')));
    const duplicate = editor.state.doc.child(0);
    let observedRepairs = 0;
    editor.subscribe((_state, transaction) => {
      observedRepairs += transaction.getMeta<readonly unknown[]>(STABLE_NODE_ID_REPAIR_META)?.length ?? 0;
    });

    expect(editor.dispatch(editor.state.createTransaction().replace(1, 1, [duplicate]))).toBe(true);
    expect(editor.state.doc.child(0).attrs.nodeId).toBe('shared-id');
    expect(editor.state.doc.child(1).attrs.nodeId).toBe('test-1-0');
    expect(observedRepairs).toBe(1);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.childCount).toBe(1);
    expect(redo(editor)).toBe(true);
    expect(editor.state.doc.child(1).attrs.nodeId).toBe('test-1-0');
  });

  it('fails closed on duplicates and reports every invalid identity with paths', () => {
    const kit = composeExtensions([CoreExtension]);
    const editor = createEditor({
      schema: kit.schema,
      content: content(paragraph('One', 'duplicate'), paragraph('Two', 'duplicate'), paragraph('Three', 'bad id!')),
    });
    const index = createStableNodeIdIndex(editor.state.doc);
    expect(index.get('duplicate')).toBeUndefined();
    expect(index.getAll('duplicate').map((entry) => entry.path)).toEqual([[0], [1]]);
    expect(nodeById(editor.state.doc, 'duplicate')).toBeUndefined();
    expect(index.issues).toMatchObject([
      { reason: 'duplicate', path: [1], duplicateOf: [0] },
      { reason: 'invalid', path: [2], value: 'bad id!' },
    ]);
  });

  it('normalizes missing, invalid, and duplicate IDs without a browser or fake DOM', () => {
    expect(typeof document).toBe('undefined');
    const kit = composeExtensions([CoreExtension]);
    const editor = createEditor({
      schema: kit.schema,
      content: content(paragraph('Missing'), paragraph('Invalid', 'bad id!'), paragraph('A', 'same'), paragraph('B', 'same')),
    });
    const first = normalizeStableNodeIds(editor.state.doc);
    const second = normalizeStableNodeIds(editor.state.doc);
    expect(first.document.toJSON()).toEqual(second.document.toJSON());
    expect(first.repairs.map((repair) => repair.reason)).toEqual(['missing', 'invalid', 'duplicate']);
    expect(first.index.issues).toEqual([]);
    expect(first.document.child(2).attrs.nodeId).toBe('same');
    expect(first.document.child(3).attrs.nodeId).not.toBe('same');
    expect(planStableNodeIdRepairs(first.document)).toEqual([]);
  });

  it('supports opt-in inline node types, custom attributes, and application filters', () => {
    const custom = createStableNodeIdsExtension({
      attribute: 'identity',
      types: ['inline_image'],
      filter: ({ node }) => node.attrs.alt !== 'ignored',
      generateId: deterministicId,
    });
    const kit = composeExtensions([CoreExtension, custom]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'inline_image', attrs: { src: '/kept.png', alt: 'kept' } },
            { type: 'inline_image', attrs: { src: '/ignored.png', alt: 'ignored' } },
          ],
        }],
      },
    });
    expect(editor.state.doc.child(0).attrs.identity).toBeUndefined();
    expect(editor.state.doc.child(0).child(0).attrs.identity).toBe('test-0-0-0');
    expect(editor.state.doc.child(0).child(1).attrs.identity).toBeUndefined();
    expect(selectNodeById(editor, 'test-0-0-0')).toBe(true);
  });

  it('preserves IDs through canonical JSON round trips', () => {
    const editor = editorWithIds();
    const json = editor.getJSON();
    expect(editor.state.schema.nodeFromJSON(json).toJSON()).toEqual(json);
    const migrated = normalizeStableNodeIdJSON(
      editor.state.schema,
      content(paragraph('Stored document')),
      { generateId: deterministicId },
    );
    expect(migrated.document.content?.[0]?.attrs?.nodeId).toBe('test-0-0');
    expect(migrated.repairs).toMatchObject([{ reason: 'missing', path: [0] }]);
  });

  it('keeps repeated lookup constant-time on a 10,000-block document', () => {
    const kit = composeExtensions([CoreExtension]);
    const editor = createEditor({
      schema: kit.schema,
      content: content(...Array.from({ length: 10_000 }, (_, index) => paragraph(`Line ${index}`, `node-${index}`))),
    });
    const index = createStableNodeIdIndex(editor.state.doc);
    const started = performance.now();
    for (let iteration = 0; iteration < 100_000; iteration += 1) {
      expect(index.get(`node-${iteration % 10_000}`)).toBeDefined();
    }
    expect(performance.now() - started).toBeLessThan(1_500);
    expect(index.get('node-9999')?.path).toEqual([9_999]);
  });

  it('normalizes and maintains a 10,000-block live index within explicit budgets', () => {
    const stableIds = createStableNodeIdsExtension();
    const kit = composeExtensions([CoreExtension, stableIds]);
    const started = performance.now();
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: content(...Array.from({ length: 10_000 }, (_, index) => paragraph(`Missing ${index}`))),
    });
    const initializedIn = performance.now() - started;
    expect(getStableNodeIdIndex(editor)?.entries).toHaveLength(10_000);
    expect(inspectStableNodeIds(editor.state.doc)).toEqual([]);
    expect(initializedIn).toBeLessThan(2_000);

    const updateStarted = performance.now();
    expect(insertText(editor, '!')).toBe(true);
    expect(performance.now() - updateStarted).toBeLessThan(750);
    expect(getStableNodeIdIndex(editor)?.entries).toHaveLength(10_000);
  });

  it('rejects unsafe configuration and bounded generators that cannot produce a unique ID', () => {
    expect(() => createStableNodeIdsExtension({ attribute: '<id>' })).toThrow(/safe names/);
    expect(() => createStableNodeIdsExtension({ attribute: '__proto__' })).toThrow(/safe names/);
    expect(() => createStableNodeIdsExtension({ types: ['paragraph', 'paragraph'] })).toThrow(/unique/);
    const kit = composeExtensions([CoreExtension]);
    const editor = createEditor({ schema: kit.schema, content: content(paragraph('A', 'taken'), paragraph('B')) });
    expect(() => normalizeStableNodeIds(editor.state.doc, { generateId: () => 'taken' })).toThrow(/100 attempts/);
  });

  it('snapshots extension policy so later caller mutations cannot change live identity rules', () => {
    const types = ['paragraph'];
    const options = { types, generateId: deterministicId };
    const stable = createStableNodeIdsExtension(options);
    types.splice(0, 1, 'heading');
    const kit = composeExtensions([CoreExtension, stable]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: content(paragraph('Stable')) });
    expect(editor.state.doc.child(0).attrs.nodeId).toBe('test-0-0');
  });
});
