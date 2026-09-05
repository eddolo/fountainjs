import { Mark, Node, type Schema } from '../schema';
import { isSafeURL } from '../url';
import { decodeMarkdownEntities, decodeMarkdownText } from '../markdown-entities';
import { unicodeCaseFold } from '../unicode-case-fold';

const MAX_MARKDOWN_SOURCE_BLOCKS = 10_000;
const MAX_MARKDOWN_REFERENCE_LINES = 32;

export type MarkdownLineEnding = '\n' | '\r\n' | '\r';

export interface MarkdownFrontmatter {
  /** Exact prefix, including the opening/closing delimiters and any final line ending. */
  readonly raw: string;
  /** Exact unparsed content between the delimiter lines. FountainJS never executes YAML. */
  readonly content: string;
  readonly openingDelimiter: '---';
  readonly closingDelimiter: '---' | '...';
}

interface MarkdownSourceParts {
  readonly body: string;
  readonly lineEnding: MarkdownLineEnding;
  readonly frontmatter?: MarkdownFrontmatter;
}

/** One conservatively mapped top-level source block and its following whitespace. */
export interface MarkdownSourceBlockSnapshot {
  readonly source: string;
  readonly separatorAfter: string;
  /** True when a current top-level node is semantically equal to this captured block. */
  matches(document: Node): boolean;
}

interface MarkdownBlockCapture {
  readonly leading: string;
  readonly blocks: readonly MarkdownSourceBlockSnapshot[];
}

/**
 * Immutable source provenance captured by `MarkdownImporter.parseWithSource`.
 *
 * The original string can be returned exactly while its parsed document is
 * unchanged. After a visual edit, recognized frontmatter and safely mapped
 * unchanged blocks can remain exact; every other region is rendered through
 * the canonical Markdown exporter.
 */
export class MarkdownSourceSnapshot {
  readonly source: string;
  readonly body: string;
  readonly lineEnding: MarkdownLineEnding;
  readonly frontmatter?: MarkdownFrontmatter;
  /** Exact whitespace before the first safely mapped block. */
  readonly leading: string;
  /**
   * Conservatively mapped top-level blocks. An empty array means this source was
   * too structurally ambiguous for block-level preservation.
   */
  readonly blocks: readonly MarkdownSourceBlockSnapshot[];

  private constructor(
    source: string,
    parts: MarkdownSourceParts,
    private readonly originalDocument: Node,
    capture?: MarkdownBlockCapture,
  ) {
    this.source = source;
    this.body = parts.body;
    this.lineEnding = parts.lineEnding;
    this.frontmatter = parts.frontmatter;
    this.leading = capture?.leading ?? '';
    this.blocks = Object.freeze([...(capture?.blocks ?? [])]);
    Object.freeze(this);
  }

  /** True only while the current immutable document is semantically unchanged. */
  matches(document: Node): boolean {
    return this.originalDocument.eq(document);
  }

  /**
   * Maps current top-level nodes to uniquely equal captured source blocks.
   * Duplicate/ambiguous content returns `null` for that node; the array itself
   * is `null` when conservative source-block capture was unavailable.
   */
  mapBlocks(document: Node): readonly (MarkdownSourceBlockSnapshot | null)[] | null {
    if (!this.blocks.length || document.type !== this.originalDocument.type) return null;
    const originals = new Map<string, number[]>();
    const currents = new Map<string, number[]>();
    this.originalDocument.content.forEach((node, index) => {
      const key = markdownNodeFingerprint(node);
      const indexes = originals.get(key);
      if (indexes) indexes.push(index);
      else originals.set(key, [index]);
    });
    document.content.forEach((node, index) => {
      const key = markdownNodeFingerprint(node);
      const indexes = currents.get(key);
      if (indexes) indexes.push(index);
      else currents.set(key, [index]);
    });
    return Object.freeze(document.content.map((node) => {
      const key = markdownNodeFingerprint(node);
      const originalIndexes = originals.get(key) ?? [];
      const currentIndexes = currents.get(key) ?? [];
      if (originalIndexes.length !== 1 || currentIndexes.length !== 1) return null;
      const block = this.blocks[originalIndexes[0]];
      return block?.matches(node) ? block : null;
    }));
  }

  static parse(source: string, schema: Schema): MarkdownSourceImportResult {
    if (typeof source !== 'string') throw new TypeError('Markdown source must be a string.');
    const parts = splitMarkdownSource(source);
    const document = new MarkdownImporter().parse(parts.body, schema);
    const capture = captureMarkdownBlocks(parts.body, schema, document);
    return Object.freeze({
      document,
      source: new MarkdownSourceSnapshot(source, parts, document, capture),
    });
  }
}

export interface MarkdownSourceImportResult {
  readonly document: Node;
  readonly source: MarkdownSourceSnapshot;
}

interface SourceLine {
  readonly value: string;
  readonly start: number;
  readonly end: number;
  readonly next: number;
  readonly ending: MarkdownLineEnding | '';
}

function sourceLine(source: string, start: number): SourceLine {
  let end = start;
  while (end < source.length && source[end] !== '\n' && source[end] !== '\r') end += 1;
  let ending: MarkdownLineEnding | '' = '';
  if (source[end] === '\r' && source[end + 1] === '\n') ending = '\r\n';
  else if (source[end] === '\r') ending = '\r';
  else if (source[end] === '\n') ending = '\n';
  return {
    value: source.slice(start, end),
    start,
    end,
    next: end + ending.length,
    ending,
  };
}

function sourceLineEnding(source: string): MarkdownLineEnding {
  const match = /\r\n|\r|\n/.exec(source);
  return (match?.[0] as MarkdownLineEnding | undefined) ?? '\n';
}

function markdownNodeFingerprint(node: Node): string {
  return JSON.stringify(node.toJSON());
}

function sourceLines(source: string): readonly SourceLine[] {
  const lines: SourceLine[] = [];
  for (let cursor = 0; cursor <= source.length;) {
    const line = sourceLine(source, cursor);
    lines.push(line);
    if (!line.ending) break;
    cursor = line.next;
  }
  return lines;
}

function markdownBlockSegments(source: string): { leading: string; blocks: Array<{ source: string; separatorAfter: string }> } {
  const lines = sourceLines(source);
  let index = 0;
  while (index < lines.length && !lines[index].value.trim()) index += 1;
  const firstStart = lines[index]?.start ?? source.length;
  const blocks: Array<{ source: string; separatorAfter: string }> = [];

  while (index < lines.length) {
    const start = lines[index].start;
    let last = lines[index];
    while (index < lines.length && lines[index].value.trim()) {
      last = lines[index];
      index += 1;
    }
    const end = last.end;
    while (index < lines.length && !lines[index].value.trim()) index += 1;
    const nextStart = lines[index]?.start ?? source.length;
    blocks.push({
      source: source.slice(start, end),
      separatorAfter: source.slice(end, nextStart),
    });
  }

  return { leading: source.slice(0, firstStart), blocks };
}

/**
 * Capture only when blank-line-delimited source regions independently map
 * one-to-one to the parsed top-level nodes. Ambiguous lists, definitions,
 * fenced content with blank lines, and cross-block references fail closed.
 */
function captureMarkdownBlocks(source: string, schema: Schema, document: Node): MarkdownBlockCapture | undefined {
  const segments = markdownBlockSegments(source);
  if (!segments.blocks.length
    || segments.blocks.length > MAX_MARKDOWN_SOURCE_BLOCKS
    || segments.blocks.length !== document.content.length) return undefined;

  const blocks: MarkdownSourceBlockSnapshot[] = [];
  for (let index = 0; index < segments.blocks.length; index += 1) {
    const segment = segments.blocks[index];
    const parsed = new MarkdownImporter().parse(segment.source, schema);
    const original = document.content[index];
    if (parsed.content.length !== 1 || !parsed.content[0].eq(original)) return undefined;
    blocks.push(Object.freeze({
      source: segment.source,
      separatorAfter: segment.separatorAfter,
      matches: (current: Node) => original.eq(current),
    }));
  }

  return Object.freeze({
    leading: segments.leading,
    blocks: Object.freeze(blocks),
  });
}

function isOpeningDelimiter(value: string): boolean {
  return /^---[\t ]*$/u.test(value.replace(/^\uFEFF/u, ''));
}

function closingDelimiter(value: string): '---' | '...' | null {
  const match = /^(---|\.\.\.)[\t ]*$/u.exec(value)?.[1];
  return match === '---' || match === '...' ? match : null;
}

function splitMarkdownSource(source: string): MarkdownSourceParts {
  const lineEnding = sourceLineEnding(source);
  const opening = sourceLine(source, 0);
  if (!isOpeningDelimiter(opening.value) || !opening.ending) return { body: source, lineEnding };

  for (let cursor = opening.next; cursor <= source.length;) {
    const line = sourceLine(source, cursor);
    const close = closingDelimiter(line.value);
    if (close) {
      const raw = source.slice(0, line.next);
      return {
        body: source.slice(line.next),
        lineEnding,
        frontmatter: Object.freeze({
          raw,
          content: source.slice(opening.next, line.start),
          openingDelimiter: '---' as const,
          closingDelimiter: close,
        }),
      };
    }
    if (line.next <= cursor || line.next >= source.length && line.end >= source.length) break;
    cursor = line.next;
  }
  return { body: source, lineEnding };
}

const HAS_EMOJI = /\p{Extended_Pictographic}/u;

interface ReferenceDefinition {
  readonly href: string;
  readonly title: string;
}

interface ParsedReferenceDefinition extends ReferenceDefinition {
  readonly label: string;
  readonly lineCount: number;
}

interface ReferenceDefinitionOpening {
  readonly label: string;
  readonly remainder: string;
  readonly lineCount: number;
}

type References = ReadonlyMap<string, ReferenceDefinition>;

function unicodeEmojiName(value: string): string {
  return `unicode-${Array.from(value).map((character) => character.codePointAt(0)?.toString(16)).join('-')}`;
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
  return unicodeCaseFold(decodeMarkdownText(value).trim().replace(/\s+/g, ' '));
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

function inlineLinkEnd(value: string, start: number): number {
  let depth = 0;
  let angleDestination = false;
  let destinationStarted = false;
  for (let index = start; index < value.length; index++) {
    const character = value[index];
    if (character === '\\') { index++; continue; }
    if (index === start) {
      if (character !== '(') return -1;
      depth = 1;
      continue;
    }
    if (!destinationStarted && /[\t ]/u.test(character)) continue;
    if (!destinationStarted) {
      destinationStarted = true;
      angleDestination = character === '<';
    }
    if (angleDestination) {
      if (character === '\n' || character === '\r') return -1;
      if (character === '>') angleDestination = false;
      continue;
    }
    if (character === '(') depth++;
    else if (character === ')') {
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

function codeSpanToken(value: string, start: number): { readonly text: string; readonly end: number } | null {
  if (value[start] !== '`' || value[start - 1] === '`') return null;
  let openingEnd = start;
  while (value[openingEnd] === '`') openingEnd += 1;
  const delimiterLength = openingEnd - start;

  for (let cursor = openingEnd; cursor < value.length;) {
    if (value[cursor] !== '`') { cursor += 1; continue; }
    let closingEnd = cursor;
    while (value[closingEnd] === '`') closingEnd += 1;
    if (closingEnd - cursor !== delimiterLength) { cursor = closingEnd; continue; }

    let content = value.slice(openingEnd, cursor).replace(/\r\n?|\n/gu, ' ');
    if (content.startsWith(' ') && content.endsWith(' ') && /[^ ]/u.test(content)) {
      content = content.slice(1, -1);
    }
    return { text: content, end: closingEnd };
  }
  return null;
}

function destinationParts(value: string, allowEmpty = false): ReferenceDefinition | null {
  const source = value.trim();
  if (!source) return allowEmpty ? { href: '', title: '' } : null;
  let href = '';
  let cursor = 0;
  if (source[0] === '<') {
    const close = matchingDelimiter(source, 1, '>');
    if (close < 0) return null;
    href = source.slice(1, close);
    if (/\r|\n/u.test(href)) return null;
    cursor = close + 1;
  } else {
    let depth = 0;
    for (; cursor < source.length; cursor++) {
      const character = source[cursor];
      if (character === '\\') { href += character + (source[++cursor] ?? ''); continue; }
      if (/\s/.test(character) && depth === 0) break;
      if (character === '(') depth++;
      else if (character === ')') {
        if (depth === 0) return null;
        depth--;
      }
      href += character;
    }
    if (depth !== 0) return null;
  }
  const remainder = source.slice(cursor).trim();
  let title = '';
  if (remainder) {
    const first = remainder[0];
    const last = remainder.at(-1);
    if (!((first === '"' && last === '"') || (first === "'" && last === "'") || (first === '(' && last === ')'))) return null;
    for (let index = 1; index < remainder.length - 1; index++) {
      if (remainder[index] === '\\') { index++; continue; }
      if (remainder[index] === last) return null;
    }
    title = remainder.slice(1, -1);
  }
  return { href: decodeMarkdownText(href), title: decodeMarkdownText(title) };
}

function referenceDefinitionOpeningAt(
  lines: readonly string[],
  index: number,
): ReferenceDefinitionOpening | null {
  const first = /^ {0,3}\[(.*)$/u.exec(lines[index] ?? '');
  if (!first) return null;
  let label = '';

  for (let cursor = index; cursor < lines.length && cursor < index + MAX_MARKDOWN_REFERENCE_LINES; cursor++) {
    const content = cursor === index ? first[1] : lines[cursor];
    if (cursor > index) {
      if (!content.trim() || /^(?: {4}|\t)/u.test(content)) return null;
      label += '\n';
    }
    for (let offset = 0; offset < content.length; offset++) {
      const character = content[offset];
      if (character === '\\') {
        label += character + (content[++offset] ?? '');
        continue;
      }
      // An unescaped opening bracket is not legal inside a reference label.
      if (character === '[') return null;
      if (character !== ']') {
        label += character;
        continue;
      }
      const suffix = /^:[\t ]*(.*)$/u.exec(content.slice(offset + 1));
      if (!suffix || !label.trim() || Array.from(label).length > 999) return null;
      return { label, remainder: suffix[1], lineCount: cursor - index + 1 };
    }
  }
  return null;
}

function referenceDefinitionAt(lines: readonly string[], index: number): ParsedReferenceDefinition | null {
  const opening = referenceDefinitionOpeningAt(lines, index);
  if (!opening) return null;
  const label = referenceName(opening.label);
  if (!label) return null;

  const parts = [opening.remainder];
  let best: ParsedReferenceDefinition | null = null;
  const closingLine = index + opening.lineCount - 1;
  for (let cursor = closingLine; cursor < lines.length && cursor < index + MAX_MARKDOWN_REFERENCE_LINES; cursor++) {
    if (cursor > closingLine) {
      if (!lines[cursor].trim()) break;
      parts.push(lines[cursor].trim());
    }
    const parsed = destinationParts(parts.join('\n'));
    if (parsed && isSafeURL(parsed.href, { allowDataImage: true })) {
      best = { ...parsed, label, lineCount: cursor - index + 1 };
    }
  }
  return best;
}

interface LinkToken extends ReferenceDefinition {
  readonly label: string;
  readonly image: boolean;
  readonly end: number;
}

interface RubyToken {
  readonly node: Node;
  readonly end: number;
}

interface StyledTextToken {
  readonly nodes: readonly Node[];
  readonly end: number;
}

interface MarkdownFence {
  readonly marker: '`' | '~';
  readonly length: number;
  readonly indent: number;
  readonly language: string;
}

function generatedAttribute(source: string, name: string): string {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(source);
  return decodeMarkdownEntities(match?.[1] ?? match?.[2] ?? '');
}

/**
 * Parses only the small semantic subset emitted by `textStyleHTML`. This keeps
 * server-side Markdown import dependency-free without treating arbitrary HTML
 * as document structure.
 */
function generatedStyledNodes(
  source: string,
  schema: Schema,
  baseMarks: readonly Mark[],
): readonly Node[] {
  const nodes: Node[] = [];
  const stack: Array<{ readonly tag: string; readonly marks: readonly Mark[] }> = [
    { tag: '', marks: baseMarks },
  ];
  const tagPattern = /<\/?(?:strong|em|u|s|code|sub|sup|a)(?:\s[^>]*)?>/gi;
  const markNames: Readonly<Record<string, string>> = {
    strong: 'strong', em: 'em', u: 'underline', s: 'strike', code: 'code', sub: 'subscript', sup: 'superscript',
  };
  let cursor = 0;
  const appendText = (value: string) => {
    if (value) nodes.push(...textNodes(decodeMarkdownEntities(value), schema, stack.at(-1)?.marks ?? baseMarks));
  };

  for (const match of source.matchAll(tagPattern)) {
    const offset = match.index ?? 0;
    appendText(source.slice(cursor, offset));
    const token = match[0];
    const closing = /^<\//u.test(token);
    const tag = /^<\/?([a-z]+)/iu.exec(token)?.[1]?.toLowerCase() ?? '';
    if (closing) {
      const openingIndex = stack.findLastIndex((entry) => entry.tag === tag);
      if (openingIndex > 0) stack.splice(openingIndex);
    } else {
      const current = stack.at(-1)?.marks ?? baseMarks;
      const type = schema.marks[tag === 'a' ? 'link' : markNames[tag] ?? ''];
      const hasRequiredAttributes = tag !== 'a' || /\shref\s*=/iu.test(token);
      let next = current;
      if (type && hasRequiredAttributes && !current.some((mark) => mark.type === type)) {
        try {
          const attrs = tag === 'a' ? {
            href: generatedAttribute(token, 'href'),
            title: generatedAttribute(token, 'title'),
            target: generatedAttribute(token, 'target') === '_self' ? '_self' : '_blank',
          } : {};
          next = [...current, type.create(attrs)];
        } catch { /* Invalid or unsafe link attributes degrade to readable text. */ }
      }
      stack.push({ tag, marks: next });
    }
    cursor = offset + token.length;
  }
  appendText(source.slice(cursor));
  return nodes;
}

function rubyToken(
  value: string,
  start: number,
  schema: Schema,
  inheritedMarks: readonly Mark[],
): RubyToken | null {
  if (!schema.nodes.ruby || !/^<ruby(?:\s[^>]*)?>/i.test(value.slice(start))) return null;
  const close = /<\/ruby\s*>/i.exec(value.slice(start));
  if (!close) return null;
  const end = start + close.index + close[0].length;
  const source = value.slice(start, end);

  const annotation = /<rt(?:\s[^>]*)?>([\s\S]*?)<\/rt\s*>/i.exec(source)?.[1];
  const body = /^<ruby(?:\s[^>]*)?>([\s\S]*)<\/ruby\s*>$/i.exec(source)?.[1] ?? '';
  const explicitBase = /<rb(?:\s[^>]*)?>([\s\S]*?)<\/rb\s*>/i.exec(body)?.[1];
  const baseSource = explicitBase ?? body
    .replace(/<rt(?:\s[^>]*)?>[\s\S]*?<\/rt\s*>/gi, '')
    .replace(/<rp(?:\s[^>]*)?>[\s\S]*?<\/rp\s*>/gi, '');
  const base = generatedStyledNodes(baseSource, schema, inheritedMarks);
  const rt = decodeMarkdownEntities((annotation ?? '').replace(/<[^>]*>/g, '')).trim();
  try {
    if (!base.some((node) => node.textContent) || !rt) return null;
    return { node: schema.node('ruby', { rt }, base), end };
  } catch { return null; }
}

function styledTextToken(
  value: string,
  start: number,
  schema: Schema,
  inheritedMarks: readonly Mark[],
): StyledTextToken | null {
  const opening = /^<span\s+data-fountain-text-style="true"\s+style="([^"]*)">/i.exec(value.slice(start));
  if (!opening) return null;
  const contentStart = start + opening[0].length;
  const closing = /<\/span\s*>/i.exec(value.slice(contentStart));
  if (!closing) return null;
  const end = contentStart + closing.index + closing[0].length;
  const source = value.slice(start, end);

  const style = decodeMarkdownEntities(opening[1]);
  const marks = [...inheritedMarks];
  const add = (name: string, attrs: Record<string, unknown>) => {
    const type = schema.marks[name];
    if (!type || marks.some((mark) => mark.type === type)) return;
    try { marks.push(type.create(attrs)); }
    catch { /* Invalid style declarations are ignored. */ }
  };
  style.split(';').forEach((declaration) => {
    const separator = declaration.indexOf(':');
    if (separator < 1) return;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const styleValue = declaration.slice(separator + 1).trim();
    if (property === 'color') add('text_color', { color: styleValue });
    else if (property === 'background-color') add('highlight', { color: styleValue });
    else if (property === 'font-family') add('font_family', { family: styleValue.replace(/["']/g, '').replace(/,/g, ', ') });
    else if (property === 'font-size') add('font_size', { size: styleValue });
    else if (property === 'line-height') add('line_height', { lineHeight: styleValue });
  });
  const body = value.slice(contentStart, contentStart + closing.index);
  const nodes = generatedStyledNodes(body, schema, marks);
  return nodes.length ? { nodes, end } : null;
}

function containsNestedLink(label: string, references: References): boolean {
  for (let index = 0; index < label.length;) {
    if (label[index] === '\\') { index += 2; continue; }
    if (label[index] === '`') {
      const code = codeSpanToken(label, index);
      if (code) { index = code.end; continue; }
    }
    if (label[index] === '!' || label[index] === '[') {
      const nested = linkToken(label, index, references, false);
      if (nested && !nested.image) return true;
    }
    index += 1;
  }
  return false;
}

function linkToken(
  value: string,
  start: number,
  references: References,
  rejectNestedLinks = true,
): LinkToken | null {
  const image = value.startsWith('![', start);
  const bracket = image ? start + 1 : start;
  if (value[bracket] !== '[') return null;
  const labelEnd = closingBracket(value, bracket);
  if (labelEnd < 0) return null;
  const label = value.slice(bracket + 1, labelEnd);
  const following = labelEnd + 1;
  const result = (definition: ReferenceDefinition, end: number): LinkToken | null => (
    !image && rejectNestedLinks && containsNestedLink(label, references)
      ? null
      : { ...definition, label, image, end }
  );
  if (value[following] === '(') {
    const destinationEnd = inlineLinkEnd(value, following);
    if (destinationEnd >= 0) {
      const parsed = destinationParts(value.slice(following + 1, destinationEnd), true);
      if (parsed) return result(parsed, destinationEnd + 1);
    }
    // Invalid inline-link syntax does not consume the label. CommonMark can
    // therefore still resolve it as a shortcut reference and leave the
    // malformed `(…)` suffix as literal text.
    if (!label.trim() || label.length > 999) return null;
    const definition = references.get(referenceName(label));
    return definition ? result(definition, labelEnd + 1) : null;
  }
  if (value[following] === '[') {
    const referenceEnd = closingBracket(value, following);
    if (referenceEnd < 0) return null;
    const explicit = value.slice(following + 1, referenceEnd);
    const referenceLabel = explicit || label;
    if (!referenceLabel.trim() || referenceLabel.length > 999) return null;
    const definition = references.get(referenceName(referenceLabel));
    return definition ? result(definition, referenceEnd + 1) : null;
  }
  if (!label.trim() || label.length > 999) return null;
  const definition = references.get(referenceName(label));
  return definition ? result(definition, labelEnd + 1) : null;
}

function autolinkToken(value: string, start: number): (ReferenceDefinition & { readonly label: string; readonly end: number }) | null {
  if (value[start] !== '<') return null;
  const closing = value.indexOf('>', start + 1);
  if (closing < 0) return null;
  const label = value.slice(start + 1, closing);
  if (!label || /[\s<>\u0000-\u001f\u007f]/u.test(label)) return null;
  const email = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/u.test(label);
  const href = email ? `mailto:${label}` : label;
  if (!email && !/^[A-Za-z][A-Za-z\d+.-]{1,31}:/u.test(label)) return null;
  return isSafeURL(href) ? { href, title: '', label, end: closing + 1 } : null;
}

function inline(text: string, schema: Schema, references: References, inheritedMarks: readonly Mark[] = []): Node[] {
  const result: Node[] = [];
  let plain = '';
  const flush = () => {
    if (plain) result.push(...textNodes(decodeMarkdownText(plain), schema, inheritedMarks));
    plain = '';
  };
  for (let index = 0; index < text.length;) {
    const spaceBreak = /^ {2,}\n/u.exec(text.slice(index));
    if (spaceBreak && schema.nodes.hard_break) {
      flush();
      result.push(schema.node('hard_break'));
      index += spaceBreak[0].length;
      continue;
    }
    if (text.startsWith('\\\n', index) && schema.nodes.hard_break) {
      flush();
      result.push(schema.node('hard_break'));
      index += 2;
      continue;
    }
    if (text[index] === '\\' && index + 1 < text.length) {
      plain += text.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (text[index] === '<') {
      const styled = styledTextToken(text, index, schema, inheritedMarks);
      if (styled) {
        flush();
        result.push(...styled.nodes);
        index = styled.end;
        continue;
      }
      const parsed = rubyToken(text, index, schema, inheritedMarks);
      if (parsed) {
        flush();
        result.push(parsed.node);
        index = parsed.end;
        continue;
      }
      const autolink = autolinkToken(text, index);
      if (autolink && schema.marks.link) {
        flush();
        result.push(...textNodes(autolink.label, schema, [
          ...inheritedMarks,
          schema.marks.link.create({ href: autolink.href, title: autolink.title }),
        ]));
        index = autolink.end;
        continue;
      }
    }
    if (text.startsWith('[^', index) && schema.nodes.footnote_reference) {
      const token = /^\[\^([^\]\r\n]+)\]/.exec(text.slice(index));
      if (token) {
        try {
          const reference = schema.node('footnote_reference', { id: decodeMarkdownText(token[1]) });
          flush();
          result.push(reference);
          index += token[0].length;
          continue;
        } catch { /* Invalid IDs remain readable literal text. */ }
      }
    }
    if (text[index] === '!' || text[index] === '[') {
      const parsed = linkToken(text, index, references);
      if (parsed) {
        const safe = isSafeURL(parsed.href, {
          allowDataImage: parsed.image,
          allowEmpty: !parsed.image,
        });
        if (safe) {
          flush();
          if (parsed.image && schema.nodes.inline_image) {
            try {
              result.push(schema.node('inline_image', {
                src: parsed.href,
                alt: decodeMarkdownText(parsed.label),
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
      ['**', '**', 'strong'], ['~~', '~~', 'strike'], ['==', '==', 'highlight'], ['_', '_', 'em'], ['*', '*', 'em'],
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
      const codeSpan = codeSpanToken(text, index);
      if (codeSpan?.text) {
        flush();
        result.push(...textNodes(codeSpan.text, schema, [...inheritedMarks, schema.marks.code.create()]));
        index = codeSpan.end;
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

function detailsStart(line: string): { open: boolean } | null {
  const match = /^\s*<details(?:\s+(open)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)?\s*>\s*$/i.exec(line);
  return match ? { open: Boolean(match[1]) } : null;
}

function detailsEnd(lines: readonly string[], start: number): number {
  let depth = 0;
  for (let index = start; index < lines.length; index += 1) {
    if (detailsStart(lines[index])) depth += 1;
    if (/^\s*<\/details>\s*$/i.test(lines[index])) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function markdownFence(line: string): MarkdownFence | null {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/u.exec(line);
  if (!match) return null;
  const marker = match[2][0] as '`' | '~';
  const info = match[3].trim();
  if (marker === '`' && info.includes('`')) return null;
  return {
    marker,
    length: match[2].length,
    indent: match[1].length,
    language: decodeMarkdownText(info.split(/\s+/u)[0] ?? ''),
  };
}

function closesMarkdownFence(line: string, fence: MarkdownFence): boolean {
  const match = /^( {0,3})(`+|~+)[\t ]*$/u.exec(line);
  return Boolean(match && match[2][0] === fence.marker && match[2].length >= fence.length);
}

function indentedCodeLine(line: string): string | null {
  if (line.startsWith('\t')) return line.slice(1);
  return line.startsWith('    ') ? line.slice(4) : null;
}

function endsWithHardBreak(value: string): boolean {
  if (/ {2,}$/u.test(value)) return true;
  let slashes = 0;
  for (let index = value.length - 1; index >= 0 && value[index] === '\\'; index -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function startsBlock(lines: readonly string[], index: number, references: References, schema: Schema): boolean {
  const line = lines[index] ?? '';
  return Boolean(markdownFence(line))
    || /^\$\$/.test(line)
    || /^ {0,3}(#{1,6})(?:[\t ]+|$)/u.test(line)
    || /^ {0,3}(?:-{3,}|\*{3,}|_{3,})[\t ]*$/u.test(line)
    || /^>\s?/.test(line)
    || listMarker(line)?.indent === 0
    || Boolean(tableStart(lines, index))
    || Boolean(blockImage(line, references))
    || Boolean(schema.nodes.details && schema.nodes.details_summary && detailsStart(line));
}

function parseBlocks(lines: readonly string[], schema: Schema, references: References): Node[] {
  const blocks: Node[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const disclosure = detailsStart(line);
    if (disclosure && schema.nodes.details && schema.nodes.details_summary) {
      const closing = detailsEnd(lines, index);
      let summaryIndex = index + 1;
      while (summaryIndex < closing && !lines[summaryIndex].trim()) summaryIndex += 1;
      const summary = closing > summaryIndex
        ? /^\s*<summary>(.*)<\/summary>\s*$/i.exec(lines[summaryIndex])
        : null;
      if (summary) {
        const body = parseBlocks(lines.slice(summaryIndex + 1, closing), schema, references);
        const fallback = schema.nodes.paragraph?.create({}, [schema.text('')]);
        try {
          blocks.push(schema.node('details', { open: disclosure.open }, [
            schema.node('details_summary', {}, inline(summary[1], schema, references)),
            ...(body.length ? body : fallback ? [fallback] : []),
          ]));
          index = closing + 1;
          continue;
        } catch { /* Preserve malformed disclosure source as ordinary text. */ }
      }
    }
    const fence = markdownFence(line);
    if (fence) {
      const code: string[] = [];
      for (index++; index < lines.length && !closesMarkdownFence(lines[index], fence); index++) {
        const content = lines[index];
        const indentation = /^ */u.exec(content)?.[0].length ?? 0;
        code.push(content.slice(Math.min(fence.indent, indentation)));
      }
      if (index < lines.length) index++;
      blocks.push(schema.node('code_block', { language: fence.language || 'text', lineNumbers: true }, [schema.text(code.join('\n'))]));
      continue;
    }
    const firstCodeLine = indentedCodeLine(line);
    if (firstCodeLine !== null) {
      const code = [firstCodeLine];
      for (index++; index < lines.length;) {
        const content = indentedCodeLine(lines[index]);
        if (content !== null) { code.push(content); index++; continue; }
        if (!lines[index].trim()) { code.push(''); index++; continue; }
        break;
      }
      while (code.at(-1) === '') code.pop();
      blocks.push(schema.node('code_block', { language: 'text', lineNumbers: true }, [schema.text(code.join('\n'))]));
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
    const heading = /^ {0,3}(#{1,6})(?:[\t ]+(.*?)|[\t ]*)$/u.exec(line);
    if (heading) {
      const value = (heading[2] ?? '').replace(/[\t ]+#+[\t ]*$/u, '');
      blocks.push(schema.node('heading', { level: heading[1].length }, inline(value, schema, references)));
      index++;
      continue;
    }
    if (/^ {0,3}(?:-{3,}|\*{3,}|_{3,})[\t ]*$/u.test(line)) {
      blocks.push(schema.node('horizontal_rule'));
      index++;
      continue;
    }
    const setext = /^ {0,3}(=+|-+)[\t ]*$/u.exec(lines[index + 1] ?? '');
    if (setext && !listMarker(line) && !/^ {0,3}>[\t ]?/u.test(line) && !detailsStart(line)) {
      blocks.push(schema.node('heading', { level: setext[1][0] === '=' ? 1 : 2 }, inline(line.trim(), schema, references)));
      index += 2;
      continue;
    }
    const image = blockImage(line, references);
    if (image && isSafeURL(image.href, { allowDataImage: true })) {
      blocks.push(schema.node('image_super', {
        src: image.href,
        alt: decodeMarkdownText(image.label),
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
    for (index++; index < lines.length && lines[index].trim() && !startsBlock(lines, index, references, schema); index++) paragraphLines.push(lines[index]);
    const joined = paragraphLines.reduce((value, current) => endsWithHardBreak(value) ? `${value}\n${current}` : `${value} ${current}`);
    blocks.push(paragraph(schema, joined, references));
  }
  return blocks;
}

function references(markdown: string): { lines: string[]; definitions: References } {
  const definitions = new Map<string, ReferenceDefinition>();
  const sourceLines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const lines: string[] = [];
  let fence: MarkdownFence | null = null;
  let paragraphOpen = false;
  for (let index = 0; index < sourceLines.length;) {
    const line = sourceLines[index];
    const quote = /^( {0,3}>[\t ]?)(.*)$/u.exec(line);
    if (quote && !fence) {
      const prefixes: string[] = [];
      const contents: string[] = [];
      let cursor = index;
      for (; cursor < sourceLines.length; cursor++) {
        const nested = /^( {0,3}>[\t ]?)(.*)$/u.exec(sourceLines[cursor]);
        if (!nested) break;
        prefixes.push(nested[1]);
        contents.push(nested[2]);
      }
      const extracted = references(contents.join('\n'));
      extracted.definitions.forEach((definition, name) => {
        if (!definitions.has(name)) definitions.set(name, definition);
      });
      extracted.lines.forEach((content, offset) => lines.push(`${prefixes[offset]}${content}`));
      paragraphOpen = false;
      index = cursor;
      continue;
    }
    if (fence) {
      lines.push(line);
      if (closesMarkdownFence(line, fence)) fence = null;
      paragraphOpen = false;
      index++;
      continue;
    }
    const openingFence = markdownFence(line);
    if (openingFence) {
      fence = openingFence;
      lines.push(line);
      paragraphOpen = false;
      index++;
      continue;
    }
    if (!line.trim()) {
      lines.push(line);
      paragraphOpen = false;
      index++;
      continue;
    }
    if (indentedCodeLine(line) !== null && !paragraphOpen) {
      lines.push(line);
      index++;
      continue;
    }
    const definition = paragraphOpen ? null : referenceDefinitionAt(sourceLines, index);
    if (definition) {
      if (!definitions.has(definition.label)) definitions.set(definition.label, {
        href: definition.href,
        title: definition.title,
      });
      for (let offset = 0; offset < definition.lineCount; offset++) lines.push('');
      paragraphOpen = false;
      index += definition.lineCount;
      continue;
    }
    lines.push(line);
    if (/^ {0,3}(?:#{1,6}(?:[\t ]+|$)|(?:-{3,}|\*{3,}|_{3,})[\t ]*$|>|(?:[-*])\s+|\d+[.)]\s+|\$\$)/u.test(line)) {
      paragraphOpen = false;
    } else if (paragraphOpen && /^ {0,3}(?:=+|-+)[\t ]*$/u.test(line)) {
      paragraphOpen = false;
    } else {
      paragraphOpen = true;
    }
    index++;
  }
  return { lines, definitions };
}

interface MarkdownFootnoteDefinition {
  readonly id: string;
  readonly lines: readonly string[];
}

function extractFootnoteDefinitions(
  markdown: string,
  schema: Schema,
): { markdown: string; definitions: readonly MarkdownFootnoteDefinition[] } {
  if (!schema.nodes.footnote_reference || !schema.nodes.footnote_definition) {
    return { markdown, definitions: [] };
  }
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const body: string[] = [];
  const definitions: MarkdownFootnoteDefinition[] = [];
  for (let index = 0; index < lines.length;) {
    const opening = /^\s{0,3}\[\^([^\]]+)\]:[ \t]*(.*)$/.exec(lines[index]);
    if (!opening) { body.push(lines[index]); index += 1; continue; }
    const id = decodeMarkdownText(opening[1]);
    try { schema.nodes.footnote_definition.create({ id }, [paragraph(schema, '', new Map())]); }
    catch { body.push(lines[index]); index += 1; continue; }

    const content = [opening[2]];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const continuation = /^(?: {4}|\t)(.*)$/.exec(lines[cursor]);
      if (continuation) { content.push(continuation[1]); cursor += 1; continue; }
      if (!lines[cursor].trim() && /^(?: {4}|\t)/.test(lines[cursor + 1] ?? '')) {
        content.push('');
        cursor += 1;
        continue;
      }
      break;
    }
    definitions.push(Object.freeze({ id, lines: Object.freeze(content) }));
    body.push('');
    index = cursor;
  }
  return { markdown: body.join('\n'), definitions: Object.freeze(definitions) };
}

export class MarkdownImporter {
  parse(markdown: string, schema: Schema): Node {
    const footnotes = extractFootnoteDefinitions(markdown, schema);
    const source = references(footnotes.markdown);
    const blocks = parseBlocks(source.lines, schema, source.definitions);
    const definitions = footnotes.definitions.map((definition) => {
      const content = parseBlocks(definition.lines, schema, source.definitions);
      return schema.node('footnote_definition', { id: definition.id }, content.length
        ? content
        : [paragraph(schema, '', source.definitions)]);
    });
    const content = [...blocks, ...definitions];
    const document = schema.topNodeType.create({}, content.length ? content : [paragraph(schema, '', source.definitions)]);
    schema.validate(document);
    return document;
  }

  /**
   * Parses the document body while retaining exact source and inert YAML
   * frontmatter provenance for raw/visual workflows.
   */
  parseWithSource(markdown: string, schema: Schema): MarkdownSourceImportResult {
    return MarkdownSourceSnapshot.parse(markdown, schema);
  }

  static parse(markdown: string, schema: Schema): Node { return new MarkdownImporter().parse(markdown, schema); }

  static parseWithSource(markdown: string, schema: Schema): MarkdownSourceImportResult {
    return new MarkdownImporter().parseWithSource(markdown, schema);
  }
}
