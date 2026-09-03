import type { Editor } from './editor';
import type { Node } from './schema';
import { Selection } from './selection';
import { comparePaths } from './transaction/path';

export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

export interface TextMatch {
  path: readonly number[];
  from: number;
  endPath: readonly number[];
  to: number;
  text: string;
}

interface InlineSegment {
  path: readonly number[];
  start: number;
  end: number;
}

function isWord(value: string | undefined): boolean { return Boolean(value && /[\p{L}\p{N}_]/u.test(value)); }

/** Finds model ranges across adjacent marked fragments within every text block. */
export function findText(document: Node, query: string, options: SearchOptions = {}): readonly TextMatch[] {
  if (!query) return [];
  const needle = options.caseSensitive ? query : query.toLocaleLowerCase();
  const matches: TextMatch[] = [];
  document.descendants((node, path) => {
    if (node.isText || !node.content.some((child) => child.isText) || !node.content.every((child) => child.type.isInline)) return;
    let value = '';
    const segments: InlineSegment[] = [];
    node.content.forEach((child, index) => {
      const start = value.length;
      value += child.isText ? child.text ?? '' : child.type.name === 'hard_break' ? '\n' : '';
      if (child.isText) segments.push({ path: Object.freeze([...path, index]), start, end: value.length });
    });
    const haystack = options.caseSensitive ? value : value.toLocaleLowerCase();
    for (let offset = 0; offset <= haystack.length - needle.length;) {
      const index = haystack.indexOf(needle, offset);
      if (index < 0) break;
      const end = index + needle.length;
      const isWhole = !options.wholeWord || (!isWord(value[index - 1]) && !isWord(value[end]));
      const startSegment = segments.find((segment) => index >= segment.start && index < segment.end);
      const endSegment = [...segments].reverse().find((segment) => end > segment.start && end <= segment.end);
      if (isWhole && startSegment && endSegment) {
        matches.push({
          path: startSegment.path,
          from: index - startSegment.start,
          endPath: endSegment.path,
          to: end - endSegment.start,
          text: value.slice(index, end),
        });
      }
      offset = index + Math.max(needle.length, 1);
    }
  });
  return Object.freeze(matches);
}

/** Selects the next match after the current range and wraps at the end. */
export function selectNextMatch(editor: Editor, query: string, options: SearchOptions = {}): boolean {
  const matches = findText(editor.state.doc, query, options);
  if (!matches.length) return false;
  const selection = editor.state.selection;
  const next = matches.find((match) => comparePaths(match.path, selection.endPath) > 0
    || (comparePaths(match.path, selection.endPath) === 0 && match.from >= selection.to)) ?? matches[0];
  if (!next) return false;
  editor.dispatch(editor.state.createTransaction().setSelection(Selection.range(next.path, next.from, next.endPath, next.to)));
  return true;
}

/** Replaces all matches in one transaction so the entire operation is one undo step. */
export function replaceAllText(editor: Editor, query: string, replacement: string, options: SearchOptions = {}): number {
  if (!editor.editable) return 0;
  const matches = findText(editor.state.doc, query, options);
  if (!matches.length) return 0;
  const transaction = editor.state.createTransaction();
  [...matches].reverse().forEach((match) => {
    transaction.replaceTextRange(match.path, match.from, match.endPath, match.to, replacement);
  });
  const first = matches[0] as TextMatch;
  transaction.setSelection(Selection.cursor(first.path, first.from + replacement.length));
  editor.dispatch(transaction);
  return matches.length;
}
