import type { Editor } from './editor';

import type { Node } from './schema';
import { ReplaceDocumentStep } from './transaction/replace-document-step';

/** Internal observers of plain text written by the editor’s copy and cut handlers. */
export const clipboardTextObservers = new WeakMap<Editor, (text: string) => void>();

/** One transient transfer per live editor, never serialized into document state. */
export interface ClipboardCutTransfer {
  readonly token: string;
  readonly document: Node;
  readonly native: string;
  readonly html: string;
}
const cuts = new WeakMap<Editor, { transfer: ClipboardCutTransfer; release: () => void }>();
export function forgetClipboardCut(editor: Editor): void {
  cuts.get(editor)?.release(); cuts.delete(editor);
}
export function getClipboardCut(editor: Editor): ClipboardCutTransfer | undefined {
  return editor.isDestroyed ? undefined : cuts.get(editor)?.transfer;
}
export function rememberClipboardCut(editor: Editor, transfer: ClipboardCutTransfer): void {
  forgetClipboardCut(editor);
  const release = editor.subscribe((_state, transaction) => {
    // Undo/redo and whole-document replacement end this move's provenance.
    // Ordinary edits are allowed; the owning plugin checks dependency conflicts.
    if (transaction.getMeta('fountain$historyAction') || transaction.getMeta('history$reset')
      || transaction.steps.some(step => step instanceof ReplaceDocumentStep)) forgetClipboardCut(editor);
  });
  cuts.set(editor, { transfer, release });
}
