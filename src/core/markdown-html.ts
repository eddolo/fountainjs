/** Lexical CommonMark HTML-block boundaries; this module never evaluates HTML. */
export interface MarkdownHTMLBlock {
  readonly kind: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** null means the next blank line ends the block (and is not included). */
  readonly closing: RegExp | null;
}

const BLOCK_TAGS = new Set(('address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul').split(' '));
const COMPLETE_TAG = /^(?:<[A-Za-z][A-Za-z\d-]*(?:[\t ]+[A-Za-z_:][A-Za-z\d_.:-]*(?:[\t ]*=[\t ]*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*[\t ]*\/?>|<\/[A-Za-z][A-Za-z\d-]*[\t ]*>)[\t ]*$/u;

export function markdownHTMLBlock(line: string, interruptParagraph = false): MarkdownHTMLBlock | null {
  const prefix = /^ {0,3}(?=<)/u.exec(line);
  if (!prefix) return null;
  const value = line.slice(prefix[0].length);
  if (/^<(?:pre|script|style|textarea)(?=[\t >]|$)/iu.test(value)) return { kind: 1, closing: /<\/(?:pre|script|style|textarea)>/iu };
  if (value.startsWith('<!--')) return { kind: 2, closing: /-->/u };
  if (value.startsWith('<?')) return { kind: 3, closing: /\?>/u };
  if (/^<![A-Za-z]/u.test(value)) return { kind: 4, closing: />/u };
  if (value.startsWith('<![CDATA[')) return { kind: 5, closing: /\]\]>/u };
  const tag = /^<\/?([A-Za-z][A-Za-z\d-]*)(?=[\t >]|\/>|$)/u.exec(value);
  if (tag && BLOCK_TAGS.has(tag[1].toLowerCase())) return { kind: 6, closing: null };
  if (!interruptParagraph && COMPLETE_TAG.test(value) && !/^<(?:pre|script|style|textarea)(?=[\t />])/iu.test(value)) return { kind: 7, closing: null };
  return null;
}

export function markdownHTMLBlockEnd(lines: readonly string[], start: number, block: MarkdownHTMLBlock): number {
  let end = start;
  while (end < lines.length) {
    if (!block.closing && !lines[end].trim()) break;
    const closed = block.closing?.test(lines[end]);
    end++;
    if (closed) break;
  }
  return end;
}
