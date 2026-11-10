import type { Editor } from './editor';

/** Internal observers of plain text written by the editor’s copy and cut handlers. */
export const clipboardTextObservers = new WeakMap<Editor, (text: string) => void>();
