/** Source offsets belong to the exact Markdown sent to GitLab's renderer. */
export interface GitLabFootnoteSpan { readonly from: number; readonly to: number }
interface SourceLine { from: number; to: number; boundaries?: Int32Array }
const byteWidth = (point: number): number => point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;

/**
 * Bridge inclusive, one-based UTF-8 source columns to half-open JS offsets.
 * This does not parse footnotes, derive identities or trust generated anchors.
 * A position inside a multibyte character is refused rather than rounded.
 */
export class GitLabFootnotePositions {
  private readonly lines: SourceLine[] = [];

  constructor(readonly source: string, maxBytes = 1_048_576) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('Invalid source byte limit.');
    let from = 0, bytes = 0;
    for (let offset = 0; offset < source.length;) {
      const point = source.codePointAt(offset)!;
      if (point >= 0xd800 && point <= 0xdfff) throw new TypeError('Source must contain valid Unicode scalar values.');
      const newline = point === 10 || point === 13;
      const crlf = point === 13 && source.charCodeAt(offset + 1) === 10;
      const width = crlf || point > 0xffff ? 2 : 1;
      bytes += crlf ? 2 : byteWidth(point);
      if (bytes > maxBytes) throw new RangeError('Footnote positions exceed the configured source byte limit.');
      if (newline) {
        this.lines.push({ from, to: offset });
        from = offset + width;
      }
      offset += width;
    }
    this.lines.push({ from, to: source.length });
  }

  private boundaries(line: SourceLine): Int32Array {
    if (line.boundaries) return line.boundaries;
    const text = this.source.slice(line.from, line.to);
    let length = 0;
    for (const character of text) length += byteWidth(character.codePointAt(0)!);
    // One bounded integer per byte; avoid a Map entry for every ASCII position.
    const boundaries = new Int32Array(length + 1).fill(-1);
    let byte = 0, offset = line.from;
    boundaries[0] = offset;
    for (const character of text) {
      byte += byteWidth(character.codePointAt(0)!);
      offset += character.length;
      boundaries[byte] = offset;
    }
    line.boundaries = boundaries;
    return boundaries;
  }

  read(position: string): GitLabFootnoteSpan | undefined {
    const match = /^([1-9]\d{0,15}):([1-9]\d{0,15})-([1-9]\d{0,15}):([1-9]\d{0,15})$/u.exec(position);
    if (!match) return undefined;
    const [startLine, startColumn, endLine, endColumn] = match.slice(1).map(Number);
    if (![startLine, startColumn, endLine, endColumn].every(Number.isSafeInteger)
      || startLine! > endLine! || endLine! > this.lines.length) return undefined;
    const first = this.lines[startLine! - 1], last = this.lines[endLine! - 1];
    if (!first || !last) return undefined;
    const from = this.boundaries(first)[startColumn! - 1];
    const to = this.boundaries(last)[endColumn!];
    if (from === undefined || to === undefined || from < 0 || to < 0 || from >= to) return undefined;
    return { from, to };
  }
}
