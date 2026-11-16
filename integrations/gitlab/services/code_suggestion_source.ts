import type { DefaultTreeAdapterMap } from 'parse5';
import { readGitLabCodeRendering } from './code_rendering';

type Element = DefaultTreeAdapterMap['element'];
const attr = (node: Element, name: string): string | undefined => node.attrs.find(item => item.name === name)?.value;
const offsets = /^[+-]\d{1,9}[+-]\d{1,9}$/u;
export interface GitLabSuggestionSource {
  /** Includes each source body line's terminator; an empty replacement is ''. */
  readonly text: string;
  readonly params: string;
  readonly fence: string;
  /** Markdown comment positions, never repository target line numbers. */
  readonly startLine: number;
  readonly endLine: number;
}
function refuse(): never { throw new Error('GITLAB_SUGGESTION_SOURCE_AMBIGUOUS'); }

/** Read project-preview carriers only. Published MR diff widgets require their
 * own adapter; this function never reconstructs code from added/deleted rows. */
export function readGitLabSuggestionSource(pre: Element, source: string): GitLabSuggestionSource {
  if (pre.tagName !== 'pre' || attr(pre, 'data-canonical-lang') !== 'suggestion'
    || typeof source !== 'string' || source.length > 1_048_576) return refuse();
  const position = attr(pre, 'data-sourcepos')?.match(/^(\d+):(\d+)-(\d+):(\d+)$/u);
  if (!position) return refuse();
  const [startLine, column, endLine] = position.slice(1).map(Number);
  const lines = source.split(/\r\n|[\r\n]/u);
  if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(column) || !Number.isSafeInteger(endLine)
    || startLine < 1 || endLine <= startLine || endLine > lines.length || column < 1 || column > 1024) return refuse();
  const opening = lines[startLine - 1], prefix = opening.slice(0, column - 1);
  // These verified source positions cover standalone, indented-list and quote
  // fences. Refuse unfamiliar container prefixes until they have fixture proof.
  if (!/^(?:[ \t]|>[ \t]?)*$/u.test(prefix)) return refuse();
  const header = opening.slice(column - 1).match(/^(`{3,}|~{3,})suggestion(?::([+-]\d{1,9}[+-]\d{1,9}))?[ \t]*$/u);
  const params = attr(pre, 'data-lang-params') ?? '';
  if (!header || header[1].length > 1024 || (params !== '' && !offsets.test(params)) || (header[2] ?? '') !== params) return refuse();
  const strip = (line: string): string => {
    if (line.startsWith(prefix)) return line.slice(prefix.length);
    if (!line.trim()) return '';
    return refuse();
  };
  const closing = strip(lines[endLine - 1]);
  const closingFence = closing.match(/^(`+|~+)[ \t]*$/u)?.[1];
  if (!closingFence || closingFence[0] !== header[1][0] || closingFence.length < header[1].length) return refuse();
  const body = lines.slice(startLine, endLine - 1).map(line => strip(line) + '\n').join('');
  const rendered = readGitLabCodeRendering(pre, true);
  // GitLab's presentation omits the final source terminator. Read it from the
  // fence rather than guessing, and never strip actual U+200B or other code.
  if (rendered === undefined || rendered !== (body.endsWith('\n') ? body.slice(0, -1) : body)) return refuse();
  return Object.freeze({ text: body, params, fence: header[1], startLine, endLine });
}

/** Serialize a standalone suggestion body. A surrounding document writer owns
 * container indentation and source-snapshot retention. No execution/apply occurs. */
export function serializeGitLabSuggestionSource(value: Pick<GitLabSuggestionSource, 'text' | 'params' | 'fence'>): string {
  if (typeof value.text !== 'string' || value.text.length > 1_048_576 || /\r/u.test(value.text)
    || typeof value.params !== 'string' || value.params !== '' && !offsets.test(value.params)
    || typeof value.fence !== 'string' || !/^(?:`{3,1024}|~{3,1024})$/u.test(value.fence)) return refuse();
  const char = value.fence[0];
  const runs = value.text.match(char === '`' ? /`+/gu : /~+/gu) ?? [];
  const length = runs.reduce((maximum, run) => Math.max(maximum, run.length + 1), value.fence.length);
  const fence = char.repeat(length);
  return fence + 'suggestion' + (value.params ? ':' + value.params : '') + '\n'
    + value.text + (value.text && !value.text.endsWith('\n') ? '\n' : '') + fence;
}
