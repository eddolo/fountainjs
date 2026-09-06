import { describe, expect, it } from 'vitest';
import { Selection, createEditor, insertText, moveNode } from '../src/core';
import { CoreExtension, composeExtensions } from '../src/extensions';
import { createStableNodeIdsExtension } from '../src/node-ids';
import {
  TableOfContentsExtension,
  buildTableOfContents,
  getTableOfContentsState,
  navigateTableOfContents,
} from '../src/table-of-contents';

function createDocumentEditor() {
  const stableIds = createStableNodeIdsExtension({
    generateId: ({ node, path }) => `${node.type.name}-${path.join('-')}`,
  });
  const kit = composeExtensions([CoreExtension, stableIds, TableOfContentsExtension]);
  return createEditor({
    schema: kit.schema,
    plugins: kit.plugins,
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Overview' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Opening' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Deep detail' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Next section' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Next section' }] },
      ],
    },
  });
}

describe('table of contents', () => {
  it('builds stable flat and hierarchical indexes without browser globals', () => {
    const editor = createDocumentEditor();
    const state = getTableOfContentsState(editor);
    expect(state?.entries.map(({ title, level, depth, stable }) => ({ title, level, depth, stable }))).toEqual([
      { title: 'Overview', level: 1, depth: 0, stable: true },
      { title: 'Deep detail', level: 3, depth: 1, stable: true },
      { title: 'Next section', level: 2, depth: 1, stable: true },
      { title: 'Next section', level: 2, depth: 1, stable: true },
    ]);
    expect(state?.tree).toHaveLength(1);
    expect(state?.tree[0]?.children.map((entry) => entry.title)).toEqual([
      'Deep detail', 'Next section', 'Next section',
    ]);
    expect(state?.entries.every((entry) => entry.anchor === `fountain-heading-${entry.id}`)).toBe(true);
    expect(Object.isFrozen(state?.entries)).toBe(true);
    expect(Object.isFrozen(state?.tree[0]?.children)).toBe(true);
    editor.destroy();
  });

  it('tracks the active section and navigates through model selections', () => {
    const editor = createDocumentEditor();
    const target = getTableOfContentsState(editor)?.entries[2];
    expect(target).toBeDefined();
    expect(navigateTableOfContents(editor, target?.id ?? '')).toBe(true);
    expect(editor.state.selection).toEqual(Selection.cursor([3, 0], 0));
    expect(getTableOfContentsState(editor)?.activeId).toBe(target?.id);
    expect(navigateTableOfContents(editor, 'missing')).toBe(false);
    editor.destroy();
  });

  it('keeps anchors through title edits and block moves', () => {
    const editor = createDocumentEditor();
    const original = getTableOfContentsState(editor)?.entries.find((entry) => entry.title === 'Deep detail');
    expect(original).toBeDefined();
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([2, 0], 11)));
    expect(insertText(editor, '!')).toBe(true);
    expect(moveNode(editor, { fromPath: [2], toParentPath: [], toIndex: 4 })).toBe(true);
    const moved = getTableOfContentsState(editor)?.entries.find((entry) => entry.title === 'Deep detail!');
    expect(moved?.id).toBe(original?.id);
    expect(moved?.anchor).toBe(original?.anchor);
    expect(moved?.path).toEqual([4]);
    editor.destroy();
  });

  it('offers a deterministic compatibility fallback and validates options', () => {
    const schema = composeExtensions([CoreExtension]).schema;
    const editor = createEditor({
      schema,
      content: { type: 'doc', content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'No identity' }] },
      ] },
    });
    expect(buildTableOfContents(editor.state.doc).entries[0]).toMatchObject({
      id: 'path-0', anchor: 'fountain-heading-path-0', stable: false,
    });
    expect(() => buildTableOfContents(editor.state.doc, { minLevel: 4, maxLevel: 2 })).toThrow(/cannot exceed/);
    expect(() => buildTableOfContents(editor.state.doc, { types: ['heading', 'heading'] })).toThrow(/unique/);
    editor.destroy();
  });
});
