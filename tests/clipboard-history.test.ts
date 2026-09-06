// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  ClipboardHistoryExtension,
  EditorView,
  Selection,
  StarterKit,
  clearClipboardHistory,
  composeExtensions,
  createClipboardHistoryExtension,
  createEditor,
  getClipboardHistoryState,
  pasteClipboardHistoryEntry,
  removeClipboardHistoryEntry,
} from '../src';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const waitForCapture = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

function clipboardEvent(type: 'copy' | 'cut' | 'paste', text = ''): ClipboardEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as ClipboardEvent;
  const values = new Map<string, string>([['text/plain', text]]);
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files: [],
      getData: (format: string) => values.get(format) ?? '',
      setData: (format: string, value: string) => { values.set(format, value); },
    },
  });
  return event;
}

describe('optional clipboard history', () => {
  it('captures only editor copy events and deduplicates entries without owning paste', async () => {
    const kit = composeExtensions([...StarterKit.extensions, ClipboardHistoryExtension]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: { type: 'doc', content: [paragraph('First copy'), paragraph('Second copy')] },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0], 0, [0, 0], 5)));
    const copy = clipboardEvent('copy');
    view.dom.dispatchEvent(copy);
    expect(copy.defaultPrevented).toBe(true);
    await waitForCapture();
    expect(getClipboardHistoryState(editor)?.entries.map((entry) => entry.text)).toEqual(['First']);

    view.dom.dispatchEvent(clipboardEvent('copy'));
    await waitForCapture();
    expect(getClipboardHistoryState(editor)?.entries).toHaveLength(1);
    view.destroy();
    editor.destroy();
    mount.remove();
  });

  it('opens from Mod-Alt-V, pastes a chosen slot, and preserves ordinary paste', async () => {
    const kit = composeExtensions([...StarterKit.extensions, ClipboardHistoryExtension]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: { type: 'doc', content: [paragraph('Remember me'), paragraph('Target: ')] },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0], 0, [0, 0], 11)));
    view.dom.dispatchEvent(clipboardEvent('copy'));
    await waitForCapture();
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([1, 0], 8)));
    await Promise.resolve();

    const shortcut = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'v', ctrlKey: true, altKey: true });
    view.dom.dispatchEvent(shortcut);
    expect(shortcut.defaultPrevented).toBe(true);
    expect(getClipboardHistoryState(editor)?.open).toBe(true);
    const entry = getClipboardHistoryState(editor)?.entries[0];
    expect(entry && pasteClipboardHistoryEntry(editor, entry.id)).toBe(true);
    expect(editor.state.doc.child(1).textContent).toBe('Target: Remember me');
    expect(getClipboardHistoryState(editor)?.open).toBe(false);

    const ordinary = clipboardEvent('paste', ' normal');
    view.dom.dispatchEvent(ordinary);
    expect(ordinary.defaultPrevented).toBe(true);
    expect(editor.state.doc.child(1).textContent).toBe('Target: Remember me normal');
    view.destroy();
    editor.destroy();
    mount.remove();
  });

  it('enforces bounded slots and supports remove, clear, and explicit host persistence', async () => {
    const save = vi.fn();
    const extension = createClipboardHistoryExtension({
      maxEntries: 2,
      persistence: {
        load: () => [{ id: 'loaded', text: 'Loaded entry', copiedAt: 1 }],
        save,
      },
    });
    const kit = composeExtensions([...StarterKit.extensions, extension]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: { type: 'doc', content: [paragraph('Alpha Beta Gamma')] },
    });
    expect(getClipboardHistoryState(editor)?.entries.map((entry) => entry.text)).toEqual(['Loaded entry']);
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    for (const [from, to] of [[0, 5], [6, 10], [11, 16]] as const) {
      editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0], from, [0, 0], to)));
      view.dom.dispatchEvent(clipboardEvent('copy'));
      await waitForCapture();
    }
    expect(getClipboardHistoryState(editor)?.entries.map((entry) => entry.text)).toEqual(['Gamma', 'Beta']);
    const first = getClipboardHistoryState(editor)?.entries[0];
    expect(first && removeClipboardHistoryEntry(editor, first.id)).toBe(true);
    expect(save).toHaveBeenLastCalledWith([expect.objectContaining({ text: 'Beta' })]);
    expect(clearClipboardHistory(editor)).toBe(true);
    expect(getClipboardHistoryState(editor)?.entries).toEqual([]);
    expect(save).toHaveBeenLastCalledWith([]);
    view.destroy();
    editor.destroy();
    mount.remove();
  });
});
