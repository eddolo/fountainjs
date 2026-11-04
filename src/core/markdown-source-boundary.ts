import type { Node } from './schema';
import type { MarkdownSourceBlockSnapshot } from './importers/markdown-importer';

type ParseSource = (source: string) => readonly Node[];

// Only parser-owned, reference-free captures register here. Weak ownership
// releases the schema/options when the source snapshot is no longer used.
const parsers = new WeakMap<MarkdownSourceBlockSnapshot, ParseSource>();

export function registerMarkdownSourceBoundary(block: MarkdownSourceBlockSnapshot, parse: ParseSource): void {
  parsers.set(block, parse);
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
