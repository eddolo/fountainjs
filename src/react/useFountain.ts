import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createEditor, type Editor, type EditorConfig, type EditorState } from '../core';

export function useFountain(config: EditorConfig): Editor {
  const [editor] = useState(() => createEditor(config));
  const mounts = useRef(0);
  useEffect(() => {
    mounts.current += 1;
    return () => {
      mounts.current -= 1;
      queueMicrotask(() => {
        if (mounts.current === 0 && !editor.isDestroyed) editor.destroy();
      });
    };
  }, [editor]);
  return editor;
}

export function useFountainState(editor: Editor | null): EditorState | null {
  return useSyncExternalStore(
    (notify) => editor?.subscribe(notify) ?? (() => undefined),
    () => editor?.state ?? null,
    () => editor?.state ?? null,
  );
}
