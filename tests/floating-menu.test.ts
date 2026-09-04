/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import {
  CoreExtension,
  FountainMenuController,
  composeExtensions,
  createBubbleMenuExtension,
  createEditor,
  createFloatingMenuExtension,
  getEditorMenuAnchorRect,
  insertText,
  placeEditorMenu,
  selectAll,
  selectText,
  type FountainMenuService,
} from '../src';

describe('headless bubble and floating menus', () => {
  it('tracks default selection eligibility, dismissal, and selection changes', () => {
    const bubble = createBubbleMenuExtension();
    const floating = createFloatingMenuExtension();
    const kit = composeExtensions([CoreExtension, bubble, floating]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const bubbleController = (kit.services.bubbleMenu as FountainMenuService).getController(editor);
    const floatingController = (kit.services.floatingMenu as FountainMenuService).getController(editor);
    const revisions: number[] = [];
    bubbleController.subscribe((snapshot) => revisions.push(snapshot.revision));

    expect(bubbleController.getSnapshot().open).toBe(false);
    expect(floatingController.getSnapshot()).toMatchObject({ open: true, anchorPath: [0] });
    expect(insertText(editor, 'A selectable sentence.')).toBe(true);
    expect(floatingController.getSnapshot().open).toBe(false);
    expect(selectText(editor, [0, 0], 2, 12)).toBe(true);
    expect(bubbleController.getSnapshot().open).toBe(true);
    expect(bubbleController.dismiss()).toBe(true);
    expect(bubbleController.getSnapshot().open).toBe(false);
    expect(bubbleController.refresh()).toBe(true);
    expect(bubbleController.getSnapshot().open).toBe(true);
    expect(selectText(editor, [0, 0], 4)).toBe(true);
    expect(bubbleController.getSnapshot().open).toBe(false);
    expect(selectAll(editor)).toBe(true);
    expect(bubbleController.getSnapshot().open).toBe(true);
    expect(revisions.length).toBeGreaterThanOrEqual(4);
    editor.destroy();
  });

  it('supports named instances and contains custom visibility failures', () => {
    const links = createBubbleMenuExtension({ id: 'links', shouldShow: () => { throw new Error('host failure'); } });
    const blocks = createFloatingMenuExtension({ id: 'blocks' });
    const kit = composeExtensions([CoreExtension, links, blocks]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const linksService = kit.services['bubbleMenu:links'] as FountainMenuService;
    const blocksService = kit.services['floatingMenu:blocks'] as FountainMenuService;

    expect(linksService.getController(editor).getSnapshot()).toMatchObject({ open: false, error: 'host failure' });
    expect(blocksService.getController(editor).getSnapshot()).toMatchObject({ open: true, kind: 'floating' });
    expect(() => createBubbleMenuExtension({ id: 'spaces are unsafe' })).toThrow('bubble menu ids');
    expect(() => createFloatingMenuExtension({ id: ' ' })).toThrow('non-empty');
    editor.destroy();
  });

  it('keeps read-only menus closed unless the host opts in', () => {
    const hidden = new FountainMenuController(
      createEditor({ schema: composeExtensions([CoreExtension]).schema, editable: false }),
      'floating',
    );
    const shownEditor = createEditor({ schema: composeExtensions([CoreExtension]).schema, editable: false });
    const shown = new FountainMenuController(shownEditor, 'floating', { showWhenReadOnly: true });
    expect(hidden.getSnapshot().open).toBe(false);
    expect(shown.getSnapshot().open).toBe(true);
    hidden.destroy();
    shown.destroy();
    hidden.editor.destroy();
    shownEditor.destroy();
  });
});

describe('menu geometry', () => {
  it('resolves a floating block and clamps or flips placement inside the viewport', () => {
    const kit = composeExtensions([CoreExtension, createFloatingMenuExtension()]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const snapshot = (kit.services.floatingMenu as FountainMenuService).getController(editor).getSnapshot();
    const root = document.createElement('div');
    const block = document.createElement('p');
    block.dataset.fountainPath = '0';
    block.getBoundingClientRect = () => ({
      x: 180, y: 170, left: 180, top: 170, right: 280, bottom: 190, width: 100, height: 20,
      toJSON: () => ({}),
    });
    root.append(block);

    expect(getEditorMenuAnchorRect(root, snapshot)).toMatchObject({ left: 180, top: 170, width: 100 });
    expect(placeEditorMenu(
      block.getBoundingClientRect(),
      { width: 160, height: 60 },
      'floating',
      { viewportWidth: 300, viewportHeight: 220 },
    )).toEqual({ left: 132, top: 102, side: 'top' });
    editor.destroy();
  });
});
