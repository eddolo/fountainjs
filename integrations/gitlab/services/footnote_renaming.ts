import { NodeSelection, mapSelection, type Editor, type Node, type Transaction } from 'fountainjs-editor';
import { GitLabMarkdownConversionError, type GitLabMarkdownCodec } from './markdown_codec';
import type { GitLabMarkdownInsertion } from './markdown_insertion';
import { getGitLabFootnoteContext } from './footnote_editing';
import { validGitLabFootnoteLabel } from './footnote_nodes';

const at = (doc: Node, path: readonly number[]): Node => path.reduce((node, index) => node.child(index), doc);
function renameTransaction(editor: Editor, id: string, label: string): Transaction {
  const transaction = editor.createTransaction();
  editor.state.doc.descendants((node, path) => {
    if (!node.type.name.startsWith('footnote_') || node.attrs.id !== id) return;
    transaction.setNodeAttrs(path, { ...node.attrs, gitlabFootnoteLabel: label,
      ...(node.type.name === 'footnote_reference' ? { gitlabFootnoteOriginalLabel: label, gitlabFootnoteTargetLabel: label } : {}) });
  });
  return transaction;
}

/** Compare actual host projections, allowing only the requested note-label change. */
export function gitLabFootnoteRenameFingerprint(document: Node, rename?: { from: string; to: string }): string {
  const labels = new Map<string, string>();
  document.descendants(node => {
    if (node.type.name !== 'footnote_definition') return;
    const label = String(node.attrs.gitlabFootnoteLabel ?? node.attrs.id);
    if (labels.has(String(node.attrs.id))) throw new Error('GITLAB_FOOTNOTE_RENAME_RESOLUTION');
    labels.set(String(node.attrs.id), rename && label === rename.to ? rename.from : label);
  });
  const project = (node: Node): unknown => {
    let attrs = node.attrs;
    if (node.type.name.startsWith('footnote_')) {
      const label = labels.get(String(node.attrs.id));
      if (!label) throw new Error('GITLAB_FOOTNOTE_RENAME_RESOLUTION');
      const retained = Object.fromEntries(Object.entries(node.attrs).filter(([name]) => ![
        'id', 'gitlabFootnoteLabel', 'gitlabFootnoteOriginalLabel', 'gitlabFootnoteTargetLabel',
      ].includes(name)));
      attrs = { ...retained, id: label };
    }
    return { type: node.type.name, attrs, text: node.text, marks: node.marks.map(mark => mark.toJSON()),
      content: node.content.map(project) };
  };
  return JSON.stringify(project(document));
}

interface RenameOptions {
  editor: Editor;
  codec: GitLabMarkdownCodec;
  insertions: GitLabMarkdownInsertion;
  ensureReady(): void;
  changed?(snapshot: GitLabFootnoteRenameSnapshot): void;
  closed?(): void;
  onListenerError?(error: unknown): void;
}
export interface GitLabFootnoteRenameSnapshot {
  readonly label: string;
  readonly path: readonly number[];
  readonly pending: boolean;
  readonly conflict: boolean;
  readonly closed: boolean;
}

/** A label draft owns one definition; the insertion queue owns async save guards. */
export class GitLabFootnoteRenameSession {
  private options?: RenameOptions;
  private doc?: Node;
  private node?: Node;
  private selected: NodeSelection;
  private release?: () => void;
  private attempt?: AbortController;
  private pending = false;
  private conflict = false;
  private interrupted = false;
  private committing = false;
  readonly label: string;
  readonly id: string;
  constructor(options: RenameOptions) {
    options.ensureReady();
    const context = getGitLabFootnoteContext(options.editor);
    if (!context) throw new Error('GITLAB_FOOTNOTE_SELECTION_REQUIRED');
    this.options = options; this.doc = options.editor.state.doc;
    this.node = at(this.doc, context.definitionPath);
    this.selected = new NodeSelection(this.doc, context.definitionPath);
    this.label = context.label; this.id = context.id;
    this.release = options.editor.subscribe((state, transaction) => this.track(state.doc, transaction));
  }
  get snapshot(): GitLabFootnoteRenameSnapshot {
    return Object.freeze({ label: this.label, path: Object.freeze([...this.selected.nodePath]),
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
    if (this.pending) { this.interrupted = true; this.attempt?.abort(); }
    this.notify();
  }
  private ready(): RenameOptions {
    if (!this.options) throw new Error('GITLAB_FOOTNOTE_RENAME_CLOSED');
    this.options.ensureReady();
    if (this.conflict || this.options.editor.state.doc !== this.doc) throw new Error('GITLAB_FOOTNOTE_TARGET_CHANGED');
    return this.options;
  }
  private source(options: RenameOptions, doc: Node): string {
    const result = options.codec.serializeWithReport({ doc, canonical: true });
    if (result.issues.length) throw new Error('GITLAB_FOOTNOTE_RENAME_SOURCE');
    return result.markdown;
  }
  async apply(label: string) {
    const options = this.ready();
    if (this.pending) throw new Error('GITLAB_FOOTNOTE_RENAME_PENDING');
    if (!validGitLabFootnoteLabel(label)) throw new Error('GITLAB_FOOTNOTE_INVALID_LABEL');
    if (label === this.label) { this.close(); return { status: 'applied' as const }; }
    this.doc!.descendants(node => {
      if (node.type.name === 'footnote_definition' && node.attrs.id !== this.id && node.attrs.gitlabFootnoteLabel === label)
        throw new Error('GITLAB_FOOTNOTE_LABEL_COLLISION');
    });
    const controller = this.attempt = new AbortController();
    this.pending = true; this.interrupted = false; this.notify();
    let transaction: Transaction | undefined, expected: Node | undefined;
    try {
      const result = await options.insertions.insertFrom(async signal => {
        this.ready(); expected = options.editor.state.doc;
        transaction = renameTransaction(options.editor, this.id, label);
        const schema = options.editor.state.schema;
        const before = await options.codec.deserialize({ schema, markdown: this.source(options, expected), signal });
        const after = await options.codec.deserialize({ schema, markdown: this.source(options, transaction.doc), signal }).catch(error => {
          if (error instanceof GitLabMarkdownConversionError && error.issues.some(issue => issue.code.startsWith('footnote')))
            throw new Error('GITLAB_FOOTNOTE_RENAME_RESOLUTION');
          throw error;
        });
        if (gitLabFootnoteRenameFingerprint(before.document) !== gitLabFootnoteRenameFingerprint(after.document, { from: this.label, to: label }))
          throw new Error('GITLAB_FOOTNOTE_RENAME_RESOLUTION');
        return '';
      }, controller.signal, undefined, {
        selection: this.selected,
        nativeDocument: () => options.editor.state.doc,
        project: document => {
          this.ready();
          if (document !== expected || !transaction) throw new Error('GITLAB_FOOTNOTE_DOCUMENT_CHANGED');
          return transaction.doc;
        },
        apply: () => {
          this.ready();
          if (options.editor.state.doc !== expected || !transaction) throw new Error('GITLAB_FOOTNOTE_DOCUMENT_CHANGED');
          this.committing = true; return options.editor.dispatch(renameTransaction(options.editor, this.id, label));
        },
      });
      if (this.interrupted) throw new Error(this.conflict ? 'GITLAB_FOOTNOTE_TARGET_CHANGED' : 'GITLAB_FOOTNOTE_DOCUMENT_CHANGED');
      if (result.status === 'applied') { this.pending = false; this.close(); }
      return result;
    } finally { this.committing = false; this.pending = false; this.attempt = undefined; this.notify(); }
  }
  close(): void {
    const options = this.options;
    if (!options) return;
    this.attempt?.abort(); this.release?.(); this.release = undefined;
    this.options = undefined; this.doc = undefined; this.node = undefined;
    for (const notify of [() => options.changed?.(this.snapshot), () => options.closed?.()]) {
      try { notify(); } catch (error) { try { options.onListenerError?.(error); } catch { /* Cleanup cannot reverse a committed update. */ } }
    }
  }
}
