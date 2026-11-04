import type { Node } from './schema';
import type { MarkdownSourceBlockSnapshot, MarkdownSourceSnapshot } from './importers/markdown-importer';

type ParseSource = (source: string) => readonly Node[];

// Only parser-owned captures register here. Weak ownership
// releases the schema/options when the source snapshot is no longer used.
const parsers = new WeakMap<MarkdownSourceBlockSnapshot, ParseSource>();
const projections = new WeakMap<MarkdownSourceSnapshot, (source: string) => Node>();
const footerChecks = new WeakMap<MarkdownSourceBlockSnapshot, {
  readonly parse: ParseSource;
  readonly entries: { readonly before: string; readonly after: string; readonly separator: string; readonly valid: boolean }[];
}>();

export function registerMarkdownSourceBoundary(block: MarkdownSourceBlockSnapshot, parse: ParseSource): void {
  parsers.set(block, parse);
}

export function registerMarkdownSourceProjection(source: MarkdownSourceSnapshot, parse: (value: string) => Node): void {
  projections.set(source, parse);
}

/** Host HTML adapters can depend on the complete container, not just a pair.
 * Native-only snapshots keep their existing local proof path. */
export function markdownSourceProjectionMatches(source: MarkdownSourceSnapshot, value: string, document: Node): boolean {
  const parse = projections.get(source);
  if (!parse) return true;
  try { return parse(value).eq(document); }
  catch { return false; }
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
