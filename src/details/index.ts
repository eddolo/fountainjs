import {
  AllSelection,
  GapSelection,
  NodeSelection,
  Plugin,
  Selection,
  insertNode,
  type Editor,
  type Node,
  type NodeSpec,
  type NodeViewLike,
  type Schema,
} from '../core';
import { getNodeAtPath, getTextLeaves } from '../core/transaction/path';
import { defineExtension, type FountainExtension } from '../extensions/extension';

const MAX_SUMMARY_LENGTH = 20_000;

export interface DetailsOptions {
  /** Plain-text summary used by insertion and wrapping commands. */
  readonly summary?: string;
  /** Initial disclosure state. Defaults to closed. */
  readonly open?: boolean;
  /** Optional schema-owned body blocks. Defaults to one empty paragraph. */
  readonly content?: readonly Node[];
}

export interface ActiveDetails {
  readonly path: readonly number[];
  readonly node: Node;
}

interface DetailsEditorView { readonly editor: Editor }

function validSummary(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_SUMMARY_LENGTH;
}

function samePath(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function ancestorDetailsPath(editor: Editor, source = editor.state.selection.path): readonly number[] | null {
  for (let length = source.length - 1; length >= 1; length -= 1) {
    const path = source.slice(0, length);
    try {
      if (getNodeAtPath(editor.state.doc, path).type.name === 'details') return Object.freeze(path);
    } catch { return null; }
  }
  return null;
}

function detailsBody(schema: Schema, supplied?: readonly Node[]): readonly Node[] | null {
  if (supplied?.length) {
    if (supplied.some((node) => node.type.schema !== schema || !node.isBlock || node.type.name === 'details_summary')) return null;
    return Object.freeze([...supplied]);
  }
  const paragraph = schema.nodes.paragraph;
  return paragraph ? Object.freeze([paragraph.create({}, [schema.text('')])]) : null;
}

function buildDetails(schema: Schema, options: DetailsOptions = {}): Node | null {
  const details = schema.nodes.details;
  const detailsSummary = schema.nodes.details_summary;
  const summary = options.summary ?? 'Details';
  const body = detailsBody(schema, options.content);
  if (!details || !detailsSummary || !body || !validSummary(summary)) return null;
  try {
    const node = details.create({ open: options.open === true }, [
      detailsSummary.create({}, [schema.text(summary)]),
      ...body,
    ]);
    schema.validate(node);
    return node;
  } catch { return null; }
}

/** Returns the disclosure containing the current selection, if one exists. */
export function getActiveDetails(editor: Editor): ActiveDetails | null {
  const path = ancestorDetailsPath(editor);
  if (!path) return null;
  try { return Object.freeze({ path, node: getNodeAtPath(editor.state.doc, path) }); }
  catch { return null; }
}

/** Inserts a new disclosure after the selected top-level block. */
export function insertDetails(editor: Editor, options: DetailsOptions = {}): boolean {
  const node = buildDetails(editor.state.schema, options);
  return node ? insertNode(editor, node) : false;
}

function selectedTopLevelRange(editor: Editor): { from: number; to: number } | null {
  const { selection, doc } = editor.state;
  if (!doc.childCount) return null;
  if (selection instanceof GapSelection) {
    return selection.parentPath.length ? null : { from: selection.index, to: selection.index - 1 };
  }
  if (selection instanceof AllSelection) return { from: 0, to: doc.childCount - 1 };
  if (selection instanceof NodeSelection) {
    const index = selection.nodePath[0];
    return index === undefined ? null : { from: index, to: index };
  }
  const from = selection.path[0];
  const to = selection.endPath[0];
  return from === undefined || to === undefined ? null : { from, to };
}

/** Wraps the selected top-level blocks in a disclosure with an editable summary. */
export function wrapInDetails(editor: Editor, options: Omit<DetailsOptions, 'content'> = {}): boolean {
  if (!editor.editable || getActiveDetails(editor)) return false;
  const range = selectedTopLevelRange(editor);
  if (!range) return false;
  if (range.to < range.from) return insertDetails(editor, options);
  const body = editor.state.doc.content.slice(range.from, range.to + 1);
  const node = buildDetails(editor.state.schema, { ...options, content: body });
  if (!node) return false;
  const summary = String(options.summary ?? 'Details');
  const transaction = editor.state.createTransaction()
    .replace(range.from, range.to + 1, [node])
    .setSelection(Selection.cursor([range.from, 0, 0], summary.length));
  try { editor.state.schema.validate(transaction.doc); }
  catch { return false; }
  editor.dispatch(transaction);
  return true;
}

/** Replaces the active disclosure with a paragraph summary followed by its body blocks. */
export function unwrapDetails(editor: Editor): boolean {
  if (!editor.editable) return false;
  const active = getActiveDetails(editor);
  const paragraph = editor.state.schema.nodes.paragraph;
  if (!active || !paragraph) return false;
  const summary = active.node.child(0);
  let summaryParagraph: Node;
  try { summaryParagraph = paragraph.create({}, summary.content); }
  catch { return false; }
  const parentPath = active.path.slice(0, -1);
  const index = active.path.at(-1) as number;
  const replacements = [summaryParagraph, ...active.node.content.slice(1)];
  const transaction = editor.state.createTransaction()
    .replaceNode(active.path, replacements);
  const first = getTextLeaves(summaryParagraph)[0];
  if (first) transaction.setSelection(Selection.cursor([...parentPath, index, ...first.path], 0));
  try { editor.state.schema.validate(transaction.doc); }
  catch { return false; }
  editor.dispatch(transaction);
  return true;
}

/** Wraps the selection, or unwraps it when the caret is already in a disclosure. */
export function toggleDetails(editor: Editor, options: Omit<DetailsOptions, 'content'> = {}): boolean {
  return getActiveDetails(editor) ? unwrapDetails(editor) : wrapInDetails(editor, options);
}

/** Persists the open/closed state of the active or explicitly addressed disclosure. */
export function setDetailsOpen(editor: Editor, open: boolean, path?: readonly number[]): boolean {
  if (!editor.editable || typeof open !== 'boolean') return false;
  const targetPath = path ? Object.freeze([...path]) : getActiveDetails(editor)?.path;
  if (!targetPath) return false;
  let node: Node;
  try { node = getNodeAtPath(editor.state.doc, targetPath); }
  catch { return false; }
  if (node.type.name !== 'details' || node.attrs.open === open) return false;
  try {
    const transaction = editor.state.createTransaction().setNodeAttrs(targetPath, { ...node.attrs, open });
    editor.state.schema.validate(transaction.doc);
    editor.dispatch(transaction);
    return true;
  } catch { return false; }
}

export function toggleDetailsOpen(editor: Editor, path?: readonly number[]): boolean {
  const targetPath = path ? Object.freeze([...path]) : getActiveDetails(editor)?.path;
  if (!targetPath) return false;
  try {
    const node = getNodeAtPath(editor.state.doc, targetPath);
    return node.type.name === 'details' && setDetailsOpen(editor, !Boolean(node.attrs.open), targetPath);
  } catch { return false; }
}

/** Native disclosure view whose `open` state remains part of the document model. */
export class DetailsNodeView implements NodeViewLike {
  readonly dom = document.createElement('details');
  readonly contentDOM = this.dom;
  private current: Node;

  constructor(node: Node, private readonly view: unknown, private readonly getPath: () => number[]) {
    this.current = node;
    this.dom.className = 'fountain-details';
    this.dom.addEventListener('toggle', this.onToggle);
    this.render();
  }

  update(node: Node): boolean {
    if (node.type !== this.current.type) return false;
    // A selection/decorations-only view update can arrive between the native
    // <details> element changing `open` and its asynchronous `toggle` event.
    // Re-applying an equivalent model node here would erase that native state
    // before the event can persist it. Attribute/content changes still render.
    if (node.eq(this.current)) {
      this.current = node;
      return true;
    }
    this.current = node;
    this.render();
    return true;
  }

  ignoreMutation(mutation: MutationRecord): boolean {
    return mutation.target === this.dom && mutation.type === 'attributes' && mutation.attributeName === 'open';
  }

  destroy(): void { this.dom.removeEventListener('toggle', this.onToggle); }

  private get editor(): Editor | null {
    return (this.view as Partial<DetailsEditorView> | null)?.editor ?? null;
  }

  private render(): void { this.dom.open = Boolean(this.current.attrs.open); }

  private onToggle = (): void => {
    if (this.dom.open === Boolean(this.current.attrs.open)) return;
    const editor = this.editor;
    if (editor?.editable) setDetailsOpen(editor, this.dom.open, this.getPath());
  };
}

function splitDetailsSummary(editor: Editor): boolean {
  if (!editor.editable || !(editor.state.selection instanceof Selection)) return false;
  const active = getActiveDetails(editor);
  if (!active) return false;
  const summaryPath = [...active.path, 0];
  const selection = editor.state.selection;
  if (!samePath(selection.path.slice(0, -1), summaryPath)
    || !samePath(selection.endPath.slice(0, -1), summaryPath)) return false;

  const transaction = editor.state.createTransaction();
  if (!selection.isCollapsed) {
    if (selection.isSingleText) transaction.replaceText(selection.path, selection.from, selection.to, '');
    else transaction.replaceTextRange(selection.path, selection.from, selection.endPath, selection.to, '');
  }
  const mapped = transaction.selection;
  if (!(mapped instanceof Selection) || !mapped.isSingleText) return false;
  const details = getNodeAtPath(transaction.doc, active.path);
  const summary = details.child(0);
  const textIndex = mapped.path.at(-1) as number;
  const text = summary.child(textIndex);
  if (!text.isText) return false;
  const left = text.withText((text.text ?? '').slice(0, mapped.from));
  const right = text.withText((text.text ?? '').slice(mapped.from));
  const nextSummary = summary.copy([...summary.content.slice(0, textIndex), left]);
  const paragraph = editor.state.schema.nodes.paragraph;
  if (!paragraph) return false;
  const nextParagraph = paragraph.create({}, [right, ...summary.content.slice(textIndex + 1)]);
  const nextDetails = details.copy([nextSummary, nextParagraph, ...details.content.slice(1)]);
  transaction.replaceNode(active.path, [nextDetails])
    .setSelection(Selection.cursor([...active.path, 1, 0], 0));
  try { editor.state.schema.validate(transaction.doc); }
  catch { return false; }
  editor.dispatch(transaction);
  return true;
}

function moveFromBodyToSummary(editor: Editor): boolean {
  const selection = editor.state.selection;
  if (!(selection instanceof Selection) || !selection.isCollapsed || selection.from !== 0) return false;
  const active = getActiveDetails(editor);
  if (!active || selection.path.length !== active.path.length + 2) return false;
  const bodyIndex = selection.path[active.path.length];
  const inlineIndex = selection.path.at(-1);
  if (bodyIndex !== 1 || inlineIndex !== 0) return false;
  const last = getTextLeaves(active.node.child(0)).at(-1);
  if (!last) return false;
  editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor(
    [...active.path, 0, ...last.path],
    last.node.text?.length ?? 0,
  )));
  return true;
}

const detailsKeyboardPlugin = new Plugin({
  props: {
    handleBeforeInput: (editor, event) => event.inputType === 'insertParagraph' && splitDetailsSummary(editor),
    handleKeyDown: (editor, event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === 'Enter') return toggleDetailsOpen(editor);
      return !event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'Backspace'
        ? moveFromBodyToSummary(editor)
        : false;
    },
  },
});

export const detailsSummaryNode: NodeSpec = {
  content: 'inline*',
  parseHTML: [{ tag: 'summary' }],
  parseDOM: [{ tag: 'summary' }],
  toDOM: () => ['summary', { className: 'fountain-details__summary' }, 0],
};

export const detailsNode: NodeSpec = {
  group: 'block',
  content: 'details_summary block+',
  attrs: { open: { default: false, validate: (value) => typeof value === 'boolean' } },
  parseHTML: [{ tag: 'details', getAttrs: (element) => ({ open: element.hasAttribute('open') }) }],
  parseDOM: [{ tag: 'details', getAttrs: (element) => ({ open: element.hasAttribute('open') }) }],
  toDOM: (node) => ['details', { className: 'fountain-details', open: node.attrs.open === true }, 0],
  toText: (node) => node.content.map((child) => child.textContent).join('\n'),
  nodeView: DetailsNodeView,
};

export const DetailsExtension: FountainExtension = defineExtension({
  name: 'details',
  nodes: { details: detailsNode, details_summary: detailsSummaryNode },
  plugins: [detailsKeyboardPlugin],
  commands: { insertDetails, wrapInDetails, unwrapDetails, toggleDetails, setDetailsOpen, toggleDetailsOpen },
});
