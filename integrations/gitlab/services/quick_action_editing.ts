import { Plugin, PluginKey, ReplaceDocumentStep, Selection, Step, closeHistory, nodeRangeAtPath,
  type Editor, type EditorState, type Node } from 'fountainjs-editor';
import { SuggestionController, findSuggestionMatch, handleSuggestionKeyDown,
  type SuggestionMatch, type SuggestionPluginState } from 'fountainjs-editor/document-utilities';
import { gitlabQuickActionText, serializeGitLabQuickAction } from './quick_actions';

export interface GitLabQuickActionCommand {
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly description: string;
  readonly warning: string;
  readonly aliases: readonly string[];
  readonly params: readonly string[];
}
export type GitLabQuickActionProvider = (context: { query: string; signal: AbortSignal }) => Promise<readonly GitLabQuickActionCommand[]>;
export interface GitLabQuickActionContext { readonly path: readonly number[]; readonly source: string; readonly literal: boolean; readonly node: Node }
export interface GitLabQuickActionPreview {
  readonly context: GitLabQuickActionContext | null;
  readonly status: 'closed' | 'literal' | 'loading' | 'ready' | 'error';
  readonly explanation: string;
}

const commandName = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z\d_-]{0,79}$/u.test(value);
const short = (value: unknown): value is string => typeof value === 'string' && value.length <= 4096 && !value.includes('\0');
/** The host owns transport; this boundary validates actual GitLab records. */
export function parseGitLabQuickActionCommands(value: unknown): readonly GitLabQuickActionCommand[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('GITLAB_QUICK_ACTION_RESPONSE_INVALID');
  const names = new Set<string>();
  return Object.freeze(value.map(record => {
    if (!record || typeof record !== 'object' || !commandName(record.name) || names.has(record.name)
      || !short(record.description) || !short(record.warning ?? '')
      || !Array.isArray(record.aliases) || record.aliases.length > 50 || !record.aliases.every(commandName)
      || !Array.isArray(record.params) || record.params.length > 20 || !record.params.every(short))
      throw new Error('GITLAB_QUICK_ACTION_RESPONSE_INVALID');
    names.add(record.name);
    return Object.freeze({ id: record.name, label: '/' + record.name, name: record.name,
      description: record.description, warning: record.warning ?? '',
      aliases: Object.freeze([...record.aliases]), params: Object.freeze([...record.params]) });
  }));
}

export function filterGitLabQuickActionCommands(items: readonly GitLabQuickActionCommand[], query: string): readonly GitLabQuickActionCommand[] {
  const needle = query.toLowerCase();
  const score = (item: GitLabQuickActionCommand) => item.name.startsWith(needle) ? 0
    : item.aliases.some(alias => alias.startsWith(needle)) ? 1 : 2;
  return items.filter(item => item.name.includes(needle) || item.aliases.some(alias => alias.includes(needle)))
    .sort((left, right) => score(left) - score(right) || left.name.localeCompare(right.name));
}

export function getGitLabQuickActionContext(editor: Pick<Editor, 'state'>): GitLabQuickActionContext | undefined {
  const { selection, doc } = editor.state;
  if (selection.kind !== 'text' && selection.kind !== 'node') return undefined;
  const path = selection.kind === 'node' ? selection.nodePath : selection.path;
  if (selection.kind === 'text' && selection.endPath[0] !== path[0] || !path.length) return undefined;
  const node = doc.content[path[0]!];
  if (!node || node.type.name !== 'paragraph') return undefined;
  const source = gitlabQuickActionText(node);
  if (source !== '/' && !/^\/[a-z][a-z\d_-]*(?:[\t ]|$)/iu.test(source) || /[\r\n]/u.test(source)) return undefined;
  if (node.content.some(child => !child.isText && child.type.name !== 'gitlab_reference')) return undefined;
  return Object.freeze({ path: Object.freeze([path[0]!]), source, node,
    literal: Boolean(node.attrs.gitlabLiteralSlash || source !== '/' && serializeGitLabQuickAction(node) === undefined) });
}

function matchQuickAction(state: EditorState): SuggestionMatch | null {
  const context = getGitLabQuickActionContext({ state });
  if (!context || context.literal) return null;
  const match = findSuggestionMatch(state, [{ char: '/', startOfLine: true }]);
  return match && match.range.path.length === 2 && match.range.path[1] === 0 && /^[a-z\d_-]*$/iu.test(match.query) ? match : null;
}

export function createGitLabQuickActionPlugin(editing: () => GitLabQuickActionEditing | undefined): Plugin<SuggestionPluginState> {
  return new Plugin({ key: new PluginKey<SuggestionPluginState>('gitlabQuickActions'), state: {
    init: () => ({ match: null }),
    apply: (_transaction, _value, _oldState, state) => ({ match: editing()?.enabled ? matchQuickAction(state) : null }),
  }, props: { handleKeyDown: (editor, event) => {
    const service = editing();
    if (!editor.editable || !service?.enabled) return false;
    const handled = handleSuggestionKeyDown(service.suggestions, event);
    if (handled) event.stopPropagation(); // Escape belongs to this popup, not the GitLab form.
    return handled;
  } } });
}

interface QuickActionEditingOptions {
  editor: Editor;
  key: PluginKey<SuggestionPluginState>;
  provider?: GitLabQuickActionProvider;
  ensureReady(): void;
  validate(document: Node): void;
  explain(source: string): Promise<string>;
  onListenerError?(error: unknown): void;
}

/** Changing interpretation/marks changes no text positions or reference IDs. */
class QuickActionInterpretationStep extends Step {
  constructor(private readonly context: GitLabQuickActionContext, private readonly literal: boolean) { super(); }
  apply(document: Node): Node {
    const index = this.context.path[0]!, current = document.child(index);
    if (current !== this.context.node) throw new Error('GITLAB_QUICK_ACTION_TARGET_CHANGED');
    const node = current.withAttrs({ ...current.attrs, gitlabLiteralSlash: this.literal });
    return document.copy(document.content.map((child, position) => position === index
      ? node.copy(this.literal ? current.content : current.content.map(value => value.withMarks([]))) : child));
  }
}

/** Source editing and async UI state without DOM nodes or GitLab transport. */
export class GitLabQuickActionEditing {
  readonly enabled: boolean;
  readonly suggestions?: SuggestionController<GitLabQuickActionCommand>;
  private readonly release: () => void;
  private readonly listeners = new Set<(value: GitLabQuickActionPreview) => void>();
  private preview: GitLabQuickActionPreview = Object.freeze({ context: null, status: 'closed', explanation: '' });
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private destroyed = false;

  constructor(private readonly options: QuickActionEditingOptions) {
    this.enabled = Boolean(options.provider);
    if (options.provider) this.suggestions = new SuggestionController(options.editor, options.key,
      async ({ match, signal }) => {
        // Debounce transport; the public controller cancels old requests/results.
        await new Promise<void>((resolve, reject) => {
          const cancel = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
          const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, 150);
          if (signal.aborted) cancel(); else signal.addEventListener('abort', cancel, { once: true });
        });
        return filterGitLabQuickActionCommands(await options.provider!({ query: match.query, signal }), match.query);
      }, (_editor, item, match) => this.applySuggestion(item, match), 100);
    this.release = options.editor.subscribe((_state, transaction) => {
      const replacement = transaction.getMeta('content$replace') === true || transaction.steps.some(step => step instanceof ReplaceDocumentStep);
      if (replacement || !options.editor.editable) this.suggestions?.dismiss();
      this.refresh(replacement);
    });
  }
  getSnapshot = (): GitLabQuickActionPreview => this.preview;
  subscribe = (listener: (value: GitLabQuickActionPreview) => void): (() => void) => {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  };
  private commit(execute: () => boolean): boolean {
    this.options.ensureReady(); closeHistory(this.options.editor);
    return this.options.editor.runCommandBatch(() => {
      this.options.ensureReady();
      if (!execute()) return false;
      this.options.validate(this.options.editor.state.doc); return true;
    });
  }
  insert(): boolean {
    if (!this.enabled) return false;
    const { editor } = this.options;
    return this.commit(() => {
      const { doc, schema, selection } = editor.state;
      let index = selection.path[0] ?? doc.childCount - 1;
      if (index < 0) index = doc.childCount - 1;
      const current = doc.content[index];
      const node = schema.node('paragraph', {}, [schema.text('/')]);
      const transaction = editor.createTransaction();
      if (selection.kind === 'gap') {
        const boundary = doc.content.findIndex((_value, position) => nodeRangeAtPath(doc, [position]).from === selection.position);
        const owner = doc.content.findIndex((_value, position) => nodeRangeAtPath(doc, [position]).to >= selection.position);
        index = boundary >= 0 ? boundary : owner >= 0 ? owner + 1 : doc.childCount;
        transaction.replace(index, index, [node]);
      } else if (current?.type.name === 'paragraph' && !current.textContent && !current.content.some(child => !child.isText))
        transaction.replaceNode([index], [node]);
      else { index++; transaction.replace(index, index, [node]); }
      return editor.dispatch(transaction.setSelection(Selection.cursor([index, 0], 1)).setStoredMarks([]));
    });
  }
  setLiteral(literal: boolean): boolean {
    if (!this.enabled) return false;
    const { editor } = this.options, context = getGitLabQuickActionContext(editor);
    if (!context) return false;
    return this.commit(() => {
      return editor.dispatch(editor.createTransaction().step(new QuickActionInterpretationStep(context, literal)).setStoredMarks([]));
    });
  }
  accept(item: GitLabQuickActionCommand): boolean {
    const index = this.suggestions?.getSnapshot().items.indexOf(item) ?? -1;
    return index >= 0 && Boolean(this.suggestions?.accept(index));
  }
  private applySuggestion(item: GitLabQuickActionCommand, match: SuggestionMatch): boolean {
    const { editor } = this.options, context = getGitLabQuickActionContext(editor);
    if (!context || context.literal || !commandName(item.name) || matchQuickAction(editor.state)?.text !== match.text
      || editor.state.selection.path.join('.') !== match.range.path.join('.')) return false;
    return this.commit(() => {
      if (editor.state.doc.child(context.path[0]!) !== context.node) throw new Error('GITLAB_QUICK_ACTION_TARGET_CHANGED');
      const prefix = context.node.child(0), end = prefix.text?.match(/^\/[a-z\d_-]*/iu)?.[0].length ?? 1;
      const remaining = (prefix.text ?? '').slice(end);
      const text = '/' + item.name + ' ';
      const transaction = editor.createTransaction().replaceText(match.range.path, 0, end + (remaining.startsWith(' ') ? 1 : 0), text);
      return editor.dispatch(transaction.setSelection(Selection.cursor(match.range.path, text.length)).setStoredMarks([]));
    });
  }
  retryPreview(): void { this.refresh(true); }
  private refresh(force = false): void {
    if (this.destroyed) return;
    const context = this.enabled && this.options.editor.editable ? getGitLabQuickActionContext(this.options.editor) : undefined;
    if (!force && context?.node === this.preview.context?.node && context?.path.join('.') === this.preview.context?.path.join('.')) return;
    const generation = ++this.generation; clearTimeout(this.timer);
    if (!context) { this.publish({ context: null, status: 'closed', explanation: '' }); return; }
    if (context.literal) { this.publish({ context, status: 'literal', explanation: '' }); return; }
    if (context.source === '/') { this.publish({ context, status: 'ready', explanation: '' }); return; }
    this.publish({ context, status: 'loading', explanation: '' });
    this.timer = setTimeout(() => {
      void this.options.explain(context.source).then(explanation => {
        if (!this.destroyed && generation === this.generation) this.publish({ context, status: 'ready', explanation });
      }).catch(() => {
        if (!this.destroyed && generation === this.generation) this.publish({ context, status: 'error', explanation: '' });
      });
    }, 200);
  }
  private publish(value: GitLabQuickActionPreview): void {
    this.preview = Object.freeze(value);
    for (const listener of this.listeners) {
      try { listener(this.preview); } catch (error) { this.options.onListenerError?.(error); }
    }
  }
  destroy(): void {
    this.destroyed = true; this.generation++; clearTimeout(this.timer);
    this.release(); this.suggestions?.destroy(); this.listeners.clear();
  }
}
