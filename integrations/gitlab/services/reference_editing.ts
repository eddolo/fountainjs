import { NodeSelection, closeHistory, deleteSelection, mapSelection, type Editor, type Node, type Transaction } from 'fountainjs-editor';
import type { GitLabInsertionProjection } from './markdown_insertion';
import type { SerializedContentResult } from './serialized_content';

export type GitLabReferenceFormat = 'id' | 'title' | 'summary';
export interface GitLabReferenceContext {
  readonly path: readonly number[];
  readonly original: string;
  readonly label: string;
  readonly referenceType: string;
  readonly href: string;
  readonly format: GitLabReferenceFormat;
  readonly formats: readonly GitLabReferenceFormat[];
}
export interface GitLabReferenceSnapshot extends GitLabReferenceContext {
  readonly pending: boolean;
  readonly conflict: boolean;
  readonly closed: boolean;
}
interface ReferenceEditingOptions {
  editor: Editor;
  ensureReady(): void;
  replace(options: { source: string; signal: AbortSignal; projection: GitLabInsertionProjection }): Promise<SerializedContentResult>;
  validate(doc: Node): void;
  changed?(snapshot: GitLabReferenceSnapshot): void;
  closed?(): void;
  onListenerError?(error: unknown): void;
}
const at = (doc: Node, path: readonly number[]): Node => path.reduce((node, index) => node.child(index), doc);
const expandable = new Set(['issue', 'issue_alternative', 'work_item', 'merge_request', 'epic', 'epic_alternative']);

export function getGitLabReferenceContext(editor: Editor): GitLabReferenceContext | undefined {
  const { doc, selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return undefined;
  const node = at(doc, selection.nodePath);
  if (node.type.name !== 'gitlab_reference') return undefined;
  const type = String(node.attrs.referenceType), original = String(node.attrs.original);
  const canExpand = expandable.has(type);
  const format = canExpand && original.endsWith('+s') ? 'summary' : canExpand && original.endsWith('+') ? 'title' : 'id';
  const formats: GitLabReferenceFormat[] = canExpand ? ['id', 'title'] : [];
  if (canExpand && !['epic', 'epic_alternative'].includes(type)) formats.push('summary');
  return Object.freeze({ path: Object.freeze([...selection.nodePath]), original,
    label: String(node.attrs.label), href: String(node.attrs.href), referenceType: type,
    format, formats: Object.freeze(formats) });
}

/** A format draft owns one reference; insertion coordination owns async ordering/save guards. */
export class GitLabReferenceEditingSession {
  private options?: ReferenceEditingOptions;
  private doc?: Node;
  private node?: Node;
  private selected: NodeSelection;
  private release?: () => void;
  private readonly cancel = new AbortController();
  private pending = false;
  private conflict = false;
  private committing = false;
  readonly initial: GitLabReferenceContext;
  constructor(options: ReferenceEditingOptions) {
    options.ensureReady();
    const context = getGitLabReferenceContext(options.editor);
    if (!context) throw new Error('GITLAB_REFERENCE_SELECTION_REQUIRED');
    this.initial = context; this.options = options;
    this.doc = options.editor.state.doc; this.node = at(this.doc, context.path);
    this.selected = new NodeSelection(this.doc, context.path);
    this.release = options.editor.subscribe((state, transaction) => this.track(state.doc, transaction));
  }
  get snapshot(): GitLabReferenceSnapshot {
    return Object.freeze({ ...this.initial, path: Object.freeze([...this.selected.nodePath]),
      pending: this.pending, conflict: this.conflict, closed: !this.options });
  }
  private notify(): void {
    try { this.options?.changed?.(this.snapshot); }
    catch (error) { try { this.options?.onListenerError?.(error); } catch { /* Observers do not own the draft. */ } }
  }
  private track(doc: Node, transaction: Transaction): void {
    if (!transaction.docChanged || this.committing || this.conflict || !this.doc) return;
    try {
      if (transaction.originalDoc !== this.doc || transaction.getMeta('content$replace')) throw new Error();
      const mapped = mapSelection(this.selected, this.doc, doc, transaction.mapping);
      if (!(mapped instanceof NodeSelection) || at(doc, mapped.nodePath) !== this.node) throw new Error();
      this.selected = mapped; this.doc = doc;
    } catch { this.conflict = true; }
    this.notify();
  }
  private ready(): ReferenceEditingOptions {
    if (!this.options) throw new Error('GITLAB_REFERENCE_SESSION_CLOSED');
    this.options.ensureReady();
    if (this.conflict || this.options.editor.state.doc !== this.doc) throw new Error('GITLAB_REFERENCE_TARGET_CHANGED');
    return this.options;
  }
  async applyFormat(format: GitLabReferenceFormat): Promise<SerializedContentResult> {
    const options = this.ready();
    if (this.pending) throw new Error('GITLAB_REFERENCE_UPDATE_PENDING');
    if (!this.initial.formats.includes(format)) throw new Error('GITLAB_REFERENCE_FORMAT_UNAVAILABLE');
    if (format === this.initial.format) { this.close(); return { status: 'applied' }; }
    const suffix = format === 'summary' ? '+s' : format === 'title' ? '+' : '';
    const source = this.initial.original.replace(/\+(?:s)?$/u, '') + suffix;
    this.pending = true; this.notify();
    try {
      const result = await options.replace({ source, signal: this.cancel.signal, projection: {
        selection: this.selected,
        project: document => {
          this.ready();
          const block = document.content[0], reference = block?.content[0];
          if (document.type !== options.editor.state.schema.topNodeType || document.childCount !== 1
            || block?.type.name !== 'paragraph' || block.childCount !== 1
            || reference?.type !== this.node!.type || reference.attrs.original !== source
            || reference.attrs.href !== this.initial.href || reference.attrs.referenceType !== this.initial.referenceType
            || typeof reference.attrs.label !== 'string' || !reference.attrs.label)
            throw new Error('GITLAB_REFERENCE_RESOLUTION_MISMATCH');
          const updated = this.node!.type.create({ ...this.node!.attrs, original: source,
            label: reference.attrs.label, title: reference.attrs.title, color: reference.attrs.color,
          }, this.node!.content, this.node!.text, this.node!.marks);
          this.committing = true;
          return document.copy([block.copy([updated])]);
        },
        apply: document => {
          this.ready();
          return options.editor.dispatch(options.editor.createTransaction().setNodeAttrs(this.selected.nodePath, document.child(0).child(0).attrs));
        },
      } });
      this.close(); return result;
    } finally { this.committing = false; this.pending = false; this.notify(); }
  }
  remove(): boolean {
    const options = this.ready();
    if (this.pending) throw new Error('GITLAB_REFERENCE_UPDATE_PENDING');
    closeHistory(options.editor); this.ready(); this.committing = true;
    try {
      const accepted = options.editor.runCommandBatch(() => {
        this.ready();
        if (!options.editor.dispatch(options.editor.createTransaction().setSelection(this.selected)) || !deleteSelection(options.editor)) return false;
        options.validate(options.editor.state.doc); return true;
      });
      if (!accepted) throw new Error('GITLAB_REFERENCE_UPDATE_REFUSED');
    } finally { this.committing = false; }
    this.close(); return true;
  }
  close(): void {
    const options = this.options;
    if (!options) return;
    this.cancel.abort(); this.release?.(); this.release = undefined;
    this.options = undefined; this.doc = undefined; this.node = undefined;
    for (const notify of [() => options.changed?.(this.snapshot), () => options.closed?.()]) {
      try { notify(); }
      catch (error) { try { options.onListenerError?.(error); } catch { /* Cleanup cannot reverse a committed update. */ } }
    }
  }
}
