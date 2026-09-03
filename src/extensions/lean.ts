import {
  AllSelection,
  GapSelection,
  Node,
  NodeSelection,
  Plugin,
  Selection,
  type Editor,
} from '../core';
import { getNodeAtPath } from '../core/transaction/path';
import { LeanController, MAX_LEAN_SOURCE_LENGTH, createLeanProvider, type LeanProvider } from '../lean';
import { defineExtension, type FountainExtension } from './extension';

export const LEAN_UNICODE_SHORTCUTS = Object.freeze({
  '\\forall': '∀', '\\exists': '∃', '\\fun': 'λ', '\\lambda': 'λ',
  '\\to': '→', '\\->': '→', '\\mapsto': '↦', '\\and': '∧', '\\or': '∨', '\\not': '¬',
  '\\ne': '≠', '\\le': '≤', '\\ge': '≥', '\\in': '∈', '\\notin': '∉', '\\subset': '⊂',
  '\\Nat': 'ℕ', '\\Int': 'ℤ', '\\Rat': 'ℚ', '\\Real': 'ℝ',
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\epsilon': 'ε',
  '\\theta': 'θ', '\\lambda_': 'λ', '\\mu': 'μ', '\\pi': 'π', '\\sigma': 'σ', '\\phi': 'φ',
  '\\omega': 'ω', '\\times': '×', '\\comp': '∘', '\\vdash': '⊢', '\\models': '⊨',
} as const);

export interface LeanExtensionOptions {
  /** Optional explicit provider. Omit it for fully functional source-only mode. */
  readonly provider?: LeanProvider;
  /** Enables backslash-shortcut expansion on Tab inside Lean blocks. Defaults to true. */
  readonly unicodeInput?: boolean;
}

export interface LeanService {
  readonly mode: 'source-only' | LeanProvider['descriptor']['mode'];
  readonly provider?: LeanProvider;
  createController(editor: Editor): LeanController;
}

function isLeanBlock(node: Node): boolean {
  return node.type.name === 'code_block' && String(node.attrs.language).toLowerCase() === 'lean';
}

export function getLeanBlockPath(editor: Editor, supplied?: readonly number[]): readonly number[] | null {
  try {
    if (supplied) return isLeanBlock(getNodeAtPath(editor.state.doc, supplied)) ? Object.freeze([...supplied]) : null;
    const selection = editor.state.selection;
    const candidate = selection instanceof NodeSelection ? selection.nodePath : selection.path;
    for (let length = candidate.length; length > 0; length -= 1) {
      const path = candidate.slice(0, length);
      if (isLeanBlock(getNodeAtPath(editor.state.doc, path))) return Object.freeze([...path]);
    }
    return null;
  } catch { return null; }
}

function validSource(source: string): boolean {
  return typeof source === 'string' && source.length <= MAX_LEAN_SOURCE_LENGTH && !source.includes('\0');
}

function insertionIndex(editor: Editor): { index: number; replaceTo: number } {
  const { doc, selection } = editor.state;
  if (selection instanceof AllSelection) return { index: 0, replaceTo: doc.childCount };
  if (selection instanceof GapSelection && selection.parentPath.length === 0) {
    return { index: selection.index, replaceTo: selection.index };
  }
  const index = Math.min(doc.childCount, (selection.endPath[0] ?? doc.childCount - 1) + 1);
  return { index, replaceTo: index };
}

/** Inserts an editable `code_block` whose portable language attribute is `lean`. */
export function insertLeanBlock(editor: Editor, source = ''): boolean {
  if (!editor.editable || !validSource(source)) return false;
  const { schema } = editor.state;
  const type = schema.nodes.code_block;
  if (!type) return false;
  let block: Node;
  try { block = type.create({ language: 'lean', lineNumbers: true }, [schema.text(source)]); }
  catch { return false; }
  const { index, replaceTo } = insertionIndex(editor);
  const paragraph = schema.nodes.paragraph?.create({}, [schema.text('')]);
  const transaction = editor.state.createTransaction().replace(
    index,
    replaceTo,
    paragraph ? [block, paragraph] : [block],
  );
  transaction.setSelection(Selection.cursor([index, 0], source.length));
  editor.dispatch(transaction);
  return true;
}

/** Replaces a Lean block's source without persisting diagnostics or provider state. */
export function setLeanSource(editor: Editor, source: string, blockPath?: readonly number[]): boolean {
  if (!editor.editable || !validSource(source)) return false;
  const path = getLeanBlockPath(editor, blockPath);
  if (!path) return false;
  const current = getNodeAtPath(editor.state.doc, path);
  let replacement: Node;
  try { replacement = current.type.create(current.attrs, [editor.state.schema.text(source)]); }
  catch { return false; }
  const transaction = editor.state.createTransaction().replaceNode(path, [replacement]);
  transaction.setSelection(Selection.cursor([...path, 0], source.length));
  editor.dispatch(transaction);
  return true;
}

/** Expands the longest supported backslash abbreviation immediately before the caret. */
export function replaceLeanUnicode(editor: Editor): boolean {
  if (!editor.editable) return false;
  const selection = editor.state.selection;
  if (selection.kind !== 'text' || !selection.isCollapsed) return false;
  if (!getLeanBlockPath(editor)) return false;
  const node = getNodeAtPath(editor.state.doc, selection.path);
  if (!node.isText) return false;
  const before = (node.text ?? '').slice(0, selection.from);
  const shortcut = Object.keys(LEAN_UNICODE_SHORTCUTS)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => before.endsWith(candidate));
  if (!shortcut) return false;
  const symbol = LEAN_UNICODE_SHORTCUTS[shortcut as keyof typeof LEAN_UNICODE_SHORTCUTS];
  const from = selection.from - shortcut.length;
  const transaction = editor.state.createTransaction().replaceText(selection.path, from, selection.from, symbol);
  transaction.setSelection(Selection.cursor(selection.path, from + symbol.length));
  editor.dispatch(transaction);
  return true;
}

export const leanUnicodePlugin = new Plugin({
  props: {
    handleKeyDown: (editor, event) => {
      if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
      return replaceLeanUnicode(editor);
    },
  },
});

/** Creates a Lean capability with no implicit network or process dependency. */
export function createLeanExtension(options: LeanExtensionOptions = {}): FountainExtension {
  const provider = options.provider ? createLeanProvider(options.provider) : undefined;
  const service: LeanService = Object.freeze({
    mode: provider?.descriptor.mode ?? 'source-only',
    ...(provider ? { provider } : {}),
    createController: (editor: Editor) => new LeanController(editor, provider),
  });
  return defineExtension({
    name: 'lean',
    plugins: options.unicodeInput === false ? [] : [leanUnicodePlugin],
    commands: { insertLeanBlock, setLeanSource, replaceLeanUnicode },
    services: { lean: service },
  });
}

export const LeanExtension = createLeanExtension();
