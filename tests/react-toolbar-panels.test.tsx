/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { StarterKit, createEditor, insertTable, selectText } from '../src';
import { FountainToolbar, FountainToolbarButton, FountainToolbarRoot } from '../src/react';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('toolbar configuration panel keyboard ownership', () => {
  it.each([
    ['link', 'link', 'Link URL'], ['search', 'search', 'Find text'],
    ['highlight', 'highlight', 'Highlight colour'], ['text-style', 'text-style', 'Font family'],
    ['image', 'image', 'Image placement'], ['insert-table', 'insert-table', 'Table rows'],
    ['media', 'media', 'Media type'], ['code-block', 'code', 'Code language'], ['table-menu', 'table-tools', 'Select row'],
  ])('opens %s with owned focus and cancels without changing the document', async (action, panel, field) => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins, content: {
      type: 'doc', content: [{ type: action === 'code-block' ? 'code_block' : 'paragraph', content: [{ type: 'text', text: 'Keep this selection' }] }],
    } });
    selectText(editor, [0, 0], 0, 4);
    if (action === 'table-menu') insertTable(editor, { rows: 2, columns: 2 });
    const original = editor.getJSON(); const selection = editor.state.selection;
    const mount = document.createElement('div'); document.body.append(mount); const root = createRoot(mount);
    try {
      await act(async () => root.render(<FountainToolbar editor={editor} />));
      const trigger = mount.querySelector<HTMLButtonElement>(`button[data-fountain-toolbar-action="${action}"]`)!;
      trigger.focus();
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      await act(async () => trigger.click());
      const form = mount.querySelector<HTMLFormElement>(`form.is-${panel === 'insert-table' ? 'table' : panel}`)!;
      expect(form).not.toBeNull(); expect(form.id).toBeTruthy();
      expect(trigger.getAttribute('aria-controls')).toBe(form.id);
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(form.getAttribute('aria-label')).toBeTruthy();
      const input = form.querySelector<HTMLElement>(`[aria-label="${field}"]`)!;
      expect(document.activeElement).toBe(input);
      expect(editor.getJSON()).toEqual(original); expect(editor.state.selection).toBe(selection);
      await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true })));
      expect(form.isConnected).toBe(true); expect(document.activeElement).toBe(input);
      await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
      expect(mount.querySelector(`form.is-${panel === 'insert-table' ? 'table' : panel}`)).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(editor.getJSON()).toEqual(original); expect(editor.state.selection).toBe(selection);
    } finally { await act(async () => root.unmount()); editor.destroy(); mount.remove(); }
  });

  it('keeps panel ownership independent across two toolbars', async () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins });
    const mount = document.createElement('div'); document.body.append(mount); const root = createRoot(mount);
    try {
      await act(async () => root.render(<><FountainToolbar editor={editor} /><FountainToolbar editor={editor} /></>));
      const wrappers = [...mount.querySelectorAll('.fountain-toolbar-wrap')];
      const first = wrappers[0]!.querySelector<HTMLButtonElement>('[data-fountain-toolbar-action="link"]')!;
      const second = wrappers[1]!.querySelector<HTMLButtonElement>('[data-fountain-toolbar-action="link"]')!;
      await act(async () => first.click()); await act(async () => second.click());
      const firstForm = wrappers[0]!.querySelector('form')!; const secondForm = wrappers[1]!.querySelector('form')!;
      expect(firstForm.id).not.toBe(secondForm.id);
      expect(first.getAttribute('aria-controls')).toBe(firstForm.id);
      expect(second.getAttribute('aria-controls')).toBe(secondForm.id);
      const input = secondForm.querySelector<HTMLInputElement>('input')!;
      expect(document.activeElement).toBe(input);
      await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
      expect(document.activeElement).toBe(second); expect(secondForm.isConnected).toBe(false);
      expect(firstForm.isConnected).toBe(true); expect(first.getAttribute('aria-expanded')).toBe('true');
    } finally { await act(async () => root.unmount()); editor.destroy(); mount.remove(); }
  });
});

describe('toolbar native field key ownership', () => {
  it.each(['text', 'number', 'color', 'textarea', 'select', 'contenteditable'])('keeps %s navigation inside its field', async kind => {
    const mount = document.createElement('div'); document.body.append(mount); const root = createRoot(mount);
    const field = kind === 'textarea' ? <textarea aria-label="Field" defaultValue="Editable" />
      : kind === 'select' ? <select aria-label="Field"><option>First</option><option>Second</option></select>
      : kind === 'contenteditable' ? <div contentEditable suppressContentEditableWarning aria-label="Field">Editable</div>
      : <input aria-label="Field" type={kind} defaultValue={kind === 'number' ? '10' : kind === 'color' ? '#123456' : 'Editable'} />;
    try {
      await act(async () => root.render(<FountainToolbarRoot><FountainToolbarButton label="Other" onAction={() => {}} />{field}</FountainToolbarRoot>));
      const input = mount.querySelector<HTMLElement>('[aria-label="Field"]')!;
      input.focus();
      for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        await act(async () => input.dispatchEvent(event));
        // Linux WebKit applies colour-input navigation to an old editor range
        // even without Fountain. Only that native default is suppressed; all
        // ordinary fields retain their own navigation and none enter traversal.
        expect(event.defaultPrevented).toBe(kind === 'color'); expect(document.activeElement).toBe(input);
      }
    } finally { await act(async () => root.unmount()); mount.remove(); }
  });
});
