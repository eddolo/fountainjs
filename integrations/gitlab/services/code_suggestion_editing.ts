import { NodeSelection, Selection, closeHistory, insertBlock, mapSelection, type AnySelection, type Editor, type Node, type Transaction } from 'fountainjs-editor';

import type { GitLabInsertionProjection } from './markdown_insertion';
import type { SerializedContentResult } from './serialized_content';
import { serializeGitLabSuggestionNode } from './code_suggestion_node';

export interface GitLabSuggestionPreview {
  readonly preview_suggestions: true;
  readonly line: number;
  readonly file_path: string;
  readonly base_sha: string;
  readonly start_sha: string;
  readonly head_sha: string;
}
export interface GitLabSuggestionContext {
  readonly lines: readonly string[];
  readonly lineRange: Readonly<{ start: number; end: number }>;
  readonly lineType: string;
  readonly blobRawPath: string | null;
  readonly previewParams?: Readonly<GitLabSuggestionPreview>;
}
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) < 1_000_000_000;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
function fail(code: string): never { throw new Error('GITLAB_SUGGESTION_' + code); }
function readPreviewParams(value: unknown, line: number): Readonly<GitLabSuggestionPreview> {
  if (!record(value) || Object.keys(value).sort().join(',') !== 'base_sha,file_path,head_sha,line,preview_suggestions,start_sha'
    || value.preview_suggestions !== true || value.line !== line
    || typeof value.file_path !== 'string' || !value.file_path.length || value.file_path.length > 4096
    || value.file_path.startsWith('/') || /[\\\u0000-\u001f\u007f]/u.test(value.file_path)
    || value.file_path.split('/').some(part => !part || part === '.' || part === '..')
    || [value.base_sha, value.start_sha, value.head_sha].some(sha => typeof sha !== 'string' || !/^[a-f0-9]{40}$/u.test(sha))) return fail('PREVIEW_CONTEXT_INVALID');
  return Object.freeze({ preview_suggestions: true, line, file_path: value.file_path,
    base_sha: value.base_sha as string, start_sha: value.start_sha as string, head_sha: value.head_sha as string });
}
export function readGitLabSuggestionContext(value: unknown): GitLabSuggestionContext | undefined {
  if (value == null) return undefined;
  if (!record(value) || Object.keys(value).some(key => !['canSuggest', 'showPopover', 'lines', 'lineRange', 'lineType', 'blobRawPath', 'previewParams'].includes(key))) return fail('CONTEXT_INVALID');
  if (value.canSuggest !== undefined && typeof value.canSuggest !== 'boolean'
    || value.showPopover !== undefined && typeof value.showPopover !== 'boolean') return fail('CONTEXT_INVALID');
  if (value.canSuggest !== true) return undefined;
  const { lines, lineRange, lineType = '', blobRawPath = null } = value;
  if (!Array.isArray(lines) || !lines.length || lines.length > 1000
    || lines.some(line => typeof line !== 'string' || /[\r\n]/u.test(line))
    || lines.reduce((length, line) => length + line.length, 0) > 1_048_576
    || !record(lineRange) || Object.keys(lineRange).sort().join(',') !== 'end,start'
    || !positive(lineRange.start) || !positive(lineRange.end) || lineRange.end - lineRange.start + 1 !== lines.length
    || typeof lineType !== 'string' || !['', 'new', 'context'].includes(lineType)
    || blobRawPath !== null && (typeof blobRawPath !== 'string' || blobRawPath.length > 10_000
      || !blobRawPath.startsWith('/') || blobRawPath.startsWith('//') || /[\\\u0000-\u0020\u007f]/u.test(blobRawPath))) return fail('CONTEXT_INVALID');
  return Object.freeze({ lines: Object.freeze([...lines] as string[]), lineRange: Object.freeze({ start: lineRange.start, end: lineRange.end }),
    lineType: String(lineType), blobRawPath: blobRawPath as string | null,
    ...(value.previewParams !== undefined ? { previewParams: readPreviewParams(value.previewParams, lineRange.end) } : {}) });
}
const key = (context: GitLabSuggestionContext): string => JSON.stringify(context);
const at = (doc: Node, path: readonly number[]): Node => path.reduce((parent, index) => parent.child(index), doc);
function target(editor: Editor, wholeSelection = true): readonly number[] | undefined {
  const selection = editor.state.selection;
  if (selection.kind !== 'text' && selection.kind !== 'node') return undefined;
  const origin = selection instanceof NodeSelection ? selection.nodePath : selection.path;
  for (let length = origin.length; length > 0; length--) {
    const path = origin.slice(0, length);
    if (at(editor.state.doc, path).type.name === 'gitlab_code_suggestion'
      && (!wholeSelection || path.every((part, index) => selection.endPath[index] === part))) return path;
  }
  return undefined;
}
export interface GitLabSuggestionEditingOptions {
  editor: Editor;
  ensureReady(): void;
  getContext(): unknown;
  validate(document: Node): void;
  loadSource?(path: string, options: { signal: AbortSignal }): Promise<string>;
  insertVerified?(resolve: (signal: AbortSignal) => Promise<string>, signal: AbortSignal, projection: GitLabInsertionProjection): Promise<SerializedContentResult>;
}
function context(options: GitLabSuggestionEditingOptions): GitLabSuggestionContext {
  options.ensureReady();
  if (options.editor.isDestroyed) return fail('EDITOR_DESTROYED');
  if (!options.editor.editable) return fail('READ_ONLY');
  return readGitLabSuggestionContext(options.getContext()) ?? fail('UNAVAILABLE');
}
/** The pinned Rapid Diffs transport is lossy: literal backslash-n and U+E000
 * share the same displayed value. Compare its encoding, but only use raw file
 * lines as replacement source. Never reverse/clean the displayed sentinel. */
function verifiedLines(source: string, captured: GitLabSuggestionContext): readonly string[] {
  if (typeof source !== 'string' || source.length > 1_048_576) return fail('SOURCE_INVALID');
  const lines = source.split('\n').map(line => line.endsWith('\r') ? line.slice(0, -1) : line);
  if (source.endsWith('\n')) lines.pop();
  const range = captured.lineRange;
  if (range.end > lines.length || captured.lines.some((line, index) => {
    const raw = lines[range.start - 1 + index]!;
    return (captured.previewParams ? raw.replace(/\\n/gu, '\uE000') : raw) !== line;
  })) return fail('SOURCE_CHANGED');
  return Object.freeze(lines);
}
/** Insertions are proposals in the comment model, never repository writes. */
export class GitLabSuggestionEditing {
  private disposed = false;
  private session?: GitLabSuggestionEditingSession;
  private pending?: AbortController;
  constructor(private readonly options: GitLabSuggestionEditingOptions) {}
  get available(): boolean { if (this.disposed) return false; try { context(this.options); return true; } catch { return false; } }
  insert(): boolean {
    if (this.disposed) return fail('DISPOSED');
    const captured = context(this.options), { editor } = this.options;
    if (target(editor, false)) return fail('ALREADY_INSIDE');
    // Ambiguous host text must use the raw-file path even for private callers.
    if (captured.lines.some(line => line.includes('\uE000'))) return fail('SOURCE_REQUIRED');
    if (this.pending) return fail('INSERTION_PENDING');
    closeHistory(editor);
    if (!editor.runCommandBatch(() => this.applyInsertion(captured, captured.lines))) return fail('UPDATE_REFUSED');
    return true;
  }
  /** Capture the comment target now; raw-file completion may not follow a later caret. */
  async insertVerified(signal?: AbortSignal): Promise<SerializedContentResult> {
    if (this.disposed) return fail('DISPOSED');
    const captured = context(this.options), fingerprint = key(captured), { editor, loadSource, insertVerified } = this.options;
    if (target(editor, false)) return fail('ALREADY_INSIDE');
    if (this.pending) return fail('INSERTION_PENDING');
    if (!captured.blobRawPath || !loadSource || !insertVerified) return fail('SOURCE_REQUIRED');
    if (signal?.aborted) return { status: 'superseded' };
    const pending = this.pending = new AbortController(), cancel = () => pending.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    let proposal: Node | undefined, selected: readonly string[] = [];
    const ready = () => {
      if (this.disposed) return fail('DISPOSED');
      if (key(context(this.options)) !== fingerprint) return fail('CONTEXT_CHANGED');
    };
    try {
      return await insertVerified(async request => {
        ready();
        const source = await loadSource(captured.blobRawPath!, { signal: request });
        // Cancellation belongs to the mapped insertion owner, including an
        // uncooperative loader. It discards late resolution before projection.
        ready();
        selected = verifiedLines(source, captured).slice(captured.lineRange.start - 1, captured.lineRange.end);
        proposal = editor.state.schema.node('gitlab_code_suggestion',
          { params: `-${selected.length - 1}+0`, fence: '```' }, [editor.state.schema.text(selected.join('\n') + '\n')]);
        return serializeGitLabSuggestionNode(proposal);
      }, pending.signal, {
        selection: editor.state.selection,
        nativeDocument: () => proposal ? editor.state.schema.node('doc', {}, [proposal]) : undefined,
        project: document => { ready(); return document; },
        apply: (_document, selection) => { ready(); return this.applyInsertion(captured, selected, selection); },
      });
    } finally {
      signal?.removeEventListener('abort', cancel);
      if (this.pending === pending) this.pending = undefined;
    }
  }
  private applyInsertion(captured: GitLabSuggestionContext, lines: readonly string[], mapped?: AnySelection): boolean {
    const fingerprint = key(captured), { editor } = this.options;
    if (key(context(this.options)) !== fingerprint) return fail('CONTEXT_CHANGED');
    if (mapped && !editor.dispatch(editor.createTransaction().setSelection(mapped).setStoredMarks([]))) return false;
    if (target(editor, false)) return fail('ALREADY_INSIDE');
    const before = editor.state.doc;
    const text = lines.join('\n') + '\n', attrs = { params: `-${lines.length - 1}+0`, fence: '```' };
    const selection = editor.state.selection, schema = editor.state.schema;
    const empty = before.childCount === 1 && before.child(0).type.name === 'paragraph'
      && before.child(0).eq(schema.node('paragraph', {}, [schema.text('')]))
      && selection.kind === 'text' && selection.isCollapsed && selection.path[0] === 0;
    if (empty) {
      const proposal = schema.node('gitlab_code_suggestion', attrs, [schema.text(text)]);
      if (!editor.dispatch(editor.createTransaction().replaceNode([0], [proposal])
        .setSelection(Selection.cursor([0, 0], text.length)).setStoredMarks([]))) return false;
    } else {
      if (!insertBlock(editor, 'gitlab_code_suggestion', attrs, text)) return false;
      if (!editor.dispatch(editor.createTransaction().setStoredMarks([]))) return false;
    }
    if (editor.state.doc === before) return false;
    this.options.validate(editor.state.doc);
    if (key(context(this.options)) !== fingerprint) return fail('CONTEXT_CHANGED');
    return true;
  }
  begin(): GitLabSuggestionEditingSession {
    if (this.disposed) return fail('DISPOSED');
    this.session?.close();
    return this.session = new GitLabSuggestionEditingSession(this.options);
  }
  dispose(): void { this.disposed = true; this.pending?.abort(); this.session?.close(); this.session = undefined; }
}

/** Capture an owned proposal and host context. Later caret movement cannot
 * redirect it; changed source/target/context requires reopening the session. */
export class GitLabSuggestionEditingSession {
  readonly initial: Readonly<{ text: string; params: string; range: Readonly<{ start: number; end: number }> }>;
  private options?: GitLabSuggestionEditingOptions;
  private readonly captured: GitLabSuggestionContext;
  private readonly fingerprint: string;
  private doc?: Node;
  private node?: Node;
  private selection: NodeSelection;
  private release?: () => void;
  private conflicted = false;
  private committing = false;
  private source?: string;
  private lines?: readonly string[];
  private request = 0;
  private abort?: AbortController;
  constructor(options: GitLabSuggestionEditingOptions) {
    this.captured = context(options); this.fingerprint = key(this.captured);
    const path = target(options.editor); if (!path) fail('SELECTION_REQUIRED');
    this.options = options; this.doc = options.editor.state.doc; this.node = at(this.doc, path);
    this.selection = new NodeSelection(this.doc, path);
    const params = String(this.node.attrs.params), offsets = params.match(/^([+-]\d+)([+-]\d+)$/u);
    const anchor = this.captured.lineRange.end;
    this.initial = Object.freeze({ text: this.node.textContent, params,
      range: Object.freeze({ start: anchor + Number(offsets?.[1] ?? 0), end: anchor + Number(offsets?.[2] ?? 0) }) });
    this.release = options.editor.subscribe((state, transaction) => this.track(state.doc, transaction));
  }
  get closed(): boolean { return !this.options; }
  get conflict(): boolean { try { this.ready(); return false; } catch { return true; } }
  get targetPath(): readonly number[] | undefined { return this.conflict ? undefined : this.selection.nodePath; }
  private track(document: Node, transaction: Transaction): void {
    if (this.committing || this.conflicted || !this.doc) return;
    if (transaction.getMeta('content$replace')) { this.conflicted = true; this.abort?.abort(); return; }
    if (document === this.doc) return;
    try {
      if (transaction.originalDoc !== this.doc || transaction.getMeta('content$replace')) throw new Error();
      const selected = mapSelection(this.selection, this.doc, document, transaction.mapping);
      if (!(selected instanceof NodeSelection) || at(document, selected.nodePath) !== this.node) throw new Error();
      this.selection = selected; this.doc = document;
    } catch { this.conflicted = true; this.abort?.abort(); }
  }
  private ready(): GitLabSuggestionEditingOptions {
    if (!this.options) return fail('SESSION_CLOSED');
    const current = context(this.options);
    if (key(current) !== this.fingerprint) { this.conflicted = true; this.abort?.abort(); return fail('CONTEXT_CHANGED'); }
    if (this.conflicted || this.options.editor.state.doc !== this.doc) return fail('TARGET_CHANGED');
    return this.options;
  }
  private async fetchSource(): Promise<string> {
    const options = this.ready(), path = this.captured.blobRawPath;
    if (!path || !options.loadSource) return fail('SOURCE_REQUIRED');
    this.abort?.abort(); const abort = this.abort = new AbortController(), request = ++this.request;
    const source = await options.loadSource(path, { signal: abort.signal });
    this.ready();
    if (abort.signal.aborted || request !== this.request) return fail('SOURCE_SUPERSEDED');
    if (typeof source !== 'string' || source.length > 1_048_576) return fail('SOURCE_INVALID');
    return source;
  }
  async prepareRange(): Promise<readonly string[]> {
    const source = await this.fetchSource(), lines = verifiedLines(source, this.captured);
    this.source = source; this.lines = Object.freeze(lines); return this.lines;
  }
  private async rangeParams(start: number, end: number): Promise<string> {
    this.ready(); const anchor = this.captured.lineRange.end;
    if (!positive(start) || !positive(end) || start > anchor || end < anchor) return fail('RANGE_INVALID');
    // A reopened note can describe more lines than the host's single diff anchor.
    // Editing its text keeps the stored offsets. A loaded file still needs revalidation.
    if (!this.lines && start === this.initial.range.start && end === this.initial.range.end) return this.initial.params;
    const within = start >= this.captured.lineRange.start && end <= anchor;
    if (!within && !this.lines) return fail('SOURCE_REQUIRED');
    if (this.lines) {
      if (end > this.lines.length) return fail('RANGE_INVALID');
      if (await this.fetchSource() !== this.source) return fail('SOURCE_CHANGED');
    }
    this.ready();
    return `-${anchor - start}+${end - anchor}`;
  }
  async applyRange(start: number, end: number): Promise<boolean> {
    const params = await this.rangeParams(start, end);
    return this.commit(node => node.type.create({ ...node.attrs, params }, node.content));
  }
  /** A dialog applies its replacement and range together as one undoable edit. */
  async applyChange(text: string, start: number, end: number): Promise<boolean> {
    this.ready();
    if (typeof text !== 'string' || text.length > 1_048_576 || /\r/u.test(text)) return fail('SOURCE_INVALID');
    const params = await this.rangeParams(start, end);
    return this.commit(node => node.type.create({ ...node.attrs, params }, [node.type.schema.text(text)]));
  }
  applySource(text: string): boolean {
    this.ready();
    if (typeof text !== 'string' || text.length > 1_048_576 || /\r/u.test(text)) return fail('SOURCE_INVALID');
    return this.commit(node => node.copy([node.type.schema.text(text)]));
  }
  private commit(change: (node: Node) => Node): boolean {
    const options = this.ready(), { editor } = options;
    closeHistory(editor); this.ready();
    this.committing = true;
    try {
      const accepted = editor.runCommandBatch(() => {
        this.ready(); const document = editor.state.doc;
        const replacement = change(this.node!);
        if (replacement.eq(this.node!)) return true;
        if (!editor.dispatch(editor.createTransaction().replaceNode(this.selection.nodePath, [replacement])) || editor.state.doc === document) return false;
        options.validate(editor.state.doc);
        if (key(context(options)) !== this.fingerprint) return fail('CONTEXT_CHANGED');
        return true;
      });
      if (!accepted) return fail('UPDATE_REFUSED');
      this.close(); return true;
    } finally { this.committing = false; }
  }
  close(): void {
    this.request++; this.abort?.abort(); this.abort = undefined;
    this.release?.(); this.release = undefined; this.options = undefined;
    this.doc = undefined; this.node = undefined; this.source = undefined; this.lines = undefined;
  }
}
