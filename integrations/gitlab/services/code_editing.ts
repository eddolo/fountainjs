import { NodeSelection, Selection, Step, closeHistory, mapSelection, removeNode, setBlockType,
  type Editor, type Node, type Transaction } from 'fountainjs-editor';
import { changeGitLabFrontmatterLanguage, getGitLabFrontmatter, type GitLabFrontmatter } from './frontmatter';

export interface GitLabCodeContext {
  readonly path: readonly number[];
  readonly text: string;
  readonly language: string;
  readonly frontmatter?: 'header' | 'fence';
}
interface CodeEditingOptions {
  editor: Editor;
  ensureReady(): void;
  validate(doc: Node): void;
  closed?(): void;
  onListenerError?(error: unknown): void;
}
const at = (doc: Node, path: readonly number[]): Node => path.reduce((node, index) => node.child(index), doc);
const inside = (path: readonly number[], parent: readonly number[]): boolean =>
  path.length >= parent.length && parent.every((part, index) => path[index] === part);

/** Removing mark metadata changes no source characters or model positions. */
class PlainGitLabCodeStep extends Step {
  private readonly targets: ReadonlySet<string>;
  constructor(paths: readonly (readonly number[])[]) {
    super(); this.targets = new Set(paths.map(path => path.join('.')));
  }
  apply(doc: Node): Node {
    const rewrite = (node: Node, path: readonly number[]): Node => {
      if (this.targets.has(path.join('.'))) {
        if (node.type.name !== 'code_block' || node.content.some(child => !child.isText)) throw new Error('GITLAB_CODE_TARGET_CHANGED');
        return node.content.some(child => child.marks.length) ? node.copy(node.content.map(child => child.withMarks([]))) : node;
      }
      const content = node.content.map((child, index) => rewrite(child, [...path, index]));
      return content.every((child, index) => child === node.child(index)) ? node : node.copy(content);
    };
    return rewrite(doc, []);
  }
}

/** Explicit conversion to GitLab fenced source clears prose marks atomically. */
export function setGitLabCodeBlock(editor: Editor, input: string, validate: (doc: Node) => void): boolean {
  if (!editor.editable) return false;
  if (typeof input !== 'string' || !/^[A-Za-z0-9_+.#-]{1,80}$/u.test(input.trim())) throw new Error('GITLAB_CODE_INVALID_LANGUAGE');
  const language = input.trim().toLowerCase();
  if (['glql', 'suggestion', 'math'].includes(language)) throw new Error('GITLAB_CODE_SPECIALIZED_LANGUAGE');
  const existing = new Set<Node>();
  editor.state.doc.descendants(node => { if (node.type.name === 'code_block') existing.add(node); });
  closeHistory(editor);
  return editor.runCommandBatch(() => {
    if (!setBlockType(editor, 'code_block', { language })) return false;
    const paths: number[][] = [];
    editor.state.doc.descendants((node, path) => { if (node.type.name === 'code_block' && !existing.has(node)) paths.push(path); });
    if (!paths.length) return false;
    const transaction = editor.createTransaction().step(new PlainGitLabCodeStep(paths)).setStoredMarks([]);
    if (!editor.dispatch(transaction)) return false;
    validate(editor.state.doc);
    return true;
  });
}

export function getGitLabCodeContext(editor: Editor): GitLabCodeContext | undefined {
  const { doc, selection } = editor.state;
  if (selection.kind !== 'text' && selection.kind !== 'node') return undefined;
  const origin = selection instanceof NodeSelection ? selection.nodePath : selection.path;
  try {
    for (let length = origin.length; length > 0; length--) {
      const path = origin.slice(0, length), node = at(doc, path);
      if (node.type.name !== 'code_block') continue;
      if (!inside(selection.endPath, path) || node.content.some(child => !child.isText)) return undefined;
      return Object.freeze({ path: Object.freeze(path), text: node.textContent,
        language: String(node.attrs.language), ...(getGitLabFrontmatter(node) ? { frontmatter: getGitLabFrontmatter(node)!.kind } : {}) });
    }
  } catch { return undefined; }
  return undefined;
}

/** Document-level insertion is explicit: a header never replaces selected prose. */
export function insertGitLabFrontmatter(editor: Editor, language: string, validate: (doc: Node) => void): boolean {
  if (!editor.editable) return false;
  const delimiter = ({ yaml: '---', toml: '+++', json: ';;;' } as Record<string, string>)[language];
  if (!delimiter) throw new Error('GITLAB_FRONTMATTER_LANGUAGE');
  let exists = false;
  editor.state.doc.descendants(node => { if (getGitLabFrontmatter(node)?.kind === 'header') exists = true; });
  if (exists) throw new Error('GITLAB_FRONTMATTER_EXISTS');
  const metadata: GitLabFrontmatter = { kind: 'header', prefix: '', opening: delimiter, closing: delimiter,
    newline: '\n', blankLine: false };
  closeHistory(editor);
  return editor.runCommandBatch(() => {
    const { schema, doc } = editor.state;
    const header = schema.node('code_block', { language, gitlabFrontmatter: metadata }, [schema.text('')]);
    const transaction = editor.createTransaction().replaceNode([0], [header, doc.child(0)])
      .setSelection(Selection.cursor([0, 0], 0)).setStoredMarks([]);
    if (!editor.dispatch(transaction)) return false;
    validate(editor.state.doc); return true;
  });
}

/** A form owns one captured block; later selection changes cannot redirect it. */
export class GitLabCodeEditingSession {
  private options?: CodeEditingOptions;
  private doc?: Node;
  private node?: Node;
  private selected: NodeSelection;
  private release?: () => void;
  private conflicted = false;
  private committing = false;
  readonly initial: GitLabCodeContext;

  constructor(options: CodeEditingOptions) {
    options.ensureReady();
    const context = getGitLabCodeContext(options.editor);
    if (!context) throw new Error('GITLAB_CODE_SELECTION_REQUIRED');
    this.initial = context; this.options = options;
    this.doc = options.editor.state.doc; this.node = at(this.doc, context.path);
    this.selected = new NodeSelection(this.doc, context.path);
    this.release = options.editor.subscribe((state, transaction) => this.track(state.doc, transaction));
  }

  get conflict(): boolean { return this.conflicted; }
  get closed(): boolean { return !this.options; }

  private track(doc: Node, transaction: Transaction): void {
    if (!transaction.docChanged || this.committing || this.conflicted || !this.doc) return;
    try {
      if (transaction.originalDoc !== this.doc || transaction.getMeta('content$replace')) throw new Error();
      const mapped = mapSelection(this.selected, this.doc, doc, transaction.mapping);
      if (!(mapped instanceof NodeSelection) || at(doc, mapped.nodePath) !== this.node) throw new Error();
      this.selected = mapped; this.doc = doc;
    } catch { this.conflicted = true; }
  }

  private ready(): CodeEditingOptions {
    if (!this.options) throw new Error('GITLAB_CODE_SESSION_CLOSED');
    this.options.ensureReady();
    if (this.conflicted || this.options.editor.state.doc !== this.doc) throw new Error('GITLAB_CODE_TARGET_CHANGED');
    return this.options;
  }

  applyLanguage(input: string): boolean {
    const { editor } = this.ready();
    if (typeof input !== 'string' || !/^[A-Za-z0-9_+.#-]{1,80}$/u.test(input.trim()))
      throw new Error('GITLAB_CODE_INVALID_LANGUAGE');
    const language = input.trim().toLowerCase();
    if (input.trim() === this.initial.language) { this.close(); return true; }
    if (['glql', 'suggestion', 'math'].includes(language))
      throw new Error('GITLAB_CODE_SPECIALIZED_LANGUAGE');
    if (language === this.initial.language) { this.close(); return true; }
    const metadata = getGitLabFrontmatter(this.node!);
    const gitlabFrontmatter = metadata ? changeGitLabFrontmatterLanguage(metadata, language) : null;
    closeHistory(editor); this.ready();
    const transaction = editor.createTransaction().setNodeAttrs(this.selected.nodePath, { ...this.node!.attrs, language, gitlabFrontmatter });
    this.commit(() => editor.dispatch(transaction));
    this.close(); return true;
  }

  applySource(input: string): boolean {
    const { editor } = this.ready();
    if (typeof input !== 'string') throw new Error('GITLAB_CODE_INVALID_SOURCE');
    if (input === this.initial.text) { this.close(); return true; }
    closeHistory(editor); this.ready();
    const content = [editor.state.schema.text(input)];
    const transaction = editor.createTransaction().replaceNode(this.selected.nodePath, [this.node!.copy(content)]);
    this.commit(() => editor.dispatch(transaction));
    this.close(); return true;
  }

  convertToCode(input = this.initial.language): boolean {
    const { editor } = this.ready();
    if (!this.node!.attrs.gitlabFrontmatter) return this.applyLanguage(input);
    if (typeof input !== 'string' || !/^[A-Za-z0-9_+.#-]{1,80}$/u.test(input.trim()))
      throw new Error('GITLAB_CODE_INVALID_LANGUAGE');
    const language = input.trim().toLowerCase();
    if (['glql', 'suggestion', 'math'].includes(language)) throw new Error('GITLAB_CODE_SPECIALIZED_LANGUAGE');
    closeHistory(editor); this.ready();
    const transaction = editor.createTransaction().setNodeAttrs(this.selected.nodePath,
      { ...this.node!.attrs, language, gitlabFrontmatter: null });
    this.commit(() => editor.dispatch(transaction));
    this.close(); return true;
  }

  remove(): boolean {
    const { editor } = this.ready();
    closeHistory(editor); this.ready();
    this.commit(() => removeNode(editor, this.selected.nodePath));
    this.close(); return true;
  }

  private commit(execute: () => boolean): void {
    const options = this.ready();
    this.committing = true;
    try {
      const accepted = options.editor.runCommandBatch(() => {
        this.ready();
        const before = options.editor.state.doc;
        if (!execute() || options.editor.state.doc === before) return false;
        options.validate(options.editor.state.doc);
        return true;
      });
      if (!accepted) throw new Error('GITLAB_CODE_UPDATE_REFUSED');
    } finally { this.committing = false; }
  }

  close(): void {
    const options = this.options;
    if (!options) return;
    this.release?.(); this.release = undefined;
    this.options = undefined; this.doc = undefined; this.node = undefined;
    try { options.closed?.(); }
    catch (error) { try { options.onListenerError?.(error); } catch { /* Closing observers cannot reverse a committed edit. */ } }
  }
}
