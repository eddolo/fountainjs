import {
  closeHistory,
  insertDocument,
  mapSelection,
  nodeRangeAtPath,
  textPointToPosition,
  type AnySelection,
  type Editor,
  type Node,
} from 'fountainjs-editor';
import type { SerializedContentCodec, SerializedContentResult } from './serialized_content';

export interface GitLabInsertionProjection {
  readonly selection: AnySelection;
  project(document: Node, markdown: string): Node;
  /** Receives the captured target rebased through unrelated edits. */
  apply?(document: Node, target: AnySelection): boolean;
}

export class GitLabInsertionConflict extends Error {
  constructor() {
    super('GITLAB_INSERTION_TARGET_CHANGED');
    this.name = 'GitLabInsertionConflict';
  }
}

function bounds(doc: Node, selection: AnySelection): { from: number; to: number } {
  if (selection.kind === 'text')
    return {
      from: textPointToPosition(doc, selection.path, selection.from),
      to: textPointToPosition(doc, selection.endPath, selection.to),
    };
  if (selection.kind === 'gap') return { from: selection.position, to: selection.position };
  if (selection.kind === 'all') return { from: 0, to: doc.nodeSize - 2 };
  if (selection.kind === 'cell') {
    const ranges = selection.cellPaths.map((path) => nodeRangeAtPath(doc, path));
    return {
      from: Math.min(...ranges.map((range) => range.from)),
      to: Math.max(...ranges.map((range) => range.to)),
    };
  }
  return { from: selection.structuralFrom, to: selection.structuralTo };
}

/** Ordered asynchronous insertions, using native step maps rather than DOM positions. */
export class GitLabMarkdownInsertion {
  private readonly pending = new Set<AbortController>();
  private turn: Promise<void> = Promise.resolve();
  private destroyed = false;
  private failure?: Readonly<{ markdown: string; error: unknown }>;
  private readonly origin = Symbol('gitlab-markdown-insertion');

  constructor(
    private readonly editor: Editor,
    private readonly codec: SerializedContentCodec,
    private readonly ensureReady: () => void,
    private readonly notify: () => void,
  ) {}

  get pendingCount(): number {
    return this.pending.size;
  }
  get recovery(): Readonly<{ markdown: string; error: unknown }> | undefined {
    return this.failure;
  }

  async insert(markdown: string): Promise<SerializedContentResult> {
    if (this.destroyed) throw new Error('GITLAB_INSERTION_DESTROYED');
    if (typeof markdown !== 'string') throw new TypeError('EXPECTED_MARKDOWN_STRING');
    this.ensureReady();
    if (markdown === '') return { status: 'applied' };
    return this.insertFrom(() => markdown, undefined, markdown);
  }

  async insertFrom(
    resolveSource: (signal: AbortSignal) => string | Promise<string>,
    signal?: AbortSignal,
    markdown?: string,
    projection?: GitLabInsertionProjection,
  ): Promise<SerializedContentResult> {
    if (this.destroyed) throw new Error('GITLAB_INSERTION_DESTROYED');
    this.ensureReady();
    if (signal?.aborted) return { status: 'superseded' };
    const request = new AbortController();
    const cancel = () => request.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const previous = this.turn;
    let finishTurn!: () => void;
    const complete = new Promise<void>((resolve) => {
      finishTurn = resolve;
    });
    this.turn = previous.then(() => complete);
    this.pending.add(request);
    let target = projection?.selection ?? this.editor.state.selection,
      targetDoc = this.editor.state.doc;
    const targetMarks = this.editor.state.storedMarks;
    let conflict = false;
    const release = this.editor.subscribe((state, transaction) => {
      if (!transaction.docChanged) return;
      if (transaction.getMeta('content$replace') === true) {
        request.abort();
        return;
      }
      if (conflict) return;
      try {
        if (!transaction.originalDoc.eq(targetDoc)) throw new GitLabInsertionConflict();
        let overlap = false;
        let { from, to } = bounds(targetDoc, target);
        for (const map of transaction.mapping.maps) {
          for (let index = 0; index < map.ranges.length; index += 3) {
            const start = map.ranges[index]!,
              oldSize = map.ranges[index + 1]!;
            if (
              from === to
                ? oldSize > 0 && start < from && start + oldSize > from
                : oldSize === 0
                ? start > from && start < to
                : start < to && start + oldSize > from
            )
              overlap = true;
          }
          const collapsed = from === to;
          from = map.map(from, 1);
          to = collapsed ? from : map.map(to, -1);
        }
        // An unlocated semantic/formatting change cannot safely replace a range.
        if (!target.isCollapsed && transaction.mapping.maps.every((map) => map.ranges.length === 0))
          overlap = true;
        const origin = transaction.getMeta<{ owner: symbol; target: AnySelection }>(
          'gitlab$insertionOrigin',
        );
        const sameInsertionTarget = origin?.owner === this.origin && target.eq(origin.target);
        if (overlap && !sameInsertionTarget) {
          conflict = true;
          request.abort();
          return;
        }
        target =
          overlap && sameInsertionTarget
            ? state.selection
            : mapSelection(target, targetDoc, state.doc, transaction.mapping);
        targetDoc = state.doc;
      } catch {
        conflict = true;
        request.abort();
      }
    });
    let onAbort!: () => void;
    const aborted = new Promise<undefined>((resolve) => {
      onAbort = () => resolve(undefined);
      request.signal.addEventListener('abort', onAbort, { once: true });
      if (request.signal.aborted) onAbort();
    });
    this.notify();
    try {
      await Promise.race([previous, aborted]);
      if (conflict && !this.destroyed) throw new GitLabInsertionConflict();
      if (request.signal.aborted || this.destroyed) return { status: 'superseded' };
      const source = resolveSource(request.signal);
      markdown = typeof source === 'string' ? source : await Promise.race([source, aborted]);
      if (conflict && !this.destroyed) throw new GitLabInsertionConflict();
      if (request.signal.aborted || this.destroyed) return { status: 'superseded' };
      if (typeof markdown !== 'string' || !markdown) throw new Error('GITLAB_INVALID_INSERTION_SOURCE');
      const decoded = await Promise.race([
        this.codec.deserialize({
          schema: this.editor.state.schema,
          markdown,
          signal: request.signal,
        }),
        aborted,
      ]);
      if (conflict && !this.destroyed) throw new GitLabInsertionConflict();
      if (!decoded || request.signal.aborted || this.destroyed) return { status: 'superseded' };
      this.ensureReady();
      const document = projection?.project(decoded.document, markdown) ?? decoded.document;
      release();
      this.pending.delete(request);
      closeHistory(this.editor);
      const accepted = this.editor.runCommandBatch(() => {
        if (projection?.apply) {
          if (!projection.apply(document, target)) return false;
        } else {
          if (
            !this.editor.dispatch(
              this.editor
                .createTransaction()
                .setSelection(target)
                .setStoredMarks(targetMarks)
                .setMeta('gitlab$insertionOrigin', { owner: this.origin, target }),
            )
          )
            return false;
          if (!insertDocument(this.editor, document)) return false;
        }
        this.codec.serialize({ doc: this.editor.state.doc });
        return true;
      });
      if (!accepted) throw new Error('GITLAB_INSERTION_REFUSED');
      this.failure = undefined;
      return { status: 'applied' };
    } catch (error) {
      if (this.destroyed || (request.signal.aborted && !conflict)) return { status: 'superseded' };
      if (markdown !== undefined) this.failure = Object.freeze({ markdown, error });
      throw error;
    } finally {
      release();
      request.signal.removeEventListener('abort', onAbort);
      signal?.removeEventListener('abort', cancel);
      this.pending.delete(request);
      finishTurn();
      this.notify();
    }
  }

  cancel(): void {
    for (const request of this.pending) request.abort();
  }
  dispose(): void {
    this.destroyed = true;
    this.cancel();
    this.failure = undefined;
  }
}
