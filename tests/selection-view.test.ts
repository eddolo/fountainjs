// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  AllSelection,
  CellSelection,
  EditorView,
  GapSelection,
  NodeSelection,
  StarterKit,
  createEditor,
  selectGap,
  topLevelPosition,
} from '../src';

const paragraph = (value: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value }],
});

const settleSelection = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe('semantic selection DOM bridge', () => {
  it('uses Ctrl/Cmd+A as a document selection and replaces it through beforeinput', async () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: { type: 'doc', content: [paragraph('One'), paragraph('Two')] },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);

    const shortcut = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'a', ctrlKey: true });
    view.dom.dispatchEvent(shortcut);
    await settleSelection();
    expect(shortcut.defaultPrevented).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(AllSelection);
    expect(document.getSelection()?.toString()).toContain('One');
    expect(document.getSelection()?.toString()).toContain('Two');

    view.dom.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: 'Everything',
    }));
    expect(editor.getText()).toBe('Everything');
    view.destroy();
  });

  it('selects an atomic node by pointer and exposes an explicit visual marker', async () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: {
        type: 'doc',
        content: [
          paragraph('Before'),
          { type: 'image_super', attrs: { src: 'https://example.com/image.png', alt: '', title: '', caption: '', width: '100%' } },
          paragraph('After'),
        ],
      },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const image = view.dom.querySelector<HTMLElement>('[data-fountain-node="image_super"]');
    image?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    await settleSelection();

    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((editor.state.selection as NodeSelection).nodePath).toEqual([1]);
    expect(view.dom.querySelector('[data-fountain-selected-node="true"]')?.getAttribute('data-fountain-path')).toBe('1');

    view.dom.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'deleteContentBackward',
    }));
    expect(editor.state.doc.content.some((node) => node.type.name === 'image_super')).toBe(false);
    view.destroy();
  });

  it('extends a table selection with Shift+pointer and marks only its rectangle', async () => {
    const cell = (value: string, header = false) => ({
      type: header ? 'table_header' : 'table_cell',
      content: [paragraph(value)],
    });
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: {
        type: 'doc',
        content: [{
          type: 'table',
          content: [
            { type: 'table_row', content: [cell('A', true), cell('B', true), cell('C', true)] },
            { type: 'table_row', content: [cell('D'), cell('E'), cell('F')] },
          ],
        }],
      },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const head = view.dom.querySelector<HTMLElement>('[data-fountain-path="0.1.2"]');
    head?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, shiftKey: true }));
    await settleSelection();

    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect((editor.state.selection as CellSelection).cellPaths).toEqual([
      [0, 0, 0], [0, 0, 1], [0, 0, 2],
      [0, 1, 0], [0, 1, 1], [0, 1, 2],
    ]);
    expect(view.dom.querySelectorAll('[data-fountain-selected-cell="true"]')).toHaveLength(6);
    view.destroy();
  });

  it('renders a gap caret and inserts text as a real block at that boundary', async () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: { type: 'doc', content: [paragraph('A'), paragraph('B')] },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    expect(selectGap(editor, topLevelPosition(editor.state.doc, 1))).toBe(true);
    await settleSelection();
    expect(editor.state.selection).toBeInstanceOf(GapSelection);
    expect(view.dom.querySelector('[data-fountain-gap="before"]')?.getAttribute('data-fountain-path')).toBe('1');

    view.dom.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: 'Between',
    }));
    expect(editor.getText()).toBe('A\nBetween\nB');
    view.destroy();
  });
});
