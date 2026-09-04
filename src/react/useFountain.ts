import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createEditor, type Editor, type EditorConfig, type EditorState } from '../core';

interface PendingEditor {
  readonly editor: Editor;
  mounts: number;
}

/*
 * React deliberately evaluates state initializers twice during a development
 * Strict Mode mount. Editors run plugin lifecycle hooks during construction, so
 * creating both values would connect an adapter that React immediately throws
 * away. useId identifies the logical hook across those render probes. The
 * short-lived cache is removed after commit and also destroys an editor from an
 * abandoned render that never reaches an effect.
 */
const pendingEditors = new WeakMap<EditorConfig['schema'], Map<string, PendingEditor>>();

function acquireEditor(id: string, config: EditorConfig): PendingEditor {
  let pending = pendingEditors.get(config.schema);
  if (!pending) {
    pending = new Map();
    pendingEditors.set(config.schema, pending);
  }
  const existing = pending.get(id);
  if (existing && !existing.editor.isDestroyed) return existing;
  const entry: PendingEditor = { editor: createEditor(config), mounts: 0 };
  pending.set(id, entry);
  setTimeout(() => {
    if (pending?.get(id) === entry) pending.delete(id);
    if (entry.mounts === 0 && !entry.editor.isDestroyed) entry.editor.destroy();
  }, 0);
  return entry;
}

export function useFountain(config: EditorConfig): Editor {
  const id = useId();
  const [entry] = useState(() => acquireEditor(id, config));
  const mounts = useRef(entry.mounts);
  useLayoutEffect(() => {
    mounts.current += 1;
    entry.mounts += 1;
    return () => {
      mounts.current -= 1;
      entry.mounts -= 1;
      queueMicrotask(() => {
        if (mounts.current === 0 && entry.mounts === 0 && !entry.editor.isDestroyed) entry.editor.destroy();
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
