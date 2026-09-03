import type { Editor } from './editor';
import { Selection } from './selection';
import { Mark, Node, type Attributes } from './schema';
import { outdentListItem } from './structure-commands';
import { mapMarkRangeSelection } from './transaction/mark-range-step';
import { comparePaths, getNodeAtPath, getTextLeaves, getTextRangeSegments } from './transaction/path';

export type Command = (editor: Editor) => boolean;

export interface ImageAttributes extends Attributes {
  src: string;
  alt?: string;
  title?: string;
  caption?: string;
  width?: string;
}

export interface TableOptions {
  rows?: number;
  columns?: number;
  headerRow?: boolean;
}

const SAFE_CONTENT_URL = /^(https?:|data:image\/(?:png|gif|jpe?g|webp);base64,|\/|#|\.)/i;

function dispatchTextSelection(editor: Editor, transaction: ReturnType<Editor['createTransaction']>, path: readonly number[], from: number, to: number): boolean {
  transaction.setSelection(new Selection(path, from, to));
  editor.dispatch(transaction);
  return true;
}

function sameMarks(left: readonly Mark[], right: readonly Mark[]): boolean {
  return left.length === right.length && left.every((mark) => right.some((candidate) => candidate.eq(mark)));
}

export function insertText(editor: Editor, text: string): boolean {
  if (!editor.editable || !text) return false;
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
  const { state } = editor;
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
  const { state } = editor;
  const { path, from } = state.selection;
  if (from > 0) {
    const transaction = state.createTransaction()
      .replaceText(path, from - 1, from, '')
      .setSelection(Selection.cursor(path, from - 1));
    editor.dispatch(transaction);
    return true;
  }
  const leaves = getTextLeaves(state.doc);
  const index = leaves.findIndex((leaf) => comparePaths(leaf.path, path) === 0);
  const previous = leaves[index - 1];
  if (!previous) return false;
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
  if (content.type !== editor.state.schema.topNodeType) throw new Error('Content must use the editor schema and top node type.');
  const transaction = editor.state.createTransaction()
    .replace(0, editor.state.doc.childCount, content.content)
    .setMeta('content$replace', true);
  editor.dispatch(transaction);
  return true;
}

/** Inserts a parsed document fragment while preserving inline marks and block structure. */
export function insertDocument(editor: Editor, document: Node): boolean {
  if (!editor.editable || document.type !== editor.state.schema.topNodeType || !document.childCount) return false;
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

  if (path.length === 2) {
    const blockIndex = path[0] as number;
    const textIndex = path[1] as number;
    const block = state.doc.child(blockIndex);
    const value = target.text ?? '';
    const left = block.copy([...block.content.slice(0, textIndex), target.withText(value.slice(0, from))]);
    const right = block.type.create(block.attrs, [target.withText(value.slice(from)), ...block.content.slice(textIndex + 1)]);
    const transaction = state.createTransaction().replaceNode([blockIndex], [left, ...blocks, right]);
    const lastInserted = blocks.at(-1);
    if (lastInserted) {
      const leaf = getTextLeaves(lastInserted).at(-1);
      if (leaf) transaction.setSelection(Selection.cursor([blockIndex + blocks.length, ...leaf.path], leaf.node.text?.length ?? 0));
    }
    editor.dispatch(transaction);
    return true;
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

export function isMarkActive(editor: Editor, markName: string): boolean {
  try {
    const { state } = editor;
    if (state.selection.isCollapsed) return state.storedMarks.some((mark) => mark.type.name === markName);
    const { path, endPath, from, to } = state.selection;
    const segments = getTextRangeSegments(state.doc, path, from, endPath, to).filter((segment) => segment.to > segment.from);
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
  const { path, endPath, from, to } = state.selection;
  const mapped = mapMarkRangeSelection(state.doc, path, from, endPath, to);
  if (!mapped) return false;
  const transaction = state.createTransaction()
    .addMarkRange(path, from, endPath, to, markType.create({ href: value, title: '', target: '_blank', ...attrs }))
    .setSelection(Selection.range(mapped.startPath, 0, mapped.endPath, mapped.endOffset));
  editor.dispatch(transaction);
  return true;
}

export function unsetLink(editor: Editor): boolean {
  if (!editor.editable || editor.state.selection.isCollapsed) return false;
  const { state } = editor;
  const markType = state.schema.marks.link;
  if (!markType) return false;
  const { path, endPath, from, to } = state.selection;
  const mapped = mapMarkRangeSelection(state.doc, path, from, endPath, to);
  if (!mapped) return false;
  const transaction = state.createTransaction()
    .removeMarkRange(path, from, endPath, to, markType)
    .setSelection(Selection.range(mapped.startPath, 0, mapped.endPath, mapped.endOffset));
  editor.dispatch(transaction);
  return true;
}

export function toggleMark(editor: Editor, markName: string): boolean {
  if (!editor.editable) return false;
  const { state } = editor;
  const { path, from, to } = state.selection;
  const target = getNodeAtPath(state.doc, path);
  if (!target.isText) return false;
  const markType = state.schema.marks[markName];
  if (!markType) return false;
  if (state.selection.isCollapsed) {
    const active = state.storedMarks.some((mark) => mark.type === markType);
    const marks = active
      ? state.storedMarks.filter((mark) => mark.type !== markType)
      : [...state.storedMarks.filter((mark) => mark.type !== markType), markType.create()];
    editor.dispatch(state.createTransaction().setStoredMarks(marks));
    return true;
  }
  const { endPath } = state.selection;
  const segments = getTextRangeSegments(state.doc, path, from, endPath, to)
    .filter((segment) => segment.to > segment.from);
  if (!segments.length) return false;
  const activeAcrossRange = segments.every((segment) => segment.node.marks.some((mark) => mark.type === markType));
  const mapped = mapMarkRangeSelection(state.doc, path, from, endPath, to);
  if (!mapped) return false;
  const transaction = state.createTransaction();
  if (activeAcrossRange) transaction.removeMarkRange(path, from, endPath, to, markType);
  else transaction.addMarkRange(path, from, endPath, to, markType.create());
  transaction.setSelection(Selection.range(mapped.startPath, 0, mapped.endPath, mapped.endOffset));
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
    editor.dispatch(state.createTransaction().setStoredMarks([
      ...state.storedMarks.filter((existing) => existing.type !== markType),
      mark,
    ]));
    return true;
  }
  const { path, endPath, from, to } = state.selection;
  const mapped = mapMarkRangeSelection(state.doc, path, from, endPath, to);
  if (!mapped) return false;
  editor.dispatch(state.createTransaction()
    .addMarkRange(path, from, endPath, to, mark)
    .setSelection(Selection.range(mapped.startPath, 0, mapped.endPath, mapped.endOffset)));
  return true;
}

export function unsetMark(editor: Editor, markName: string): boolean {
  if (!editor.editable) return false;
  const { state } = editor;
  const markType = state.schema.marks[markName];
  if (!markType) return false;
  if (state.selection.isCollapsed) {
    editor.dispatch(state.createTransaction().setStoredMarks(state.storedMarks.filter((mark) => mark.type !== markType)));
    return true;
  }
  const { path, endPath, from, to } = state.selection;
  const mapped = mapMarkRangeSelection(state.doc, path, from, endPath, to);
  if (!mapped) return false;
  editor.dispatch(state.createTransaction()
    .removeMarkRange(path, from, endPath, to, markType)
    .setSelection(Selection.range(mapped.startPath, 0, mapped.endPath, mapped.endOffset)));
  return true;
}

export function setTextAlignment(editor: Editor, align: 'left' | 'center' | 'right' | 'justify'): boolean {
  if (!editor.editable) return false;
  const path = editor.state.selection.path.slice(0, -1);
  const block = getNodeAtPath(editor.state.doc, path);
  if (!['paragraph', 'heading'].includes(block.type.name)) return false;
  try { block.type.create({ ...block.attrs, align }, block.content); }
  catch { return false; }
  editor.dispatch(editor.state.createTransaction().setNodeAttrs(path, { ...block.attrs, align }));
  return true;
}

/** Inserts a semantic hard-break node and leaves an editable text cursor after it. */
export function insertHardBreak(editor: Editor): boolean {
  if (!editor.editable) return false;
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
  const blockPath = state.selection.path.slice(0, -1);
  const block = getNodeAtPath(state.doc, blockPath);
  const type = state.schema.nodes[typeName];
  if (!block || !type || !type.isBlock) return false;
  let replacement: Node;
  try { replacement = type.create(attrs, block.content); }
  catch { return false; }
  const transaction = state.createTransaction().replaceNode(blockPath, [replacement]);
  try { state.schema.validate(transaction.doc); }
  catch { return false; }
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
  const source = attrs.src.trim();
  if (!source || !SAFE_CONTENT_URL.test(source)) return false;
  const type = editor.state.schema.nodes.image_super;
  if (!type) return false;
  return insertNode(editor, type.create({
    src: source,
    alt: attrs.alt ?? '',
    title: attrs.title ?? '',
    caption: attrs.caption ?? '',
    width: attrs.width ?? '100%',
  }));
}

export function insertQuote(editor: Editor, text = ''): boolean {
  const { schema } = editor.state;
  if (!schema.nodes.blockquote || !schema.nodes.paragraph) return false;
  return insertNode(editor, schema.node('blockquote', {}, [
    schema.node('paragraph', {}, [schema.text(text)]),
  ]));
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
  const { path, from, to } = state.selection;
  if (path.length < 2 || !state.selection.isSingleText) return false;
  const blockPath = path.slice(0, -1);
  const blockIndex = blockPath.at(-1) as number;
  const textIndex = path.at(-1) as number;
  const block = getNodeAtPath(state.doc, blockPath);
  const text = block.child(textIndex);
  if (!text.isText) return false;
  const leftText = (text.text ?? '').slice(0, from);
  const rightText = (text.text ?? '').slice(to);
  const left = block.copy([...block.content.slice(0, textIndex), text.withText(leftText)]);
  const nextType = block.type.name === 'heading' ? state.schema.nodes.paragraph : block.type;
  const right = nextType.create(block.type === nextType ? block.attrs : {}, [text.withText(rightText), ...block.content.slice(textIndex + 1)]);
  const itemPath = blockPath.slice(0, -1);
  const item = itemPath.length ? getNodeAtPath(state.doc, itemPath) : undefined;
  if (item && ['list_item', 'task_item'].includes(item.type.name)) {
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
  const { path, from, to } = state.selection;
  if (path.length < 2 || !state.selection.isCollapsed || from !== 0 || to !== 0) return false;
  const currentPath = path.slice(0, -1);
  const currentIndex = currentPath.at(-1) as number;
  if (currentIndex === 0) {
    const itemPath = currentPath.slice(0, -1);
    const item = itemPath.length ? getNodeAtPath(state.doc, itemPath) : undefined;
    if (!item || !['list_item', 'task_item'].includes(item.type.name)) return false;
    const itemIndex = itemPath.at(-1) as number;
    if (itemIndex === 0) return false;
    const listPath = itemPath.slice(0, -1);
    const list = getNodeAtPath(state.doc, listPath);
    const previousItem = list.child(itemIndex - 1);
    const previousBlock = previousItem.content.at(-1);
    const currentBlock = item.content[0];
    if (!previousBlock || !currentBlock || !['paragraph', 'heading'].includes(previousBlock.type.name) || !['paragraph', 'heading'].includes(currentBlock.type.name)) return false;
    const leaves = getTextLeaves(previousBlock);
    const leaf = leaves.at(-1);
    const mergedBlock = previousBlock.copy([...previousBlock.content, ...currentBlock.content]);
    const mergedItem = previousItem.copy([
      ...previousItem.content.slice(0, -1),
      mergedBlock,
      ...item.content.slice(1),
    ]);
    const previousItemPath = [...listPath, itemIndex - 1];
    const transaction = state.createTransaction()
      .replaceNode(previousItemPath, [mergedItem])
      .replaceNode(itemPath, [])
      .setSelection(Selection.cursor([
        ...previousItemPath,
        previousItem.childCount - 1,
        ...(leaf?.path ?? [0]),
      ], leaf?.node.text?.length ?? 0));
    editor.dispatch(transaction);
    return true;
  }
  const parentPath = currentPath.slice(0, -1);
  const parent = getNodeAtPath(state.doc, parentPath);
  const previousIndex = currentIndex - 1;
  const previous = parent.child(previousIndex);
  const current = parent.child(currentIndex);
  if (!['paragraph', 'heading'].includes(previous.type.name) || !['paragraph', 'heading'].includes(current.type.name)) return false;
  const previousLeaves = getTextLeaves(previous);
  const previousLeaf = previousLeaves.at(-1);
  const previousLength = previousLeaf?.node.text?.length ?? 0;
  const merged = previous.copy([...previous.content, ...current.content]);
  const previousPath = [...parentPath, previousIndex];
  const transaction = state.createTransaction()
    .replaceNode(previousPath, [merged])
    .replaceNode(currentPath, [])
    .setSelection(Selection.cursor([
      ...previousPath,
      ...(previousLeaf?.path ?? [Math.max(0, previous.childCount - 1)]),
    ], previousLength));
  editor.dispatch(transaction);
  return true;
}

/** Joins the text block or list item after a collapsed cursor into its current block. */
export function joinForward(editor: Editor): boolean {
  if (!editor.editable) return false;
  const { state } = editor;
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
    if (!['paragraph', 'heading'].includes(block.type.name) || !['paragraph', 'heading'].includes(next.type.name)) return false;
    const transaction = state.createTransaction()
      .replaceNode(blockPath, [block.copy([...block.content, ...next.content])])
      .replaceNode([...parentPath, blockIndex + 1], [])
      .setSelection(Selection.cursor(path, from));
    editor.dispatch(transaction);
    return true;
  }

  const itemPath = parentPath;
  if (!itemPath.length || !['list_item', 'task_item'].includes(parent.type.name)) return false;
  const listPath = itemPath.slice(0, -1);
  const list = getNodeAtPath(state.doc, listPath);
  const itemIndex = itemPath.at(-1) as number;
  if (itemIndex >= list.childCount - 1) return false;
  const nextItem = list.child(itemIndex + 1);
  const nextBlock = nextItem.content[0];
  if (!nextBlock || !['paragraph', 'heading'].includes(block.type.name) || !['paragraph', 'heading'].includes(nextBlock.type.name)) return false;
  const mergedItem = parent.copy([
    ...parent.content.slice(0, blockIndex),
    block.copy([...block.content, ...nextBlock.content]),
    ...nextItem.content.slice(1),
  ]);
  const transaction = state.createTransaction()
    .replaceNode(itemPath, [mergedItem])
    .replaceNode([...listPath, itemIndex + 1], [])
    .setSelection(Selection.cursor(path, from));
  editor.dispatch(transaction);
  return true;
}
