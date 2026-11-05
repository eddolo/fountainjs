// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { EditorView, NodeSelection, Selection, StarterKit, createEditor, undo } from '../src';

function setup(empty = false, editable = true) {
  const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins, editable, content: { type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Heading' }] },
    { type: 'code_block', attrs: { language: 'x"y' }, ...(empty ? {} : { content: [{ type: 'text', text: 'example' }] }) },
  ] } });
  const mount = document.body.appendChild(document.createElement('div'));
  const view = new EditorView(mount, editor);
  view.dom.setAttribute('contenteditable', String(editable));
  const pre = view.dom.querySelector('pre')!, code = pre.querySelector('code')!;
  vi.spyOn(code, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 60, 100, 20));
  const outside = document.body.appendChild(document.createElement('input'));
  outside.focus();
  const heading = view.dom.querySelector('[data-fountain-text-path="0.0"]')!.firstChild!;
  document.getSelection()!.setBaseAndExtent(heading, 2, heading, 2);
  return { editor, view, pre, code, outside, destroy() {
    vi.restoreAllMocks(); view.destroy(); editor.destroy(); mount.remove(); outside.remove(); document.getSelection()?.removeAllRanges();
  } };
}

it.each([false, true])('enters code on label pointer-down before native focus can restore an unrelated caret (empty=%s)', async empty => {
  const { editor, view, pre, destroy } = setup(empty);
  try {
    const original = editor.getJSON();
    const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientY: 30 });
    pre.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(view.dom);
    expect(editor.state.selection).toBeInstanceOf(empty ? NodeSelection : Selection);
    expect(editor.state.selection instanceof NodeSelection ? editor.state.selection.nodePath : editor.state.selection.path).toEqual(empty ? [1] : [1, 0]);
    await Promise.resolve();
    if (empty) expect(pre.dataset.fountainSelectedNode).toBe('true');
    else expect(pre.contains(document.getSelection()?.anchorNode ?? null)).toBe(true);
    view.dom.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'X' }));
    expect(editor.state.doc.child(0).textContent).toBe('Heading');
    expect(editor.state.doc.child(1).textContent).toBe(empty ? 'X' : 'Xexample');
    expect(undo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(original);
  } finally { destroy(); }
});

it.each([
  { name: 'Shift', options: { shiftKey: true } },
  { name: 'Control', options: { ctrlKey: true } },
  { name: 'Meta', options: { metaKey: true } },
  { name: 'Alt', options: { altKey: true } },
  { name: 'secondary button', options: { button: 2 } },
  { name: 'body padding', options: { clientY: 80 } },
  { name: 'source text', options: {}, source: true },
  { name: 'reader', options: {}, editable: false },
])('keeps $name interaction native instead of redirecting it from the code label', item => {
  const { editor, pre, code, destroy } = setup(false, item.editable !== false);
  try {
    const original = editor.state.doc, selection = editor.state.selection;
    const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientY: 30, ...item.options });
    (item.source ? code : pre).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(editor.state.doc).toBe(original);
    expect(editor.state.selection).toBe(selection);
  } finally { destroy(); }
});
