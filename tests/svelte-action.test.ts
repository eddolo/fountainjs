/** @vitest-environment jsdom */
import { expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';
import { createEditor, insertText, StarterKit, undo, type Editor, type ExternalPasteReport } from '../src';
import { fountainEditor, fountainState } from '../src/svelte';

it('subscribes lazily, switches sources and releases listeners after the last store subscriber', () => {
  const first = createEditor({ schema: StarterKit.schema });
  const second = createEditor({ schema: StarterKit.schema });
  const source = writable<Editor | null>(first);
  const subscribe = vi.spyOn(first, 'subscribe');
  const snapshot = fountainState(source);
  expect(subscribe).not.toHaveBeenCalled();
  const values: unknown[] = [];
  const stop = snapshot.subscribe(state => values.push(state));
  const stopOther = snapshot.subscribe(() => undefined);
  expect(subscribe).toHaveBeenCalledTimes(1);
  insertText(first, 'First'); expect(values.at(-1)).toBe(first.state);
  source.set(second); expect(values.at(-1)).toBe(second.state);
  const count = values.length;
  insertText(first, ' detached'); expect(values).toHaveLength(count);
  insertText(second, 'Second'); expect(values.at(-1)).toBe(second.state);
  source.set(null); expect(values.at(-1)).toBeNull();
  source.set(first);
  stop(); stopOther();
  const before = values.length;
  insertText(first, ' unobserved'); expect(values).toHaveLength(before);
  expect(get(snapshot)).toBe(first.state);
  expect(first.isDestroyed || second.isDestroyed).toBe(false);
  first.destroy(); second.destroy();
});

it('retains a view for equivalent action updates, forwards focus/options, and never owns external engines', () => {
  const element = document.createElement('div'); document.body.append(element);
  const first = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins });
  const second = createEditor({ schema: StarterKit.schema, editable: false });
  const options = { ariaLabel: 'Svelte action editor' };
  const action = fountainEditor(element, { editor: first, options });
  const dom = action.view!.dom;
  action.focus('start'); expect(document.activeElement).toBe(dom);
  insertText(first, 'Stored edit');
  action.update({ editor: first, options }); expect(action.view!.dom).toBe(dom);
  action.update({ editor: null }); expect(action.view).toBeNull();
  expect(dom.isConnected).toBe(false);
  action.update({ editor: first, options });
  expect(action.view!.dom.textContent).toBe('Stored edit');
  undo(first); expect(action.view!.dom.textContent).toBe('');
  action.update({ editor: second, options });
  expect(action.view!.dom.contentEditable).toBe('false');
  action.update({ editor: second, options: { ariaLabel: 'Read only report' } });
  expect(action.view!.dom.getAttribute('aria-label')).toBe('Read only report');
  action.destroy(); action.destroy(); action.update({ editor: first });
  expect(action.view).toBeNull(); expect(element.children).toHaveLength(0);
  expect(first.isDestroyed || second.isDestroyed).toBe(false);
  first.destroy(); second.destroy(); element.remove();
});

it('does not mount a destroyed editor and forwards source-aware paste reporting', () => {
  const element = document.createElement('div'); document.body.append(element);
  const editor = createEditor({ schema: StarterKit.schema });
  const reports: ExternalPasteReport[] = [];
  const action = fountainEditor(element, { editor, options: { paste: { onReport: report => reports.push(report) } } });
  const paste = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(paste, 'clipboardData', { value: {
    files: [], getData: (type: string) => type === 'text/html' ? '<p>Svelte <strong>paste</strong></p>' : 'Svelte paste',
  } });
  action.view!.dom.dispatchEvent(paste);
  expect(paste.defaultPrevented).toBe(true);
  expect(editor.state.doc.textContent).toContain('Svelte paste');
  expect(reports).toHaveLength(1);
  action.destroy(); editor.destroy();
  const disposed = fountainEditor(element, { editor });
  expect(disposed.view).toBeNull(); expect(get(fountainState(writable(editor)))).toBeNull();
  disposed.destroy(); element.remove();
});
