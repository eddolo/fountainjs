/** Deliberately bounded TeX tabular projection, never macro expansion. */
export type TeXTableSegment = { readonly kind: 'text' | 'math'; readonly value: string };
export interface TeXTableProjection {
  readonly alignments: readonly ('left' | 'center' | 'right')[];
  readonly rows: readonly (readonly (readonly TeXTableSegment[])[])[];
  readonly layoutLosses: readonly string[];
}

function withoutComments(source: string): string {
  let value = '';
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\\') {
      value += source[index] + (source[++index] ?? '');
    } else if (source[index] === '%') {
      while (index < source.length && source[index] !== '\n') index++;
    } else value += source[index];
  }
  return value;
}

export function projectTeXTableSource(source: string): TeXTableProjection | null {
  const losses: string[] = [];
  let value = withoutComments(source).trim();
  const float = /^\\begin\{table\}(?:\[([A-Za-z!]*)\])?\s*([\s\S]*)\\end\{table\}$/u.exec(value);
  if (float) {
    losses.push(`TeX table float placement${float[1] ? ` [${float[1]}]` : ''} is not represented.`);
    value = float[2].trim();
  }
  const tabular = /^\\begin\{tabular\}\{([lcr|\s]+)\}([\s\S]*)\\end\{tabular\}$/u.exec(value);
  if (!tabular) return null;
  const columns = tabular[1].replace(/[|\s]/gu, '');
  if (!columns.length || columns.length > 100) return null;
  if (tabular[1].includes('|')) losses.push('TeX vertical rules are not represented; the host controls table borders.');
  const alignments = [...columns].map(column => column === 'l' ? 'left' as const : column === 'r' ? 'right' as const : 'center' as const);
  const rows: TeXTableSegment[][][] = [];
  let cells: TeXTableSegment[][] = [];
  let segments: TeXTableSegment[] = [];
  let text = '';
  let math: string | null = null;
  let rules = false;
  const flushText = () => {
    if (text) segments.push({ kind: 'text', value: text.replace(/\s+/gu, ' ') });
    text = '';
  };
  const cell = () => {
    flushText();
    if (segments[0]?.kind === 'text') segments[0] = { kind: 'text', value: segments[0].value.trimStart() };
    const last = segments.length - 1;
    if (segments[last]?.kind === 'text') segments[last] = { kind: 'text', value: segments[last].value.trimEnd() };
    cells.push(segments.filter(segment => segment.value.length));
    segments = [];
  };
  const row = () => {
    cell();
    if (cells.length !== columns.length || rows.length >= 1000) return false;
    rows.push(cells);
    cells = [];
    return true;
  };
  const body = tabular[2];
  for (let index = 0; index < body.length; index++) {
    const character = body[index];
    if (math !== null) {
      if (character === '\\') { math += character + (body[++index] ?? ''); continue; }
      if (character === '$') {
        if (!math.trim()) return null;
        segments.push({ kind: 'math', value: math });
        math = null;
      } else math += character;
      continue;
    }
    if (character === '$') { flushText(); math = ''; continue; }
    if (character === '&') {
      cell();
      if (cells.length >= columns.length) return null;
      continue;
    }
    if (character === '\\') {
      const next = body[index + 1];
      if (next === '\\') {
        if (/^\s*[\[*]/u.test(body.slice(index + 2)) || !row()) return null;
        index++;
        continue;
      }
      if (next && '&%$#_{}'.includes(next)) { text += next; index++; continue; }
      if (/^\\hline(?![A-Za-z])/u.test(body.slice(index)) && !cells.length && !segments.length && !text.trim()) {
        rules = true; text = ''; index += 5; continue;
      }
      return null; // Unknown commands, spacing options, captions and spans need dedicated support.
    }
    if ('{}_^~#'.includes(character)) return null;
    text += character;
  }
  if (math !== null) return null;
  if (cells.length || segments.length || text.trim()) { if (!row()) return null; }
  if (!rows.length) return null;
  if (rules) losses.push('TeX horizontal rules are not represented; no header semantics are inferred from a rule.');
  return { alignments, rows, layoutLosses: losses };
}
