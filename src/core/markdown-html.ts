/** Shared CommonMark inline-token and HTML-block boundaries; never evaluates HTML. */
export interface MarkdownHTMLBlock {
  readonly kind: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** null means the next blank line ends the block (and is not included). */
  readonly closing: RegExp | null;
}

const BLOCK_TAGS = new Set(('address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul').split(' '));

// CommonMark HTML whitespace is ASCII space/tab plus at most one line ending
// per separator, not JavaScript's broader Unicode \s class.
function htmlSpaceEnd(value: string, start: number): number {
  let end = start;
  let lineEndings = 0;
  while (end < value.length) {
    if (value[end] === ' ' || value[end] === '\t') { end++; continue; }
    if (value[end] !== '\n' && value[end] !== '\r') break;
    if (++lineEndings > 1) return -1;
    if (value[end] === '\r' && value[end + 1] === '\n') end++;
    end++;
  }
  return end;
}

/** Return the end of one syntactically valid raw-HTML token; never parse a DOM. */
export function markdownHTMLTokenEnd(value: string, start: number): number {
  if (value.startsWith('<!-->', start)) return start + 5;
  if (value.startsWith('<!--->', start)) return start + 6;
  for (const [open, close] of [['<!--', '-->'], ['<![CDATA[', ']]>'], ['<?', '?>']]) {
    if (!value.startsWith(open, start)) continue;
    const end = value.indexOf(close, start + open.length);
    return end < 0 ? -1 : end + close.length;
  }
  if (value.startsWith('<!', start) && /[A-Za-z]/u.test(value[start + 2] ?? '')) {
    const end = value.indexOf('>', start + 3);
    return end < 0 ? -1 : end + 1;
  }
  if (value[start] !== '<') return -1;
  let index = start + 1;
  const closing = value[index] === '/';
  if (closing) index++;
  if (!/[A-Za-z]/u.test(value[index] ?? '')) return -1;
  while (/[A-Za-z\d-]/u.test(value[index] ?? '')) index++;
  if (closing) {
    index = htmlSpaceEnd(value, index);
    return index >= 0 && value[index] === '>' ? index + 1 : -1;
  }
  for (;;) {
    const beforeSpace = index;
    index = htmlSpaceEnd(value, index);
    if (index < 0) return -1;
    if (value[index] === '>') return index + 1;
    if (value[index] === '/' && value[index + 1] === '>') return index + 2;
    if (index === beforeSpace || !/[A-Za-z_:]/u.test(value[index] ?? '')) return -1;
    while (/[A-Za-z\d_.:-]/u.test(value[index] ?? '')) index++;
    const afterName = index;
    const afterSpace = htmlSpaceEnd(value, index);
    if (afterSpace < 0) return -1;
    if (value[afterSpace] !== '=') { index = afterName; continue; }
    index = htmlSpaceEnd(value, afterSpace + 1);
    if (index < 0) return -1;
    if (value[index] === '"' || value[index] === "'") {
      const end = value.indexOf(value[index], index + 1);
      if (end < 0) return -1;
      index = end + 1;
    } else {
      const beginning = index;
      while (index < value.length && !/[ \t\r\n"'=<>`]/u.test(value[index])) index++;
      if (index === beginning) return -1;
    }
  }
}

/** A deliberately narrow, inert dialect marker, not general HTML parsing. */
export function markdownEmptyParagraph(line: string): 'block' | 'text' | null {
  const match = /^ {0,3}<p data-fountain-empty="(block|text)"><\/p>[\t ]*$/u.exec(line);
  return match ? match[1] as 'block' | 'text' : null;
}

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
  if (!interruptParagraph && /^<\/?[A-Za-z]/u.test(value)) {
    const end = markdownHTMLTokenEnd(value, 0);
    if (end > 0 && /^[\t ]*$/u.test(value.slice(end)) && !/^<(?:pre|script|style|textarea)(?=[\t />])/iu.test(value)) return { kind: 7, closing: null };
  }
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
