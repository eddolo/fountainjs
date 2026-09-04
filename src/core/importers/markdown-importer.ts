import { Mark, Node, type Schema } from '../schema';
import { isSafeURL } from '../url';

const HAS_EMOJI = /\p{Extended_Pictographic}/u;
const REFERENCE_DEFINITION = /^\s{0,3}\[([^\]]+)\]:\s*(<[^>]*>|\S+)(?:\s+(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|\(((?:\\.|[^)\\])*)\)))?\s*$/;

interface ReferenceDefinition {
  readonly href: string;
  readonly title: string;
}

type References = ReadonlyMap<string, ReferenceDefinition>;

function unicodeEmojiName(value: string): string {
  return `unicode-${Array.from(value).map((character) => character.codePointAt(0)?.toString(16)).join('-')}`;
}

function unescapeMarkdown(value: string): string {
  return value.replace(/\\([\\`*{}\[\]()#+\-.!_|<>"'])/g, '$1');
}

function textNodes(value: string, schema: Schema, marks: readonly Mark[] = []): Node[] {
  if (!value || !schema.nodes.emoji || !HAS_EMOJI.test(value)) return [schema.text(value, marks)];
  const segments = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value), (part) => part.segment)
    : Array.from(value);
  const result: Node[] = [];
  let pending = '';
  const flush = () => {
    if (pending) result.push(schema.text(pending, marks));
    pending = '';
  };
  segments.forEach((segment) => {
    if (!HAS_EMOJI.test(segment)) { pending += segment; return; }
    flush();
    try { result.push(schema.node('emoji', { name: unicodeEmojiName(segment), emoji: segment })); }
    catch { result.push(schema.text(segment, marks)); }
  });
  flush();
  return result.length ? result : [schema.text('', marks)];
}

function referenceName(value: string): string {
  return unescapeMarkdown(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

function closingBracket(value: string, start: number, open = '[', close = ']'): number {
  let depth = 0;
  for (let index = start; index < value.length; index++) {
    if (value[index] === '\\') { index++; continue; }
    if (value[index] === open) depth++;
    else if (value[index] === close) {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function matchingDelimiter(value: string, start: number, delimiter: string): number {
  for (let index = start; index <= value.length - delimiter.length; index++) {
    if (value[index] === '\\') { index++; continue; }
    if (value.startsWith(delimiter, index)) return index;
  }
  return -1;
}

function destinationParts(value: string): ReferenceDefinition | null {
  const source = value.trim();
  if (!source) return null;
  let href = '';
  let cursor = 0;
  if (source[0] === '<') {
    const close = matchingDelimiter(source, 1, '>');
    if (close < 0) return null;
    href = source.slice(1, close);
    cursor = close + 1;
  } else {
    let depth = 0;
    for (; cursor < source.length; cursor++) {
      const character = source[cursor];
      if (character === '\\') { href += character + (source[++cursor] ?? ''); continue; }
      if (/\s/.test(character) && depth === 0) break;
      if (character === '(') depth++;
      else if (character === ')' && depth > 0) depth--;
      href += character;
    }
  }
  const remainder = source.slice(cursor).trim();
  let title = '';
  if (remainder) {
    const first = remainder[0];
    const last = remainder.at(-1);
    if (!((first === '"' && last === '"') || (first === "'" && last === "'") || (first === '(' && last === ')'))) return null;
    title = remainder.slice(1, -1);
  }
  return { href: unescapeMarkdown(href), title: unescapeMarkdown(title) };
}

interface LinkToken extends ReferenceDefinition {
  readonly label: string;
  readonly image: boolean;
  readonly end: number;
}

function linkToken(value: string, start: number, references: References): LinkToken | null {
  const image = value.startsWith('![', start);
  const bracket = image ? start + 1 : start;
  if (value[bracket] !== '[') return null;
  const labelEnd = closingBracket(value, bracket);
  if (labelEnd < 0) return null;
  const label = value.slice(bracket + 1, labelEnd);
  const following = labelEnd + 1;
  if (value[following] === '(') {
    const destinationEnd = closingBracket(value, following, '(', ')');
    if (destinationEnd < 0) return null;
    const parsed = destinationParts(value.slice(following + 1, destinationEnd));
    return parsed ? { ...parsed, label, image, end: destinationEnd + 1 } : null;
  }
  if (value[following] === '[') {
    const referenceEnd = closingBracket(value, following);
    if (referenceEnd < 0) return null;
    const explicit = value.slice(following + 1, referenceEnd);
    const definition = references.get(referenceName(explicit || label));
    return definition ? { ...definition, label, image, end: referenceEnd + 1 } : null;
  }
  const definition = references.get(referenceName(label));
  return definition ? { ...definition, label, image, end: labelEnd + 1 } : null;
}

function inline(text: string, schema: Schema, references: References, inheritedMarks: readonly Mark[] = []): Node[] {
  const result: Node[] = [];
  let plain = '';
  const flush = () => {
    if (plain) result.push(...textNodes(unescapeMarkdown(plain), schema, inheritedMarks));
    plain = '';
  };
  for (let index = 0; index < text.length;) {
    if (text[index] === '\\' && index + 1 < text.length) {
      plain += text.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (text.startsWith('  \n', index) && schema.nodes.hard_break) {
      flush();
      result.push(schema.node('hard_break'));
      index += 3;
      continue;
    }
    if (text[index] === '!' || text[index] === '[') {
      const parsed = linkToken(text, index, references);
      if (parsed) {
        const safe = isSafeURL(parsed.href, { allowDataImage: parsed.image });
        if (safe) {
          flush();
          if (parsed.image && schema.nodes.inline_image) {
            try {
              result.push(schema.node('inline_image', {
                src: parsed.href,
                alt: unescapeMarkdown(parsed.label),
                title: parsed.title,
              }));
            } catch { result.push(...textNodes(text.slice(index, parsed.end), schema, inheritedMarks)); }
          } else if (!parsed.image && schema.marks.link) {
            const mark = schema.marks.link.create({ href: parsed.href, title: parsed.title });
            result.push(...inline(parsed.label, schema, references, [...inheritedMarks, mark]));
          } else {
            result.push(...textNodes(text.slice(index, parsed.end), schema, inheritedMarks));
          }
          index = parsed.end;
          continue;
        }
      }
    }
    const delimiters: readonly [string, string, string][] = [
      ['**', '**', 'strong'], ['~~', '~~', 'strike'], ['==', '==', 'highlight'], ['_', '_', 'em'],
    ];
    let handled = false;
    for (const [opening, closing, markName] of delimiters) {
      if (!text.startsWith(opening, index)) continue;
      const end = matchingDelimiter(text, index + opening.length, closing);
      const type = schema.marks[markName];
      if (end <= index + opening.length || !type) continue;
      flush();
      result.push(...inline(text.slice(index + opening.length, end), schema, references, [...inheritedMarks, type.create()]));
      index = end + closing.length;
      handled = true;
      break;
    }
    if (handled) continue;
    if (text[index] === '`' && schema.marks.code) {
      const end = matchingDelimiter(text, index + 1, '`');
      if (end > index + 1) {
        flush();
        result.push(...textNodes(text.slice(index + 1, end).replace(/\\`/g, '`'), schema, [...inheritedMarks, schema.marks.code.create()]));
        index = end + 1;
        continue;
      }
    }
    if (text[index] === '$' && text[index + 1] !== '$' && schema.nodes.inline_math) {
      const end = matchingDelimiter(text, index + 1, '$');
      if (end > index + 1 && !/^\s|\s$/.test(text.slice(index + 1, end))) {
        flush();
        try { result.push(schema.node('inline_math', { latex: text.slice(index + 1, end), ariaLabel: '' })); }
        catch { result.push(...textNodes(text.slice(index, end + 1), schema, inheritedMarks)); }
        index = end + 1;
        continue;
      }
    }
    plain += text[index];
    index++;
  }
  flush();
  return result.length ? result : [schema.text('')];
}

function paragraph(schema: Schema, value: string, references: References, align = 'left'): Node {
  return schema.node('paragraph', { align }, inline(value, schema, references));
}

function tableCells(line: string): string[] {
  let source = line.trim();
  if (source.startsWith('|')) source = source.slice(1);
  if (source.endsWith('|') && !/(^|[^\\])(?:\\\\)*\\\|$/.test(source)) source = source.slice(0, -1);
  const cells: string[] = [];
  let cell = '';
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\\' && index + 1 < source.length) {
      cell += source[index] + source[index + 1];
      index++;
    } else if (source[index] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else cell += source[index];
  }
  cells.push(cell.trim());
  return cells;
}

function tableAlignment(value: string): 'left' | 'center' | 'right' | null {
  const delimiter = value.replace(/\s/g, '');
  if (!/^:?-{3,}:?$/.test(delimiter)) return null;
  if (delimiter.startsWith(':') && delimiter.endsWith(':')) return 'center';
  return delimiter.endsWith(':') ? 'right' : 'left';
}

function tableStart(lines: readonly string[], index: number): { headers: string[]; alignments: ('left' | 'center' | 'right')[] } | null {
  if (index + 1 >= lines.length || !lines[index].includes('|')) return null;
  const headers = tableCells(lines[index]);
  const delimiters = tableCells(lines[index + 1]);
  if (headers.length < 2 || headers.length !== delimiters.length) return null;
  const alignments = delimiters.map(tableAlignment);
  return alignments.every((align): align is 'left' | 'center' | 'right' => Boolean(align))
    ? { headers, alignments }
    : null;
}

interface ListMarker {
  readonly indent: number;
  readonly kind: 'bullet' | 'ordered' | 'task';
  readonly value: string;
  readonly checked: boolean;
  readonly start: number;
}

function listMarker(line: string): ListMarker | null {
  const normalized = line.replace(/^\t+/, (tabs) => '  '.repeat(tabs.length));
  const match = /^(\s*)(?:(?:[-*])\s+\[([ xX])\]\s+|([-*])\s+|(\d+)[.)]\s+)(.*)$/.exec(normalized);
  if (!match) return null;
  return {
    indent: match[1].length,
    kind: match[2] !== undefined ? 'task' : match[3] ? 'bullet' : 'ordered',
    value: match[5],
    checked: match[2]?.toLowerCase() === 'x',
    start: Number(match[4] ?? 1),
  };
}

function appendContinuation(current: Node, value: string, schema: Schema, references: References): Node {
  return schema.node('paragraph', current.attrs, [
    ...current.content,
    schema.text(' '),
    ...inline(value, schema, references),
  ]);
}

function parseList(
  lines: readonly string[],
  startIndex: number,
  indent: number,
  schema: Schema,
  references: References,
): { node: Node; nextIndex: number } {
  const first = listMarker(lines[startIndex]) as ListMarker;
  const listName = first.kind === 'bullet' ? 'bullet_list' : first.kind === 'ordered' ? 'ordered_list' : 'task_list';
  const itemName = first.kind === 'task' ? 'task_item' : 'list_item';
  const items: Node[] = [];
  let index = startIndex;
  while (index < lines.length) {
    const marker = listMarker(lines[index]);
    if (!marker || marker.indent !== indent || marker.kind !== first.kind) break;
    const content: Node[] = [paragraph(schema, marker.value, references)];
    index++;
    while (index < lines.length) {
      const next = listMarker(lines[index]);
      if (next && next.indent > indent) {
        const nested = parseList(lines, index, next.indent, schema, references);
        content.push(nested.node);
        index = nested.nextIndex;
        continue;
      }
      if (next || (!lines[index].trim() && listMarker(lines[index + 1] ?? '')?.indent === indent)) break;
      if (!lines[index].trim()) {
        let continuationStart = index + 1;
        while (continuationStart < lines.length && !lines[continuationStart].trim()) continuationStart++;
        const continuationMarker = listMarker(lines[continuationStart] ?? '');
        if (continuationMarker && continuationMarker.indent > indent) {
          const nested = parseList(lines, continuationStart, continuationMarker.indent, schema, references);
          content.push(nested.node);
          index = nested.nextIndex;
          continue;
        }
        const leading = /^\s*/.exec(lines[continuationStart] ?? '')?.[0].length ?? 0;
        if (continuationStart >= lines.length || leading <= indent) { index = continuationStart; break; }
        const continuation: string[] = [];
        index = continuationStart;
        while (index < lines.length) {
          const candidate = listMarker(lines[index]);
          const candidateIndent = /^\s*/.exec(lines[index])?.[0].length ?? 0;
          if ((candidate && candidate.indent <= indent) || (lines[index].trim() && candidateIndent <= indent)) break;
          continuation.push(lines[index].slice(Math.min(lines[index].length, indent + 2)));
          index++;
        }
        content.push(...parseBlocks(continuation, schema, references));
        continue;
      }
      const leading = /^\s*/.exec(lines[index])?.[0].length ?? 0;
      if (leading <= indent) break;
      const continuation = lines[index].trim();
      const last = content.at(-1);
      if (last?.type.name === 'paragraph') content[content.length - 1] = appendContinuation(last, continuation, schema, references);
      else content.push(paragraph(schema, continuation, references));
      index++;
    }
    items.push(schema.node(itemName, itemName === 'task_item' ? { checked: marker.checked } : {}, content));
  }
  return {
    node: schema.node(listName, listName === 'ordered_list' ? { start: first.start } : {}, items),
    nextIndex: index,
  };
}

function blockImage(line: string, references: References): LinkToken | null {
  const parsed = linkToken(line, 0, references);
  return parsed?.image && parsed.end === line.length ? parsed : null;
}

function startsBlock(lines: readonly string[], index: number, references: References): boolean {
  const line = lines[index] ?? '';
  return /^```[^`]*$/.test(line)
    || /^\$\$/.test(line)
    || /^(#{1,6})\s+/.test(line)
    || /^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)
    || /^>\s?/.test(line)
    || listMarker(line)?.indent === 0
    || Boolean(tableStart(lines, index))
    || Boolean(blockImage(line, references));
}

function parseBlocks(lines: readonly string[], schema: Schema, references: References): Node[] {
  const blocks: Node[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const fence = /^```([^\s]*)\s*$/.exec(line);
    if (fence) {
      const code: string[] = [];
      for (index++; index < lines.length && !/^```\s*$/.test(lines[index]); index++) code.push(lines[index]);
      if (index < lines.length) index++;
      blocks.push(schema.node('code_block', { language: fence[1] || 'text', lineNumbers: true }, [schema.text(code.join('\n'))]));
      continue;
    }
    if (schema.nodes.math_block && /^\$\$/.test(line)) {
      const singleLine = /^\$\$(.+)\$\$$/.exec(line);
      if (singleLine) {
        blocks.push(schema.node('math_block', { latex: singleLine[1], ariaLabel: '' }));
        index++;
        continue;
      }
      if (/^\$\$\s*$/.test(line)) {
        const closing = lines.findIndex((candidate, candidateIndex) => candidateIndex > index && /^\$\$\s*$/.test(candidate));
        if (closing > index) {
          blocks.push(schema.node('math_block', { latex: lines.slice(index + 1, closing).join('\n'), ariaLabel: '' }));
          index = closing + 1;
          continue;
        }
      }
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push(schema.node('heading', { level: heading[1].length }, inline(heading[2], schema, references)));
      index++;
      continue;
    }
    if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(schema.node('horizontal_rule'));
      index++;
      continue;
    }
    const image = blockImage(line, references);
    if (image && isSafeURL(image.href, { allowDataImage: true })) {
      blocks.push(schema.node('image_super', {
        src: image.href,
        alt: unescapeMarkdown(image.label),
        title: image.title,
        width: '100%',
        caption: '',
      }));
      index++;
      continue;
    }
    const table = tableStart(lines, index);
    if (table) {
      const rows: Node[] = [];
      const cells = (values: readonly string[], type: 'table_header' | 'table_cell') => table.headers.map((_, cellIndex) => (
        schema.node(type, {}, [paragraph(schema, values[cellIndex] ?? '', references, table.alignments[cellIndex])])
      ));
      rows.push(schema.node('table_row', {}, cells(table.headers, 'table_header')));
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(schema.node('table_row', {}, cells(tableCells(lines[index]), 'table_cell')));
        index++;
      }
      blocks.push(schema.node('table', {}, rows));
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ''));
      const quoteBlocks = parseBlocks(quote, schema, references);
      blocks.push(schema.node('blockquote', {}, quoteBlocks.length ? quoteBlocks : [paragraph(schema, '', references)]));
      continue;
    }
    const marker = listMarker(line);
    if (marker?.indent === 0) {
      const parsed = parseList(lines, index, 0, schema, references);
      blocks.push(parsed.node);
      index = parsed.nextIndex;
      continue;
    }
    const paragraphLines = [line];
    for (index++; index < lines.length && lines[index].trim() && !startsBlock(lines, index, references); index++) paragraphLines.push(lines[index]);
    const joined = paragraphLines.reduce((value, current) => value.endsWith('  ') ? `${value}\n${current}` : `${value} ${current}`);
    blocks.push(paragraph(schema, joined, references));
  }
  return blocks;
}

function references(markdown: string): { lines: string[]; definitions: References } {
  const definitions = new Map<string, ReferenceDefinition>();
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n').map((line) => {
    const match = REFERENCE_DEFINITION.exec(line);
    if (!match) return line;
    const rawHref = match[2];
    const href = unescapeMarkdown(rawHref.startsWith('<') && rawHref.endsWith('>') ? rawHref.slice(1, -1) : rawHref);
    if (!isSafeURL(href, { allowDataImage: true })) return line;
    const name = referenceName(match[1]);
    if (name && !definitions.has(name)) definitions.set(name, {
      href,
      title: unescapeMarkdown(match[3] ?? match[4] ?? match[5] ?? ''),
    });
    return '';
  });
  return { lines, definitions };
}

export class MarkdownImporter {
  parse(markdown: string, schema: Schema): Node {
    const source = references(markdown);
    const blocks = parseBlocks(source.lines, schema, source.definitions);
    const document = schema.topNodeType.create({}, blocks.length ? blocks : [paragraph(schema, '', source.definitions)]);
    schema.validate(document);
    return document;
  }

  static parse(markdown: string, schema: Schema): Node { return new MarkdownImporter().parse(markdown, schema); }
}
