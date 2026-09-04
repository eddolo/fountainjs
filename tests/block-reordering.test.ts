// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  CoreSchemaSpec,
  EditorView,
  NodeSelection,
  Plugin,
  canMoveNode,
  createEditor,
  historyPlugin,
  moveNode,
  registerFountainElement,
  undo,
} from '../src';

const paragraph = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

const listItem = (text: string) => ({
  type: 'list_item',
  content: [paragraph(text)],
});

describe('path-based node moves', () => {
  it('reorders nested list items atomically, restores selection, and undoes in one step', () => {
    const update = vi.fn();
    const editor = createEditor({
      schema: CoreSchemaSpec,
      plugins: [historyPlugin],
      content: {
        type: 'doc',
        content: [
          paragraph('Intro'),
          { type: 'bullet_list', content: [listItem('One'), listItem('Two'), listItem('Three')] },
        ],
      },
      onUpdate: update,
    });

    const move = { fromPath: [1, 2], toParentPath: [1], toIndex: 0 } as const;
    expect(canMoveNode(editor, move)).toBe(true);
    expect(editor.state.doc.child(1).content.map((node) => node.textContent)).toEqual(['One', 'Two', 'Three']);
    expect(moveNode(editor, move)).toBe(true);
    expect(editor.state.doc.child(1).content.map((node) => node.textContent)).toEqual(['Three', 'One', 'Two']);
    expect(editor.state.selection.path).toEqual([1, 0, 0, 0]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.child(1).content.map((node) => node.textContent)).toEqual(['One', 'Two', 'Three']);
  });

  it('moves a nested block across containers and remaps a shifted destination path', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      plugins: [historyPlugin],
      content: {
        type: 'doc',
        content: [
          { type: 'blockquote', content: [paragraph('A'), paragraph('B')] },
          { type: 'blockquote', content: [paragraph('C'), paragraph('D')] },
          { type: 'blockquote', content: [paragraph('E'), paragraph('F')] },
        ],
      },
    });

    expect(moveNode(editor, { fromPath: [0, 1], toParentPath: [1], toIndex: 1 })).toBe(true);
    expect(editor.state.doc.child(0).content.map((node) => node.textContent)).toEqual(['A']);
    expect(editor.state.doc.child(1).content.map((node) => node.textContent)).toEqual(['C', 'B', 'D']);
    expect(editor.state.selection.path).toEqual([1, 1, 0]);

    // Removing a whole earlier sibling shifts the destination parent before insertion.
    expect(moveNode(editor, { fromPath: [0], toParentPath: [2], toIndex: 1 })).toBe(true);
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(1).content.map((node) => node.textContent)).toEqual(['E', 'A', 'F']);
    expect(editor.state.selection.path).toEqual([1, 1, 0, 0]);
  });

  it('rejects no-ops, cycles, bad paths, schema-invalid destinations, and read-only moves', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [
          { type: 'blockquote', content: [paragraph('Quote')] },
          { type: 'bullet_list', content: [listItem('Item')] },
        ],
      },
    });
    const original = editor.getJSON();

    expect(canMoveNode(editor, { fromPath: [0], toParentPath: [], toIndex: 0 })).toBe(false);
    expect(moveNode(editor, { fromPath: [0], toParentPath: [0], toIndex: 0 })).toBe(false);
    expect(moveNode(editor, { fromPath: [9], toParentPath: [], toIndex: 0 })).toBe(false);
    expect(moveNode(editor, { fromPath: [0, 0], toParentPath: [1], toIndex: 0 })).toBe(false);
    expect(editor.getJSON()).toEqual(original);

    const readOnly = createEditor({ schema: CoreSchemaSpec, content: original, editable: false });
    expect(canMoveNode(readOnly, { fromPath: [1], toParentPath: [], toIndex: 0 })).toBe(false);
    expect(moveNode(readOnly, { fromPath: [1], toParentPath: [], toIndex: 0 })).toBe(false);

    const filtered = createEditor({
      schema: CoreSchemaSpec,
      content: original,
      plugins: [new Plugin({ filterTransaction: () => false })],
    });
    expect(canMoveNode(filtered, { fromPath: [1], toParentPath: [], toIndex: 0 })).toBe(true);
    expect(moveNode(filtered, { fromPath: [1], toParentPath: [], toIndex: 0 })).toBe(false);
    expect(filtered.getJSON()).toEqual(original);
  });

  it('selects a moved atom when it has no text leaf', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: { type: 'doc', content: [paragraph('Text'), { type: 'horizontal_rule' }] },
    });
    expect(moveNode(editor, { fromPath: [1], toParentPath: [], toIndex: 0 })).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((editor.state.selection as NodeSelection).nodePath).toEqual([0]);
  });
});

describe('framework-neutral block handles', () => {
  it('renders external accessible controls and moves a nested block with buttons', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      plugins: [historyPlugin],
      content: {
        type: 'doc',
        content: [
          paragraph('Intro'),
          { type: 'blockquote', content: [paragraph('First quote'), paragraph('Second quote')] },
        ],
      },
    });
    const mount = document.createElement('div');
    mount.style.position = 'absolute';
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor, { blockHandles: true });
    const nested = view.dom.querySelector<HTMLElement>('[data-fountain-path="1.1"]');
    nested?.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));

    const controls = mount.querySelector<HTMLElement>('[data-fountain-block-controls]');
    expect(controls).not.toBeNull();
    expect(view.dom.contains(controls)).toBe(false);
    expect(mount.style.position).toBe('absolute');
    expect(mount.hasAttribute('data-fountain-block-handles-static')).toBe(false);
    expect(controls?.dataset.fountainBlockPath).toBe('1.1');
    expect(controls?.getAttribute('role')).toBe('toolbar');
    expect(controls?.getAttribute('aria-label')).toBe('Paragraph block controls');
    const before = controls?.querySelector<HTMLButtonElement>('[data-fountain-block-action="before"]');
    const drag = controls?.querySelector<HTMLButtonElement>('[data-fountain-block-action="drag"]');
    expect(before?.getAttribute('aria-label')).toBe('Move Paragraph block before');
    expect(before?.title).toBe('Move Paragraph block before');
    expect(before?.disabled).toBe(false);
    drag?.focus();
    drag?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowRight' }));
    expect(document.activeElement).toBe(before);

    before?.click();
    expect(editor.state.doc.child(1).content.map((node) => node.textContent)).toEqual(['Second quote', 'First quote']);
    expect(editor.state.selection.path).toEqual([1, 0, 0]);
    expect(controls?.dataset.fountainBlockPath).toBe('1.0');
    expect(before?.disabled).toBe(true);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.child(1).content.map((node) => node.textContent)).toEqual(['First quote', 'Second quote']);

    view.destroy();
    expect(mount.hasAttribute('data-fountain-block-handles')).toBe(false);
    expect(mount.querySelector('[data-fountain-block-controls]')).toBeNull();
    mount.remove();
  });

  it('supports host filtering and product-owned labels', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [paragraph('Intro'), { type: 'blockquote', content: [paragraph('Quote')] }],
      },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor, {
      attributes: { dir: 'rtl' },
      blockHandles: {
        include: ({ node }) => node.type.name === 'blockquote',
        labels: {
          toolbar: () => 'Story section controls',
          drag: () => 'Reorder story section',
        },
      },
    });
    const controls = mount.querySelector<HTMLElement>('[data-fountain-block-controls]');
    expect(view.dom.querySelectorAll('[data-fountain-block-reorderable]')).toHaveLength(1);
    expect(mount.hasAttribute('data-fountain-block-handles-static')).toBe(true);
    expect(controls?.getAttribute('aria-label')).toBe('Story section controls');
    expect(controls?.dir).toBe('rtl');
    const drag = controls?.querySelector<HTMLButtonElement>('[data-fountain-block-action="drag"]');
    const before = controls?.querySelector<HTMLButtonElement>('[data-fountain-block-action="before"]');
    expect(drag?.getAttribute('aria-label')).toBe('Reorder story section');
    drag?.focus();
    drag?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowRight' }));
    expect(document.activeElement).toBe(before);
    view.destroy();
    mount.remove();
  });

  it('forwards the same controls through the Web Component registration boundary', () => {
    registerFountainElement({ tagName: 'reorder-fountain-editor', blockHandles: true });
    const element = document.createElement('reorder-fountain-editor') as HTMLElement & {
      value: { type: string; content: unknown[] };
    };
    element.value = { type: 'doc', content: [paragraph('One'), paragraph('Two')] };
    document.body.appendChild(element);
    expect(element.querySelector('[data-fountain-block-controls]')).not.toBeNull();
    expect(element.querySelectorAll('[data-fountain-block-reorderable]')).toHaveLength(2);
    element.remove();
  });
});
