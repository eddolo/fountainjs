// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { CoreSchemaSpec, EditorView, createEditor, selectText } from '../src';

it.each([[1, 1], [1, 3], [3, 1]])('captures native endpoints %s→%s without replacing their browser range', async (anchor, focus) => {
  const editor = createEditor({ schema: CoreSchemaSpec, content: { type: 'doc', content: [
    { type: 'paragraph', attrs: { dir: 'rtl', align: 'start' }, content: [{ type: 'text', text: 'אבגד' }] },
  ] } });
  const mount = document.createElement('div');
  document.body.append(mount);
  const view = new EditorView(mount, editor);
  const native = document.getSelection()!;
  try {
    view.focus();
    await Promise.resolve();
    const text = view.dom.querySelector('[data-fountain-text-path]')!.firstChild!;
    native.setBaseAndExtent(text, anchor, text, focus);
    const range = native.getRangeAt(0);
    const remove = vi.spyOn(native, 'removeAllRanges');
    const add = vi.spyOn(native, 'addRange');
    const set = vi.spyOn(native, 'setBaseAndExtent');
    view.dom.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }));
    await Promise.resolve();
    expect(editor.state.selection.from).toBe(Math.min(anchor, focus));
    expect(editor.state.selection.to).toBe(Math.max(anchor, focus));
    expect(native.getRangeAt(0)).toBe(range);
    expect(native.anchorOffset).toBe(anchor);
    expect(native.focusOffset).toBe(focus);
    expect(remove).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    // An explicit different model selection must still reach the DOM.
    selectText(editor, [0, 0], 2, 4);
    await Promise.resolve();
    expect(native.toString()).toBe('גד');
    expect(native.anchorOffset).toBe(2);
    expect(native.focusOffset).toBe(4);
  } finally {
    vi.restoreAllMocks(); view.destroy(); editor.destroy(); mount.remove(); native.removeAllRanges();
  }
});

it('restores native endpoints after a document edit replaces their text node', async () => {
  const editor = createEditor({ schema: CoreSchemaSpec, content: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'abcd' }] },
  ] } });
  const mount = document.createElement('div');
  document.body.append(mount);
  const view = new EditorView(mount, editor);
  try {
    view.focus(); selectText(editor, [0, 0], 2);
    await Promise.resolve();
    const original = document.getSelection()!.anchorNode;
    editor.dispatch(editor.createTransaction().insertText([0, 0], 2, 'XY'));
    await Promise.resolve();
    const native = document.getSelection()!;
    expect(native.anchorNode).not.toBe(original);
    expect(native.anchorNode?.textContent).toBe('abXYcd');
    expect(native.anchorOffset).toBe(4);
    expect(native.isCollapsed).toBe(true);
  } finally { view.destroy(); editor.destroy(); mount.remove(); document.getSelection()?.removeAllRanges(); }
});
