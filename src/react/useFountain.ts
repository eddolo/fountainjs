import { useState, useSyncExternalStore } from 'react';
import { createEditor, type Editor, type EditorConfig, type EditorState } from '../core';

export function useFountain(config: EditorConfig): Editor {
  const [editor] = useState(() => createEditor(config));
  return editor;
}

export function useFountainState(editor: Editor | null): EditorState | null {
  return useSyncExternalStore(
    (notify) => editor?.subscribe(notify) ?? (() => undefined),
    () => editor?.state ?? null,
    () => editor?.state ?? null,
  );
}
