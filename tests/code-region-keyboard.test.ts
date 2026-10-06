// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { CoreSchemaSpec, EditorView, Plugin, createEditor, createHistoryPlugin, undo } from '../src';

function setup(empty = false, editable = true, plugins: Plugin[] = []) {
  const editor = createEditor({ schema: CoreSchemaSpec, editable, plugins: [createHistoryPlugin(), ...plugins], content: {
    type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
      { type: 'code_block', attrs: { language: 'python' }, ...(empty ? {} : { content: [{ type: 'text', text: 'print(1)' }] }) },
    ],
  } });
  const mount = document.createElement('div'); document.body.append(mount);
  const view = new EditorView(mount, editor);
  const code = view.dom.querySelector<HTMLPreElement>('pre')!;
  code.focus();
  const range = document.createRange();
  range.setStart(view.dom.querySelector('[data-fountain-text-path="0.0"]')!.firstChild!, 3); range.collapse(true);
  document.getSelection()?.removeAllRanges(); document.getSelection()?.addRange(range);
  expect(document.activeElement).toBe(code);
  expect(code.contains(document.getSelection()?.anchorNode ?? null)).toBe(false);
  const key = (key: string, options: KeyboardEventInit = {}) => code.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }));
  const type = (value: string) => view.dom.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
  return { editor, view, code, key, type, destroy() { view.destroy(); editor.destroy(); mount.remove(); document.getSelection()?.removeAllRanges(); } };
}

describe('keyboard browsing of scrolling code regions', () => {
  it('scrolls without capturing an unrelated caret, preserves focus, and leaves Tab native', () => {
    const { editor, code, key, destroy } = setup();
    const original = editor.getJSON();
    expect(code.tabIndex).toBe(0);
    expect(code.getAttribute('role')).toBe('region');
    expect(code.getAttribute('aria-label')).toBe('python code');
    expect(key('ArrowRight')).toBe(false);
    expect(code.scrollLeft).toBe(40);
    expect(document.activeElement).toBe(code);
    expect(key('ArrowLeft')).toBe(false);
    expect(code.scrollLeft).toBe(0);
    expect(key('Tab')).toBe(true);
    key('Delete'); key('Backspace');
    expect(editor.getJSON()).toEqual(original);
    destroy();
  });

  it.each([false, true])('enters the actual source, not the previous paragraph (empty=%s)', empty => {
    const { editor, key, type, destroy } = setup(empty);
    const original = editor.getJSON();
    expect(key('Enter')).toBe(false);
    type('x');
    expect(editor.state.doc.child(0).textContent).toBe('Before');
    expect(editor.state.doc.child(1).type.name).toBe('code_block');
    expect(editor.state.doc.child(1).textContent).toBe(empty ? 'x' : 'xprint(1)');
    expect(undo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(original);
    destroy();
  });

  it('keeps source read-only while allowing keyboard scroll', () => {
    const { editor, key, code, destroy } = setup(false, false);
    const original = editor.getJSON();
    key('ArrowRight'); key('Enter'); key('x');
    expect(code.scrollLeft).toBe(40);
    expect(editor.getJSON()).toEqual(original);
    expect(document.activeElement).toBe(code);
    destroy();
  });

  it('pastes into a keyboard-focused code region instead of the old paragraph range', () => {
    const { editor, code, destroy } = setup();
    const original = editor.getJSON();
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => type === 'text/plain' ? 'copied ' : '' } });
    code.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(editor.state.doc.child(0).textContent).toBe('Before');
    expect(editor.state.doc.child(1).textContent).toBe('copied print(1)');
    expect(undo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(original);
    destroy();
  });

  it('establishes the source caret before the browser invokes native Ctrl+V', () => {
    const { editor, key, destroy } = setup();
    const original = editor.getJSON();
    expect(key('v', { ctrlKey: true })).toBe(true);
    expect(editor.state.selection.path).toEqual([1, 0]);
    expect(editor.getJSON()).toEqual(original);
    destroy();
  });

  it('retains extension precedence and calls the key hook only once when typing enters the source', () => {
    const handleKeyDown = vi.fn(() => false);
    const { editor, key, type, destroy } = setup(false, true, [new Plugin({ props: { handleKeyDown } })]);
    key('x'); type('x');
    expect(handleKeyDown).toHaveBeenCalledTimes(1);
    expect(editor.state.doc.child(1).textContent).toBe('xprint(1)');
    destroy();
    const intercept = vi.fn(() => true);
    const blocked = setup(false, true, [new Plugin({ props: { handleKeyDown: intercept } })]);
    expect(blocked.key('ArrowRight')).toBe(false);
    expect(intercept).toHaveBeenCalledTimes(1);
    expect(blocked.code.scrollLeft).toBe(0);
    blocked.destroy();
  });
});
