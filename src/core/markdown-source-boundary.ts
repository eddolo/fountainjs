import type { Node } from './schema';
import type { MarkdownLineEnding, MarkdownSourceBlockSnapshot, MarkdownSourceSnapshot } from './importers/markdown-importer';
import { isAutomaticTrailingParagraph } from './editing-provenance';

type ParseSource = (source: string) => readonly Node[];
type SourceRange = { readonly from: number; readonly to: number };
type ProjectionCapture = {
  readonly original: Node;
  readonly capture: () => ReadonlyMap<number, SourceRange>;
  ranges?: ReadonlyMap<number, SourceRange>;
};

// Only parser-owned captures register here. Weak ownership
// releases the schema/options when the source snapshot is no longer used.
const parsers = new WeakMap<MarkdownSourceBlockSnapshot, ParseSource>();
const projections = new WeakMap<MarkdownSourceSnapshot, { parse: (source: string) => Node; capture?: ProjectionCapture }>();
const footerChecks = new WeakMap<MarkdownSourceBlockSnapshot, {
  readonly parse: ParseSource;
  readonly entries: { readonly before: string; readonly after: string; readonly separator: string; readonly valid: boolean }[];
}>();

export function registerMarkdownSourceBoundary(block: MarkdownSourceBlockSnapshot, parse: ParseSource): void {
  parsers.set(block, parse);
}

/** Keep the author's explicit reference when a visual edit changes only its visible label.
 * Prove the replacement in the original reference scope before returning any source. */
export function rewriteMarkdownReferenceLabel(block: MarkdownSourceBlockSnapshot, current: Node): string | null {
  const parse = parsers.get(block);
  if (!parse || !block.source.includes('][') || !['paragraph','heading'].includes(current.type.name)) return null;
  const original = parse(block.source);
  if (original.length !== 1 || !block.matches(original[0]) || original[0].childCount !== current.childCount) return null;
  let result: string | undefined;
  for (const [index, before] of original[0].content.entries()) {
    const after = current.child(index);
    if (before.eq(after)) continue;
    if (result !== undefined || !before.isText || !after.isText || !before.marks.some(mark => mark.type.name === 'link')
      || !before.withText(after.text!).eq(after) || /[[\]\\<>\r\n]/u.test(after.text!)) return null;
    const spelling = '[' + before.text + '][';
    const start = block.source.indexOf(spelling);
    if (start < 0 || block.source.indexOf(spelling,start+1) !== -1) return null;
    result = block.source.slice(0,start+1) + after.text + block.source.slice(start+1+before.text!.length);
  }
  if (result === undefined) return null;
  const proposed = parse(result);
  return proposed.length === 1 && current.eq(proposed[0]) ? result : null;
}

export function registerMarkdownSourceProjection(source: MarkdownSourceSnapshot, parse: (value: string) => Node,
  capture?: ProjectionCapture): void {
  projections.set(source, { parse, capture });
}

export function tailSourceSeparator(separator: string, lineEnding: MarkdownLineEnding): string {
  let cursor = separator.length, endings = 0;
  while (cursor > 0) {
    const character = separator[--cursor];
    if (character === ' ' || character === '\t') continue;
    if (character === '\n') { if (separator[cursor - 1] === '\r') cursor--; endings++; }
    else if (character === '\r') endings++;
    else break;
  }
  return separator + lineEnding.repeat(Math.max(0, 2 - endings));
}

/** Propose a source edit for the complete parser to verify. The HTML projection
 * may merge source blocks, so only independently owned spans can be replaced. */
export function rewriteMarkdownProjection(source: MarkdownSourceSnapshot, current: Node,
  render: (node: Node, index: number) => string): { body: string; document: Node } | null {
  const entry = projections.get(source)?.capture;
  if (!entry || entry.original.type !== current.type) return null;
  const { original } = entry;
  const document = current.childCount > original.childCount && isAutomaticTrailingParagraph(current.content.at(-1))
    ? current.copy(current.content.slice(0, -1)) : current;
  if (document.childCount < original.childCount) return null;
  const changed = original.content.flatMap((node, index) => node.eq(document.child(index)) ? [] : [index]);
  const added = document.content.slice(original.childCount);
  if (!changed.length && !added.length) return null;
  const replacements = [];
  for (const index of changed) {
    const range = (entry.ranges ??= entry.capture()).get(index);
    if (!range) return null;
    replacements.push({ ...range, index });
  }
  replacements.sort((left, right) => left.from - right.from);
  const chunks: string[] = [];
  let cursor = 0;
  for (const { from, to, index } of replacements) {
    chunks.push(source.body.slice(cursor, from), render(document.child(index), index));
    cursor = to;
  }
  chunks.push(source.body.slice(cursor));
  let body = chunks.join('');
  if (added.length) {
    const appended = added.map((block, index) => render(block, original.childCount + index));
    body = tailSourceSeparator(body, source.lineEnding) + appended.join(source.lineEnding.repeat(2));
  }
  return { body, document };
}

export function hasMarkdownSourceProjection(source: MarkdownSourceSnapshot): boolean {
  return projections.has(source);
}

/** HTML adapters and container definitions can affect distant blocks. Captures
 * without nonlocal scope keep their existing local proof path. */
export function markdownSourceProjectionMatches(source: MarkdownSourceSnapshot, value: string, document: Node): boolean {
  const parse = projections.get(source)?.parse;
  if (!parse) return true;
  try { return parse(value).eq(document); }
  catch { return false; }
}

/** Replacing a defining container may strand unchanged references even when
 * the root block count stays aligned. Reuse its captured definitions only if
 * the original full-document parser proves the complete proposed result. */
export function markdownSourceProjectionWithReferences(source: MarkdownSourceSnapshot, value: string, document: Node): string | null {
  if (markdownSourceProjectionMatches(source, value, document)) return value;
  if (!source.referenceDefinitions) return null;
  const candidate = value + source.lineEnding.repeat(2) + source.referenceDefinitions;
  return markdownSourceProjectionMatches(source, candidate, document) ? candidate : null;
}

/** A reference footer can be large and is immutable for this source snapshot.
 * Retain at most two exact-input proofs per weakly owned block (usually the
 * original and canonically closed tail). Different parser scopes never reuse a
 * proof, and edited source strings must be checked again. */
export function markdownReferenceFooterValid(block: MarkdownSourceBlockSnapshot | null | undefined,
  before: string, after: string, separator: string): boolean {
  const parse = block ? parsers.get(block) : undefined;
  if (!block || !parse) return markdownSourceSeparator(block, null, before, after, separator) !== null;
  const cached = footerChecks.get(block);
  const entries = cached?.parse === parse ? cached.entries : [];
  const known = entries.find(entry => entry.before === before && entry.after === after && entry.separator === separator);
  if (known) return known.valid;
  const valid = markdownSourceSeparator(block, null, before, after, separator) !== null;
  entries.unshift({ before, after, separator, valid });
  if (entries.length > 2) entries.pop();
  footerChecks.set(block, { parse, entries });
  return valid;
}

/** A changed adjacent block may no longer end where its original did. Check
 * the actual parser, rather than guessing from headings/list marker prefixes.
 * null means that even a blank separator cannot prove an independent boundary.
 */
export function markdownSourceSeparator(
  left: MarkdownSourceBlockSnapshot | null | undefined,
  right: MarkdownSourceBlockSnapshot | null | undefined,
  before: string,
  after: string,
  separator: string,
): string | null {
  const leftParser = left ? parsers.get(left) : undefined;
  const rightParser = right ? parsers.get(right) : undefined;
  const parse = leftParser ?? rightParser;
  if (!parse) return separator;
  if (leftParser && rightParser && leftParser !== rightParser) return null;
  try {
    const expected = [...parse(before), ...parse(after)];
    const matches = (value: string): boolean => {
      const actual = parse(before + value + after);
      return actual.length === expected.length && actual.every((node, index) => node.eq(expected[index]));
    };
    if (matches(separator)) return separator;
    if ((separator.match(/\r\n|\r|\n/gu)?.length ?? 0) >= 2) return null;
    const spaced = separator + (/\r\n|\r|\n/u.exec(separator)?.[0] ?? '\n');
    return matches(spaced) ? spaced : null;
  } catch { return null; }
}
