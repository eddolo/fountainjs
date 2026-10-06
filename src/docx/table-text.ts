import { readWordParagraphFormatting, readWordRunFormatting, type WordStyleReadIssue } from './style-reader';
import type { WordTableTextFormatting } from './style-cascade';
import type { WordTableTextXML } from './table-style';

/** Reuse the strict, namespace-aware decoders. No separate table text parser or
 * browser dependency, and no source XML mutation. Only used regions are decoded.
 */
export function readWordTableText(source: WordTableTextXML | undefined,
  warn: (code: string, message: string) => void): WordTableTextFormatting {
  const issues: WordStyleReadIssue[] = [];
  const runs = source?.runs.map(root => readWordRunFormatting(root, issues)) ?? [];
  const paragraphs = source?.paragraphs.map(root => readWordParagraphFormatting(root, issues)) ?? [];
  for (const issue of issues) warn(issue.code, `Word table text: ${issue.property} is not fully represented.`);
  return Object.freeze({ runs: Object.freeze(runs), paragraphs: Object.freeze(paragraphs) });
}
