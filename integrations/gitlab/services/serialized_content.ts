import type { Editor, Node, Schema } from 'fountainjs-editor';
import { getCollaborationAdapter } from 'fountainjs-editor';

export interface SerializedContentCodec {
  deserialize(input: { schema: Schema; markdown: string; signal: AbortSignal }): Promise<{ document: Node }>;
  serialize(input: { doc: Node }): string;
}

export type SerializedContentResult = { status: 'applied' | 'superseded' };

export class SerializedContentConflict extends Error {
  constructor() {
    super('The document changed while Markdown was loading. Keep the current edits and retry explicitly.');
    this.name = 'SerializedContentConflict';
  }
}

/**
 * Non-collaborative document lifecycle used by the GitLab host integration.
 * The codec must implement the host's actual dialect; this class does not
 * substitute ordinary Markdown for GitLab Markdown or adapt its CRDT storage.
 * The host owns the editor, codec and service credentials.
 */
export class SerializedContentController {
  private pending?: AbortController;
  private disposed = false;
  private documentVersion = 0;
  private readonly unsubscribeDocumentChanges: () => void;
  private readonly subscriptions = new Set<() => void>();

  constructor(readonly editor: Editor, private readonly codec: SerializedContentCodec) {
    this.assertAlive();
    this.unsubscribeDocumentChanges = editor.subscribe((_state, transaction) => {
      if (transaction.docChanged) this.documentVersion++;
    });
  }

  getSerializedContent(): string {
    this.assertAlive();
    return this.codec.serialize({ doc: this.editor.state.doc });
  }

  async setSerializedContent(markdown: string, { addToHistory = false } = {}): Promise<SerializedContentResult> {
    this.assertAlive();
    if (typeof markdown !== 'string') throw new TypeError('Markdown must be a string.');
    if (typeof addToHistory !== 'boolean') throw new TypeError('addToHistory must be a boolean.');
    this.assertNonCollaborative();
    this.pending?.abort();
    const request = new AbortController();
    this.pending = request;
    const version = this.documentVersion;
    let onAbort!: () => void;
    const cancelled = new Promise<undefined>(resolve => {
      onAbort = () => resolve(undefined);
      request.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      let document: Node;
      try {
        const decoded = await Promise.race([
          this.codec.deserialize({ schema: this.editor.state.schema, markdown, signal: request.signal }), cancelled,
        ]);
        if (!decoded) return { status: 'superseded' };
        ({ document } = decoded);
      } catch (error) {
        if (this.pending !== request || this.disposed || this.editor.isDestroyed) return { status: 'superseded' };
        throw error;
      }
      if (this.pending !== request || this.disposed || this.editor.isDestroyed) return { status: 'superseded' };
      this.assertNonCollaborative();
      // Selection and interaction-mode changes are allowed; any replacement or
      // user/remote document edit requires a deliberate retry, even after undo.
      if (this.documentVersion !== version) throw new SerializedContentConflict();
      if (!document || document.type !== this.editor.state.schema.topNodeType) {
        throw new TypeError('The Markdown codec must return a document from the editor schema.');
      }
      const transaction = this.editor.createTransaction().replaceDocument(document)
        .setMeta('preventUpdate', true).setMeta('content$replace', true)
        .setMeta('addToHistory', addToHistory);
      // A load establishes a fresh baseline, including when replacing a
      // previously edited document. Template replacement retains prior undo.
      if (!addToHistory) transaction.setMeta('history$reset', true);
      if (!this.editor.dispatch(transaction)) throw new Error('The editor refused the Markdown document replacement.');
      return { status: 'applied' };
    } finally {
      request.signal.removeEventListener('abort', onAbort);
      if (this.pending === request) this.pending = undefined;
    }
  }

  /** Only actual document changes are host edits; loads/mode/caret changes are not. */
  subscribeChange(listener: (value: { markdown: string }) => void): () => void {
    this.assertAlive();
    const unsubscribe = this.editor.subscribe((state, transaction) => {
      if (!this.disposed && transaction.docChanged && transaction.getMeta('preventUpdate') !== true) {
        listener({ markdown: this.codec.serialize({ doc: state.doc }) });
      }
    });
    const release = () => { unsubscribe(); this.subscriptions.delete(release); };
    this.subscriptions.add(release);
    return release;
  }

  /** Cancels in-flight rendering; the host still owns/destroys its editor. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending?.abort();
    this.pending = undefined;
    this.unsubscribeDocumentChanges();
    for (const unsubscribe of this.subscriptions) unsubscribe();
  }

  private assertAlive(): void {
    if (this.disposed || this.editor.isDestroyed) throw new Error('The serialized-content controller or editor has been destroyed.');
  }

  private assertNonCollaborative(): void {
    if (getCollaborationAdapter(this.editor)) {
      throw new Error('Collaborative document replacement requires the session seed/replacement protocol, not a local Markdown load.');
    }
  }
}
