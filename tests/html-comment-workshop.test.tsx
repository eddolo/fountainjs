// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { HTMLCommentWorkshop } from '../examples/react-app/src/HTMLCommentWorkshop';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('HTML comment reader snapshot lifecycle', () => {
  it('replaces changed snapshots without navigating a retired iframe, but keeps unchanged snapshots mounted', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const root = createRoot(mount);
    const button = (label: string) => {
      const value = [...mount.querySelectorAll('button')].find(element => element.textContent === label);
      expect(value, label).toBeDefined();
      return value!;
    };
    const save = async () => act(async () => button('Save comment Markdown and preview').click());
    const reader = () => mount.querySelector<HTMLIFrameElement>('iframe[title="HTML comment reader snapshot"]')!;
    try {
      await act(async () => root.render(<HTMLCommentWorkshop />));
      await save();
      const original = reader();
      const originalSource = original.getAttribute('srcdoc');
      expect(originalSource).toContain('<!-- provenance: imported draft -->');
      expect(original.getAttribute('sandbox')).toBe('');
      expect(originalSource).toContain("default-src 'none'");
      const readerDocument = new DOMParser().parseFromString(originalSource!, 'text/html');
      expect(readerDocument.documentElement.lang).toBe('en');
      expect(readerDocument.title).toBe('HTML comment reader snapshot');
      expect(readerDocument.querySelectorAll('main')).toHaveLength(1);
      expect(readerDocument.querySelector('script')).toBeNull();

      await act(async () => button('Remove HTML comment').click());
      expect(reader()).toBe(original); // Author edits do not silently replace a saved reader.
      expect(original.getAttribute('srcdoc')).toBe(originalSource);
      await save();
      const removed = reader();
      expect(removed).not.toBe(original);
      expect(original.isConnected).toBe(false);
      expect(removed.getAttribute('srcdoc')).not.toContain('<!-- provenance: imported draft -->');
      expect(removed.getAttribute('sandbox')).toBe('');
      await save();
      expect(reader()).toBe(removed); // No new navigation for identical saved content.

      await act(async () => button('Undo comment edit').click());
      expect(reader()).toBe(removed);
      await save();
      const restored = reader();
      expect(restored).not.toBe(removed);
      expect(restored).not.toBe(original);
      expect(removed.isConnected).toBe(false);
      expect(restored.getAttribute('srcdoc')).toBe(originalSource);
      expect(restored.getAttribute('sandbox')).toBe('');
    } finally {
      await act(async () => root.unmount());
      mount.remove();
      document.getSelection()?.removeAllRanges();
    }
  });
});
