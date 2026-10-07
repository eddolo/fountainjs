// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { CoreSchemaSpec, EditorView, createEditor, selectText, setMark } from '../src';
import { SelectionHandler } from '../src/view/selection-handler';

describe('external controls own focus while an editor range remains selected', () => {
  it('does not capture native selection changes made while an external colour field owns focus', async () => {
    const editor = createEditor({ schema: CoreSchemaSpec, content: {
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Preserve this document' }] }],
    } });
    const mount = document.createElement('div');
    const field = document.createElement('input'); field.type = 'color';
    document.body.append(mount, field);
    const view = new EditorView(mount, editor);
    try {
      view.focus(); selectText(editor, [0, 0], 0, 8);
      await new Promise(resolve => setTimeout(resolve, 0));
      const selected = editor.state.selection;
      field.focus();
      const text = view.dom.querySelector('[data-fountain-text-path]')!.firstChild!;
      document.getSelection()!.setBaseAndExtent(text, 2, text, 4);
      document.dispatchEvent(new Event('selectionchange'));
      await Promise.resolve();
      expect(editor.state.selection).toBe(selected);
      expect(document.activeElement).toBe(field);
      view.focus();
      expect(document.getSelection()?.toString()).toBe('Preserve');
    } finally { view.destroy(); editor.destroy(); mount.remove(); field.remove(); document.getSelection()?.removeAllRanges(); }
  });

  it.each(['color', 'textarea', 'select'])('keeps %s focused when formatting remaps the retained text selection', async kind => {
    const editor = createEditor({ schema: CoreSchemaSpec, content: {
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Preserve this document' }] }],
    } });
    const mount = document.createElement('div');
    const field = document.createElement(kind === 'color' ? 'input' : kind);
    if (field instanceof HTMLInputElement) field.type = 'color';
    document.body.append(mount, field);
    const view = new EditorView(mount, editor);
    try {
      view.focus();
      selectText(editor, [0, 0], 0, 8);
      await Promise.resolve();
      field.focus();
      // jsdom does not implement the browser focus side effect of addRange.
      // Assert that rendering leaves the native range alone, not just focus.
      const addRange = vi.spyOn(document.getSelection()!, 'addRange');
      expect(setMark(editor, 'text_color', { color: '#234567' })).toBe(true);
      await Promise.resolve();
      expect(addRange).not.toHaveBeenCalled();
      addRange.mockRestore();
      expect(document.activeElement).toBe(field);
      expect(editor.state.doc.child(0).child(0).marks[0]?.attrs.color).toBe('#234567');
      expect(editor.state.selection.isCollapsed).toBe(false);
      view.focus();
      expect(document.activeElement).toBe(view.dom);
      expect(document.getSelection()?.toString()).toBe('Preserve');
    } finally { vi.restoreAllMocks(); view.destroy(); editor.destroy(); mount.remove(); field.remove(); document.getSelection()?.removeAllRanges(); }
  });

  it.each(['color', 'textarea', 'select', 'button'])('does not claim a stale range while %s owns focus', async kind => {
    const editor = createEditor({ schema: CoreSchemaSpec, content: {
      type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Preserve this document' }] }],
    } });
    const mount = document.createElement('div');
    const field = document.createElement(kind === 'color' ? 'input' : kind);
    if (field instanceof HTMLInputElement) field.type = 'color';
    document.body.append(mount, field);
    const view = new EditorView(mount, editor);
    const handler = new SelectionHandler(editor, view.dom);
    try {
      view.focus('end'); await Promise.resolve();
      expect(handler.ownsDOMSelection()).toBe(true);
      const original = editor.getJSON(); const modelSelection = editor.state.selection;
      field.focus();
      // Native non-text controls can retain the old contenteditable range.
      // Reproduce that state explicitly rather than relying on jsdom focus.
      const range = document.createRange();
      range.selectNodeContents(view.dom.querySelector('[data-fountain-text-path]')!); range.collapse(false);
      document.getSelection()?.removeAllRanges(); document.getSelection()?.addRange(range);
      expect(view.dom.contains(document.getSelection()?.anchorNode ?? null)).toBe(true);
      expect(document.activeElement).toBe(field);
      expect(handler.ownsDOMSelection()).toBe(false);
      view.dom.style.caretColor = 'transparent';
      await new Promise(resolve => setTimeout(resolve, 0)); await Promise.resolve();
      expect(document.activeElement).toBe(field);
      expect(editor.getJSON()).toEqual(original); expect(editor.state.selection).toBe(modelSelection);
      view.focus();
      expect(document.activeElement).toBe(view.dom); expect(handler.ownsDOMSelection()).toBe(true);
      expect(editor.getJSON()).toEqual(original);
    } finally { handler.destroy(); view.destroy(); editor.destroy(); mount.remove(); field.remove(); document.getSelection()?.removeAllRanges(); }
  });
});
