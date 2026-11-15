export interface GitLabFootnoteProbe {
  readonly source: string;
  readonly insertion: number;
  readonly prefix: string;
  readonly marker: string;
  readonly candidates: readonly string[];
}

/**
 * Candidates are not definitions: only the real renderer decides that.
 * Insert a separate root paragraph after the already-validated frontmatter.
 * This exposes unused notes without appending text inside an unclosed fence.
 */
export function prepareGitLabFootnoteProbe(source: string, insertion = 0, maxBytes = 1_048_576): GitLabFootnoteProbe | undefined {
  if (!Number.isSafeInteger(insertion) || insertion < 0 || insertion > source.length
    || insertion > 0 && insertion < source.length && !/[\r\n]/u.test(source[insertion - 1]!))
    throw new Error('Invalid footnote probe insertion boundary.');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error('Invalid footnote probe byte limit.');
  const candidates = [...new Set([...source.slice(insertion).matchAll(/\[\^([^\]\u0000-\u0020\u007f]{1,4096})\]:/gu)].map(match => match[1]!))];
  if (!candidates.length) return undefined;
  if (candidates.length > 1000) throw new Error('Footnote probe exceeds the host reference limit.');
  let marker = 'FOUNTAINGITLABFOOTNOTEPROBE';
  while (source.includes(marker)) marker += 'X';
  const prefix = `\n\n${marker} ${candidates.map(label => `[^${label}]`).join(' ')}\n\n`;
  const enriched = source.slice(0, insertion) + prefix + source.slice(insertion);
  if (new TextEncoder().encode(enriched).length > maxBytes) throw new Error('Footnote probe exceeds the configured source byte limit.');
  return Object.freeze({ source: enriched, insertion, prefix, marker, candidates: Object.freeze(candidates) });
}
