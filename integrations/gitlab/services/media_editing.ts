import { NodeSelection, closeHistory, deleteSelection, mapSelection, type Editor, type Node, type Transaction } from 'fountainjs-editor';
import { gitlabMediaSource, gitlabMediaCSSDimension, type GitLabMediaFields } from './media';

export interface GitLabMediaContext extends GitLabMediaFields {
  readonly path: readonly number[];
  readonly kind: 'image' | 'audio' | 'video';
  readonly displayURL: string;
  readonly canonicalMissing: boolean;
}
export interface GitLabMediaSnapshot extends GitLabMediaContext {
  readonly pending: boolean;
  readonly conflict: boolean;
  readonly closed: boolean;
}
const at = (doc: Node, path: readonly number[]): Node => path.reduce((node, index) => node.child(index), doc);
export function getGitLabMediaContext(editor: Editor): GitLabMediaContext | undefined {
  const { doc, selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return undefined;
  const node = at(doc, selection.nodePath);
  if (!['inline_image', 'gitlab_media'].includes(node.type.name)) return undefined;
  const width = node.attrs.gitlabIntrinsicSize && node.attrs.width === '100%' ? 'auto' : String(node.attrs.width ?? 'auto');
  return Object.freeze({ path: Object.freeze([...selection.nodePath]),
    kind: node.type.name === 'inline_image' ? 'image' : node.attrs.kind as 'audio' | 'video',
    displayURL: String(node.attrs.src), canonical: String(node.attrs.gitlabCanonicalSrc ?? node.attrs.src),
    canonicalMissing: Boolean(node.attrs.gitlabCanonicalMissing), alt: String(node.attrs.alt ?? ''), title: String(node.attrs.title ?? ''),
    width, height: String(node.attrs.height ?? 'auto') });
}
interface MediaEditingOptions {
  editor: Editor;
  ensureReady(): void;
  resolve(source: string, signal: AbortSignal): Promise<Node>;
  validate(doc: Node): void;
  changed?(snapshot: GitLabMediaSnapshot): void;
  closed?(): void;
  onListenerError?(error: unknown): void;
}

/** An asynchronous property form owns one mapped atom until apply, cancel or disposal. */
export class GitLabMediaEditingSession {
  private options?: MediaEditingOptions;
  private doc?: Node;
  private node?: Node;
  private selected: NodeSelection;
  private release?: () => void;
  private readonly cancel = new AbortController();
  private pending = false;
  private conflict = false;
  private committing = false;
  readonly initial: GitLabMediaContext;
  constructor(options: MediaEditingOptions) {
    options.ensureReady();
    const context = getGitLabMediaContext(options.editor);
    if (!context) throw new Error('GITLAB_MEDIA_SELECTION_REQUIRED');
    this.options = options; this.initial = context;
    this.doc = options.editor.state.doc; this.node = at(this.doc, context.path);
    this.selected = new NodeSelection(this.doc, context.path);
    this.release = options.editor.subscribe((state, transaction) => this.track(state.doc, transaction));
  }
  get snapshot(): GitLabMediaSnapshot {
    return Object.freeze({ ...this.initial, path: Object.freeze([...this.selected.nodePath]),
      pending: this.pending, conflict: this.conflict, closed: !this.options });
  }
  private notify(): void {
    try { this.options?.changed?.(this.snapshot); }
    catch (error) { try { this.options?.onListenerError?.(error); } catch { /* An observer cannot own a document commit. */ } }
  }
  private track(doc: Node, transaction: Transaction): void {
    if (!transaction.docChanged || this.committing || this.conflict || !this.doc) return;
    try {
      if (transaction.originalDoc !== this.doc || transaction.getMeta('content$replace')) throw new Error();
      const selected = mapSelection(this.selected, this.doc, doc, transaction.mapping);
      if (!(selected instanceof NodeSelection) || at(doc, selected.nodePath) !== this.node) throw new Error();
      this.selected = selected; this.doc = doc;
    } catch { this.conflict = true; }
    this.notify();
  }
  private ready(): MediaEditingOptions {
    if (!this.options) throw new Error('GITLAB_MEDIA_SESSION_CLOSED');
    this.options.ensureReady();
    if (this.conflict || this.options.editor.state.doc !== this.doc) throw new Error('GITLAB_MEDIA_TARGET_CHANGED');
    return this.options;
  }
  async apply(fields: GitLabMediaFields): Promise<{ status: 'applied' | 'closed' }> {
    const options = this.ready(), { editor } = options;
    if (this.pending) throw new Error('GITLAB_MEDIA_UPDATE_PENDING');
    fields = { ...fields, width: gitlabMediaCSSDimension(fields.width), height: gitlabMediaCSSDimension(fields.height) };
    const source = gitlabMediaSource(editor.state.schema, fields);
    if (Object.entries(fields).every(([key, value]) => this.initial[key as keyof GitLabMediaFields] === value) && !this.initial.canonicalMissing) {
      this.close(); return { status: 'applied' };
    }
    this.pending = true; this.notify();
    try {
      let replacement: Node;
      if (fields.canonical === this.initial.canonical) {
        if (this.initial.canonicalMissing) throw new Error('GITLAB_MEDIA_CANONICAL_SOURCE_REQUIRED');
        replacement = this.node!.type.create({ ...this.node!.attrs, alt: fields.alt, title: fields.title,
          width: fields.width, height: fields.height,
          ...(this.node!.type.name === 'inline_image' ? { gitlabIntrinsicSize: fields.width === 'auto' && fields.height === 'auto' } : {}),
        }, this.node!.content, this.node!.text, this.node!.marks);
      } else {
        try { replacement = await options.resolve(source, this.cancel.signal); }
        catch (error) { if (!this.options || this.cancel.signal.aborted) return { status: 'closed' }; throw error; }
        if (!this.options || this.cancel.signal.aborted) return { status: 'closed' };
        this.ready();
        if (!['inline_image', 'gitlab_media'].includes(replacement.type.name) || replacement.type.schema !== editor.state.schema)
          throw new Error('GITLAB_MEDIA_RESOLUTION_FAILED');
        const resolvedKind = replacement.type.name === 'inline_image' ? 'image' : replacement.attrs.kind;
        const resolvedWidth = replacement.attrs.gitlabIntrinsicSize && replacement.attrs.width === '100%' ? 'auto' : replacement.attrs.width;
        if ((replacement.attrs.gitlabCanonicalSrc ?? replacement.attrs.src) !== fields.canonical
          || replacement.attrs.alt !== fields.alt || replacement.attrs.title !== fields.title
          || gitlabMediaCSSDimension(resolvedWidth ?? 'auto') !== fields.width
          || gitlabMediaCSSDimension(replacement.attrs.height ?? 'auto') !== fields.height)
          throw new Error('GITLAB_MEDIA_RESOLUTION_MISMATCH');
        if (resolvedKind !== this.initial.kind && this.node!.marks.some(mark => mark.type.name === 'link'))
          throw new Error('GITLAB_MEDIA_LINKED_CONVERSION_REQUIRED');
        replacement = replacement.withMarks(this.node!.marks);
      }
      this.ready(); closeHistory(editor); this.ready();
      this.commit(() => {
        const transaction = editor.createTransaction().replaceNode(this.selected.nodePath, [replacement]);
        return editor.dispatch(transaction.setSelection(new NodeSelection(transaction.doc, this.selected.nodePath)));
      });
      this.close(); return { status: 'applied' };
    } finally { this.pending = false; this.notify(); }
  }
  remove(): boolean {
    const { editor } = this.ready();
    if (this.pending) throw new Error('GITLAB_MEDIA_UPDATE_PENDING');
    closeHistory(editor); this.ready();
    this.commit(() => editor.dispatch(editor.createTransaction().setSelection(this.selected)) && deleteSelection(editor));
    this.close(); return true;
  }
  private commit(run: () => boolean): void {
    const options = this.ready(); this.committing = true;
    try {
      const accepted = options.editor.runCommandBatch(() => {
        this.ready(); const before = options.editor.state.doc;
        if (!run() || options.editor.state.doc === before) return false;
        options.validate(options.editor.state.doc); return true;
      });
      if (!accepted) throw new Error('GITLAB_MEDIA_UPDATE_REFUSED');
    } finally { this.committing = false; }
  }
  close(): void {
    const options = this.options;
    if (!options) return;
    this.cancel.abort(); this.release?.(); this.release = undefined;
    this.options = undefined; this.doc = undefined; this.node = undefined;
    try { options.changed?.(this.snapshot); options.closed?.(); }
    catch (error) { try { options.onListenerError?.(error); } catch { /* Closing cannot reverse a committed update. */ } }
  }
}
