import {
  Selection, Step, closeHistory, isSafeURL, mapMarkRangeSelection, mapSelection, textPointToPosition,
  type Editor, type Mark, type Node, type Transaction,
} from 'fountainjs-editor';

export interface GitLabLinkContext {
  readonly selection: Selection;
  readonly text: string;
  readonly href: string;
  readonly displayHref: string;
  readonly existing: boolean;
}
export interface GitLabLinkSnapshot extends GitLabLinkContext {
  readonly pending: boolean;
  readonly conflict: boolean;
  readonly closed: boolean;
}
interface LinkTarget extends GitLabLinkContext { readonly mark?: Mark }
interface LinkEditingOptions {
  editor: Editor;
  resolveURL(href: string, signal: AbortSignal, wikiLink?: boolean): Promise<string | {href:string; wikiKind:'page' | 'external'}>;
  validate(doc: Node): void;
  ensureReady(): void;
  changed?(snapshot: GitLabLinkSnapshot): void;
  closed?(): void;
  onListenerError?(error: unknown): void;
}
const at = (doc: Node, path: readonly number[]): Node => path.reduce((node, index) => node.child(index), doc);
const samePath = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((part, index) => part === b[index]);

function replaceAt(doc: Node, path: readonly number[], replacement: Node): Node {
  if (!path.length) return replacement;
  const index = path[0]!, content = [...doc.content];
  content[index] = replaceAt(doc.child(index), path.slice(1), replacement);
  return doc.copy(content);
}

class WrapLinkStep extends Step {
  constructor(private readonly range: Selection, private readonly mark: Mark) { super(); }
  apply(doc: Node): Node {
    const range = this.range, parentPath = range.path.slice(0, -1), parent = at(doc, parentPath);
    const start = range.path.at(-1)!, end = range.endPath.at(-1)!;
    const first = parent.child(start), last = parent.child(end);
    const content = [
      ...parent.content.slice(0, start),
      ...(range.from ? [first.withText(first.text!.slice(0, range.from))] : []),
      ...fragments(doc, range).map(node => node.withMarks([this.mark, ...node.marks.filter(mark => mark.type.name !== 'link')])),
      ...(range.to < last.text!.length ? [last.withText(last.text!.slice(range.to))] : []),
      ...parent.content.slice(end + 1),
    ];
    return replaceAt(doc, parentPath, parent.copy(content));
  }
}

function fragments(doc: Node, range: Selection): Node[] {
  const parentPath = range.path.slice(0, -1);
  if (!range.path.length || !samePath(parentPath, range.endPath.slice(0, -1)))
    throw new Error('GITLAB_LINK_TEXT_SELECTION_REQUIRED');
  const parent = at(doc, parentPath), from = range.path.at(-1)!, to = range.endPath.at(-1)!;
  const nodes: Node[] = [];
  for (let index = from; index <= to; index++) {
    const node = parent.child(index);
    if (!node.isText) throw new Error('GITLAB_LINK_TEXT_SELECTION_REQUIRED');
    const start = index === from ? range.from : 0, end = index === to ? range.to : node.text!.length;
    if (start > end || end > node.text!.length) throw new Error('GITLAB_LINK_TARGET_CHANGED');
    if (end > start || range.isCollapsed) nodes.push(node.withText(node.text!.slice(start, end)));
  }
  return nodes;
}

function target(editor: Editor, allowCreate: boolean): LinkTarget | undefined {
  const { doc, selection } = editor.state;
  if (selection.kind !== 'text') return undefined;
  try {
    const node = at(doc, selection.path), mark = node.marks.find(candidate => candidate.type.name === 'link');
    if (node.isText && mark) {
      const parentPath = selection.path.slice(0, -1), parent = at(doc, parentPath);
      let start = selection.path.at(-1)!, end = start;
      const matches = (candidate: Node): boolean => candidate.isText && candidate.marks.some(value => value.eq(mark));
      while (start > 0 && matches(parent.child(start - 1))) start--;
      while (end + 1 < parent.childCount && matches(parent.child(end + 1))) end++;
      const range = Selection.range([...parentPath, start], 0, [...parentPath, end], parent.child(end).text!.length);
      if (samePath(parentPath, selection.endPath.slice(0, -1)) && selection.endPath.at(-1)! <= end) {
        return { selection: range, text: fragments(doc, range).map(value => value.text).join(''),
          href: String(mark.attrs.gitlabCanonicalSrc ?? mark.attrs.href ?? ''),
          displayHref: String(mark.attrs.href ?? ''), existing: true, mark };
      }
    }
    if (!allowCreate) return undefined;
    return { selection, text: fragments(doc, selection).map(value => value.text).join(''),
      href: '', displayHref: '', existing: false };
  } catch { return undefined; }
}

export function getGitLabLinkContext(editor: Editor): GitLabLinkContext | undefined {
  const value = target(editor, false);
  return value && Object.freeze({ selection: value.selection, text: value.text,
    href: value.href, displayHref: value.displayHref, existing: value.existing });
}

/** A form owns this bounded native bookmark until apply, cancel or disposal. */
export class GitLabLinkEditingSession {
  private options?: LinkEditingOptions;
  private readonly initial: LinkTarget;
  private range: Selection;
  private doc?: Node;
  private readonly fingerprint: string;
  private release?: () => void;
  private readonly cancel = new AbortController();
  private busy = false;
  private conflicted = false;
  private committing = false;

  constructor(options: LinkEditingOptions) {
    options.ensureReady();
    const value = target(options.editor, true);
    if (!value) throw new Error('GITLAB_LINK_TEXT_SELECTION_REQUIRED');
    if (value.text.length > 10_000) throw new Error('GITLAB_LINK_TEXT_TOO_LONG');
    this.options = options;
    this.initial = value;
    this.range = value.selection;
    this.doc = options.editor.state.doc;
    this.fingerprint = JSON.stringify(fragments(this.doc, this.range).map(node => node.toJSON()));
    this.release = options.editor.subscribe((state, transaction) => this.track(state.doc, transaction));
  }

  get snapshot(): GitLabLinkSnapshot {
    return Object.freeze({ selection: this.range, text: this.initial.text, href: this.initial.href,
      displayHref: this.initial.displayHref, existing: this.initial.existing,
      pending: this.busy, conflict: this.conflicted, closed: !this.options });
  }

  private track(doc: Node, transaction: Transaction): void {
    if (!transaction.docChanged || this.committing || this.conflicted || !this.doc) return;
    try {
      if (transaction.originalDoc !== this.doc || transaction.getMeta('content$replace') === true)
        throw new Error('GITLAB_LINK_TARGET_CHANGED');
      let from = textPointToPosition(this.doc, this.range.path, this.range.from);
      let to = textPointToPosition(this.doc, this.range.endPath, this.range.to);
      for (const map of transaction.mapping.maps) {
        for (let index = 0; index < map.ranges.length; index += 3) {
          const start = map.ranges[index]!, removed = map.ranges[index + 1]!;
          if (removed === 0 ? start >= from && start <= to
            : this.range.isCollapsed ? start <= from && start + removed >= from
              : start < to && start + removed > from) throw new Error('GITLAB_LINK_TARGET_CHANGED');
        }
        const collapsed = from === to;
        from = map.map(from, 1); to = collapsed ? from : map.map(to, -1);
      }
      const mapped = mapSelection(this.range, this.doc, doc, transaction.mapping);
      if (mapped.kind !== 'text' || JSON.stringify(fragments(doc, mapped).map(node => node.toJSON())) !== this.fingerprint)
        throw new Error('GITLAB_LINK_TARGET_CHANGED');
      this.range = mapped; this.doc = doc;
    } catch { this.conflicted = true; }
    this.notify();
  }

  private ready(): LinkEditingOptions {
    if (!this.options) throw new Error('GITLAB_LINK_SESSION_CLOSED');
    if (this.conflicted) throw new Error('GITLAB_LINK_TARGET_CHANGED');
    this.options.ensureReady();
    if (this.options.editor.state.doc !== this.doc) throw new Error('GITLAB_LINK_TARGET_CHANGED');
    return this.options;
  }

  async apply(values: { href: string; text: string }): Promise<{ status: 'applied' | 'superseded' }> {
    const options = this.ready();
    if (this.busy) throw new Error('GITLAB_LINK_BUSY');
    const href = typeof values.href === 'string' ? values.href.trim() : '';
    if (href.length > 2048 || !isSafeURL(href)) throw new Error('GITLAB_LINK_UNSAFE_URL');
    if (typeof values.text !== 'string' || values.text.length > 10_000) throw new Error('GITLAB_LINK_TEXT_TOO_LONG');
    const text = values.text || href;
    if (/[\r\n]/u.test(text) && this.range.path.some((_, index) =>
      ['table_cell', 'table_header'].includes(at(this.doc!, this.range.path.slice(0, index)).type.name)))
      throw new Error('GITLAB_LINK_TABLE_LINE_BREAK');
    if (this.initial.existing && href === this.initial.href && text === this.initial.text) {
      this.close(); return { status: 'applied' };
    }
    this.busy = true; this.notify();
    if (!this.options) return { status: 'superseded' };
    let onAbort!: () => void;
    const aborted = new Promise<undefined>(resolve => {
      onAbort = () => resolve(undefined);
      this.cancel.signal.addEventListener('abort', onAbort, { once: true });
      if (this.cancel.signal.aborted) onAbort();
    });
    try {
      const resolved = await Promise.race([options.resolveURL(href,this.cancel.signal,Boolean(this.initial.mark?.attrs.gitlabWikiLink)),aborted]);
      if (!this.options || resolved === undefined) return { status: 'superseded' };
      this.ready();
      const displayHref = typeof resolved === 'string' ? resolved : resolved.href;
      if (typeof displayHref !== 'string' || displayHref.length > 8192 || !isSafeURL(displayHref))
        throw new Error('GITLAB_LINK_UNSAFE_URL');
      closeHistory(options.editor);
      this.ready();
      const { editor } = options, range = this.range;
      const current = editor.state.selection;
      const ownsSelection = current.kind === 'text'
        && textPointToPosition(editor.state.doc, current.path, current.from) >= textPointToPosition(editor.state.doc, range.path, range.from)
        && textPointToPosition(editor.state.doc, current.endPath, current.to) <= textPointToPosition(editor.state.doc, range.endPath, range.to);
      const transaction = editor.createTransaction();
      let selected = range;
      if (text !== this.initial.text) {
        transaction.replaceTextRange(range.path, range.from, range.endPath, range.to, text);
        selected = Selection.range(range.path, range.from, range.path, range.from + text.length);
      }
      const landing = mapMarkRangeSelection(transaction.doc, selected.path, selected.from, selected.endPath, selected.to);
      const mark = editor.state.schema.mark('link', { ...this.initial.mark?.attrs,
        href: displayHref, gitlabCanonicalSrc: href, htmlHref: undefined,
        ...(typeof resolved === 'string' ? {} : {gitlabWikiLink:resolved.wikiKind}) });
      if (this.initial.existing) transaction.addMarkRange(selected.path, selected.from, selected.endPath, selected.to, mark);
      else transaction.step(new WrapLinkStep(selected, mark));
      transaction.setSelection(landing && ownsSelection
        ? Selection.cursor(landing.endPath, landing.endOffset) : transaction.selection);
      this.commit(transaction);
      this.close(); return { status: 'applied' };
    } finally {
      this.cancel.signal.removeEventListener('abort', onAbort);
      this.busy = false; this.notify();
    }
  }

  remove(): boolean {
    const { editor } = this.ready();
    if (this.busy) throw new Error('GITLAB_LINK_BUSY');
    if (!this.initial.existing) return false;
    closeHistory(editor);
    this.ready();
    const range = this.range, transaction = editor.createTransaction()
      .removeMarkRange(range.path, range.from, range.endPath, range.to, editor.state.schema.marks.link!);
    transaction.setSelection(transaction.selection);
    this.commit(transaction);
    this.close(); return true;
  }

  private commit(transaction: Transaction): void {
    const options = this.ready();
    options.editor.state.schema.validate(transaction.doc);
    this.committing = true;
    try {
      const accepted = options.editor.runCommandBatch(() => {
        this.ready();
        if (transaction.originalDoc !== options.editor.state.doc) throw new Error('GITLAB_LINK_TARGET_CHANGED');
        if (!options.editor.dispatch(transaction)) return false;
        options.validate(options.editor.state.doc);
        return true;
      });
      if (!accepted) throw new Error('GITLAB_LINK_UPDATE_REFUSED');
    } finally { this.committing = false; }
  }

  private notify(): void {
    try { this.options?.changed?.(this.snapshot); }
    catch (error) { try { this.options?.onListenerError?.(error); } catch { /* Observers cannot change the command outcome. */ } }
  }

  close(): void {
    if (!this.options) return;
    this.cancel.abort(); this.release?.(); this.release = undefined; this.doc = undefined;
    const options = this.options;
    this.options = undefined; this.busy = false;
    try { options.changed?.(this.snapshot); } catch (error) { try { options.onListenerError?.(error); } catch { /* Isolate host observers. */ } }
    try { options.closed?.(); } catch (error) { try { options.onListenerError?.(error); } catch { /* Isolate host observers. */ } }
  }
}
