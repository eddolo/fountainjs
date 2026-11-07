import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { type Editor, type EditorConfig, type EditorState } from '../core';
import { prepareEditor } from '../core/editor';

export function useFountain(config: EditorConfig): Editor {
  const [entry] = useState(() => ({ ...prepareEditor(config), mounts: 0 }));
  useLayoutEffect(entry.start, [entry]);
  useEffect(() => {
    entry.mounts++;
    return () => {
      entry.mounts--;
      // Strict Mode replays effects synchronously. Suspense can hide layout
      // effects while retaining the passive effect and the live editor.
      queueMicrotask(() => {
        if (entry.mounts === 0) entry.editor.destroy();
      });
    };
  }, [entry]);
  return entry.editor;
}

export function useFountainState(editor: Editor | null): EditorState | null {
  return useSyncExternalStore(
    (notify) => editor?.subscribe(notify) ?? (() => undefined),
    () => editor?.state ?? null,
    () => editor?.state ?? null,
  );
}
