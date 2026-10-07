// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorView, StarterKit, createEditor, selectText } from '../src';
import { undo } from '../src/extensions/plugins/history';
import { addTableColumnOnSide, getRenderedTableDirection, registerTableDirectionRoot } from '../src/view/table-direction';

const makeEditor = (editable = true) => {
  const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins, editable, content: {
    type: 'doc', content: [{ type: 'table', content: [{ type: 'table_row', content: ['First', 'Second'].map(text => ({
      type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })) }] }],
  } });
  selectText(editor, [0, 0, 0, 0, 0], 0);
  return editor;
};
const columns = (editor: ReturnType<typeof makeEditor>) => editor.state.doc.child(0).child(0).content.map(cell => cell.textContent);
const root = (direction: string) => {
  const dom = document.createElement('div'); dom.className = 'fountain-editor'; dom.tabIndex = 0;
  dom.innerHTML = `<table data-fountain-path="0" style="direction:${direction}"><tr><td style="direction:ltr">Text override</td></tr></table>`;
  document.body.append(dom); return dom;
};
afterEach(() => { vi.restoreAllMocks(); document.getSelection()?.removeAllRanges(); });

describe('view-owned physical table insertion', () => {
  it.each([
    ['ltr', 'left', ['', 'First', 'Second']], ['ltr', 'right', ['First', '', 'Second']],
    ['rtl', 'left', ['First', '', 'Second']], ['rtl', 'right', ['', 'First', 'Second']],
  ] as const)('maps %s %s to document order without using cell text direction', (direction, side, expected) => {
    const editor = makeEditor(), dom = root(direction), dispose = registerTableDirectionRoot(editor, dom);
    const before = editor.getJSON();
    try {
      expect(getRenderedTableDirection(editor)).toBe(direction);
      expect(addTableColumnOnSide(editor, side)).toBe(true);
      expect(columns(editor)).toEqual(expected);
      expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
    } finally { dispose(); dom.remove(); editor.destroy(); }
  });

  it('resolves computed inherited/automatic direction, and re-reads changed host CSS at activation', () => {
    const editor = makeEditor(), dom = root(''), dispose = registerTableDirectionRoot(editor, dom);
    const original = window.getComputedStyle.bind(window); let direction = 'rtl';
    // jsdom does not perform native dir=auto or inherited direction layout.
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const style = original(element, pseudo);
      if (element.tagName === 'TABLE') Object.defineProperty(style, 'direction', { value: direction });
      return style;
    });
    try {
      expect(getRenderedTableDirection(editor)).toBe('rtl');
      direction = 'ltr'; expect(addTableColumnOnSide(editor, 'left')).toBe(true);
      expect(columns(editor)).toEqual(['', 'First', 'Second']);
    } finally { dispose(); dom.remove(); editor.destroy(); }
  });

  it('does not infer view ownership from a global matching table or a different editor', () => {
    const editor = makeEditor(), other = makeEditor(), dom = root('rtl'), dispose = registerTableDirectionRoot(other, dom);
    const before = editor.getJSON();
    try {
      expect(getRenderedTableDirection(editor)).toBeUndefined();
      expect(addTableColumnOnSide(editor, 'left')).toBe(false); expect(editor.getJSON()).toEqual(before);
    } finally { dispose(); dom.remove(); editor.destroy(); other.destroy(); }
  });

  it('rejects ambiguous layouts, remembers the focused view through toolbar focus, and releases it', () => {
    const editor = makeEditor(), ltr = root('ltr'), rtl = root('rtl');
    const disposeLTR = registerTableDirectionRoot(editor, ltr), disposeRTL = registerTableDirectionRoot(editor, rtl);
    const toolbar = document.createElement('button'); document.body.append(toolbar);
    try {
      expect(getRenderedTableDirection(editor)).toBeUndefined(); expect(addTableColumnOnSide(editor, 'right')).toBe(false);
      rtl.focus(); expect(getRenderedTableDirection(editor)).toBe('rtl');
      toolbar.focus(); expect(getRenderedTableDirection(editor)).toBe('rtl');
      ltr.focus(); toolbar.focus(); expect(getRenderedTableDirection(editor)).toBe('ltr');
      disposeLTR(); expect(getRenderedTableDirection(editor)).toBe('rtl');
      rtl.remove(); expect(getRenderedTableDirection(editor)).toBeUndefined();
    } finally { disposeLTR(); disposeRTL(); ltr.remove(); rtl.remove(); toolbar.remove(); editor.destroy(); }
  });

  it('accepts multiple agreeing views but not nested editor tables', () => {
    const editor = makeEditor(), other = makeEditor(), a = root('rtl'), b = root('rtl'), nested = root('ltr');
    const offA = registerTableDirectionRoot(editor, a), offB = registerTableDirectionRoot(editor, b);
    const offNested = registerTableDirectionRoot(other, nested);
    try {
      expect(getRenderedTableDirection(editor)).toBe('rtl');
      nested.className = 'custom-editor-surface'; a.replaceChildren(nested);
      expect(getRenderedTableDirection(editor)).toBeUndefined();
    } finally { offA(); offB(); offNested(); a.remove(); b.remove(); nested.remove(); editor.destroy(); other.destroy(); }
  });

  it('registers and unregisters the actual EditorView, including a read-only view', () => {
    const editor = makeEditor(false), mount = document.createElement('div'); document.body.append(mount);
    const view = new EditorView(mount, editor);
    try {
      view.dom.querySelector('table')!.style.direction = 'rtl';
      view.dom.className = 'custom-editor-surface';
      expect(getRenderedTableDirection(editor)).toBe('rtl');
      const before = editor.getJSON();
      expect(addTableColumnOnSide(editor, 'left')).toBe(false); expect(editor.getJSON()).toEqual(before);
      view.destroy(); expect(getRenderedTableDirection(editor)).toBeUndefined();
    } finally { view.destroy(); editor.destroy(); mount.remove(); }
  });
});
