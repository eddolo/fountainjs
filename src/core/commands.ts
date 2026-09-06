import type { Editor } from './editor';
import {
  AllSelection,
  CellSelection,
  GapSelection,
  NodeSelection,
  Selection,
  type AnySelection,
} from './selection';
import { Mark, Node, type Attributes } from './schema';
import { TableMap } from './table-map';
import { createImageNode, getActiveImage, type ImageAttributes } from './image';
import { outdentListItem } from './structure-commands';
import { mapMarkRangeSelection } from './transaction/mark-range-step';
import { comparePaths, getNodeAtPath, getTextLeaves, getTextRangeSegments } from './transaction/path';

export type Command = (editor: Editor) => boolean;

export interface TableOptions {
  rows?: number;
  columns?: number;
  headerRow?: boolean;
}

const SAFE_CONTENT_URL = /^(https?:|data:image\/(?:png|gif|jpe?g|webp);base64,|\/|#|\.)/i;
const TEXT_BLOCKS = ['paragraph', 'heading'];
const LIST_ITEMS = ['list_item', 'task_item'];

function dispatchTextSelection(editor: Editor, transaction: ReturnType<Editor['createTransaction']>, path: readonly number[], from: number, to: number): boolean {
  transaction.setSelection(new Selection(path, from, to));
  return editor.dispatch(transaction);
}

function sameMarks(left: readonly Mark[], right: readonly Mark[]): boolean {
  return left.length === right.length && left.every((mark) => right.some((candidate) => candidate.eq(mark)));
}

function paragraphWithText(editor: Editor, text: string): Node | null {
  const paragraph = editor.state.schema.nodes.paragraph;
  if (!paragraph) return null;
  try { return paragraph.create({}, [editor.state.schema.text(text)]); }
  catch { return null; }
}

function dispatchIfValid(editor: Editor, transaction: ReturnType<Editor['createTransaction']>): boolean {
  try { editor.state.schema.validate(transaction.doc); }
  catch { return false; }
  editor.dispatch(transaction);
  return true;
}

function replaceAllSelection(editor: Editor, text: string): boolean {
  const paragraph = paragraphWithText(editor, text);
  if (!paragraph) return false;
  const transaction = editor.state.createTransaction()
    .replace(0, editor.state.doc.childCount, [paragraph])
    .setSelection(Selection.cursor([0, 0], text.length));
  return dispatchIfValid(editor, transaction);
}

function replaceNodeSelection(editor: Editor, selection: NodeSelection, text?: string): boolean {
  const selected = getNodeAtPath(editor.state.doc, selection.nodePath);
  const replacement = text === undefined
    ? []
    : selected.type.isInline
      ? [editor.state.schema.text(text, editor.state.storedMarks)]
      : [paragraphWithText(editor, text)].filter((node): node is Node => Boolean(node));
  if (text !== undefined && !replacement.length) return false;
  let transaction: ReturnType<Editor['createTransaction']>;
  try { transaction = editor.state.createTransaction().replaceNode(selection.nodePath, replacement); }
  catch {
    if (text !== undefined) return false;
    const paragraph = paragraphWithText(editor, '');
    if (!paragraph) return false;
    try {
      transaction = editor.state.createTransaction()
        .replaceNode(selection.nodePath, [paragraph])
        .setSelection(Selection.cursor([...selection.nodePath, 0], 0));
    } catch { return false; }
    return dispatchIfValid(editor, transaction);
  }
  if (text !== undefined) {
    const caretPath = selected.type.isInline ? selection.nodePath : [...selection.nodePath, 0];
    transaction = transaction.setSelection(Selection.cursor(caretPath, text.length));
  }
  if (dispatchIfValid(editor, transaction)) return true;
  if (text !== undefined) return false;
  const paragraph = paragraphWithText(editor, '');
  if (!paragraph) return false;
  transaction = editor.state.createTransaction()
    .replaceNode(selection.nodePath, [paragraph])
    .setSelection(Selection.cursor([...selection.nodePath, 0], 0));
  return dispatchIfValid(editor, transaction);
}

function deleteInlineSibling(editor: Editor, path: readonly number[], index: number): boolean {
  if (index < 0) return false;
  const parentPath = path.slice(0, -1);
  const sibling = getNodeAtPath(editor.state.doc, parentPath).content[index];
  return Boolean(sibling?.type.isInline && !sibling.isText
    && replaceNodeSelection(editor, new NodeSelection(editor.state.doc, [...parentPath, index])));
}

interface JoinedTextBlockContent {
  readonly content: readonly Node[];
  readonly caretIndex: number;
  readonly caretOffset: number;
}

/**
 * Joins two text blocks without retaining their empty caret sentinels as
 * additional visual lines. A single empty text node is kept at the exact
 * boundary only when neither adjacent inline node can own the caret.
 */
function joinTextBlockContent(left: Node, right: Node): JoinedTextBlockContent {
  const leftContent = [...left.content];
  const rightContent = [...right.content];
  let emptyBoundary: Node | undefined;
  while (leftContent.at(-1)?.isText && (leftContent.at(-1)?.text?.length ?? 0) === 0) {
    const removed = leftContent.pop();
    emptyBoundary ??= removed;
  }
  while (rightContent[0]?.isText && (rightContent[0]?.text?.length ?? 0) === 0) {
    const removed = rightContent.shift();
    emptyBoundary ??= removed;
  }

  const boundaryIndex = leftContent.length;
  const before = leftContent.at(-1);
  const after = rightContent[0];
  if (before?.isText) {
    return {
      content: [...leftContent, ...rightContent],
      caretIndex: boundaryIndex - 1,
      caretOffset: before.text?.length ?? 0,
    };
  }
  if (after?.isText) {
    return { content: [...leftContent, ...rightContent], caretIndex: boundaryIndex, caretOffset: 0 };
  }

  const caret = emptyBoundary ?? left.type.schema.text('');
  return {
    content: [...leftContent, caret, ...rightContent],
    caretIndex: boundaryIndex,
    caretOffset: 0,
  };
}

function replaceCellSelection(editor: Editor, selection: CellSelection, text?: string): boolean {
  const paragraph = editor.state.schema.nodes.paragraph;
  const firstPath = selection.cellPaths[0];
  if (!paragraph || !firstPath) return false;
  const transaction = editor.state.createTransaction();
  try {
    selection.cellPaths.forEach((path, index) => {
      const cell = getNodeAtPath(transaction.doc, path);
      const value = text !== undefined && index === 0 ? text : '';
      transaction.replaceNode(path, [cell.copy([paragraph.create({}, [editor.state.schema.text(value)])])]);
    });
    if (text === undefined) {
      transaction.setSelection(new CellSelection(transaction.doc, selection.anchorCellPath, selection.headCellPath));
    } else {
      transaction.setSelection(Selection.cursor([...firstPath, 0, 0], text.length));
    }
  } catch {
    return false;
  }
  return dispatchIfValid(editor, transaction);
}

function insertTextAtGap(editor: Editor, selection: GapSelection, text: string): boolean {
  const paragraph = paragraphWithText(editor, text);
  if (!paragraph) return false;
  const { parentPath, index } = selection;
  const transaction = editor.state.createTransaction();
  if (!parentPath.length) transaction.replace(index, index, [paragraph]);
  else {
    const parent = getNodeAtPath(editor.state.doc, parentPath);
    transaction.replaceNode(parentPath, [parent.copy([
      ...parent.content.slice(0, index),
      paragraph,
      ...parent.content.slice(index),
    ])]);
  }
  transaction.setSelection(Selection.cursor([...parentPath, index, 0], text.length));
  return dispatchIfValid(editor, transaction);
}

function replaceSemanticSelection(editor: Editor, selection: AnySelection, text?: string): boolean {
  if (selection instanceof AllSelection) return replaceAllSelection(editor, text ?? '');
  if (selection instanceof NodeSelection) return replaceNodeSelection(editor, selection, text);
  if (selection instanceof CellSelection) return replaceCellSelection(editor, selection, text);
  if (selection instanceof GapSelection) return text === undefined ? false : insertTextAtGap(editor, selection, text);
  return false;
}

function setSelectionAfterInserted(
  transaction: ReturnType<Editor['createTransaction']>,
  parentPath: readonly number[],
  index: number,
  content: readonly Node[],
): void {
  const selectedIndex = index + content.length - 1;
  const selectedPath = [...parentPath, selectedIndex];
  const selectedNode = getNodeAtPath(transaction.doc, selectedPath);
  const leaf = getTextLeaves(selectedNode).at(-1);
  if (leaf) transaction.setSelection(Selection.cursor([...selectedPath, ...leaf.path], leaf.node.text?.length ?? 0));
  else transaction.setSelection(new NodeSelection(transaction.doc, selectedPath));
}

function replaceSemanticSelectionWithDocument(editor: Editor, selection: Exclude<AnySelection, Selection>, document: Node): boolean {
  const content = [...document.content];
  if (!content.length) return false;
  const transaction = editor.state.createTransaction();
  try {
    if (selection instanceof AllSelection) {
      transaction.replace(0, editor.state.doc.childCount, content);
      setSelectionAfterInserted(transaction, [], 0, content);
    } else if (selection instanceof NodeSelection) {
      const parentPath = selection.nodePath.slice(0, -1);
      const index = selection.nodePath.at(-1) as number;
      const selected = getNodeAtPath(editor.state.doc, selection.nodePath);
      const inline = content.length === 1 && content[0]?.content.every((node) => node.type.isInline)
        ? [...content[0].content]
        : null;
      if (selected.type.isInline && inline) {
        transaction.replaceNode(selection.nodePath, inline);
        const last = inline.at(-1);
        if (last?.isText) transaction.setSelection(Selection.cursor([...parentPath, index + inline.length - 1], last.text?.length ?? 0));
        else if (last) transaction.setSelection(new NodeSelection(transaction.doc, [...parentPath, index + inline.length - 1]));
      } else {
        transaction.replaceNode(selection.nodePath, content);
        setSelectionAfterInserted(transaction, parentPath, index, content);
      }
    } else if (selection instanceof GapSelection) {
      const { parentPath, index } = selection;
      if (!parentPath.length) transaction.replace(index, index, content);
      else {
        const parent = getNodeAtPath(editor.state.doc, parentPath);
        transaction.replaceNode(parentPath, [parent.copy([
          ...parent.content.slice(0, index),
          ...content,
          ...parent.content.slice(index),
        ])]);
      }
      setSelectionAfterInserted(transaction, parentPath, index, content);
    } else {
      const paragraph = editor.state.schema.nodes.paragraph;
      if (!paragraph) return false;
      const firstPath = selection.cellPaths[0] as readonly number[];
      [...selection.cellPaths].reverse().forEach((path) => {
        const cell = getNodeAtPath(transaction.doc, path);
        const cellContent = comparePaths(path, firstPath) === 0
          ? content
          : [paragraph.create({}, [editor.state.schema.text('')])];
        transaction.replaceNode(path, [cell.copy(cellContent)]);
      });
      const firstCell = getNodeAtPath(transaction.doc, firstPath);
      const leaf = getTextLeaves(firstCell).at(-1);
      if (leaf) transaction.setSelection(Selection.cursor([...firstPath, ...leaf.path], leaf.node.text?.length ?? 0));
      else transaction.setSelection(new NodeSelection(transaction.doc, [...firstPath, firstCell.childCount - 1]));
    }
  } catch {
    return false;
  }
  return dispatchIfValid(editor, transaction);
}

function textRangeForNode(doc: Node, path: readonly number[]): Selection | null {
  const leaves = getTextLeaves(getNodeAtPath(doc, path));
  const first = leaves[0];
  const last = leaves.at(-1);
  if (!first || !last) return null;
  return Selection.range(
    [...path, ...first.path],
    0,
    [...path, ...last.path],
    last.node.text?.length ?? 0,
  );
}

function selectedTextRanges(doc: Node, selection: AnySelection): readonly Selection[] {
  if (selection instanceof GapSelection) return [];
  if (selection instanceof CellSelection) {
    return selection.cellPaths
      .map((path) => textRangeForNode(doc, path))
      .filter((range): range is Selection => Boolean(range));
  }
  if (selection instanceof NodeSelection) {
    const range = textRangeForNode(doc, selection.nodePath);
    return range ? [range] : [];
  }
  if (selection instanceof AllSelection) {
    const leaves = getTextLeaves(doc);
    const first = leaves[0];
    const last = leaves.at(-1);
    return first && last
      ? [Selection.range(first.path, 0, last.path, last.node.text?.length ?? 0)]
      : [];
  }
  return selection.isCollapsed ? [] : [selection];
}

function selectedTextSegments(doc: Node, selection: AnySelection) {
  return selectedTextRanges(doc, selection).flatMap(({ path, endPath, from, to }) => (
    getTextRangeSegments(doc, path, from, endPath, to).filter((segment) => segment.to > segment.from)
  ));
}

function preserveTextSelectionAfterMark(
  transaction: ReturnType<Editor['createTransaction']>,
  selection: AnySelection,
  mapped: ReturnType<typeof mapMarkRangeSelection>,
): void {
  if (selection.kind === 'text' && mapped) {
    transaction.setSelection(Selection.range(mapped.startPath, 0, mapped.endPath, mapped.endOffset));
  }
}

export function insertText(editor: Editor, text: string): boolean {
  if (!editor.editable) return false;
  if (editor.state.selection.kind !== 'text') return replaceSemanticSelection(editor, editor.state.selection, text);
  if (!text) return false;
  const { state } = editor;
  const { path, endPath, from, to } = state.selection;
  const target = getNodeAtPath(state.doc, path);
  if (!target.isText) return false;
  const transaction = state.createTransaction();
  if (state.selection.isCollapsed && !sameMarks(target.marks, state.storedMarks)) {
    const value = target.text ?? '';
    const index = path.at(-1) as number;
    const insertedPath = [...path.slice(0, -1), index + (from > 0 ? 1 : 0)];
    transaction
      .replaceNode(path, [
        ...(from ? [target.withText(value.slice(0, from))] : []),
        state.schema.text(text, state.storedMarks),
        ...(from < value.length ? [target.withText(value.slice(from))] : []),
      ])
      .setStoredMarks(state.storedMarks);
    return dispatchTextSelection(editor, transaction, insertedPath, text.length, text.length);
  }
  if (state.selection.isSingleText) transaction.replaceText(path, from, to, text);
  else transaction.replaceTextRange(path, from, endPath, to, text);
  transaction.setStoredMarks(state.storedMarks);
  return dispatchTextSelection(editor, transaction, path, from + text.length, from + text.length);
}

/** Inserts clipboard-style text and turns line boundaries into real blocks when possible. */
export function insertPlainText(editor: Editor, text: string): boolean {
  if (!editor.editable || text === '') return false;
  const normalized = text.replace(/\r\n?/g, '\n');
  if (normalized.includes('\n') && editor.state.selection.kind !== 'text') {
    const paragraph = editor.state.schema.nodes.paragraph;
    if (!paragraph) return insertText(editor, normalized);
    const document = editor.state.schema.topNodeType.create({}, normalized.split('\n').map((line) => (
      paragraph.create({}, [editor.state.schema.text(line)])
    )));
    return replaceSemanticSelectionWithDocument(editor, editor.state.selection, document);
  }
  const block = editor.state.doc.content[editor.state.selection.path[0]];
  if (!normalized.includes('\n') || block?.type.spec.code || editor.state.selection.path.length !== 2) {
    return insertText(editor, normalized);
  }
  const lines = normalized.split('\n');
  if (!insertText(editor, lines[0] ?? '')) {
    // insertText intentionally rejects an empty string; deletion still needs to happen.
    if (!deleteSelection(editor) && lines.length === 1) return false;
  }
  for (const line of lines.slice(1)) {
    if (!splitBlock(editor)) return false;
    if (line) insertText(editor, line);
  }
  return true;
}

export function deleteSelection(editor: Editor): boolean {
  if (!editor.editable) return false;
  const { state } = editor;
  if (state.selection.kind !== 'text') return replaceSemanticSelection(editor, state.selection);
  const { path, endPath, from, to } = state.selection;
  if (state.selection.isCollapsed) return false;
  const transaction = state.createTransaction();
  if (state.selection.isSingleText) transaction.replaceText(path, from, to, '');
  else transaction.replaceTextRange(path, from, endPath, to, '');
  return dispatchTextSelection(editor, transaction, path, from, from);
}

export function deleteBackward(editor: Editor): boolean {
  if (!editor.editable) return false;
  if (!editor.state.selection.isCollapsed) return deleteSelection(editor);
  if (editor.state.selection instanceof GapSelection) {
    const { parentPath, index } = editor.state.selection;
    if (index === 0) return false;
    return replaceNodeSelection(editor, new NodeSelection(editor.state.doc, [...parentPath, index - 1]));
  }
  const { state } = editor;
  const { path, from } = state.selection;
  if (from > 0) {
    const transaction = state.createTransaction()
      .replaceText(path, from - 1, from, '')
      .setSelection(Selection.cursor(path, from - 1));
    editor.dispatch(transaction);
    return true;
  }
  if (deleteInlineSibling(editor, path, (path.at(-1) as number) - 1)) return true;
  const leaves = getTextLeaves(state.doc);
  const index = leaves.findIndex((leaf) => comparePaths(leaf.path, path) === 0);
  const previous = leaves[index - 1];
  if (!previous) return joinBackward(editor);
  const sameParent = path.slice(0, -1).every((part, pathIndex) => part === previous.path[pathIndex])
    && path.length === previous.path.length;
  if (!sameParent) return joinBackward(editor);
  const length = previous.node.text?.length ?? 0;
  if (!length) return false;
  const transaction = state.createTransaction()
    .replaceText(previous.path, length - 1, length, '')
    .setSelection(Selection.cursor(previous.path, length - 1));
  editor.dispatch(transaction);
  return true;
}

export function deleteForward(editor: Editor): boolean {
  if (!editor.editable) return false;
  if (!editor.state.selection.isCollapsed) return deleteSelection(editor);
  if (editor.state.selection instanceof GapSelection) {
    const { parentPath, index } = editor.state.selection;
    const parent = getNodeAtPath(editor.state.doc, parentPath);
    if (index >= parent.childCount) return false;
    return replaceNodeSelection(editor, new NodeSelection(editor.state.doc, [...parentPath, index]));
  }
  const { state } = editor;
  const { path, from } = state.selection;
  const target = getNodeAtPath(state.doc, path);
  const length = target.text?.length ?? 0;
  if (from < length) {
    const transaction = state.createTransaction()
      .replaceText(path, from, from + 1, '')
      .setSelection(Selection.cursor(path, from));
    editor.dispatch(transaction);
    return true;
  }
  if (deleteInlineSibling(editor, path, (path.at(-1) as number) + 1)) return true;
  const leaves = getTextLeaves(state.doc);
  const index = leaves.findIndex((leaf) => comparePaths(leaf.path, path) === 0);
  const next = leaves[index + 1];
  if (!next) return false;
  const sameParent = path.slice(0, -1).every((part, pathIndex) => part === next.path[pathIndex])
    && path.length === next.path.length;
  if (!sameParent) return joinForward(editor);
  if (!sameParent || !(next.node.text?.length)) return false;
  const transaction = state.createTransaction()
    .replaceText(next.path, 0, 1, '')
    .setSelection(Selection.cursor(path, from));
  editor.dispatch(transaction);
  return true;
}

export function setContent(editor: Editor, content: Node): boolean {
  if (content.type !== editor.state.schema.topNodeType) throw new Error('Invalid content');
  const transaction = editor.state.createTransaction()
    .replace(0, editor.state.doc.childCount, content.content)
    .setMeta('content$replace', true);
  editor.dispatch(transaction);
  return true;
}

/** Inserts a parsed document fragment while preserving inline marks and block structure. */
export function insertDocument(editor: Editor, document: Node): boolean {
  if (!editor.editable || document.type !== editor.state.schema.topNodeType || !document.childCount) return false;
  if (editor.state.selection.kind !== 'text') {
    return replaceSemanticSelectionWithDocument(editor, editor.state.selection, document);
  }
  if (!editor.state.selection.isCollapsed && !deleteSelection(editor)) return false;
  const { state } = editor;
  const { path, from } = state.selection;
  const target = getNodeAtPath(state.doc, path);
  if (!target.isText) return false;
  const blocks = [...document.content];
  const single = blocks.length === 1 ? blocks[0] : undefined;
  const parent = getNodeAtPath(state.doc, path.slice(0, -1));
  if (single && single.content.every((node) => node.type.isInline) && parent.content.every((node) => node.type.isInline)) {
    const text = target.text ?? '';
    const prefix = text.slice(0, from);
    const suffix = text.slice(from);
    const content = [
      ...(prefix ? [target.withText(prefix)] : []),
      ...single.content,
      ...(suffix ? [target.withText(suffix)] : []),
    ];
    if (!content.length) content.push(target.withText(''));
    const insertedTextLeaves = single.content.flatMap((node, index) => getTextLeaves(node).map((leaf) => ({
      path: [...path.slice(0, -1), (prefix ? 1 : 0) + index, ...leaf.path],
      node: leaf.node,
    })));
    const landing = insertedTextLeaves.at(-1);
    const transaction = state.createTransaction().replaceNode(path, content);
    if (landing) transaction.setSelection(Selection.cursor(landing.path, landing.node.text?.length ?? 0));
    editor.dispatch(transaction);
    return true;
  }

  const blockPath = path.slice(0, -1);
  const containerPath = blockPath.slice(0, -1);
  const blockIndex = blockPath.at(-1) as number;
  if (blockPath.length) {
    const textIndex = path.at(-1) as number;
    const block = getNodeAtPath(state.doc, blockPath);
    const value = target.text ?? '';
    const left = block.copy([...block.content.slice(0, textIndex), target.withText(value.slice(0, from))]);
    const right = block.type.create(block.attrs, [target.withText(value.slice(from)), ...block.content.slice(textIndex + 1)]);
    const transaction = state.createTransaction().replaceNode(blockPath, [left, ...blocks, right]);
    const lastInserted = blocks.at(-1);
    if (lastInserted) {
      const leaf = getTextLeaves(lastInserted).at(-1);
      if (leaf) transaction.setSelection(Selection.cursor([
        ...containerPath,
        blockIndex + blocks.length,
        ...leaf.path,
      ], leaf.node.text?.length ?? 0));
    }
    return dispatchIfValid(editor, transaction);
  }

  const index = (path[0] as number) + 1;
  const transaction = state.createTransaction().replace(index, index, blocks);
  const landing = getTextLeaves(blocks.at(-1) as Node).at(-1);
  if (landing) transaction.setSelection(Selection.cursor([index + blocks.length - 1, ...landing.path], landing.node.text?.length ?? 0));
  editor.dispatch(transaction);
  return true;
}

function firstTextPath(node: Node): number[] | null {
  let found: number[] | null = null;
  node.descendants((child, path) => {
    if (found) return false;
    if (child.isText) {
      found = path;
      return false;
    }
  });
  return found;
}

/** Inserts any schema-owned block after the block containing the current selection. */
export function insertNode(editor: Editor, node: Node): boolean {
  if (!editor.editable || node.type.schema !== editor.state.schema || !node.isBlock) return false;
  if (editor.state.selection.kind !== 'text') {
    const document = editor.state.schema.topNodeType.create({}, [node]);
    return replaceSemanticSelectionWithDocument(editor, editor.state.selection, document);
  }
  const index = (editor.state.selection.endPath[0] ?? editor.state.doc.childCount - 1) + 1;
  const relativeTextPath = firstTextPath(node);
  const needsTrailingTextBlock = !relativeTextPath && Boolean(editor.state.schema.nodes.paragraph);
  const inserted = needsTrailingTextBlock
    ? [node, editor.state.schema.node('paragraph', {}, [editor.state.schema.text('')])]
    : [node];
  const transaction = editor.state.createTransaction().replace(index, index, inserted);
  if (relativeTextPath) transaction.setSelection(Selection.cursor([index, ...relativeTextPath], 0));
  else if (needsTrailingTextBlock) transaction.setSelection(Selection.cursor([index + 1, 0], 0));
  editor.dispatch(transaction);
  return true;
}

export function selectText(editor: Editor, path: readonly number[], from: number, to = from): boolean {
  editor.dispatch(editor.state.createTransaction().setSelection(new Selection(path, from, to)));
  return true;
}

export function selectTextRange(
  editor: Editor,
  startPath: readonly number[],
  from: number,
  endPath: readonly number[],
  to: number,
): boolean {
  try { editor.dispatch(editor.state.createTransaction().setSelection(Selection.range(startPath, from, endPath, to))); }
  catch { return false; }
  return true;
}

export function selectNode(editor: Editor, path: readonly number[]): boolean {
  try { editor.dispatch(editor.state.createTransaction().setSelection(new NodeSelection(editor.state.doc, path))); }
  catch { return false; }
  return true;
}

export function selectGap(editor: Editor, position: number, association: -1 | 1 = 1): boolean {
  try { editor.dispatch(editor.state.createTransaction().setSelection(new GapSelection(editor.state.doc, position, association))); }
  catch { return false; }
  return true;
}

export function selectAll(editor: Editor): boolean {
  editor.dispatch(editor.state.createTransaction().setSelection(new AllSelection(editor.state.doc)));
  return true;
}

export function selectCells(editor: Editor, anchorCellPath: readonly number[], headCellPath: readonly number[] = anchorCellPath): boolean {
  try {
    editor.dispatch(editor.state.createTransaction().setSelection(new CellSelection(editor.state.doc, anchorCellPath, headCellPath)));
  } catch {
    return false;
  }
  return true;
}

export type SelectionDirection = 'backward' | 'forward';
export type CellSelectionDirection = 'left' | 'right' | 'up' | 'down';

function moveToNodeEdge(editor: Editor, path: readonly number[], direction: SelectionDirection): boolean {
  const node = getNodeAtPath(editor.state.doc, path);
  const leaves = getTextLeaves(node);
  const leaf = direction === 'backward' ? leaves.at(-1) : leaves[0];
  if (!leaf) {
    editor.dispatch(editor.state.createTransaction().setSelection(new NodeSelection(editor.state.doc, path)));
    return true;
  }
  const offset = direction === 'backward' ? leaf.node.text?.length ?? 0 : 0;
  editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([...path, ...leaf.path], offset)));
  return true;
}

/** Moves between a text boundary, an adjacent atomic node, a node selection, and a gap. */
export function selectAdjacentNode(editor: Editor, direction: SelectionDirection): boolean {
  const { state } = editor;
  const selection = state.selection;
  if (selection instanceof GapSelection) {
    const parent = getNodeAtPath(state.doc, selection.parentPath);
    const index = direction === 'backward' ? selection.index - 1 : selection.index;
    if (index < 0 || index >= parent.childCount) return false;
    editor.dispatch(state.createTransaction().setSelection(new NodeSelection(state.doc, [...selection.parentPath, index])));
    return true;
  }
  if (selection instanceof NodeSelection) {
    const parentPath = selection.nodePath.slice(0, -1);
    const parent = getNodeAtPath(state.doc, parentPath);
    const index = selection.nodePath.at(-1) as number;
    const nextIndex = direction === 'backward' ? index - 1 : index + 1;
    if (nextIndex >= 0 && nextIndex < parent.childCount) {
      return moveToNodeEdge(editor, [...parentPath, nextIndex], direction);
    }
    return selectGap(editor, direction === 'backward' ? selection.structuralFrom : selection.structuralTo, direction === 'backward' ? -1 : 1);
  }
  if (selection.kind !== 'text' || !selection.isCollapsed || selection.path.length < 2) return false;
  const blockPath = [selection.path[0] as number];
  const block = getNodeAtPath(state.doc, blockPath);
  const leaves = getTextLeaves(block);
  const edge = direction === 'backward' ? leaves[0] : leaves.at(-1);
  if (!edge || comparePaths(selection.path, [...blockPath, ...edge.path]) !== 0) return false;
  const atBoundary = direction === 'backward'
    ? selection.from === 0
    : selection.to === (edge.node.text?.length ?? 0);
  if (!atBoundary) return false;
  const blockIndex = blockPath[0] as number;
  const candidateIndex = direction === 'backward' ? blockIndex - 1 : blockIndex + 1;
  if (candidateIndex < 0 || candidateIndex >= state.doc.childCount) return false;
  const candidate = state.doc.child(candidateIndex);
  if (!candidate.type.spec.atom) return false;
  editor.dispatch(state.createTransaction().setSelection(new NodeSelection(state.doc, [candidateIndex])));
  return true;
}

function currentCellPath(editor: Editor): readonly number[] | null {
  const selection = editor.state.selection;
  if (selection instanceof CellSelection) return selection.headCellPath;
  for (let length = selection.path.length; length > 0; length -= 1) {
    const path = selection.path.slice(0, length);
    if (['table_cell', 'table_header'].includes(getNodeAtPath(editor.state.doc, path).type.name)) return path;
  }
  return null;
}

/** Extends a rectangular cell selection from its stable anchor. */
export function extendCellSelection(editor: Editor, direction: CellSelectionDirection): boolean {
  const head = currentCellPath(editor);
  if (!head || head.length < 3) return false;
  const tablePath = head.slice(0, -2);
  const table = getNodeAtPath(editor.state.doc, tablePath);
  if (table.type.name !== 'table') return false;
  const map = TableMap.create(table, tablePath);
  const current = map.cellInfo(head);
  if (!current) return false;
  const nextRow = current.row + (direction === 'up' ? -1 : direction === 'down' ? current.rowspan : 0);
  const nextColumn = current.column + (direction === 'left' ? -1 : direction === 'right' ? current.colspan : 0);
  const target = map.cellAt(nextRow, nextColumn);
  if (!target) return false;
  const anchor = editor.state.selection instanceof CellSelection
    ? editor.state.selection.anchorCellPath
    : head;
  return selectCells(editor, anchor, target.path);
}

export function isMarkActive(editor: Editor, markName: string): boolean {
  try {
    const { state } = editor;
    if (state.selection instanceof GapSelection) return false;
    if (state.selection.isCollapsed) return state.storedMarks.some((mark) => mark.type.name === markName);
    const segments = selectedTextSegments(state.doc, state.selection);
    return segments.length > 0 && segments.every((segment) => segment.node.marks.some((mark) => mark.type.name === markName));
  } catch {
    return false;
  }
}

export function setLink(editor: Editor, href: string, attrs: Omit<Attributes, 'href'> = {}): boolean {
  if (!editor.editable || editor.state.selection.isCollapsed) return false;
  const value = href.trim();
  if (!SAFE_CONTENT_URL.test(value)) return false;
  const { state } = editor;
  const markType = state.schema.marks.link;
  if (!markType) return false;
  const ranges = selectedTextRanges(state.doc, state.selection);
  if (!ranges.length) return false;
  const primary = ranges[0] as Selection;
  const mapped = mapMarkRangeSelection(state.doc, primary.path, primary.from, primary.endPath, primary.to);
  const transaction = state.createTransaction();
  [...ranges].reverse().forEach(({ path, endPath, from, to }) => {
    transaction.addMarkRange(path, from, endPath, to, markType.create({ href: value, title: '', target: '_blank', ...attrs }));
  });
  preserveTextSelectionAfterMark(transaction, state.selection, mapped);
  editor.dispatch(transaction);
  return true;
}

export function unsetLink(editor: Editor): boolean {
  if (!editor.editable || editor.state.selection.isCollapsed) return false;
  const { state } = editor;
  const markType = state.schema.marks.link;
  if (!markType) return false;
  const ranges = selectedTextRanges(state.doc, state.selection);
  if (!ranges.length) return false;
  const primary = ranges[0] as Selection;
  const mapped = mapMarkRangeSelection(state.doc, primary.path, primary.from, primary.endPath, primary.to);
  const transaction = state.createTransaction();
  [...ranges].reverse().forEach(({ path, endPath, from, to }) => {
    transaction.removeMarkRange(path, from, endPath, to, markType);
  });
  preserveTextSelectionAfterMark(transaction, state.selection, mapped);
  editor.dispatch(transaction);
  return true;
}

export function toggleMark(editor: Editor, markName: string): boolean {
  if (!editor.editable) return false;
  const { state } = editor;
  const markType = state.schema.marks[markName];
  if (!markType) return false;
  if (state.selection.isCollapsed) {
    if (state.selection.kind !== 'text') return false;
    const active = state.storedMarks.some((mark) => mark.type === markType);
    const marks = active
      ? state.storedMarks.filter((mark) => mark.type !== markType)
      : [...state.storedMarks.filter((mark) => mark.type !== markType), markType.create()];
    editor.dispatch(state.createTransaction().setStoredMarks(marks));
    return true;
  }
  const ranges = selectedTextRanges(state.doc, state.selection);
  const segments = selectedTextSegments(state.doc, state.selection);
  if (!segments.length) return false;
  const activeAcrossRange = segments.every((segment) => segment.node.marks.some((mark) => mark.type === markType));
  const primary = ranges[0] as Selection;
  const mapped = mapMarkRangeSelection(state.doc, primary.path, primary.from, primary.endPath, primary.to);
  const transaction = state.createTransaction();
  [...ranges].reverse().forEach(({ path, endPath, from, to }) => {
    if (activeAcrossRange) transaction.removeMarkRange(path, from, endPath, to, markType);
    else transaction.addMarkRange(path, from, endPath, to, markType.create());
  });
  preserveTextSelectionAfterMark(transaction, state.selection, mapped);
  editor.dispatch(transaction);
  return true;
}

/** Applies or replaces an attributed mark without toggling it off. */
export function setMark(editor: Editor, markName: string, attrs: Attributes = {}): boolean {
  if (!editor.editable) return false;
  const { state } = editor;
  const markType = state.schema.marks[markName];
  if (!markType) return false;
  let mark: Mark;
  try { mark = markType.create(attrs); }
  catch { return false; }
  if (state.selection.isCollapsed) {
    if (state.selection.kind !== 'text') return false;
    editor.dispatch(state.createTransaction().setStoredMarks([
      ...state.storedMarks.filter((existing) => existing.type !== markType),
      mark,
    ]));
    return true;
  }
  const ranges = selectedTextRanges(state.doc, state.selection);
  if (!ranges.length) return false;
  const primary = ranges[0] as Selection;
  const mapped = mapMarkRangeSelection(state.doc, primary.path, primary.from, primary.endPath, primary.to);
  const transaction = state.createTransaction();
  [...ranges].reverse().forEach(({ path, endPath, from, to }) => transaction.addMarkRange(path, from, endPath, to, mark));
  preserveTextSelectionAfterMark(transaction, state.selection, mapped);
  editor.dispatch(transaction);
  return true;
}

export function unsetMark(editor: Editor, markName: string): boolean {
  if (!editor.editable) return false;
  const { state } = editor;
  const markType = state.schema.marks[markName];
  if (!markType) return false;
  if (state.selection.isCollapsed) {
    if (state.selection.kind !== 'text') return false;
    editor.dispatch(state.createTransaction().setStoredMarks(state.storedMarks.filter((mark) => mark.type !== markType)));
    return true;
  }
  const ranges = selectedTextRanges(state.doc, state.selection);
  if (!ranges.length) return false;
  const primary = ranges[0] as Selection;
  const mapped = mapMarkRangeSelection(state.doc, primary.path, primary.from, primary.endPath, primary.to);
  const transaction = state.createTransaction();
  [...ranges].reverse().forEach(({ path, endPath, from, to }) => transaction.removeMarkRange(path, from, endPath, to, markType));
  preserveTextSelectionAfterMark(transaction, state.selection, mapped);
  editor.dispatch(transaction);
  return true;
}

export function setTextAlignment(editor: Editor, align: 'left' | 'center' | 'right' | 'justify'): boolean {
  if (!editor.editable) return false;
  if (editor.state.selection.kind !== 'text' && !(editor.state.selection instanceof NodeSelection)) return false;
  const path = editor.state.selection instanceof NodeSelection
    ? editor.state.selection.nodePath
    : editor.state.selection.path.slice(0, -1);
  const block = getNodeAtPath(editor.state.doc, path);
  if (!TEXT_BLOCKS.includes(block.type.name)) return false;
  try { block.type.create({ ...block.attrs, align }, block.content); }
  catch { return false; }
  editor.dispatch(editor.state.createTransaction().setNodeAttrs(path, { ...block.attrs, align }));
  return true;
}

/** Inserts a semantic hard-break node and leaves an editable text cursor after it. */
export function insertHardBreak(editor: Editor): boolean {
  if (!editor.editable) return false;
  if (editor.state.selection instanceof GapSelection) return false;
  if (!editor.state.selection.isCollapsed && !deleteSelection(editor)) return false;
  const { state } = editor;
  const { path, from } = state.selection;
  const target = getNodeAtPath(state.doc, path);
  const hardBreak = state.schema.nodes.hard_break;
  if (!target.isText || !hardBreak) return false;
  const value = target.text ?? '';
  const before = value.slice(0, from);
  const after = value.slice(from);
  const index = path.at(-1) as number;
  const replacement = [
    ...(before ? [target.withText(before)] : []),
    hardBreak.create(),
    state.schema.text(after, state.storedMarks),
  ];
  const landing = [...path.slice(0, -1), index + (before ? 2 : 1)];
  editor.dispatch(state.createTransaction()
    .replaceNode(path, replacement)
    .setStoredMarks(state.storedMarks)
    .setSelection(Selection.cursor(landing, 0)));
  return true;
}

export function setBlockType(editor: Editor, typeName: string, attrs: Attributes = {}): boolean {
  if (!editor.editable) return false;
  const { state } = editor;
  if (state.selection.kind !== 'text' && !(state.selection instanceof NodeSelection)) return false;
  const type = state.schema.nodes[typeName];
  if (!type || !type.isBlock) return false;
  const blockPaths = state.selection instanceof NodeSelection
    ? [state.selection.nodePath]
    : getTextLeaves(state.doc)
      .filter(({ path }) => comparePaths(path, state.selection.path) >= 0 && comparePaths(path, state.selection.endPath) <= 0)
      .map(({ path }) => path.slice(0, -1))
      .filter((path, index, paths) => index === 0 || comparePaths(path, paths[index - 1] as readonly number[]) !== 0);
  if (!blockPaths.length) return false;
  const transaction = state.createTransaction();
  try {
    for (const blockPath of blockPaths) {
      const block = getNodeAtPath(transaction.doc, blockPath);
      if (!TEXT_BLOCKS.includes(block.type.name)) return false;
      transaction.replaceNode(blockPath, [type.create(attrs, block.content)]);
    }
    state.schema.validate(transaction.doc);
  } catch { return false; }
  if (state.selection instanceof NodeSelection) {
    transaction.setSelection(new NodeSelection(transaction.doc, state.selection.nodePath));
  } else {
    transaction.setSelection(new Selection(
      state.selection.path,
      state.selection.from,
      state.selection.to,
      state.selection.endPath,
    ));
  }
  editor.dispatch(transaction);
  return true;
}

export function insertBlock(editor: Editor, typeName: string, attrs: Attributes = {}, text = ''): boolean {
  if (!editor.editable) return false;
  const { state } = editor;
  const type = state.schema.nodes[typeName];
  if (!type || !type.isBlock) return false;
  const content = type.spec.atom ? [] : [state.schema.text(text)];
  let block: Node;
  try { block = type.create(attrs, content); }
  catch { return false; }
  const inserted = insertNode(editor, block);
  if (inserted && !type.spec.atom && text) {
    const path = editor.state.selection.path;
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor(path, text.length)));
  }
  return inserted;
}

export function insertImage(editor: Editor, attrs: ImageAttributes): boolean {
  const image = createImageNode(editor, attrs);
  return image ? insertNode(editor, image) : false;
}

/** Inserts an atomic image between text fragments without changing the surrounding block. */
export function insertInlineImage(
  editor: Editor,
  attrs: ImageAttributes,
  selection?: Selection,
  selectInserted = true,
): boolean {
  const targetSelection = selection ?? (editor.state.selection instanceof Selection ? editor.state.selection : null);
  if (!editor.editable || !targetSelection?.isSingleText || !targetSelection.path.length) return false;
  const image = createImageNode(editor, attrs, true);
  if (!image) return false;
  let target: Node;
  try { target = getNodeAtPath(editor.state.doc, targetSelection.path); }
  catch { return false; }
  if (!target.isText) return false;
  const value = target.text ?? '';
  if (targetSelection.to > value.length) return false;
  const index = targetSelection.path.at(-1) as number;
  const before = value.slice(0, targetSelection.from);
  const after = value.slice(targetSelection.to);
  const replacement = [
    ...(before ? [target.withText(before)] : []),
    image,
    target.withText(after),
  ];
  const imagePath = [...targetSelection.path.slice(0, -1), index + (before ? 1 : 0)];
  try {
    const transaction = editor.state.createTransaction().replaceNode(targetSelection.path, replacement);
    if (selectInserted) transaction.setSelection(new NodeSelection(transaction.doc, imagePath));
    editor.state.schema.validate(transaction.doc);
    editor.dispatch(transaction);
    return true;
  } catch { return false; }
}

/** Validates and updates portable metadata on a block or inline image. */
export function setImageAttributes(
  editor: Editor,
  attrs: Partial<ImageAttributes>,
  path?: readonly number[],
  selectUpdated = true,
): boolean {
  if (!editor.editable) return false;
  const active = getActiveImage(editor, path);
  if (!active) return false;
  const next = { ...active.node.attrs, ...attrs };
  if (typeof next.src !== 'string' || !next.src.trim() || !SAFE_CONTENT_URL.test(next.src.trim())) return false;
  next.src = next.src.trim();
  if (active.inline) delete next.caption;
  try {
    active.node.type.create(next);
    const transaction = editor.state.createTransaction().setNodeAttrs(active.path, next);
    if (selectUpdated) transaction.setSelection(new NodeSelection(transaction.doc, active.path));
    editor.dispatch(transaction);
    return true;
  } catch { return false; }
}

export function setImageAlignment(editor: Editor, align: 'left' | 'center' | 'right', path?: readonly number[]): boolean {
  return setImageAttributes(editor, { align }, path);
}

export function deleteImage(editor: Editor, path?: readonly number[]): boolean {
  const active = getActiveImage(editor, path);
  if (!active || !editor.editable) return false;
  if (!path && editor.state.selection instanceof NodeSelection) return deleteSelection(editor);
  try {
    editor.dispatch(editor.state.createTransaction().setSelection(new NodeSelection(editor.state.doc, active.path)));
    return deleteSelection(editor);
  } catch { return false; }
}

export function insertQuote(editor: Editor, text = ''): boolean {
  const { schema } = editor.state;
  if (!schema.nodes.blockquote || !schema.nodes.paragraph) return false;
  return insertNode(editor, schema.node('blockquote', {}, [
    schema.node('paragraph', {}, [schema.text(text)]),
  ]));
}

function nearestBlockPath(document: Node, path: readonly number[]): number[] | null {
  for (let length = path.length - 1; length > 0; length -= 1) {
    const candidate = path.slice(0, length);
    try {
      if (getNodeAtPath(document, candidate).type.isBlock) return candidate;
    } catch { return null; }
  }
  return null;
}

function sharedPrefix(left: readonly number[], right: readonly number[]): number[] {
  const result: number[] = [];
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) break;
    result.push(left[index] as number);
  }
  return result;
}

function quoteAncestor(document: Node, path: readonly number[]): number[] | null {
  for (let length = path.length - 1; length > 0; length -= 1) {
    const candidate = path.slice(0, length);
    if (getNodeAtPath(document, candidate).type.name === 'blockquote') return candidate;
  }
  return null;
}

/** Wraps the selected block range in a quote, or unwraps the quote containing the selection. */
export function toggleQuote(editor: Editor): boolean {
  if (!editor.editable || (editor.state.selection.kind !== 'text' && !(editor.state.selection instanceof NodeSelection))) return false;
  const { state } = editor;
  const quoteType = state.schema.nodes.blockquote;
  if (!quoteType) return false;
  const startQuote = quoteAncestor(state.doc, state.selection.path);
  const endQuote = quoteAncestor(state.doc, state.selection.endPath);
  if (startQuote && endQuote && comparePaths(startQuote, endQuote) === 0) {
    const quote = getNodeAtPath(state.doc, startQuote);
    const parentPath = startQuote.slice(0, -1);
    const quoteIndex = startQuote.at(-1) as number;
    const mapPoint = (path: readonly number[]): number[] => [
      ...parentPath,
      quoteIndex + Number(path[startQuote.length] ?? 0),
      ...path.slice(startQuote.length + 1),
    ];
    try {
      const transaction = state.createTransaction().replaceNode(startQuote, quote.content);
      state.schema.validate(transaction.doc);
      transaction.setSelection(new Selection(
        mapPoint(state.selection.path),
        state.selection.from,
        state.selection.to,
        mapPoint(state.selection.endPath),
      ));
      editor.dispatch(transaction);
      return true;
    } catch { return false; }
  }

  const startBlock = nearestBlockPath(state.doc, state.selection.path);
  const endBlock = nearestBlockPath(state.doc, state.selection.endPath);
  if (!startBlock || !endBlock) return false;
  const common = sharedPrefix(startBlock, endBlock);
  const sameBlock = comparePaths(startBlock, endBlock) === 0;
  const parentPath = sameBlock ? startBlock.slice(0, -1) : common;
  const startPath = sameBlock ? startBlock : [...parentPath, startBlock[parentPath.length] as number];
  const endPath = sameBlock ? endBlock : [...parentPath, endBlock[parentPath.length] as number];
  const startIndex = startPath.at(-1) as number;
  const endIndex = endPath.at(-1) as number;
  if (endIndex < startIndex) return false;
  let parent: Node;
  try { parent = getNodeAtPath(state.doc, parentPath); }
  catch { return false; }
  const blocks = parent.content.slice(startIndex, endIndex + 1);
  let quote: Node;
  try { quote = quoteType.create({}, blocks); }
  catch { return false; }
  const quotePath = [...parentPath, startIndex];
  const startRelative = state.selection.path.slice(startPath.length);
  const endRelative = state.selection.endPath.slice(endPath.length);
  try {
    const transaction = state.createTransaction();
    if (!parentPath.length) transaction.replace(startIndex, endIndex + 1, [quote]);
    else {
      for (let index = endIndex; index > startIndex; index -= 1) {
        transaction.replaceNode([...parentPath, index], []);
      }
      transaction.replaceNode(startPath, [quote]);
    }
    state.schema.validate(transaction.doc);
    transaction.setSelection(new Selection(
      [...quotePath, 0, ...startRelative],
      state.selection.from,
      state.selection.to,
      [...quotePath, blocks.length - 1, ...endRelative],
    ));
    editor.dispatch(transaction);
    return true;
  } catch { return false; }
}

export function insertList(editor: Editor, kind: 'bullet' | 'ordered' | 'task', items: readonly string[] = ['']): boolean {
  const { schema } = editor.state;
  const listName = kind === 'bullet' ? 'bullet_list' : kind === 'ordered' ? 'ordered_list' : 'task_list';
  const itemName = kind === 'task' ? 'task_item' : 'list_item';
  if (!schema.nodes[listName] || !schema.nodes[itemName] || !schema.nodes.paragraph) return false;
  const content = (items.length ? items : ['']).map((item) => schema.node(
    itemName,
    kind === 'task' ? { checked: false } : {},
    [schema.node('paragraph', {}, [schema.text(item)])],
  ));
  return insertNode(editor, schema.node(listName, kind === 'ordered' ? { start: 1 } : {}, content));
}

export function insertTable(editor: Editor, options: TableOptions = {}): boolean {
  const { schema } = editor.state;
  if (!schema.nodes.table || !schema.nodes.table_row || !schema.nodes.table_cell || !schema.nodes.paragraph) return false;
  const rows = Math.max(1, Math.min(50, Math.trunc(options.rows ?? 3)));
  const columns = Math.max(1, Math.min(20, Math.trunc(options.columns ?? 3)));
  const headerRow = options.headerRow !== false && Boolean(schema.nodes.table_header);
  const content = Array.from({ length: rows }, (_, rowIndex) => schema.node('table_row', {},
    Array.from({ length: columns }, () => schema.node(
      rowIndex === 0 && headerRow ? 'table_header' : 'table_cell',
      {},
      [schema.node('paragraph', {}, [schema.text('')])],
    )),
  ));
  return insertNode(editor, schema.node('table', {}, content));
}

export function splitBlock(editor: Editor): boolean {
  if (!editor.editable) return false;
  const { state } = editor;
  if (state.selection instanceof GapSelection) return insertTextAtGap(editor, state.selection, '');
  if (state.selection instanceof AllSelection) return replaceAllSelection(editor, '');
  if (state.selection instanceof NodeSelection) {
    const selected = getNodeAtPath(state.doc, state.selection.nodePath);
    if (selected.type.isInline) {
      editor.dispatch(state.createTransaction().setSelection(Selection.cursor(state.selection.endPath, state.selection.to)));
      return splitBlock(editor);
    }
    const parentPath = state.selection.nodePath.slice(0, -1);
    const selectedIndex = state.selection.nodePath.at(-1) as number;
    const parent = getNodeAtPath(state.doc, parentPath);
    const next = parent.content[selectedIndex + 1];
    const nextLeaf = next && next.textContent.length === 0 ? getTextLeaves(next)[0] : undefined;
    if (nextLeaf) {
      editor.dispatch(state.createTransaction().setSelection(Selection.cursor([
        ...parentPath, selectedIndex + 1, ...nextLeaf.path,
      ], 0)));
      return true;
    }
    return insertTextAtGap(editor, new GapSelection(state.doc, state.selection.structuralTo), '');
  }
  if (state.selection.kind !== 'text') return false;
  if (!state.selection.isCollapsed) {
    return editor.runCommandBatch(() => deleteSelection(editor) && splitBlock(editor));
  }
  const { path, from, to } = state.selection;
  if (path.length < 2 || !state.selection.isSingleText) return false;
  const blockPath = path.slice(0, -1);
  const blockIndex = blockPath.at(-1) as number;
  const textIndex = path.at(-1) as number;
  const block = getNodeAtPath(state.doc, blockPath);
  const text = block.child(textIndex);
  if (!text.isText) return false;
  const containerPath = blockPath.slice(0, -1);
  const container = getNodeAtPath(state.doc, containerPath);
  if (container.type.name === 'blockquote'
    && blockIndex === container.childCount - 1
    && block.textContent.length === 0) {
    const paragraph = paragraphWithText(editor, '');
    if (!paragraph) return false;
    const replacements = container.childCount === 1
      ? [paragraph]
      : [container.copy(container.content.slice(0, -1)), paragraph];
    const landing = [...containerPath.slice(0, -1), (containerPath.at(-1) as number) + replacements.length - 1, 0];
    const transaction = state.createTransaction().replaceNode(containerPath, replacements)
      .setSelection(Selection.cursor(landing, 0));
    return dispatchIfValid(editor, transaction);
  }
  const leftText = (text.text ?? '').slice(0, from);
  const rightText = (text.text ?? '').slice(to);
  const left = block.copy([...block.content.slice(0, textIndex), text.withText(leftText)]);
  const nextType = block.type.name === 'heading' ? state.schema.nodes.paragraph : block.type;
  const right = nextType.create(block.type === nextType ? block.attrs : {}, [text.withText(rightText), ...block.content.slice(textIndex + 1)]);
  const itemPath = blockPath.slice(0, -1);
  const item = itemPath.length ? getNodeAtPath(state.doc, itemPath) : undefined;
  if (item && LIST_ITEMS.includes(item.type.name)) {
    if (item.childCount === 1 && item.textContent.length === 0) return outdentListItem(editor);
    const paragraphIndex = blockPath.at(-1) as number;
    const itemIndex = itemPath.at(-1) as number;
    const leftItem = item.copy([...item.content.slice(0, paragraphIndex), left]);
    const rightItem = item.type.create(
      item.type.name === 'task_item' ? { ...item.attrs, checked: false } : item.attrs,
      [right, ...item.content.slice(paragraphIndex + 1)],
    );
    const transaction = state.createTransaction()
      .replaceNode(itemPath, [leftItem, rightItem])
      .setSelection(Selection.cursor([...itemPath.slice(0, -1), itemIndex + 1, 0, 0], 0));
    editor.dispatch(transaction);
    return true;
  }
  const transaction = state.createTransaction()
    .replaceNode(blockPath, [left, right])
    .setSelection(Selection.cursor([...blockPath.slice(0, -1), blockIndex + 1, 0], 0));
  editor.dispatch(transaction);
  return true;
}

export function joinBackward(editor: Editor): boolean {
  if (!editor.editable) return false;
  const { state } = editor;
  if (state.selection.kind !== 'text') return false;
  const { path, from, to } = state.selection;
  if (path.length < 2 || !state.selection.isCollapsed || from !== 0 || to !== 0) return false;
  const currentPath = path.slice(0, -1);
  const currentIndex = currentPath.at(-1) as number;
  if (currentIndex === 0) {
    const itemPath = currentPath.slice(0, -1);
    const item = itemPath.length ? getNodeAtPath(state.doc, itemPath) : undefined;
    if (item?.type.name === 'blockquote') {
      const replacements = item.childCount === 1
        ? [item.child(0)]
        : [item.child(0), item.copy(item.content.slice(1))];
      const itemIndex = itemPath.at(-1) as number;
      const transaction = state.createTransaction().replaceNode(itemPath, replacements)
        .setSelection(Selection.cursor([...itemPath.slice(0, -1), itemIndex, ...path.slice(currentPath.length)], 0));
      return dispatchIfValid(editor, transaction);
    }
    if (!item || !LIST_ITEMS.includes(item.type.name)) return false;
    const itemIndex = itemPath.at(-1) as number;
    if (itemIndex === 0) return outdentListItem(editor);
    const listPath = itemPath.slice(0, -1);
    const list = getNodeAtPath(state.doc, listPath);
    const previousItem = list.child(itemIndex - 1);
    const previousBlockIndex = previousItem.content.findLastIndex((node) => TEXT_BLOCKS.includes(node.type.name));
    const previousBlock = previousItem.content[previousBlockIndex];
    const currentBlock = item.content[0];
    if (!previousBlock || !currentBlock || !TEXT_BLOCKS.includes(previousBlock.type.name) || !TEXT_BLOCKS.includes(currentBlock.type.name)) return false;
    const joined = joinTextBlockContent(previousBlock, currentBlock);
    const mergedBlock = previousBlock.copy(joined.content);
    const mergedItem = previousItem.copy([
      ...previousItem.content.slice(0, previousBlockIndex),
      mergedBlock,
      ...previousItem.content.slice(previousBlockIndex + 1),
      ...item.content.slice(1),
    ]);
    const previousItemPath = [...listPath, itemIndex - 1];
    const transaction = state.createTransaction()
      .replaceNode(previousItemPath, [mergedItem])
      .replaceNode(itemPath, [])
      .setSelection(Selection.cursor([
        ...previousItemPath,
        previousBlockIndex,
        joined.caretIndex,
      ], joined.caretOffset));
    editor.dispatch(transaction);
    return true;
  }
  const parentPath = currentPath.slice(0, -1);
  const parent = getNodeAtPath(state.doc, parentPath);
  const previousIndex = currentIndex - 1;
  const previous = parent.child(previousIndex);
  const current = parent.child(currentIndex);
  if (!TEXT_BLOCKS.includes(previous.type.name) || !TEXT_BLOCKS.includes(current.type.name)) return false;
  const joined = joinTextBlockContent(previous, current);
  const merged = previous.copy(joined.content);
  const previousPath = [...parentPath, previousIndex];
  const transaction = state.createTransaction()
    .replaceNode(previousPath, [merged])
    .replaceNode(currentPath, [])
    .setSelection(Selection.cursor([
      ...previousPath,
      joined.caretIndex,
    ], joined.caretOffset));
  editor.dispatch(transaction);
  return true;
}

/** Joins the text block or list item after a collapsed cursor into its current block. */
export function joinForward(editor: Editor): boolean {
  if (!editor.editable) return false;
  const { state } = editor;
  if (state.selection.kind !== 'text') return false;
  const { path, from } = state.selection;
  if (path.length < 2 || !state.selection.isCollapsed) return false;
  const target = getNodeAtPath(state.doc, path);
  if (!target.isText || from !== (target.text?.length ?? 0)) return false;
  const blockPath = path.slice(0, -1);
  const block = getNodeAtPath(state.doc, blockPath);
  const blockLeaves = getTextLeaves(block);
  if (comparePaths(blockLeaves.at(-1)?.path ?? [], path.slice(blockPath.length)) !== 0) return false;

  const blockIndex = blockPath.at(-1) as number;
  const parentPath = blockPath.slice(0, -1);
  const parent = getNodeAtPath(state.doc, parentPath);
  if (blockIndex < parent.childCount - 1) {
    const next = parent.child(blockIndex + 1);
    if (!TEXT_BLOCKS.includes(block.type.name) || !TEXT_BLOCKS.includes(next.type.name)) return false;
    const joined = joinTextBlockContent(block, next);
    const transaction = state.createTransaction()
      .replaceNode(blockPath, [block.copy(joined.content)])
      .replaceNode([...parentPath, blockIndex + 1], [])
      .setSelection(Selection.cursor([...blockPath, joined.caretIndex], joined.caretOffset));
    editor.dispatch(transaction);
    return true;
  }

  const itemPath = parentPath;
  if (!itemPath.length || !LIST_ITEMS.includes(parent.type.name)) return false;
  const listPath = itemPath.slice(0, -1);
  const list = getNodeAtPath(state.doc, listPath);
  const itemIndex = itemPath.at(-1) as number;
  if (itemIndex >= list.childCount - 1) {
    if (listPath.length !== 1) return false;
    const listIndex = listPath[0] as number;
    const nextRoot = state.doc.content[listIndex + 1];
    if (!nextRoot) return false;
    if (TEXT_BLOCKS.includes(nextRoot.type.name)) {
      const joined = joinTextBlockContent(block, nextRoot);
      const mergedItem = parent.copy([
        ...parent.content.slice(0, blockIndex),
        block.copy(joined.content),
        ...parent.content.slice(blockIndex + 1),
      ]);
      const updatedList = list.copy([...list.content.slice(0, itemIndex), mergedItem]);
      const transaction = state.createTransaction()
        .replaceNode(listPath, [updatedList])
        .replaceNode([listIndex + 1], [])
        .setSelection(Selection.cursor([...blockPath, joined.caretIndex], joined.caretOffset));
      editor.dispatch(transaction);
      return true;
    }
    if (nextRoot.type === list.type && nextRoot.childCount) {
      const nextItem = nextRoot.child(0);
      const nextBlock = nextItem.content[0];
      if (!nextBlock || !TEXT_BLOCKS.includes(nextBlock.type.name)) return false;
      const joined = joinTextBlockContent(block, nextBlock);
      const mergedItem = parent.copy([
        ...parent.content.slice(0, blockIndex),
        block.copy(joined.content),
        ...parent.content.slice(blockIndex + 1),
        ...nextItem.content.slice(1),
      ]);
      const updatedList = list.copy([
        ...list.content.slice(0, itemIndex),
        mergedItem,
        ...nextRoot.content.slice(1),
      ]);
      const transaction = state.createTransaction()
        .replaceNode(listPath, [updatedList])
        .replaceNode([listIndex + 1], [])
        .setSelection(Selection.cursor([...blockPath, joined.caretIndex], joined.caretOffset));
      editor.dispatch(transaction);
      return true;
    }
    return false;
  }
  const nextItem = list.child(itemIndex + 1);
  const nextBlock = nextItem.content[0];
  if (!nextBlock || !TEXT_BLOCKS.includes(block.type.name) || !TEXT_BLOCKS.includes(nextBlock.type.name)) return false;
  const joined = joinTextBlockContent(block, nextBlock);
  const mergedItem = parent.copy([
    ...parent.content.slice(0, blockIndex),
    block.copy(joined.content),
    ...nextItem.content.slice(1),
  ]);
  const transaction = state.createTransaction()
    .replaceNode(itemPath, [mergedItem])
    .replaceNode([...listPath, itemIndex + 1], [])
    .setSelection(Selection.cursor([...blockPath, joined.caretIndex], joined.caretOffset));
  editor.dispatch(transaction);
  return true;
}
