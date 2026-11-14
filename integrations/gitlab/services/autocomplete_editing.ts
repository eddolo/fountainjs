import { Plugin, PluginKey, ReplaceDocumentStep, Selection, StepMap, closeHistory, mapSelection,
  selectionAtPosition, textPointToPosition, type AnySelection, type Editor, type EditorState, type Mark, type Node } from 'fountainjs-editor';
import { SuggestionController, findSuggestionMatch, handleSuggestionKeyDown, insertInlineAtom, suggestionDecorations,
  type SuggestionMatch, type SuggestionPluginState } from 'fountainjs-editor/document-utilities';
import { getGitLabQuickActionContext } from './quick_action_editing';
import { gitLabAutocompleteTriggers, type GitLabAutocompleteItem, type GitLabAutocompleteKind, type GitLabAutocompleteProvider } from './autocomplete_data';
import type { GitLabInsertionProjection } from './markdown_insertion';
import type { SerializedContentResult } from './serialized_content';

export interface GitLabAutocompleteMatch extends SuggestionMatch { readonly kind: GitLabAutocompleteKind; readonly command: string }
const at = (doc: Node, path: readonly number[]): Node => path.reduce((node, index) => node.child(index), doc);

export function findGitLabAutocompleteMatch(state: EditorState, commandsEnabled = true): GitLabAutocompleteMatch | null {
  const { selection, doc } = state;
  if (!(selection instanceof Selection) || !selection.isCollapsed) return null;
  for (let depth = 1; depth <= selection.path.length; depth++) {
    const node = at(doc, selection.path.slice(0, depth));
    if (node.type.spec.code || /^(math|gitlab_frontmatter)/u.test(node.type.name)
      || node.marks.some(mark => ['code', 'link'].includes(mark.type.name))) return null;
  }
  const context = getGitLabQuickActionContext({ state });
  const command = commandsEnabled && context && !context.literal ? context.source.match(/^\/[a-z][a-z\d_-]*/iu)?.[0].toLowerCase() ?? '' : '';
  const triggers = Object.keys(gitLabAutocompleteTriggers)
    // Gollum links need their own source/reader boundary before native insertion.
    .filter(char => char !== '[[').map(char => ({ char, allowSpaces: true }));
  if (['/status', '/type'].includes(command)) triggers.push({ char: '"', allowSpaces: true });
  const match = findSuggestionMatch(state, triggers);
  if (!match || /^\s/u.test(match.query) || match.query.length > 4096 || match.trigger === '"' && match.query.includes('"')) return null;
  const endPath = match.range.endPath ?? match.range.path;
  const parent = at(doc, match.range.path.slice(0, -1));
  if (parent.content.slice(match.range.path.at(-1)!, endPath.at(-1)! + 1)
    .some(node => node.marks.some(mark => ['code', 'link'].includes(mark.type.name)))) return null;
  const kind = match.trigger === '"' ? command === '/status' ? 'status' : 'type' : gitLabAutocompleteTriggers[match.trigger];
  return Object.freeze({ ...match, kind, command });
}

/** Forward expansion consumes only text that actually matches the chosen source. */
export function gitLabAutocompleteTarget(state: EditorState, match: SuggestionMatch, source: string): Selection {
  const { path, from, to } = match.range, endPath = match.range.endPath ?? path;
  const parentPath = path.slice(0, -1), parent = at(state.doc, parentPath);
  let value = '', final = path.at(-1)!;
  while (final < parent.childCount && parent.child(final).isText) value += parent.child(final++).text ?? '';
  const afterStart = value.slice(from);
  let common = 0;
  while (common < source.length && afterStart[common] === source[common]) common++;
  let length = Math.max(match.text.length, common), index = path.at(-1)!, offset = from + length;
  while (index < final - 1 && offset > parent.child(index).text!.length) { offset -= parent.child(index).text!.length; index++; }
  if (index >= final || offset > parent.child(index).text!.length)
    return Selection.range(path, from, endPath, to);
  return Selection.range(path, from, [...parentPath, index], offset);
}

function mentionedUsers(document: Node): readonly string[] {
  const names = new Set<string>();
  document.descendants(node => {
    if (node.type.name === 'gitlab_reference' && node.attrs.referenceType === 'user'
      && typeof node.attrs.original === 'string' && node.attrs.original.startsWith('@')) names.add(node.attrs.original.slice(1).toLowerCase());
  });
  return [...names];
}

export function createGitLabAutocompletePlugin(service: () => GitLabAutocompleteEditing | undefined): Plugin<SuggestionPluginState> {
  const key = new PluginKey<SuggestionPluginState>('gitlabAutocomplete');
  return new Plugin({ key, state: { init: () => ({ match: null }),
    apply: (_transaction, _value, _old, state) => ({ match: service()?.enabled ? service()!.match(state) : null }) },
    props: { decorations: state => suggestionDecorations(state, key), handleKeyDown: (editor, event) => {
      if (!editor.editable) return false;
      const handled = handleSuggestionKeyDown(service()?.suggestions, event);
      if (handled) event.stopPropagation(); return handled;
    } } });
}

interface Options {
  editor: Editor;
  key: PluginKey<SuggestionPluginState>;
  provider?: GitLabAutocompleteProvider;
  commandsEnabled?: boolean;
  ensureReady(): void;
  validate(document: Node): void;
  insert(source: string, projection: GitLabInsertionProjection): Promise<SerializedContentResult>;
  onError?(error: unknown): void;
}

function replaceText(editor: Editor, target: Selection, text: string, marks: readonly Mark[] = []): boolean {
  const before = editor.state.doc, current = editor.state.selection;
  const start = textPointToPosition(before, target.path, target.from);
  const transaction = editor.createTransaction().replaceTextRange(target.path, target.from, target.endPath, target.to, text + ' ');
  const span = (length: number): Selection => {
    const from = selectionAtPosition(transaction.doc, start), to = selectionAtPosition(transaction.doc, start + length);
    if (!(from instanceof Selection) || !(to instanceof Selection)) throw new Error('GITLAB_AUTOCOMPLETE_TARGET_CHANGED');
    return Selection.range(from.path, from.from, to.path, to.from);
  };
  for (const mark of Object.values(editor.state.schema.marks)) {
    const range = span(text.length + 1);
    transaction.removeMarkRange(range.path, range.from, range.endPath, range.to, mark);
  }
  for (const mark of marks) {
    const range = span(text.length);
    transaction.addMarkRange(range.path, range.from, range.endPath, range.to, mark);
  }
  transaction.setSelection(mapSelection(current, before, transaction.doc, transaction.mapping)).setStoredMarks([]);
  return editor.dispatch(transaction);
}

/** Native model/controller; host transport and popup layout stay outside it. */
export class GitLabAutocompleteEditing {
  readonly enabled: boolean;
  readonly suggestions?: SuggestionController<GitLabAutocompleteItem>;
  private readonly release: () => void;
  private requestKey = '';
  private destroyed = false;
  match(state: EditorState): GitLabAutocompleteMatch | null { return findGitLabAutocompleteMatch(state, Boolean(this.options.commandsEnabled)); }
  constructor(private readonly options: Options) {
    const { editor } = options; this.enabled = Boolean(options.provider);
    if (options.provider) this.suggestions = new SuggestionController(editor, options.key,
      async ({ match, signal }) => {
        await new Promise<void>((resolve, reject) => {
          const cancel = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
          const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, 150);
          if (signal.aborted) cancel(); else signal.addEventListener('abort', cancel, { once: true });
        });
        options.ensureReady(); const reference = this.match(editor.state);
        if (!reference || reference.text !== match.text) return [];
        const query = ['label', 'milestone'].includes(reference.kind) ? match.query.replace(/^"/u, '').replace(/"$/u, '') : match.query;
        return options.provider!({ kind: reference.kind, command: reference.command, query, signal,
          prioritizeUsernames: reference.kind === 'user' && reference.command ? mentionedUsers(editor.state.doc) : [] });
      }, (_editor, item, match) => this.apply(item, match), 100);
    this.release = editor.subscribe((state, transaction) => {
      if (!this.enabled) return;
      if (transaction.getMeta('content$replace') || transaction.steps.some(step => step instanceof ReplaceDocumentStep) || !editor.editable) {
        this.suggestions?.dismiss(); this.requestKey = ''; return;
      }
      const match = this.match(state);
      const key = match ? `${match.kind}:${match.command}:${match.kind === 'user' && match.command ? mentionedUsers(state.doc).join(',') : ''}` : '';
      if (this.requestKey && key !== this.requestKey) this.suggestions?.invalidate();
      this.requestKey = key;
    });
  }
  accept(item: GitLabAutocompleteItem): boolean {
    const index = this.suggestions?.getSnapshot().items.indexOf(item) ?? -1;
    return index >= 0 && Boolean(this.suggestions?.accept(index));
  }
  private apply(item: GitLabAutocompleteItem, match: SuggestionMatch): boolean {
    const { editor } = this.options, current = this.match(editor.state);
    if (!current || current.kind !== item.kind || current.text !== match.text) return false;
    this.options.ensureReady();
    const target = gitLabAutocompleteTarget(editor.state, match, item.source);
    if (['status', 'type'].includes(item.kind)) {
      closeHistory(editor);
      return editor.runCommandBatch(() => {
        if (!replaceText(editor, target, item.source)) return false;
        this.options.validate(editor.state.doc); return true;
      });
    }
    const operation = this.options.insert(item.source, { selection: target, project: document => {
      const block = document.content[0], node = block?.content[0];
      if (document.childCount !== 1 || block?.type.name !== 'paragraph' || block.childCount !== 1
        || node?.type.name !== 'gitlab_reference' || node.attrs.original !== item.source
        || !node.attrs.label || !node.attrs.href) throw new Error('GITLAB_AUTOCOMPLETE_REFERENCE_UNRESOLVED');
      const kinds = ['issue_alternative', 'work_item'].includes(item.kind) ? ['issue', 'issue_alternative', 'work_item']
        : item.kind === 'epic_alternative' ? ['epic', 'epic_alternative'] : [item.kind];
      if (!kinds.includes(String(node.attrs.referenceType))) throw new Error('GITLAB_AUTOCOMPLETE_REFERENCE_MISMATCH');
      return document;
    }, apply: (document, mapped) => {
      if (!(mapped instanceof Selection)) throw new Error('GITLAB_AUTOCOMPLETE_TARGET_CHANGED');
      const before = editor.state.doc, selection = editor.state.selection, node = document.child(0).child(0);
      const start = textPointToPosition(before, mapped.path, mapped.from), end = textPointToPosition(before, mapped.endPath, mapped.to);
      if (!insertInlineAtom(editor, node, { path: mapped.path, from: mapped.from, endPath: mapped.endPath, to: mapped.to }, ' ')) return false;
      const landing = selection.kind === 'text' && selection.isCollapsed && textPointToPosition(before, selection.path, selection.from) === end;
      if (!landing) editor.dispatch(editor.createTransaction().setSelection(mapSelection(selection, before, editor.state.doc,
        new StepMap([start, end - start, node.nodeSize + 1]))));
      return true;
    } });
    this.suggestions?.dismiss();
    void operation.catch(error => { if (!this.destroyed) this.options.onError?.(error); });
    return true;
  }
  destroy(): void { this.destroyed = true; this.release(); this.suggestions?.destroy(); }
}
