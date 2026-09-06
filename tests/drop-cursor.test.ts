// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoreSchemaSpec, DropCursorManager, EditorView, NodeSelection, createEditor } from '../src';

const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  x: left, y: top, left, top, width, height, right: left + width, bottom: top + height,
  toJSON: () => ({}),
} as DOMRect);

afterEach(() => {
  document.body.replaceChildren();
  Reflect.deleteProperty(document, 'caretRangeFromPoint');
});

describe('framework-neutral general drop cursor', () => {
  it('is enabled by default and can be omitted by the host', () => {
    const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Drop here' }] }] };
    const mount = document.body.appendChild(document.createElement('div'));
    const view = new EditorView(mount, createEditor({ schema: CoreSchemaSpec, content }));
    expect(mount.querySelector('[data-fountain-drop-cursor]')).not.toBeNull();
    expect(mount.dataset.fountainDropCursorEnabled).toBe('');
    view.destroy();
    expect(mount.querySelector('[data-fountain-drop-cursor]')).toBeNull();

    const second = document.body.appendChild(document.createElement('div'));
    const without = new EditorView(second, createEditor({ schema: CoreSchemaSpec, content }), { dropCursor: false });
    expect(second.querySelector('[data-fountain-drop-cursor]')).toBeNull();
    without.destroy();
  });

  it('renders an inline caret without changing the browser selection', () => {
    const mount = document.body.appendChild(document.createElement('div'));
    mount.style.position = 'relative';
    const dom = mount.appendChild(document.createElement('div'));
    const block = dom.appendChild(document.createElement('p'));
    block.dataset.fountainPath = '0';
    const text = block.appendChild(document.createElement('span'));
    text.dataset.fountainTextPath = '0.0';
    const leaf = text.appendChild(document.createTextNode('Drop here'));
    vi.spyOn(mount, 'getBoundingClientRect').mockReturnValue(rect(10, 20, 400, 200));
    vi.spyOn(block, 'getBoundingClientRect').mockReturnValue(rect(30, 50, 300, 24));
    const range = document.createRange();
    range.setStart(leaf, 4);
    range.collapse(true);
    range.getBoundingClientRect = vi.fn(() => rect(92, 52, 0, 20));
    (document as Document & { caretRangeFromPoint: () => Range }).caretRangeFromPoint = () => range;
    const selectionBefore = document.getSelection()?.rangeCount ?? 0;

    const manager = new DropCursorManager(mount, dom);
    expect(manager.show({ clientX: 92, clientY: 60, target: text } as unknown as DragEvent)).toBe(true);
    const cursor = mount.querySelector<HTMLElement>('[data-fountain-drop-cursor]') as HTMLElement;
    expect(cursor.hidden).toBe(false);
    expect(cursor.dataset.fountainDropCursor).toBe('inline');
    expect(cursor.dataset.fountainDropPath).toBe('0');
    expect(cursor.style.left).toBe('82px');
    expect(cursor.style.top).toBe('32px');
    expect(cursor.style.height).toBe('20px');
    expect(document.getSelection()?.rangeCount ?? 0).toBe(selectionBefore);
    manager.destroy();
  });

  it('renders a separately styled before/after boundary for atomic blocks', () => {
    const mount = document.body.appendChild(document.createElement('div'));
    const dom = mount.appendChild(document.createElement('div'));
    const atom = dom.appendChild(document.createElement('figure'));
    atom.dataset.fountainPath = '2';
    vi.spyOn(mount, 'getBoundingClientRect').mockReturnValue(rect(10, 20, 400, 200));
    vi.spyOn(atom, 'getBoundingClientRect').mockReturnValue(rect(40, 70, 240, 100));
    const manager = new DropCursorManager(mount, dom, { className: 'product-cursor', color: 'hotpink' });

    expect(manager.show({ clientX: 80, clientY: 160, target: atom } as unknown as DragEvent)).toBe(true);
    const cursor = mount.querySelector<HTMLElement>('.product-cursor') as HTMLElement;
    expect(cursor.dataset.fountainDropCursor).toBe('block');
    expect(cursor.dataset.fountainDropPosition).toBe('after');
    expect(cursor.dataset.fountainDropPath).toBe('2');
    expect(cursor.style.getPropertyValue('--fountain-drop-cursor-color')).toBe('hotpink');
    expect(cursor.style.width).toBe('240px');
    expect(cursor.style.top).toBe('150px');
    manager.clear();
    expect(cursor.hidden).toBe(true);
    manager.destroy();
  });

  it('uses the general cursor for a selected node drag when block handles are omitted', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
        ],
      },
    });
    const mount = document.body.appendChild(document.createElement('div'));
    const view = new EditorView(mount, editor);
    editor.dispatch(editor.state.createTransaction().setSelection(new NodeSelection(editor.state.doc, [0])));
    const first = view.dom.querySelector<HTMLElement>('[data-fountain-path="0"]') as HTMLElement;
    const second = view.dom.querySelector<HTMLElement>('[data-fountain-path="1"]') as HTMLElement;
    vi.spyOn(mount, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 400, 200));
    vi.spyOn(second, 'getBoundingClientRect').mockReturnValue(rect(20, 80, 300, 30));
    (document as Document & { caretRangeFromPoint: () => null }).caretRangeFromPoint = () => null;
    const transfer = {
      types: [] as string[],
      items: [] as unknown[],
      effectAllowed: 'none',
      dropEffect: 'none',
      setData(type: string) { if (!this.types.includes(type)) this.types.push(type); },
    };
    const event = (type: string, target: HTMLElement, y: number) => {
      const native = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(native, {
        dataTransfer: { value: transfer },
        clientX: { value: 40 },
        clientY: { value: y },
      });
      target.dispatchEvent(native);
    };
    event('dragstart', first, 10);
    event('dragover', second, 108);

    const cursor = mount.querySelector<HTMLElement>('[data-fountain-drop-cursor]') as HTMLElement;
    expect(mount.querySelector('[data-fountain-block-drop-indicator]')).toBeNull();
    expect(cursor.hidden).toBe(false);
    expect(cursor.dataset.fountainDropCursor).toBe('block');
    expect(cursor.dataset.fountainDropPosition).toBe('after');
    view.destroy();
  });
});
