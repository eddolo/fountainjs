import type { Editor } from './editor';
import { Selection } from './selection';
import { Mark, Node, type Attributes } from './schema';
import { getNodeAtPath } from './transaction/path';

export type Command = (editor: Editor) => boolean;

function dispatchTextSelection(editor: Editor, transaction: ReturnType<Editor['createTransaction']>, path: readonly number[], from: number, to: number): boolean {
  transaction.setSelection(new Selection(path, from, to));
  editor.dispatch(transaction);
  return true;
}

export function insertText(editor: Editor, text: string): boolean {
  if (!editor.editable || !text) return false;
  const { state } = editor;
  const { path, endPath, from, to } = state.selection;
  const target = getNodeAtPath(state.doc, path);
  if (!target.isText) return false;
  const transaction = state.createTransaction();
  if (state.selection.isSingleText) transaction.replaceText(path, from, to, text);
  else transaction.replaceTextRange(path, from, endPath, to, text);
  return dispatchTextSelection(editor, transaction, path, from + text.length, from + text.length);
}

export function deleteSelection(editor: Editor): boolean {
  const { state } = editor;
  const { path, endPath, from, to } = state.selection;
  if (state.selection.isCollapsed) return false;
  const transaction = state.createTransaction();
  if (state.selection.isSingleText) transaction.replaceText(path, from, to, '');
  else transaction.replaceTextRange(path, from, endPath, to, '');
  return dispatchTextSelection(editor, transaction, path, from, from);
}

export function setContent(editor: Editor, content: Node): boolean {
  if (content.type !== editor.state.schema.topNodeType) throw new Error('Content must use the editor schema and top node type.');
  const transaction = editor.state.createTransaction()
    .replace(0, editor.state.doc.childCount, content.content)
    .setMeta('content$replace', true);
  editor.dispatch(transaction);
  return true;
}

export function selectText(editor: Editor, path: readonly number[], from: number, to = from): boolean {
  editor.dispatch(editor.state.createTransaction().setSelection(new Selection(path, from, to)));
  return true;
}

export function isMarkActive(editor: Editor, markName: string): boolean {
  const { path } = editor.state.selection;
  try {
    return getNodeAtPath(editor.state.doc, path).marks.some((mark) => mark.type.name === markName);
  } catch {
    return false;
  }
}

export function toggleMark(editor: Editor, markName: string): boolean {
  if (!editor.editable) return false;
  const { state } = editor;
  const { path, from, to } = state.selection;
  if (state.selection.isCollapsed) return false;
  const target = getNodeAtPath(state.doc, path);
  if (!target.isText) return false;
  const markType = state.schema.marks[markName];
  if (!markType) return false;
  if (!state.selection.isSingleText) {
    const { endPath } = state.selection;
    const parentPath = path.slice(0, -1);
    if (path.length !== endPath.length || !parentPath.every((part, index) => part === endPath[index])) return false;
    const parent = getNodeAtPath(state.doc, parentPath);
    const startIndex = path.at(-1) as number;
    const endIndex = endPath.at(-1) as number;
    if (startIndex >= endIndex) return false;
    const selectedNodes = parent.content.slice(startIndex, endIndex + 1);
    if (!selectedNodes.length || selectedNodes.some((node) => !node.isText)) return false;
    const activeAcrossRange = selectedNodes.every((node) => node.marks.some((mark) => mark.type === markType));
    const transaction = state.createTransaction();
    if (activeAcrossRange) transaction.removeMarkRange(path, from, endPath, to, markType);
    else transaction.addMarkRange(path, from, endPath, to, new Mark(markType));

    let outputIndex = startIndex;
    let selectedStart: number[] | undefined;
    let selectedEnd: number[] | undefined;
    let selectedEndOffset = 0;
    selectedNodes.forEach((node, relativeIndex) => {
      const nodeFrom = relativeIndex === 0 ? from : 0;
      const nodeTo = relativeIndex === selectedNodes.length - 1 ? to : node.text?.length ?? 0;
      if (nodeFrom) outputIndex += 1;
      if (nodeTo > nodeFrom) {
        selectedStart ??= [...parentPath, outputIndex];
        selectedEnd = [...parentPath, outputIndex];
        selectedEndOffset = nodeTo - nodeFrom;
        outputIndex += 1;
      }
      if (nodeTo < (node.text?.length ?? 0)) outputIndex += 1;
    });
    if (!selectedStart || !selectedEnd) return false;
    transaction.setSelection(Selection.range(selectedStart, 0, selectedEnd, selectedEndOffset));
    editor.dispatch(transaction);
    return true;
  }
  const active = target.marks.some((mark) => mark.type === markType);
  const offset = from > 0 ? 1 : 0;
  const transaction = active
    ? state.createTransaction().removeMark(path, from, to, markType)
    : state.createTransaction().addMark(path, from, to, new Mark(markType));
  const selectedPath = [...path.slice(0, -1), path[path.length - 1] + offset];
  return dispatchTextSelection(editor, transaction, selectedPath, 0, to - from);
}

export function setBlockType(editor: Editor, typeName: string, attrs: Attributes = {}): boolean {
  if (!editor.editable) return false;
  const { state } = editor;
  const blockIndex = state.selection.path[0];
  const block = state.doc.content[blockIndex];
  const type = state.schema.nodes[typeName];
  if (!block || !type || !type.isBlock) return false;
  const replacement = new Node(type, attrs, block.content);
  const transaction = state.createTransaction().replace(blockIndex, blockIndex + 1, [replacement]);
  editor.dispatch(transaction);
  return true;
}

export function insertBlock(editor: Editor, typeName: string, attrs: Attributes = {}, text = ''): boolean {
  if (!editor.editable) return false;
  const { state } = editor;
  const type = state.schema.nodes[typeName];
  if (!type || !type.isBlock) return false;
  const blockIndex = state.selection.path[0] ?? state.doc.childCount - 1;
  const content = type.spec.atom ? [] : [state.schema.text(text)];
  const block = new Node(type, attrs, content);
  const transaction = state.createTransaction().replace(blockIndex + 1, blockIndex + 1, [block]);
  if (!type.spec.atom) transaction.setSelection(Selection.cursor([blockIndex + 1, 0], text.length));
  editor.dispatch(transaction);
  return true;
}

export function splitBlock(editor: Editor): boolean {
  if (!editor.editable) return false;
  const { state } = editor;
  const { path, from, to } = state.selection;
  if (path.length !== 2 || !state.selection.isSingleText) return false;
  const blockIndex = path[0];
  const textIndex = path[1];
  const block = state.doc.child(blockIndex);
  const text = block.child(textIndex);
  if (!text.isText) return false;
  const leftText = (text.text ?? '').slice(0, from);
  const rightText = (text.text ?? '').slice(to);
  const left = block.copy([...block.content.slice(0, textIndex), text.withText(leftText)]);
  const nextType = block.type.name === 'heading' ? state.schema.nodes.paragraph : block.type;
  const right = nextType.create(block.type === nextType ? block.attrs : {}, [text.withText(rightText), ...block.content.slice(textIndex + 1)]);
  const transaction = state.createTransaction()
    .replace(blockIndex, blockIndex + 1, [left, right])
    .setSelection(Selection.cursor([blockIndex + 1, 0], 0));
  editor.dispatch(transaction);
  return true;
}

export function joinBackward(editor: Editor): boolean {
  if (!editor.editable) return false;
  const { state } = editor;
  const { path, from, to } = state.selection;
  if (path.length !== 2 || !state.selection.isCollapsed || from !== 0 || to !== 0 || path[0] === 0) return false;
  const previousIndex = path[0] - 1;
  const previous = state.doc.child(previousIndex);
  const current = state.doc.child(path[0]);
  if (!['paragraph', 'heading'].includes(previous.type.name) || !['paragraph', 'heading'].includes(current.type.name)) return false;
  const previousLength = previous.content.at(-1)?.text?.length ?? 0;
  const merged = previous.copy([...previous.content, ...current.content]);
  const transaction = state.createTransaction()
    .replace(previousIndex, path[0] + 1, [merged])
    .setSelection(Selection.cursor([previousIndex, Math.max(0, previous.childCount - 1)], previousLength));
  editor.dispatch(transaction);
  return true;
}
