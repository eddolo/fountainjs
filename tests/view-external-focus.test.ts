// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, EditorView, createEditor } from '../src';
import { SelectionHandler } from '../src/view/selection-handler';

describe('external controls own focus while an editor range remains selected', () => {
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
