/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import {
  CoreExtension,
  EditorView,
  composeExtensions,
  createBubbleMenuExtension,
  createEditor,
  createFloatingMenuExtension,
  insertText,
  selectText,
  type FountainMenuService,
} from '../src';
import { FountainBubbleMenu, FountainFloatingMenu } from '../src/react';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left, y: top, left, top, right: left + width, bottom: top + height, width, height,
    toJSON: () => ({}),
  };
}

describe('React bubble and floating menus', () => {
  it('renders focused accessible toolbars and dismisses the bubble menu with Escape', async () => {
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function implementation(this: HTMLElement) {
      if (this.classList.contains('fountain-context-menu')) return rect(0, 0, 150, 42);
      if (this.hasAttribute('data-fountain-path')) return rect(100, 120, 220, 28);
      return rect(0, 0, 0, 0);
    });
    const bubble = createBubbleMenuExtension();
    const floating = createFloatingMenuExtension();
    const kit = composeExtensions([CoreExtension, bubble, floating]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const editorMount = document.createElement('div');
    const reactMount = document.createElement('div');
    document.body.append(editorMount, reactMount);
    const view = new EditorView(editorMount, editor);
    view.dom.focus();
    const root = createRoot(reactMount);

    await act(async () => {
      root.render(<>
        <FountainBubbleMenu
          editor={editor}
          service={kit.services.bubbleMenu as FountainMenuService}
          anchorElement={view.dom}
        ><button type="button">Bold selection</button><button type="button">Italic selection</button></FountainBubbleMenu>
        <FountainFloatingMenu
          editor={editor}
          service={kit.services.floatingMenu as FountainMenuService}
          anchorElement={view.dom}
        ><button type="button">Insert heading</button></FountainFloatingMenu>
      </>);
      await Promise.resolve();
    });

    expect(reactMount.querySelector('[role="toolbar"][aria-label="Empty block actions"]')).not.toBeNull();
    expect(reactMount.querySelector('[role="toolbar"]')?.getAttribute('data-side')).toBe('bottom');

    await act(async () => {
      insertText(editor, 'Selectable text');
      selectText(editor, [0, 0], 0, 10);
      await Promise.resolve();
    });
    const bubbleMenu = reactMount.querySelector<HTMLElement>('[role="toolbar"][aria-label="Selection actions"]');
    expect(bubbleMenu?.textContent).toContain('Bold selection');
    expect(reactMount.querySelector('[aria-label="Empty block actions"]')).toBeNull();

    const bubbleButtons = bubbleMenu?.querySelectorAll<HTMLButtonElement>('button');
    await act(async () => {
      bubbleButtons?.[0]?.focus();
      bubbleButtons?.[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(bubbleButtons?.[1]);

    await act(async () => {
      view.dom.focus();
      view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(reactMount.querySelector('[aria-label="Selection actions"]')).toBeNull();
    expect(document.activeElement).toBe(view.dom);

    await act(async () => root.unmount());
    view.destroy();
    editor.destroy();
    editorMount.remove();
    reactMount.remove();
    bounds.mockRestore();
  });
});
