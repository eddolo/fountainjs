import { NodeSelection, Plugin, Selection, closeHistory, insertNode, insertText, removeNode,
  type Editor, type Node } from 'fountainjs-editor';
import { isGitLabAlertType, type GitLabAlertType } from './alerts';

const at = (doc: Node, path: readonly number[]): Node => path.reduce((node, index) => node.child(index), doc);
const inside = (path: readonly number[], parent: readonly number[]): boolean => parent.every((part, index) => path[index] === part);
export interface GitLabAlertContext {
  readonly path: readonly number[];
  readonly kind: GitLabAlertType;
  readonly inTitle: boolean;
}
export function getGitLabAlertContext(editor: Editor): GitLabAlertContext | undefined {
  const { doc, selection } = editor.state;
  if (!['text', 'node'].includes(selection.kind)) return undefined;
  const origin = selection instanceof NodeSelection ? selection.nodePath : selection.path;
  try {
    for (let length = origin.length; length; length--) {
      const path = origin.slice(0, length), node = at(doc, path);
      if (node.type.name !== 'gitlab_alert' || !isGitLabAlertType(node.attrs.kind)) continue;
      if (!inside(selection.endPath, path)) continue;
      return Object.freeze({ path: Object.freeze(path), kind: node.attrs.kind,
        inTitle: selection.kind === 'text' && inside(selection.path, [...path, 0]) && inside(selection.endPath, [...path, 0]) });
    }
  } catch { return undefined; }
  return undefined;
}
interface AlertEditingOptions {
  editor: Editor;
  ensureReady(): void;
  validate(doc: Node): void;
  onError(error: unknown): void;
}
export class GitLabAlertEditing {
  constructor(private readonly options: AlertEditingOptions) {}
  private commit(execute: () => boolean, history = true): boolean {
    const { editor, ensureReady, validate } = this.options;
    ensureReady(); if (history) closeHistory(editor); ensureReady();
    const accepted = editor.runCommandBatch(() => {
      ensureReady();
      if (!execute()) return false;
      validate(editor.state.doc); return true;
    });
    if (!accepted) throw new Error('GITLAB_ALERT_UPDATE_REFUSED');
    return true;
  }
  private context(): GitLabAlertContext {
    this.options.ensureReady();
    const context = getGitLabAlertContext(this.options.editor);
    if (!context) throw new Error('GITLAB_ALERT_SELECTION_REQUIRED');
    return context;
  }
  setKind(kind: string): boolean {
    if (!isGitLabAlertType(kind)) throw new Error('GITLAB_ALERT_INVALID_KIND');
    const context = this.context(), { editor } = this.options;
    if (context.kind === kind) return true;
    return this.commit(() => editor.dispatch(editor.createTransaction().setNodeAttrs(context.path,
      { ...at(editor.state.doc, context.path).attrs, kind })));
  }
  insert(kind: string = 'note'): boolean {
    if (!isGitLabAlertType(kind)) throw new Error('GITLAB_ALERT_INVALID_KIND');
    const { editor } = this.options;
    return this.commit(() => {
      const { schema } = editor.state;
      const node = schema.node('gitlab_alert', { kind }, [schema.node('gitlab_alert_title', {}, [schema.text('')]),
        schema.node('paragraph', {}, [schema.text('')])]);
      const before = editor.state.doc;
      if (!insertNode(editor, node) || editor.state.doc === before) return false;
      const context = getGitLabAlertContext(editor);
      return Boolean(context && editor.dispatch(editor.createTransaction()
        .setSelection(Selection.cursor([...context.path, 1, 0], 0)).setStoredMarks([])));
    });
  }
  remove(): boolean {
    const context = this.context(), { editor } = this.options;
    return this.commit(() => {
      const before = editor.state.doc;
      return removeNode(editor, context.path) && editor.state.doc !== before;
    });
  }
  unwrap(): boolean {
    const context = this.context(), { editor } = this.options;
    return this.commit(() => {
      const { schema } = editor.state, node = at(editor.state.doc, context.path);
      const content = [...(node.child(0).textContent ? [schema.node('paragraph', {}, node.child(0).content)] : []), ...node.content.slice(1)];
      if (!content.length) content.push(schema.node('paragraph', {}, [schema.text('')]));
      const transaction = editor.createTransaction().replaceNode(context.path, content);
      let landing: readonly number[] | undefined;
      const parent = context.path.slice(0, -1), start = context.path.at(-1)!;
      for (let index = 0; index < content.length && !landing; index++) {
        content[index]!.descendants((child, path) => {
          if (!landing && child.isText) landing = [...parent, start + index, ...path];
          return !landing;
        });
      }
      transaction.setSelection(landing ? Selection.cursor(landing, 0) : new NodeSelection(transaction.doc, context.path));
      return editor.dispatch(transaction.setStoredMarks([]));
    });
  }
  private titleSplit(context: GitLabAlertContext): boolean {
    const { editor } = this.options, { selection, schema } = editor.state;
    if (selection.kind !== 'text') return false;
    return this.commit(() => {
      const alert = at(editor.state.doc, context.path), title = alert.child(0);
      const offset = (path: readonly number[], value: number) => title.content.slice(0, path.at(-1)!).reduce((sum, child) => sum + child.textContent.length, 0) + value;
      const from = offset(selection.path, selection.from), to = offset(selection.endPath, selection.to);
      const left = title.textContent.slice(0, from), right = title.textContent.slice(to);
      const firstBody = alert.content[1];
      const useExisting = !right && firstBody?.type.name === 'paragraph' && !firstBody.textContent;
      if (useExisting && left === title.textContent)
        return editor.dispatch(editor.createTransaction()
          .setSelection(Selection.cursor([...context.path, 1, 0], 0)).setStoredMarks([]));
      const body = useExisting ? alert.content.slice(1) : [schema.node('paragraph', {}, [schema.text(right)]), ...alert.content.slice(1)];
      const replacement = alert.copy([title.copy([schema.text(left)]), ...body]);
      return editor.dispatch(editor.createTransaction().replaceNode(context.path, [replacement])
        .setSelection(Selection.cursor([...context.path, 1, 0], 0)).setStoredMarks([]));
    });
  }
  private exit(context: GitLabAlertContext): boolean {
    const { editor } = this.options, { schema } = editor.state;
    return this.commit(() => {
      const alert = at(editor.state.doc, context.path), paragraph = schema.node('paragraph', {}, [schema.text('')]);
      const remaining = alert.content.slice(0, -1);
      const keep = remaining.length > 1 || Boolean(remaining[0]?.textContent);
      const parentPath = context.path.slice(0, -1), index = context.path.at(-1)!;
      const next = at(editor.state.doc, parentPath).content[index + 1];
      const reuse = next?.type.name === 'paragraph' && !next.textContent && next.childCount === 1 && next.child(0).isText;
      const replacements = [...(keep ? [alert.copy(remaining)] : []), ...(reuse ? [] : [paragraph])];
      const landing = [...parentPath, index + (keep ? 1 : 0), 0];
      return editor.dispatch(editor.createTransaction().replaceNode(context.path, replacements)
        .setSelection(Selection.cursor(landing, 0)).setStoredMarks([]));
    });
  }
  private enterBody(context: GitLabAlertContext): boolean {
    const { editor } = this.options, alert = at(editor.state.doc, context.path);
    if (alert.childCount === 1) return this.titleSplit(context);
    return this.commit(() => {
      let point: readonly number[] | undefined;
      alert.child(1).descendants((child, path) => { if (!point && child.isText) point = [...context.path, 1, ...path]; return !point; });
      return editor.dispatch(editor.createTransaction().setSelection(point
        ? Selection.cursor(point, 0) : new NodeSelection(editor.state.doc, [...context.path, 1])).setStoredMarks([]));
    }, false);
  }
  private inputAction(key: string): (() => boolean) | undefined {
    const { editor } = this.options, { selection, doc } = editor.state;
    const context = getGitLabAlertContext(editor);
    if (!context || selection.kind !== 'text') return undefined;
    const alert = at(doc, context.path), title = alert.child(0);
    if (context.inTitle && key === 'Enter') return () => this.titleSplit(context);
    if (context.inTitle && selection.isCollapsed) {
      const start = selection.path.at(-1) === 0 && selection.from === 0;
      if (key === 'Backspace' && start) return () => this.unwrap();
      if (key === 'Delete' && selection.path.at(-1) === title.childCount - 1 && selection.from === title.content.at(-1)?.textContent.length)
        return () => this.enterBody(context);
    }
    const path = selection.path.slice(0, -1), block = at(doc, path);
    const direct = path.length === context.path.length + 1 && inside(path, context.path);
    if (direct && block.type.name === 'paragraph' && selection.isCollapsed) {
      if (key === 'Enter' && !block.textContent && path.at(-1) === alert.childCount - 1) return () => this.exit(context);
      if (key === 'Backspace' && path.at(-1) === 1 && selection.from === 0 && selection.path.at(-1) === 0) return () => {
        if (!title.textContent) return this.unwrap();
        return this.commit(() => editor.dispatch(editor.createTransaction()
          .setSelection(Selection.cursor([...context.path, 0, title.childCount - 1], title.content.at(-1)!.textContent.length))), false);
      };
    }
    return undefined;
  }
  plugin(): Plugin {
    const handle = (key: string): boolean => {
      const action = this.inputAction(key);
      if (!action) return false;
      try { action(); } catch (error) { this.options.onError(error); }
      return true;
    };
    return new Plugin({ props: {
      handleKeyDown: (_editor, event) => {
        const inTitle = getGitLabAlertContext(this.options.editor)?.inTitle;
        if (!event.isComposing && !event.altKey && (event.ctrlKey || event.metaKey)
          && inTitle && ['b', 'i', 'u'].includes(event.key.toLowerCase())) return true;
        return !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey
          && (!event.shiftKey || inTitle) ? handle(event.key) : false;
      },
      handleBeforeInput: (_editor, event) => {
        const inTitle = getGitLabAlertContext(this.options.editor)?.inTitle;
        if (!event.isComposing && inTitle && ['formatBold', 'formatItalic', 'formatUnderline', 'formatStrikeThrough'].includes(event.inputType)) return true;
        return !event.isComposing && (event.inputType !== 'insertLineBreak' || inTitle)
          ? handle(({ insertParagraph: 'Enter', insertLineBreak: 'Enter', deleteContentBackward: 'Backspace', deleteContentForward: 'Delete' } as Record<string, string>)[event.inputType] ?? '') : false;
      },
      handlePaste: (_editor, event) => {
        if (!getGitLabAlertContext(this.options.editor)?.inTitle) return false;
        const text = event.clipboardData?.getData('text/plain');
        try {
          if (typeof text !== 'string' || /[\r\n\0]/u.test(text)) throw new Error('GITLAB_ALERT_TITLE_SINGLE_LINE');
          if (text) this.commit(() => insertText(this.options.editor, text));
        } catch (error) { this.options.onError(error); }
        return true;
      },
    } });
  }
}
