import { Mark, Node, type Schema } from '../schema';
import { matchesContentExpression } from '../schema/content-expression';
import { isSafeURL } from '../url';
import { decodeMarkdownEntities, decodeMarkdownText } from '../markdown-entities';
import { unicodeCaseFold } from '../unicode-case-fold';
import { texMathBlock, texMathStart, texMathCloses, texTableBlock, texTableStart } from '../markdown-tex';
import { projectTeXTableSource } from '../tex-table';
import { markdownHTMLBlock, markdownHTMLBlockEnd, markdownEmptyParagraph, markdownHTMLTokenEnd as inlineHTMLTokenEnd, type MarkdownHTMLBlock } from '../markdown-html';

const MAX_MARKDOWN_SOURCE_BLOCKS = 10_000;
const MAX_MARKDOWN_REFERENCE_LINES = 32;
const UNICODE_WHITESPACE = /\p{White_Space}/u;
const UNICODE_PUNCTUATION = /[\p{P}\p{S}]/u;

export type MarkdownLineEnding = '\n' | '\r\n' | '\r';

export interface MarkdownHTMLBlockFallback {
  readonly html: string;
  readonly reason: 'declined' | 'error';
  readonly message: string;
}

/** One Markdown container's raw HTML blocks interleaved with parsed blocks. */
export type MarkdownHTMLFlowSegment =
  | { readonly kind: 'html'; readonly html: string }
  | { readonly kind: 'node'; readonly node: Node };

export interface MarkdownHTMLFlowFallback {
  readonly reason: 'declined' | 'error';
  readonly message: string;
}

/** Parser input for one direct paragraph, before HTML adapter conversion. */
export interface MarkdownHTMLFlowParagraphSource {
  /** Normalized parser input, not an exact file slice (for that use parseWithSource). */
  readonly source: string;
  /** Current converted blocks for this paragraph, in order; may be empty. */
  readonly blocks: readonly Node[];
  /** Fresh syntax nodes, not positional identities of the converted blocks. */
  readonly segments: readonly MarkdownHTMLInlineSegment[];
  readonly tightList: boolean;
}

/** Direct text-block syntax; never inferred by exporting a finished document node. */
export type MarkdownHTMLFlowTextBlockSource =
  | (MarkdownHTMLFlowParagraphSource & { readonly kind: 'paragraph' })
  | (Omit<MarkdownHTMLFlowParagraphSource, 'tightList'> & { readonly kind: 'heading'; readonly level: number })
  | (Omit<MarkdownHTMLFlowParagraphSource, 'tightList'> & {
    readonly kind: 'code'; readonly language: string; readonly finalLineBreak: boolean;
  });

export interface MarkdownHTMLFlowContext {
  /**
   * Lazily inspect direct paragraphs in this container, without invoking host
   * adapters. Cached per flow call. Not a complete block/rendering stream:
   * headings, code, nested containers and generated separators are not included.
   */
  readonly readParagraphSources: () => readonly MarkdownHTMLFlowParagraphSource[];
  /** Lazy direct paragraphs, ATX/Setext headings and fenced/indented code, in order.
   * Nested containers and atoms still need a structural source representation.
   * Optional for compatibility with hosts supplying paragraph-only context. */
  readonly readTextBlockSources?: () => readonly MarkdownHTMLFlowTextBlockSource[];
}

/** Raw HTML tokens interleaved with already-parsed, immutable Fountain nodes. */
export type MarkdownHTMLInlineSegment =
  | { readonly kind: 'html'; readonly html: string; readonly marks: readonly Mark[] }
  | {
    readonly kind: 'node'; readonly node: Node; readonly softBreak?: true;
    /** Import-local character run; unequal values preserve generated Markdown tag boundaries. */
    readonly textRun?: number;
  };

export interface MarkdownHTMLInlineFallback {
  readonly source: string;
  readonly reason: 'declined' | 'error';
  readonly message: string;
}

export interface MarkdownImportOptions {
  /**
   * Recognize GFM-style bare web/email addresses as links (default true).
   * Set false for CommonMark-style literal addresses. Explicit Markdown links
   * and safe angle-bracket autolinks are unaffected. This is an import policy,
   * not a full CommonMark mode or an editor typing/clipboard setting.
   */
  readonly autolinkLiterals?: boolean;
  /** Explicit, lossy projection of simple TeX tabular cells/alignment; not a TeX compiler. */
  readonly texTables?: boolean;
  /** Unsupported syntax stays literal; successful projections report omitted float/rule layout. */
  readonly onTeXTableIssue?: (issue: { readonly source: string; readonly code: 'unsupported-syntax' | 'layout-projection'; readonly message: string }) => void;
  /**
   * Opt-in standalone TeX equation/align/gather/multline/displaymath environments
   * (including starred variants). Requires a math_block schema node. Retains
   * complete TeX source, including labels; does not resolve references, execute
   * macros, or compile a TeX document. Complete environments may interrupt prose
   * in this explicit dialect, as in Pandoc-style academic Markdown.
   */
  readonly texMathEnvironments?: boolean;
  /**
   * Optional synchronous, deterministic HTML-to-schema adapter for raw HTML
   * blocks only. Return a document or readonly block array from this schema,
   * including an empty array for no visible content, or null to keep literal
   * source. The adapter owns HTML sanitization and conversion-loss reporting;
   * schema validation alone is not an HTML sanitizer. No parser is bundled
   * into the core. Fountain's explicit dialect is unchanged.
   * Source capture may invoke the adapter again to verify block provenance.
   */
  readonly parseHTMLBlock?: (html: string, schema: Schema) => Node | readonly Node[] | null;
  /** Called when a block is retained literally because its adapter failed or declined. */
  readonly onHTMLBlockFallback?: (issue: MarkdownHTMLBlockFallback) => void;
  /**
   * Optional whole-container HTML scope projection, taking precedence over
   * parseHTMLBlock. Original blocks must not be serialized/reparsed as HTML.
   * Return schema block nodes (possibly empty), or null to retain inert HTML.
   * Runs separately inside Markdown containers; may run during source capture.
   */
  readonly parseHTMLFlow?: (segments: readonly MarkdownHTMLFlowSegment[], schema: Schema, context?: MarkdownHTMLFlowContext) => readonly Node[] | null;
  readonly onHTMLFlowFallback?: (issue: MarkdownHTMLFlowFallback) => void;
  /**
   * Optional synchronous inline HTML scope adapter. Original Markdown nodes
   * must not be serialized and reparsed as HTML. Raw tokens carry their local
   * Markdown marks, including marks on HTML-created atoms. Return same-schema
   * inline nodes, or null to retain the normal inert interpretation. The host
   * owns sanitization and loss reporting. May run again during source capture.
   */
  readonly parseHTMLInline?: (segments: readonly MarkdownHTMLInlineSegment[], schema: Schema) => readonly Node[] | null;
  /**
   * Optional paragraph-level HTML recovery that may return multiple blocks.
   * Receives original inline nodes and raw HTML tokens, before inline conversion.
   * Applies only to ordinary paragraphs (including list/quote paragraphs), not
   * headings or pipe-table cells. Takes precedence over parseHTMLInline there.
   * Return null to retain inert HTML; validate and sanitize in the adapter.
   */
  readonly parseHTMLParagraph?: (segments: readonly MarkdownHTMLInlineSegment[], schema: Schema, context: MarkdownHTMLParagraphContext) => readonly Node[] | null;
  readonly onHTMLParagraphFallback?: (issue: MarkdownHTMLInlineFallback) => void;
  readonly onHTMLInlineFallback?: (issue: MarkdownHTMLInlineFallback) => void;
}

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

/** One conservatively mapped top-level source block and its following source trivia. */
export interface MarkdownSourceBlockSnapshot {
  readonly source: string;
  readonly separatorAfter: string;
  /** True when a current top-level node is semantically equal to this captured block. */
  matches(document: Node): boolean;
}

interface MarkdownBlockCapture {
  readonly leading: string;
  readonly blocks: readonly MarkdownSourceBlockSnapshot[];
  readonly referenceDefinitions?: string;
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
  /** Exact source trivia (whitespace/root definitions) before the first block. */
  readonly leading: string;
  /** Root reference definitions in original order, retained after structural edits. */
  readonly referenceDefinitions: string;
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
    this.referenceDefinitions = capture?.referenceDefinitions ?? '';
    this.blocks = Object.freeze([...(capture?.blocks ?? [])]);
    Object.freeze(this);
  }

  /** True only while the current immutable document is semantically unchanged. */
  matches(document: Node): boolean {
    return this.originalDocument.eq(document);
  }

  /**
   * Maps current top-level nodes to captured source blocks. Preserved immutable
   * node identity disambiguates equal duplicates; otherwise only a semantic
   * value unique in both documents can map. Ambiguous content returns `null`.
   * The array itself is `null` when conservative capture was unavailable.
   */
  mapBlocks(document: Node): readonly (MarkdownSourceBlockSnapshot | null)[] | null {
    if (!this.blocks.length || document.type !== this.originalDocument.type) return null;
    const originalIdentities = new Map<Node, number[]>();
    const currentIdentities = new Map<Node, number[]>();
    const originals = new Map<string, number[]>();
    const currents = new Map<string, number[]>();
    this.originalDocument.content.forEach((node, index) => {
      const identities = originalIdentities.get(node);
      if (identities) identities.push(index);
      else originalIdentities.set(node, [index]);
      const key = markdownNodeFingerprint(node);
      const indexes = originals.get(key);
      if (indexes) indexes.push(index);
      else originals.set(key, [index]);
    });
    document.content.forEach((node, index) => {
      const identities = currentIdentities.get(node);
      if (identities) identities.push(index);
      else currentIdentities.set(node, [index]);
      const key = markdownNodeFingerprint(node);
      const indexes = currents.get(key);
      if (indexes) indexes.push(index);
      else currents.set(key, [index]);
    });
    return Object.freeze(document.content.map((node) => {
      const identityOriginalIndexes = originalIdentities.get(node) ?? [];
      const identityCurrentIndexes = currentIdentities.get(node) ?? [];
      if (identityOriginalIndexes.length === 1 && identityCurrentIndexes.length === 1) {
        const block = this.blocks[identityOriginalIndexes[0]];
        if (block?.matches(node)) return block;
      }
      const key = markdownNodeFingerprint(node);
      const originalIndexes = originals.get(key) ?? [];
      const currentIndexes = currents.get(key) ?? [];
      if (originalIndexes.length !== 1 || currentIndexes.length !== 1) return null;
      const block = this.blocks[originalIndexes[0]];
      return block?.matches(node) ? block : null;
    }));
  }

  static parse(source: string, schema: Schema, options: MarkdownImportOptions = {}): MarkdownSourceImportResult {
    if (typeof source !== 'string') throw new TypeError('Markdown source must be a string.');
    const parts = splitMarkdownSource(source);
    const document = new MarkdownImporter().parse(parts.body, schema, options);
    const capture = captureMarkdownBlocks(parts.body, schema, document, options);
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
 * one-to-one to the parsed top-level nodes. Root reference-definition prefixes
 * are source trivia, shared with every block's inline parser. Container
 * definitions and ambiguous block boundaries still fail closed.
 */
function captureMarkdownBlocks(source: string, schema: Schema, document: Node, options: MarkdownImportOptions): MarkdownBlockCapture | undefined {
  const segments = markdownBlockSegments(source);
  if (!segments.blocks.length || segments.blocks.length > MAX_MARKDOWN_SOURCE_BLOCKS) return undefined;
  const quietOptions = { ...options, onHTMLBlockFallback: undefined, onHTMLInlineFallback: undefined,
    onHTMLFlowFallback: undefined, onTeXTableIssue: undefined };
  const definitionPrefix = (value: string): string => {
    if (!/^ {0,3}\[/u.test(value)) return '';
    // Keep physical endings and indentation separately from the parser's lines.
    // A definition may end immediately before a paragraph, not just a blank line.
    const physical = value.match(/[^\r\n]*(?:\r\n|\r|\n|$)/gu)!.filter(Boolean);
    const lines = physical.map(line => line.replace(/(?:\r\n|\r|\n)$/u, ''));
    let index = 0;
    while (index < lines.length) {
      if (footnoteDefinitionAt(lines, index, schema)) break;
      const definition = referenceDefinitionAt(lines, index);
      if (!definition) break;
      index += definition.lineCount;
    }
    return physical.slice(0, index).join('');
  };
  const regions = segments.blocks.map(block => ({ ...block, prefix: definitionPrefix(block.source) }));
  const referenceDefinitions = regions.filter(region => region.prefix)
    .map(region => region.prefix.replace(/(?:\r\n|\r|\n)$/u, ''))
    .join(`${sourceLineEnding(source)}${sourceLineEnding(source)}`);
  // Parse the definition context once; appending every definition to every
  // block would multiply large reference sets by the number of document blocks.
  const context = referenceDefinitions ? references(referenceDefinitions, schema, quietOptions).definitions : null;
  const contentRegions: Array<{ source: string; separatorAfter: string }> = [];
  let leading = segments.leading;
  for (const region of regions) {
    const content = region.source.slice(region.prefix.length);
    const trivia = region.prefix + (content ? '' : region.separatorAfter);
    if (contentRegions.length) contentRegions[contentRegions.length - 1].separatorAfter += trivia;
    else leading += trivia;
    if (content) contentRegions.push({ source: content, separatorAfter: region.separatorAfter });
  }
  if (contentRegions.length !== document.content.length) return undefined;

  const blocks: MarkdownSourceBlockSnapshot[] = [];
  for (let index = 0; index < contentRegions.length; index += 1) {
    const segment = contentRegions[index];
    let parsed: readonly Node[];
    if (context) {
      const local = references(segment.source, schema, quietOptions);
      // Definitions embedded in a moved/deleted content region could change
      // other blocks' destinations. Do not claim independent provenance there.
      if (local.definitions.size) return undefined;
      parsed = parseBlocks(local.lines, schema, context, quietOptions);
    } else parsed = new MarkdownImporter().parse(segment.source, schema, quietOptions).content;
    const original = document.content[index];
    if (parsed.length !== 1 || !parsed[0].eq(original)) return undefined;
    blocks.push(Object.freeze({
      source: segment.source,
      separatorAfter: segment.separatorAfter,
      matches: (current: Node) => original.eq(current),
    }));
  }

  return Object.freeze({
    leading,
    blocks: Object.freeze(blocks),
    referenceDefinitions,
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
    try { result.push(schema.node('emoji', { name: unicodeEmojiName(segment), emoji: segment }, [], undefined, marks)); }
    catch { result.push(schema.text(segment, marks)); }
  });
  flush();
  return result.length ? result : [schema.text('', marks)];
}

function referenceName(value: string): string {
  // CommonMark matches normalized source labels, not their parsed inline
  // content. Escapes and character references therefore remain significant.
  return unicodeCaseFold(value
    .replace(/^[\t\n\r ]+|[\t\n\r ]+$/gu, '')
    .replace(/[\t\n\r ]+/gu, ' '));
}

function validReferenceLabel(value: string): boolean {
  return /[^\t\n\r ]/u.test(value) && Array.from(value).length <= 999;
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

function matchingDelimiter(
  value: string,
  start: number,
  delimiter: string,
  exactRun = false,
  references?: References,
): number {
  for (let index = start; index <= value.length - delimiter.length; index++) {
    if (value[index] === '\\') { index++; continue; }
    if (references) {
      const opaqueEnd = opaqueInlineEnd(value, index);
      if (opaqueEnd > index) { index = opaqueEnd - 1; continue; }
      if (value[index] === '[' || value[index] === '!') {
        const linkEnd = linkToken(value, index, references)?.end ?? -1;
        if (linkEnd > index) { index = linkEnd - 1; continue; }
      }
    }
    if (value.startsWith(delimiter, index)
      && (!exactRun || ((value[index - 1] !== delimiter[0] || isEscapedMarkdownCharacter(value, index - 1))
        && value[index + delimiter.length] !== delimiter[0]))) return index;
  }
  return -1;
}

function isEscapedMarkdownCharacter(value: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor--) slashes += 1;
  return slashes % 2 === 1;
}

function emphasisFlanking(value: string, start: number, length: number, marker: '*' | '_') {
  const before = Array.from(value.slice(Math.max(0, start - 2), start)).at(-1) ?? ' ';
  const after = String.fromCodePoint(value.codePointAt(start + length) ?? 32);
  const beforeWhitespace = UNICODE_WHITESPACE.test(before);
  const afterWhitespace = UNICODE_WHITESPACE.test(after);
  const beforePunctuation = UNICODE_PUNCTUATION.test(before);
  const afterPunctuation = UNICODE_PUNCTUATION.test(after);
  const leftFlanking = !afterWhitespace && (!afterPunctuation || beforeWhitespace || beforePunctuation);
  const rightFlanking = !beforeWhitespace && (!beforePunctuation || afterWhitespace || afterPunctuation);
  return marker === '_'
    ? (leftFlanking && (!rightFlanking || beforePunctuation) ? 1 : 0)
      | (rightFlanking && (!leftFlanking || afterPunctuation) ? 2 : 0)
    : (leftFlanking ? 1 : 0) | (rightFlanking ? 2 : 0);
}

function opaqueInlineEnd(value: string, start: number): number {
  return value[start] === '`'
    ? codeSpanToken(value, start)?.end ?? -1
    : value[start] === '<'
      ? autolinkToken(value, start)?.end ?? inlineHTMLTokenEnd(value, start)
      : -1;
}

interface EmphasisMatch {
  readonly start: number;
  readonly end: number;
  readonly runStart: number;
  readonly runEnd: number;
}

function emphasisDelimiterLength(runLength: number): 1 | 2 {
  return runLength % 2 === 0 ? 2 : 1;
}

function violatesEmphasisRuleOfThree(
  openerLength: number,
  openerFlanking: number,
  closerLength: number,
  closerFlanking: number,
): boolean {
  if (!(openerFlanking & 2) && !(closerFlanking & 1)) return false;
  return (openerLength + closerLength) % 3 === 0
    && (openerLength % 3 !== 0 || closerLength % 3 !== 0);
}

function enclosedByEarlierUnlikeEmphasis(
  value: string,
  searchStart: number,
  candidateStart: number,
  candidateCloserStart: number,
  references: References,
): boolean {
  const candidateMarker = value[candidateStart] as '*' | '_';
  const marker = candidateMarker === '*' ? '_' : '*';

  for (let index = searchStart; index < candidateStart; index++) {
    if (value[index] === '\\') { index++; continue; }
    const opaqueEnd = opaqueInlineEnd(value, index);
    if (opaqueEnd > index) { index = opaqueEnd - 1; continue; }
    if (value[index] === '[' || value[index] === '!') {
      const linkEnd = linkToken(value, index, references)?.end ?? -1;
      if (linkEnd > index) { index = linkEnd - 1; continue; }
    }
    if (value[index] !== marker) continue;

    let runEnd = index;
    while (value[runEnd] === marker) runEnd += 1;
    const runLength = runEnd - index;
    if (emphasisFlanking(value, index, runLength, marker) & 1) {
      const delimiterLength = emphasisDelimiterLength(runLength);
      const match = matchingEmphasisRun(
        value,
        index,
        runLength,
        delimiterLength,
        references,
        runLength - delimiterLength,
      );
      if (match && match.start > candidateStart && match.end <= candidateCloserStart) return true;
    }
    index = runEnd - 1;
  }
  return false;
}

function matchingEmphasisRun(
  value: string,
  openerStart: number,
  openerLength: number,
  delimiterLength: 1 | 2,
  references: References,
  openerRemainder = openerLength - delimiterLength,
): EmphasisMatch | null {
  const marker = value[openerStart] as '*' | '_';
  const openerFlanking = emphasisFlanking(value, openerStart, openerLength, marker);
  const start = openerStart + openerLength;
  let pendingRemainder = openerRemainder;
  for (let index = start; index <= value.length - delimiterLength; index++) {
    if (value[index] === '\\') { index++; continue; }
    const opaqueEnd = opaqueInlineEnd(value, index);
    if (opaqueEnd > index) { index = opaqueEnd - 1; continue; }
    if (value[index] === '[' || value[index] === '!') {
      const linkEnd = linkToken(value, index, references)?.end ?? -1;
      if (linkEnd > index) { index = linkEnd - 1; continue; }
    }
    if (value[index] !== marker
      || (value[index - 1] === marker && !isEscapedMarkdownCharacter(value, index - 1))) continue;
    let runEnd = index;
    while (value[runEnd] === marker) runEnd += 1;
    const runLength = runEnd - index;
    const flanking = emphasisFlanking(value, index, runLength, marker);
    if ((flanking & 2) && pendingRemainder > 0 && runLength <= pendingRemainder) {
      pendingRemainder -= runLength;
      index = runEnd - 1;
      continue;
    }
    const canClose = Boolean(flanking & 2)
      && runLength >= delimiterLength + pendingRemainder
      && !violatesEmphasisRuleOfThree(openerLength, openerFlanking, runLength, flanking);

    if (canClose) {
      const closeStart = index + pendingRemainder;
      return { start: closeStart, end: closeStart + delimiterLength, runStart: index, runEnd };
    }

    if (flanking & 1) {
      const nestedLength = emphasisDelimiterLength(runLength);
      const nested = matchingEmphasisRun(
        value,
        index,
        runLength,
        nestedLength,
        references,
        runLength - nestedLength,
      );
      if (nested) {
        // A same-marker opener inside an already-open unlike span must not
        // steal the current opener's later closer. CommonMark rule 15 gives
        // the earlier, outer span precedence in this overlap shape.
        if (enclosedByEarlierUnlikeEmphasis(
          value,
          start,
          index,
          nested.start,
          references,
        )) {
          index = runEnd - 1;
          continue;
        }
        const remainingCloserLength = nested.runEnd - nested.end;
        const nestedCloserFlanking = emphasisFlanking(
          value,
          nested.runStart,
          nested.runEnd - nested.runStart,
          marker,
        );
        if (remainingCloserLength >= delimiterLength
          && (nestedCloserFlanking & 2)
          && !violatesEmphasisRuleOfThree(
            openerLength,
            openerFlanking,
            nested.runEnd - nested.runStart,
            nestedCloserFlanking,
          )) {
          const closeStart = nested.runEnd - delimiterLength;
          return {
            start: closeStart,
            end: nested.runEnd,
            runStart: nested.runStart,
            runEnd: nested.runEnd,
          };
        }
        index = nested.runEnd - 1;
        continue;
      }
    }
    index = runEnd - 1;
  }
  return null;
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


function linkLabelEnd(value: string, start: number): number {
  let depth = 0;
  for (let index = start; index < value.length; index++) {
    if (value[index] === '\\') { index++; continue; }
    const opaqueEnd = opaqueInlineEnd(value, index);
    if (opaqueEnd > index) { index = opaqueEnd - 1; continue; }
    if (value[index] === '[') depth++;
    else if (value[index] === ']') {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function destinationParts(value: string, allowEmpty = false): ReferenceDefinition | null {
  const source = value.replace(/^[\t \r\n]+|[\t \r\n]+$/gu, '');
  if (!source) return allowEmpty ? { href: '', title: '' } : null;
  let href = '';
  let cursor = 0;
  if (source[0] === '<') {
    const close = matchingDelimiter(source, 1, '>');
    if (close < 0) return null;
    href = source.slice(1, close);
    if (/\r|\n/u.test(href)) return null;
    cursor = close + 1;
    if (cursor < source.length && !/[\t \r\n]/u.test(source[cursor])) return null;
  } else {
    let depth = 0;
    for (; cursor < source.length; cursor++) {
      const character = source[cursor];
      if (character === '\\') { href += character + (source[++cursor] ?? ''); continue; }
      if (/[\t \r\n]/u.test(character) && depth === 0) break;
      if (character === '(') depth++;
      else if (character === ')') {
        if (depth === 0) return null;
        depth--;
      }
      href += character;
    }
    if (depth !== 0) return null;
  }
  const remainder = source.slice(cursor).replace(/^[\t \r\n]+|[\t \r\n]+$/gu, '');
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
      if (!suffix || !validReferenceLabel(label)) return null;
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
    if (parsed && isSafeURL(parsed.href, { allowDataImage: true, allowEmpty: true })) {
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
  const stack: Array<{ readonly tag: string; readonly marks: readonly Mark[]; readonly nodeStart: number }> = [
    { tag: '', marks: baseMarks, nodeStart: 0 },
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
      if (openingIndex > 0) {
        if (nodes.length === stack[openingIndex].nodeStart) {
          nodes.push(schema.text('', stack.at(-1)?.marks ?? baseMarks));
        }
        stack.splice(openingIndex);
      }
    } else {
      const current = stack.at(-1)?.marks ?? baseMarks;
      const type = schema.marks[tag === 'a' ? 'link' : markNames[tag] ?? ''];
      const hasRequiredAttributes = tag !== 'a' || /\shref\s*=/iu.test(token);
      let next = current;
      if (type && hasRequiredAttributes && (
        tag === 'em' || tag === 'strong' || !current.some((mark) => mark.type === type)
      )) {
        try {
          const href = generatedAttribute(token, 'href');
          if (tag === 'a' && !isSafeURL(href, { allowEmpty: true })) throw new Error('Unsafe link');
          const attrs = tag === 'a' ? {
            href,
            title: generatedAttribute(token, 'title'),
            target: generatedAttribute(token, 'target') === '_self' ? '_self' : '_blank',
          } : {};
          next = [...current, type.create(attrs)];
        } catch { /* Invalid or unsafe link attributes degrade to readable text. */ }
      }
      stack.push({ tag, marks: next, nodeStart: nodes.length });
    }
    cursor = offset + token.length;
  }
  appendText(source.slice(cursor));
  if (!nodes.length) nodes.push(schema.text('', stack.at(-1)?.marks ?? baseMarks));
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
    if (label[index] === '<') {
      const autolink = autolinkToken(label, index);
      if (autolink) return true;
      const htmlEnd = inlineHTMLTokenEnd(label, index);
      if (htmlEnd > index) { index = htmlEnd; continue; }
    }
    if (label[index] === '!' || label[index] === '[') {
      const nested = linkToken(label, index, references, false);
      if (nested && !nested.image) return true;
      if (nested) { index = nested.end; continue; }
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
  const labelEnd = linkLabelEnd(value, bracket);
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
    if (!validReferenceLabel(label)) return null;
    const definition = references.get(referenceName(label));
    return definition ? result(definition, labelEnd + 1) : null;
  }
  if (value[following] === '[') {
    const referenceEnd = closingBracket(value, following);
    if (referenceEnd < 0) return null;
    const explicit = value.slice(following + 1, referenceEnd);
    const referenceLabel = explicit || label;
    if (!validReferenceLabel(referenceLabel)) return null;
    const definition = references.get(referenceName(referenceLabel));
    return definition ? result(definition, referenceEnd + 1) : null;
  }
  if (!validReferenceLabel(label)) return null;
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

function extendedWebAutolinkToken(
  value: string,
  start: number,
): (ReferenceDefinition & { readonly label: string; readonly end: number }) | null {
  const before = Array.from(value.slice(Math.max(0, start - 2), start)).at(-1);
  if (before && !UNICODE_WHITESPACE.test(before) && !'*_~('.includes(before)) return null;
  const match = /^(www\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*|https?:\/\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+)/u
    .exec(value.slice(start));
  if (!match) return null;
  if (value[start + match[0].length] === '\\') return null;
  const domain = match[0].startsWith('www.') ? match[0] : match[0].replace(/^https?:\/\//u, '');
  const segments = domain.split('.');
  if (segments.slice(-2).some((segment) => segment.includes('_'))) return null;

  let end = start + match[0].length;
  while (end < value.length && value[end] !== '<' && !UNICODE_WHITESPACE.test(value[end])) end += 1;
  while ('?!.,:*_~'.includes(value[end - 1] ?? '')) end -= 1;
  while (value[end - 1] === ')') {
    const candidate = value.slice(start, end);
    const opening = candidate.split('(').length - 1;
    const closing = candidate.split(')').length - 1;
    if (closing <= opening) break;
    end -= 1;
  }
  const entitySuffix = /&[A-Za-z0-9]+;$/u.exec(value.slice(start, end));
  if (entitySuffix) end -= entitySuffix[0].length;

  const label = decodeMarkdownText(value.slice(start, end));
  const href = match[0].startsWith('www.') ? `http://${label}` : label;
  return label && isSafeURL(href) ? { href, title: '', label, end } : null;
}

function extendedEmailAutolinkToken(
  value: string,
  start: number,
): (ReferenceDefinition & { readonly label: string; readonly end: number }) | null {
  if (/[A-Za-z0-9._+-]/u.test(value[start - 1] ?? '')) return null;
  const match = /^[A-Za-z0-9._+-]+@[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+/u.exec(value.slice(start));
  if (!match || !/[A-Za-z0-9]$/u.test(match[0])) return null;
  const end = start + match[0].length;
  if (value[end] === '+' || value[end] === '\\') return null;
  const label = decodeMarkdownText(match[0]);
  const href = `mailto:${label}`;
  return isSafeURL(href) ? { href, title: '', label, end } : null;
}

function inline(
  text: string, schema: Schema, references: References, inheritedMarks: readonly Mark[] = [],
  htmlTokens?: Map<Node, MarkdownHTMLInlineSegment>,
  autolinkLiterals = true,
  softBreaks?: Map<Node, { readonly softBreak?: true; readonly textRun: number }>,
): Node[] {
  const result: Node[] = [];
  let plain = '';
  const flush = () => {
    if (plain && softBreaks) {
      const textRun = softBreaks.size;
      plain.split('\n').forEach((part, index) => {
        if (index) {
          const node = schema.text(' ', inheritedMarks);
          softBreaks.set(node, { softBreak: true, textRun });
          result.push(node);
        }
        if (part) for (const node of textNodes(decodeMarkdownText(part), schema, inheritedMarks)) {
          softBreaks.set(node, { textRun });
          result.push(node);
        }
      });
      plain = '';
      return;
    }
    if (plain) result.push(...textNodes(
      // Only physical Markdown soft breaks collapse. Entity-decoded LF/CR
      // characters belong to the text and must survive unchanged.
      decodeMarkdownText(plain.replace(/\n/gu, ' ')),
      schema,
      inheritedMarks,
    ));
    plain = '';
  };
  for (let index = 0; index < text.length;) {
    const spaceBreak = /^ {2,}\n/u.exec(text.slice(index));
    if (spaceBreak && schema.nodes.hard_break) {
      flush();
      result.push(schema.node('hard_break', {}, [], undefined, inheritedMarks));
      index += spaceBreak[0].length;
      continue;
    }
    if (text.startsWith('\\\n', index) && schema.nodes.hard_break) {
      flush();
      result.push(schema.node('hard_break', {}, [], undefined, inheritedMarks));
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
      const htmlEnd = inlineHTMLTokenEnd(text, index);
      if (htmlEnd > index) {
        if (htmlTokens) {
          flush();
          const html = text.slice(index, htmlEnd);
          const token = schema.text(html, inheritedMarks);
          htmlTokens.set(token, Object.freeze({ kind: 'html', html, marks: token.marks }));
          result.push(token);
          index = htmlEnd;
          continue;
        }
        // Unknown HTML is currently readable literal text. Its attributes are
        // not Markdown: keep their backslashes/entities opaque to the flush.
        plain += text.slice(index, htmlEnd).replace(/[\\&]/gu, '\\$&');
        index = htmlEnd;
        continue;
      }
    }
    if (text.startsWith('[^', index) && schema.nodes.footnote_reference) {
      const token = /^\[\^([^\]\r\n]+)\]/.exec(text.slice(index));
      if (token) {
        try {
          const reference = schema.node('footnote_reference', { id: decodeMarkdownText(token[1]) }, [], undefined, inheritedMarks);
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
                alt: imageDescription(parsed.label, schema, references),
                title: parsed.title,
              }, [], undefined, inheritedMarks));
            } catch { result.push(...textNodes(text.slice(index, parsed.end), schema, inheritedMarks)); }
          } else if (!parsed.image && schema.marks.link) {
            const mark = schema.marks.link.create({ href: parsed.href, title: parsed.title });
            result.push(...inline(parsed.label, schema, references, [...inheritedMarks, mark], htmlTokens, autolinkLiterals, softBreaks));
          } else {
            result.push(...textNodes(text.slice(index, parsed.end), schema, inheritedMarks));
          }
          index = parsed.end;
          continue;
        }
      }
    }
    if (autolinkLiterals && schema.marks.link && !inheritedMarks.some((mark) => mark.type.name === 'link')) {
      const extended = extendedWebAutolinkToken(text, index) ?? extendedEmailAutolinkToken(text, index);
      if (extended) {
        flush();
        result.push(...textNodes(extended.label, schema, [
          ...inheritedMarks,
          schema.marks.link.create({ href: extended.href, title: '' }),
        ]));
        index = extended.end;
        continue;
      }
    }
    let handled = false;
    const marker = text[index] === '*' || text[index] === '_'
      ? text[index] as '*' | '_'
      : null;
    if (marker && (text[index - 1] !== marker || isEscapedMarkdownCharacter(text, index - 1))) {
      let openingEnd = index;
      while (text[openingEnd] === marker) openingEnd += 1;
      const openingLength = openingEnd - index;
      const primaryLength = emphasisDelimiterLength(openingLength);
      if (emphasisFlanking(text, index, openingLength, marker) & 1) {
        const attemptCount = openingLength > 1 ? 3 : 1;
        for (let attempt = 0; attempt < attemptCount; attempt++) {
          const delimiterLength = attempt === 0 ? primaryLength : primaryLength === 1 ? 2 : 1;
          const prefix = attempt === 2 ? openingLength - delimiterLength : 0;
          const type = schema.marks[delimiterLength === 2 ? 'strong' : 'em'];
          if (!type) continue;
          const match = matchingEmphasisRun(
            text,
            index,
            openingLength,
            delimiterLength,
            references,
            prefix === 0 ? openingLength - delimiterLength : 0,
          );
          const contentStart = prefix === 0 ? index + delimiterLength : openingEnd;
          if (!match || match.start <= contentStart) continue;
          if (attempt === 0 && openingLength === 3 && delimiterLength === 1
            && match.runEnd - match.runStart === 2 && match.start > match.runStart) continue;
          if (prefix > 0) plain += marker.repeat(prefix);
          flush();
          result.push(...inline(text.slice(contentStart, match.start), schema, references, [
            ...inheritedMarks,
            type.create(),
          ], htmlTokens, autolinkLiterals, softBreaks));
          index = match.end;
          handled = true;
          break;
        }
      }
    }
    if (handled) continue;

    const delimiters: readonly [string, readonly string[]][] = [
      ['~~', ['strike']],
      ['~', ['strike']],
      ['==', ['highlight']],
    ];
    for (const [delimiter, markNames] of delimiters) {
      if (!text.startsWith(delimiter, index)) continue;
      const exactRun = delimiter[0] === '~';
      if (exactRun && ((text[index - 1] === '~' && !isEscapedMarkdownCharacter(text, index - 1))
        || text[index + delimiter.length] === '~')) continue;
      const end = matchingDelimiter(text, index + delimiter.length, delimiter, exactRun, references);
      const types = markNames.map((markName) => schema.marks[markName]);
      if (end <= index + delimiter.length || types.some((type) => !type)) continue;
      flush();
      result.push(...inline(text.slice(index + delimiter.length, end), schema, references, [
        ...inheritedMarks,
        ...types.map((type) => type.create()),
      ], htmlTokens, autolinkLiterals, softBreaks));
      index = end + delimiter.length;
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
        try {
          result.push(schema.node(
            'inline_math',
            { latex: text.slice(index + 1, end), ariaLabel: '' },
            [],
            undefined,
            inheritedMarks,
          ));
        }
        catch { result.push(...textNodes(text.slice(index, end + 1), schema, inheritedMarks)); }
        index = end + 1;
        continue;
      }
    }
    plain += text[index];
    index++;
  }
  flush();
  return result.length ? result : [schema.text('', inheritedMarks)];
}

function imageDescription(value: string, schema: Schema, references: References): string {
  return inline(value, schema, references).map((node) => {
    if (node.isText) return node.textContent;
    if (node.type.name === 'inline_image') return String(node.attrs.alt ?? '');
    if (node.type.name === 'hard_break') return '\n';
    if (node.type.name === 'footnote_reference') return `[^${String(node.attrs.id ?? '')}]`;
    if (node.type.name === 'inline_math') return String(node.attrs.latex ?? '');
    if (node.type.name === 'emoji') return String(node.attrs.emoji ?? node.textContent);
    return node.textContent;
  }).join('');
}

function projectInline(text: string, schema: Schema, references: References, options: MarkdownImportOptions): Node[] {
  if (!options.parseHTMLInline) return inline(text, schema, references, [], undefined, options.autolinkLiterals);
  const tokens = new Map<Node, MarkdownHTMLInlineSegment>();
  const nodes = inline(text, schema, references, [], tokens, options.autolinkLiterals);
  if (!tokens.size) return nodes;
  const segments = Object.freeze(nodes.map(node => tokens.get(node) ?? Object.freeze({ kind: 'node' as const, node })));
  let issue: MarkdownHTMLInlineFallback;
  try {
    const projected = options.parseHTMLInline(segments, schema);
    if (projected !== null) {
      if (!Array.isArray(projected)) throw new TypeError('Inline HTML adapter must return an array of inline nodes.');
      for (const node of projected) {
        if (!(node instanceof Node) || !node.type.isInline || node.type.schema !== schema) {
          throw new TypeError('Inline HTML adapter must return inline nodes from the supplied schema.');
        }
        schema.validate(node);
      }
      return projected.length ? [...projected] : [schema.text('')];
    }
    issue = { source: text, reason: 'declined', message: 'Inline HTML adapter declined conversion; literal source retained.' };
  } catch (error) {
    issue = { source: text, reason: 'error', message: error instanceof Error ? error.message : 'Inline HTML adapter failed; literal source retained.' };
  }
  options.onHTMLInlineFallback?.(Object.freeze(issue));
  return inline(text, schema, references, [], undefined, options.autolinkLiterals);
}

function paragraph(schema: Schema, value: string, references: References, align = 'left', options: MarkdownImportOptions = {}): Node {
  return schema.node('paragraph', { align }, projectInline(value, schema, references, options));
}

export interface MarkdownHTMLParagraphContext {
  /** Direct paragraph of a tight list item; its HTML has no implicit p wrapper. */
  readonly tightList: boolean;
}

function paragraphBlocks(schema: Schema, value: string, references: References, options: MarkdownImportOptions, tightList = false): Node[] {
  if (!options.parseHTMLParagraph) return [paragraph(schema, value, references, 'left', options)];
  const tokens = new Map<Node, MarkdownHTMLInlineSegment>();
  const softBreaks = new Map<Node, { readonly softBreak?: true; readonly textRun: number }>();
  const nodes = inline(value, schema, references, [], tokens, options.autolinkLiterals, softBreaks);
  if (!tokens.size) return [schema.node('paragraph', { align: 'left' }, nodes)];
  const segments = Object.freeze(nodes.map(node => tokens.get(node) ?? Object.freeze({ kind: 'node' as const, node, ...softBreaks.get(node) })));
  let issue: MarkdownHTMLInlineFallback;
  try {
    const projected = options.parseHTMLParagraph(segments, schema, Object.freeze({ tightList }));
    if (projected !== null) {
      if (!Array.isArray(projected)) throw new TypeError('Paragraph HTML adapter must return a block array.');
      for (const node of projected) {
        if (!(node instanceof Node) || node.type.isInline || node.type === schema.topNodeType || node.type.schema !== schema) {
          throw new TypeError('Paragraph HTML adapter must return block nodes from the supplied schema.');
        }
        schema.validate(node);
      }
      if (projected.length && !matchesContentExpression(projected, schema.topNodeType.spec.content ?? '')) {
        throw new TypeError('Paragraph HTML adapter result does not match document content.');
      }
      return [...projected];
    }
    issue = { source: value, reason: 'declined', message: 'Paragraph HTML adapter declined conversion; literal source retained.' };
  } catch (error) {
    issue = { source: value, reason: 'error', message: error instanceof Error ? error.message : 'Paragraph HTML adapter failed; literal source retained.' };
  }
  options.onHTMLParagraphFallback?.(Object.freeze(issue));
  return [schema.node('paragraph', { align: 'left' }, inline(value, schema, references, [], undefined, options.autolinkLiterals))];
}

function tableCells(line: string): string[] {
  let source = line.trim();
  if (source.startsWith('|')) source = source.slice(1);
  if (source.endsWith('|') && source.at(-2) !== '\\') source = source.slice(0, -1);
  const cells: string[] = [];
  let cell = '';
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\\' && source[index + 1] === '|') {
      // GFM removes an escaped pipe at the table layer, including inside code
      // spans where the inline parser deliberately leaves escapes literal.
      // Other backslashes stay for inline parsing: even a run of two or more
      // before a pipe protects it, and only the final slash is removed here.
      cell += '|';
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
  const delimiter = value.trim();
  if (!/^:?-+:?$/.test(delimiter)) return null;
  if (delimiter.startsWith(':') && delimiter.endsWith(':')) return 'center';
  return delimiter.endsWith(':') ? 'right' : 'left';
}

function tableStart(lines: readonly string[], index: number): { headers: string[]; alignments: ('left' | 'center' | 'right')[] } | null {
  if (index + 1 >= lines.length || !/(^|[^\\])\|/u.test(lines[index])) return null;
  const headers = tableCells(lines[index]);
  const delimiters = tableCells(lines[index + 1]);
  if (headers.length !== delimiters.length) return null;
  const alignments = delimiters.map(tableAlignment);
  return alignments.every((align): align is 'left' | 'center' | 'right' => Boolean(align))
    ? { headers, alignments }
    : null;
}

interface ListMarker {
  readonly indent: number;
  readonly contentIndent: number;
  readonly kind: 'bullet' | 'ordered' | 'task';
  readonly m: '-' | '*' | '+' | '.' | ')';
  readonly value: string;
  readonly checked: boolean;
  readonly start: number;
}

function listMarker(line: string): ListMarker | null {
  const match = /^([ \t]*)(?:([-*+])|(\d{1,9})([.)]))(?:([ \t]+)(.*)|$)/.exec(line);
  if (!match) return null;
  const indent = indentationColumns(match[1]);
  const markerEnd = indent + (match[2] ? 1 : match[3].length + 1);
  const padding = indentationColumns(match[5] ?? '', markerEnd);
  const contentPadding = match[6] && padding <= 4 ? padding : 1;
  const contentIndent = markerEnd + contentPadding;
  const raw = (match[6] && padding > 4 ? ' '.repeat(padding - 1) : '') + (match[6] ?? '');
  // Task syntax is an inline prefix; it does not increase the container's
  // indentation requirement for subsequent paragraphs or nested lists.
  const task = match[2] ? /^\[([ xX])\](?:[ \t]+(.*)|$)/.exec(raw) : null;
  return {
    indent,
    contentIndent,
    kind: task ? 'task' : match[2] ? 'bullet' : 'ordered',
    m: (match[2] || match[4]) as ListMarker['m'],
    value: task ? task[2] ?? '' : raw,
    checked: task?.[1].toLowerCase() === 'x',
    start: +(match[3] || 1),
  };
}

function indentationColumns(value: string, start = 0): number {
  let column = start;
  for (const character of value) {
    if (character === ' ') column++;
    else if (character === '\t') column += 4 - column % 4;
    else break;
  }
  return column - start;
}

function stripIndentation(value: string, columns: number): string {
  let column = 0;
  let index = 0;
  while (column < columns && index < value.length) {
    if (value[index] === ' ') column++;
    else if (value[index] === '\t') column += 4 - column % 4;
    else break;
    index++;
  }
  return ' '.repeat(Math.max(0, column - columns)) + value.slice(index);
}

/** Shared item boundaries for rendering and definition discovery. */
function collectListItem(
  lines: readonly string[],
  startIndex: number,
  schema: Schema,
  references: References,
  options: MarkdownImportOptions = {},
): { lines: string[]; nextIndex: number } {
  const marker = listMarker(lines[startIndex]) as ListMarker;
  let index = startIndex;
  const itemLines = [marker.value];
  let paragraphOpen = false;
  let fence: MarkdownFence | null = null;
  let html: MarkdownHTMLBlock | null = null;
  let tex: string | null = null;
  const trackLine = (line: string) => {
    let value = line;
    if (tex) {
      if (texMathCloses(value, tex)) tex = null;
      paragraphOpen = false;
      return;
    }
    if (html) {
      if (html.closing ? html.closing.test(value) : !value.trim()) html = null;
      paragraphOpen = false;
      return;
    }
    if (fence) {
      if (closesMarkdownFence(value, fence)) fence = null;
      paragraphOpen = false;
      return;
    }
    // Track the paragraph at the innermost container so lazy continuation
    // remains possible through combinations of quotes and nested lists.
    for (;;) {
      const quote = BLOCKQUOTE.exec(value);
      const nested = listMarker(value);
      if (quote) value = value.slice(quote[0].length);
      else if (nested && nested.indent < 4) value = nested.value;
      else break;
      paragraphOpen = false;
    }
    if (schema.nodes.paragraph && markdownEmptyParagraph(value)) {
      paragraphOpen = false;
      return;
    }
    fence = markdownFence(value);
    if (!fence) {
      const opening = texStart(value, schema, options);
      if (opening) {
        tex = texMathCloses(value, opening) ? null : opening;
        paragraphOpen = false;
        return;
      }
    }
    const disclosure = schema.nodes.details && /^\s*<\/?(?:details|summary)(?=[\t >])/iu.test(value);
    html = !fence && !disclosure ? markdownHTMLBlock(value, paragraphOpen) : null;
    const opaque = Boolean(html);
    if (html?.closing?.test(value)) html = null;
    paragraphOpen = !fence && !opaque && Boolean(value.trim())
      && (paragraphOpen || indentedCodeLine(value) === null)
      && !startsBlock([value], 0, references, schema, options);
  };
  trackLine(marker.value);
  index++;
  while (index < lines.length) {
    if (!lines[index].trim()) {
      // An item with no content ends at the next blank line.
      if (itemLines.length === 1 && !marker.value) { index++; break; }
      itemLines.push('');
      trackLine('');
      index++;
      continue;
    }
    const leading = indentationColumns(lines[index]);
    if (leading >= marker.contentIndent) {
      const value = stripIndentation(lines[index], marker.contentIndent);
      itemLines.push(value);
      trackLine(value);
      index++;
      continue;
    }
    const next = listMarker(lines[index]);
    if (next && next.indent < 4) break;
    const lazyEquals = /^ {0,3}=+[\t ]*$/u.test(lines[index]);
    if (!paragraphOpen || (startsBlock(lines, index, references, schema, options) && !lazyEquals)) break;
    itemLines.push(lazyEquals ? lines[index].replace(/^( {0,3})(=)/u, '$1\\$2') : lines[index]);
    index++;
  }
  return { lines: itemLines, nextIndex: index };
}

function parseList(
  lines: readonly string[],
  startIndex: number,
  schema: Schema,
  references: References,
  options: MarkdownImportOptions,
): { node: Node; nextIndex: number; sourceEnd: number } {
  const first = listMarker(lines[startIndex]) as ListMarker;
  const listName = first.kind === 'bullet' ? 'bullet_list' : first.kind === 'ordered' ? 'ordered_list' : 'task_list';
  const itemName = first.kind === 'task' ? 'task_item' : 'list_item';
  const items: Node[] = [];
  const pending: { marker: ListMarker; layout: ListItemLayout; start: number; end: number }[] = [];
  let index = startIndex;
  let sourceEnd = startIndex;
  while (index < lines.length) {
    if (thematicBreak(lines[index])) break;
    const marker = listMarker(lines[index]);
    if (!marker || marker.indent >= 4 || marker.kind !== first.kind || marker.m !== first.m) break;
    const itemStart = index;
    const item = collectListItem(lines, index, schema, references, options);
    index = item.nextIndex;
    const layout: ListItemLayout | undefined = options.parseHTMLParagraph || options.parseHTMLFlow ? { spans: [] } : undefined;
    const content = parseBlocks(item.lines, schema, references, options, layout);
    let lastLine = item.lines.length - 1;
    while (lastLine > 0 && !item.lines[lastLine].trim()) lastLine--;
    sourceEnd = layout ? itemStart + Math.max(layout.spans.at(-1)?.end ?? 0, lastLine) : index - 1;
    if (layout) pending.push({ marker, layout, start: itemStart, end: sourceEnd });
    else {
      if (!content.length) content.push(paragraph(schema, '', references));
      items.push(schema.node(itemName, itemName === 'task_item' ? { checked: marker.checked } : {}, content));
    }
    while (index < lines.length && !lines[index].trim()) index++;
  }
  // Decide from sibling source boundaries, never from blank lines buried inside
  // a nested list, quote, fenced code or raw HTML block. Delay only this item's
  // paragraph/flow adapters until all siblings establish the list's tightness.
  const tight = !pending.some((item, itemIndex) => (
    (pending[itemIndex + 1]?.start ?? item.end + 1) > item.end + 1
    || item.layout.spans.some((span, blockIndex, spans) => blockIndex > 0 && span.start > spans[blockIndex - 1].end + 1)
  ));
  for (const { marker, layout } of pending) {
    const content = layout.finish!(tight);
    if (!content.length) content.push(paragraph(schema, '', references));
    items.push(schema.node(itemName, itemName === 'task_item' ? { checked: marker.checked } : {}, content));
  }
  return {
    node: schema.node(listName, listName === 'ordered_list' ? { start: first.start } : {}, items),
    nextIndex: index,
    sourceEnd,
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
  const tab = /^ {0,3}\t/u.exec(line);
  if (tab) return line.slice(tab[0].length);
  return line.startsWith('    ') ? line.slice(4) : null;
}

function thematicBreak(line: string): boolean {
  return /^ {0,3}([*_-])(?:[ \t]*\1){2,}[ \t]*$/u.test(line);
}

const BLOCKQUOTE = /^ {0,3}>[ \t]?/u;

function startsBlock(lines: readonly string[], index: number, references: References, schema: Schema, options: MarkdownImportOptions = {}): boolean {
  const line = lines[index] ?? '';
  const marker = listMarker(line);
  return !!(markdownFence(line)
    || texBlockAt(lines, index, schema, options)
    || markdownHTMLBlock(line, true)
    || /^\$\$/.test(line)
    || /^ {0,3}(#{1,6})(?:[\t ]+|$)/u.test(line)
    || /^ {0,3}(?:=+|-+)[\t ]*$/u.test(line)
    || thematicBreak(line)
    || BLOCKQUOTE.test(line)
    || (marker?.value && marker.indent < 4 && marker.start === 1)
    || tableStart(lines, index)
    || blockImage(line, references)
    || footnoteDefinitionAt(lines, index, schema)
    || (schema.nodes.details && schema.nodes.details_summary && detailsStart(line)));
}

function texStart(line: string, schema: Schema, options: MarkdownImportOptions): string | null {
  return (options.texMathEnvironments && schema.nodes.math_block ? texMathStart(line) : null)
    ?? (options.texTables ? texTableStart(line) : null);
}

function texBlockAt(lines: readonly string[], index: number, schema: Schema, options: MarkdownImportOptions) {
  const math = options.texMathEnvironments && schema.nodes.math_block ? texMathBlock(lines, index) : null;
  if (math) return { ...math, kind: 'math' as const };
  const table = options.texTables ? texTableBlock(lines, index) : null;
  return table ? { ...table, kind: 'table' as const } : null;
}

function projectHTMLBlock(html: string, schema: Schema, options: MarkdownImportOptions): readonly Node[] | null {
  if (!options.parseHTMLBlock) return null;
  let issue: MarkdownHTMLBlockFallback;
  try {
    const document = options.parseHTMLBlock(html, schema);
    if (document !== null) {
      if (Array.isArray(document)) {
        for (const node of document) {
          if (!(node instanceof Node) || node.type.isInline || node.type === schema.topNodeType) {
            throw new TypeError('HTML block adapter fragments must contain only schema block nodes.');
          }
          schema.validate(node);
        }
        if (document.length && !matchesContentExpression(document, schema.topNodeType.spec.content ?? '')) {
          throw new TypeError('HTML block adapter fragment does not match document content.');
        }
        return document;
      }
      if (!(document instanceof Node) || document.type !== schema.topNodeType) {
        throw new TypeError('HTML block adapter must return a document from the supplied schema.');
      }
      schema.validate(document);
      return document.content;
    }
    issue = { html, reason: 'declined', message: 'HTML block adapter declined conversion; literal source retained.' };
  } catch (error) {
    issue = { html, reason: 'error', message: error instanceof Error ? error.message : 'HTML block adapter failed; literal source retained.' };
  }
  // Do not swallow exceptions thrown by the host's reporting callback.
  options.onHTMLBlockFallback?.(Object.freeze(issue));
  return null;
}

interface ListItemLayout {
  spans: { start: number; end: number }[];
  finish?: (tight: boolean) => Node[];
}

type PendingHTMLParagraphSource = Omit<MarkdownHTMLFlowParagraphSource, 'segments'>;
type PendingHTMLTextBlockSource =
  | (PendingHTMLParagraphSource & { readonly kind: 'paragraph' })
  | (Omit<PendingHTMLParagraphSource, 'tightList'> & { readonly kind: 'heading'; readonly level: number })
  | (Omit<PendingHTMLParagraphSource, 'tightList'> & { readonly kind: 'code'; readonly language: string; readonly finalLineBreak: boolean });

function htmlFlowContext(sources: readonly PendingHTMLTextBlockSource[], schema: Schema, references: References, options: MarkdownImportOptions): MarkdownHTMLFlowContext {
  let cached: readonly MarkdownHTMLFlowParagraphSource[] | undefined;
  let textBlocks: readonly MarkdownHTMLFlowTextBlockSource[] | undefined;
  const snapshots = new Map<PendingHTMLTextBlockSource, MarkdownHTMLFlowTextBlockSource>();
  const autolinkLiterals = options.autolinkLiterals;
  const inspect = (source: PendingHTMLTextBlockSource): MarkdownHTMLFlowTextBlockSource => {
    const existing = snapshots.get(source);
    if (existing) return existing;
    const tokens = new Map<Node, MarkdownHTMLInlineSegment>();
    const characters = new Map<Node, { readonly softBreak?: true; readonly textRun: number }>();
    const nodes = source.kind === 'code' ? [schema.text(source.source)]
      : inline(source.source, schema, references, [], tokens, autolinkLiterals, characters);
    const segments = Object.freeze(nodes.map(node => tokens.get(node)
      ?? Object.freeze({ kind: 'node' as const, node, ...characters.get(node) })));
    const result = Object.freeze({ ...source, segments });
    snapshots.set(source, result);
    return result;
  };
  return Object.freeze({ readParagraphSources: () => {
    if (!cached) cached = Object.freeze(sources.filter(source => source.kind === 'paragraph').map(source => inspect(source) as MarkdownHTMLFlowParagraphSource));
    return cached;
  }, readTextBlockSources: () => textBlocks ??= Object.freeze(sources.map(inspect)) });
}

function parseBlocks(lines: readonly string[], schema: Schema, references: References, options: MarkdownImportOptions, layout?: ListItemLayout): Node[] {
  const blocks: Node[] = [];
  const htmlBlocks = new Map<Node, string>();
  const paragraphs = new Map<Node, string>();
  const sources: PendingHTMLTextBlockSource[] = [];
  const projectParagraph = (value: string, tightList = false): Node[] => {
    const projected = paragraphBlocks(schema, value, references, options, tightList);
    if (options.parseHTMLFlow) sources.push(Object.freeze({
      kind: 'paragraph', source: value, blocks: Object.freeze([...projected]), tightList,
    }));
    return projected;
  };
  const projectHeading = (value: string, level: number): Node => {
    const node = schema.node('heading', { level }, projectInline(value, schema, references, options));
    if (options.parseHTMLFlow) sources.push(Object.freeze({ kind: 'heading', source: value, level, blocks: Object.freeze([node]) }));
    return node;
  };
  const projectCode = (code: readonly string[], language: string): Node => {
    const value = code.join('\n');
    const node = schema.node('code_block', { language, lineNumbers: true }, [schema.text(value)]);
    if (options.parseHTMLFlow) sources.push(Object.freeze({ kind: 'code', source: value, language, finalLineBreak: code.length > 0, blocks: Object.freeze([node]) }));
    return node;
  };
  b: for (let index = 0; index < lines.length;) {
    const start = index;
    const previousLength = blocks.length;
    let sourceEnd: number | undefined;
    let syntaxBlock = false;
    try {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const emptyParagraph = markdownEmptyParagraph(line);
    if (emptyParagraph && schema.nodes.paragraph) {
      blocks.push(schema.node('paragraph', {}, emptyParagraph === 'text' ? [schema.text('')] : []));
      index++;
      continue;
    }
    const disclosure = detailsStart(line);
    if (disclosure && schema.nodes.details && schema.nodes.details_summary) {
      const closing = detailsEnd(lines, index);
      let summaryIndex = index + 1;
      while (summaryIndex < closing && !lines[summaryIndex].trim()) summaryIndex += 1;
      const summary = closing > summaryIndex
        ? /^\s*<summary>(.*)<\/summary>\s*$/i.exec(lines[summaryIndex])
        : null;
      if (summary) {
        const body = parseBlocks(lines.slice(summaryIndex + 1, closing), schema, references, options);
        const fallback = schema.nodes.paragraph?.create({}, [schema.text('')]);
        const summaryContent = projectInline(summary[1], schema, references, options);
        try {
          blocks.push(schema.node('details', { open: disclosure.open }, [
            schema.node('details_summary', {}, summaryContent),
            ...(body.length ? body : fallback ? [fallback] : []),
          ]));
          index = closing + 1;
          continue;
        } catch { /* Preserve malformed disclosure source as ordinary text. */ }
      }
    }
    const rawHTML = markdownHTMLBlock(line);
    if (rawHTML) {
      syntaxBlock = true;
      const end = markdownHTMLBlockEnd(lines, index, rawHTML);
      const html = lines.slice(index, end).join('\n');
      const projected = options.parseHTMLFlow ? null : projectHTMLBlock(html, schema, options);
      if (projected !== null) {
        blocks.push(...projected);
        index = end;
        continue;
      }
      const content: Node[] = [];
      lines.slice(index, end).forEach((raw, offset) => {
        if (offset && schema.nodes.hard_break) content.push(schema.node('hard_break'));
        if (raw || !schema.nodes.hard_break) content.push(schema.text(offset && !schema.nodes.hard_break ? `\n${raw}` : raw));
      });
      const literal = schema.node('paragraph', {}, content);
      blocks.push(literal);
      if (options.parseHTMLFlow) htmlBlocks.set(literal, html);
      index = end;
      continue;
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
      blocks.push(projectCode(code, fence.language || 'text'));
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
      sourceEnd = index - 1;
      while (sourceEnd > start && !lines[sourceEnd].trim()) sourceEnd--;
      blocks.push(projectCode(code, 'text'));
      continue;
    }
    // Definitions discovered globally remain in container source until this
    // block pass, so removing one cannot turn its list into an empty item.
    const tex = texBlockAt(lines, index, schema, options);
    if (tex) {
      if (tex.kind === 'table') {
        const projection = projectTeXTableSource(tex.source);
        let table: Node | null = null;
        try {
          if (projection) {
            table = schema.node('table', {}, projection.rows.map(row => schema.node('table_row', {}, row.map((cell, column) => (
              schema.node('table_cell', {}, [schema.node('paragraph', { align: projection.alignments[column] }, cell.map(segment => (
                segment.kind === 'math' ? schema.node('inline_math', { latex: segment.value, ariaLabel: '' }) : schema.text(segment.value)
              )))])
            )))));
            schema.validate(table);
          }
        } catch { table = null; }
        if (table && projection) {
          blocks.push(table);
          projection.layoutLosses.forEach(message => options.onTeXTableIssue?.({ source: tex.source, code: 'layout-projection', message }));
        } else {
          blocks.push(schema.node('paragraph', {}, [schema.text(tex.source)]));
          options.onTeXTableIssue?.({ source: tex.source, code: 'unsupported-syntax', message: 'Unsupported TeX table syntax or schema; retained complete literal source without interpreting cells.' });
        }
        index = tex.end;
        continue;
      }
      try {
        const node = schema.node('math_block', { latex: tex.source, ariaLabel: '' });
        schema.validate(node);
        blocks.push(node);
        index = tex.end;
        continue;
      } catch { /* A host's incompatible math schema retains normal Markdown interpretation. */ }
    }
    const footnote = footnoteDefinitionAt(lines, index, schema);
    if (footnote) { index = footnote.nextIndex; continue; }
    const definition = referenceDefinitionAt(lines, index);
    if (definition) { syntaxBlock = true; index += definition.lineCount; continue; }
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
      const value = (heading[2] ?? '')
        .replace(/(?:^|[\t ]+)#+[\t ]*$/u, '')
        .replace(/[\t ]+$/u, '');
      blocks.push(projectHeading(value, heading[1].length));
      index++;
      continue;
    }
    if (thematicBreak(line)) {
      blocks.push(schema.node('horizontal_rule'));
      index++;
      continue;
    }
    const image = blockImage(line, references);
    if (image && isSafeURL(image.href, { allowDataImage: true })) {
      blocks.push(schema.node('image_super', {
        src: image.href,
        alt: imageDescription(image.label, schema, references),
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
        schema.node(type, {}, [paragraph(schema, values[cellIndex] ?? '', references, table.alignments[cellIndex], options)])
      ));
      rows.push(schema.node('table_row', {}, cells(table.headers, 'table_header')));
      index += 2;
      // A short body row may omit pipes; a real new block ends the table.
      // A one-line probe excludes tableStart itself from the termination test.
      while (index < lines.length && lines[index].trim() && !startsBlock([lines[index]], 0, references, schema, options)
        && !texBlockAt(lines, index, schema, options)) {
        rows.push(schema.node('table_row', {}, cells(tableCells(lines[index]), 'table_cell')));
        index++;
      }
      blocks.push(schema.node('table', {}, rows));
      continue;
    }
    if (BLOCKQUOTE.test(line)) {
      const quote: string[] = [];
      let paragraphOpen = false;
      let fence: MarkdownFence | null = null;
      let html: MarkdownHTMLBlock | null = null;
      let tex: string | null = null;
      while (index < lines.length) {
        const marked = BLOCKQUOTE.exec(lines[index]);
        if (marked) {
          const content = lines[index].slice(marked[0].length);
          quote.push(content);
          let deepest = content;
          for (;;) {
            const quotePrefix = BLOCKQUOTE.exec(deepest);
            const listPrefix = listMarker(deepest);
            if (quotePrefix) deepest = deepest.slice(quotePrefix[0].length);
            else if (listPrefix && listPrefix.indent < 4) deepest = listPrefix.value;
            else break;
          }
          if (tex) {
            if (texMathCloses(deepest, tex)) tex = null;
            paragraphOpen = false;
          } else if (html) {
            if (html.closing ? html.closing.test(deepest) : !deepest.trim()) html = null;
            paragraphOpen = false;
          } else if (fence) {
            if (closesMarkdownFence(deepest, fence)) fence = null;
            paragraphOpen = false;
          } else if (schema.nodes.paragraph && markdownEmptyParagraph(deepest)) {
            paragraphOpen = false;
          } else {
            fence = markdownFence(deepest);
            if (!fence) {
              const opening = texStart(deepest, schema, options);
              if (opening) {
                tex = texMathCloses(deepest, opening) ? null : opening;
                paragraphOpen = false;
                index++;
                continue;
              }
            }
            const disclosure = schema.nodes.details && /^\s*<\/?(?:details|summary)(?=[\t >])/iu.test(deepest);
            html = !fence && !disclosure ? markdownHTMLBlock(deepest, paragraphOpen) : null;
            const opaque: boolean = Boolean(html);
            if (html?.closing?.test(deepest)) html = null;
            paragraphOpen = !fence && !opaque
              && Boolean(deepest.trim())
              && (paragraphOpen || indentedCodeLine(deepest) === null)
              && !startsBlock([deepest], 0, references, schema, options);
          }
          index++;
          continue;
        }
        // An unmarked `===` line cannot turn a lazily continued blockquote
        // paragraph into a Setext heading. Keep it as paragraph text. A `---`
        // line remains interrupting because it is independently a thematic
        // break (CommonMark examples 92-93).
        const lazyEqualsUnderline = /^ {0,3}=+[\t ]*$/u.test(lines[index]);
        if (!lines[index].trim()
          || !paragraphOpen
          || (startsBlock(lines, index, references, schema, options) && !lazyEqualsUnderline)) break;
        // Escape only the parser's internal copy so recursive block parsing
        // cannot reinterpret this literal continuation as an underline. Inline
        // escape decoding restores the exact visible equals sign.
        quote.push(lazyEqualsUnderline
          ? lines[index].replace(/^( {0,3})(=)/u, '$1\\$2')
          : lines[index]);
        index++;
      }
      const quoteBlocks = parseBlocks(quote, schema, references, options);
      blocks.push(schema.node('blockquote', {}, quoteBlocks.length ? quoteBlocks : [paragraph(schema, '', references)]));
      continue;
    }
    const marker = listMarker(line);
    if (marker && marker.indent < 4) {
      const parsed = parseList(lines, index, schema, references, options);
      blocks.push(parsed.node);
      index = parsed.nextIndex;
      sourceEnd = parsed.sourceEnd;
      continue;
    }
    const paragraphLines = [line];
    for (index++; index < lines.length && lines[index].trim(); index++) {
      const underline = /^ {0,3}(=+|-+)[\t ]*$/u.exec(lines[index]);
      if (underline && !marker && !/^ {0,3}>/u.test(line) && !detailsStart(line)) {
        blocks.push(projectHeading(paragraphLines.join('\n').trim(), underline[1][0] === '=' ? 1 : 2));
        index++;
        continue b;
      }
      if (startsBlock(lines, index, references, schema, options)) break;
      paragraphLines.push(lines[index]);
    }
    // Keep physical line endings visible to inline syntax validation. Ordinary
    // soft breaks become spaces only when text nodes are emitted; hard-break
    // markers are consumed by `inline` before that normalization.
    const value = paragraphLines.join('\n').replace(/^[\t ]+|[\t ]+$/gu, '');
    if (layout) {
      const placeholder = schema.node('paragraph');
      paragraphs.set(placeholder, value);
      blocks.push(placeholder);
    } else blocks.push(...projectParagraph(value));
    } finally {
      if (blocks.length > previousLength || syntaxBlock) layout?.spans.push({ start, end: sourceEnd ?? index - 1 });
    }
  }
  if (layout) {
    layout.finish = tight => finishHTMLBlocks(blocks.flatMap(node => paragraphs.has(node)
      ? projectParagraph(paragraphs.get(node)!, tight) : [node]), htmlBlocks, lines, schema, references, options, sources);
    return blocks;
  }
  return finishHTMLBlocks(blocks, htmlBlocks, lines, schema, references, options, sources);
}

function finishHTMLBlocks(blocks: Node[], htmlBlocks: Map<Node, string>, lines: readonly string[], schema: Schema, references: References, options: MarkdownImportOptions, sources: readonly PendingHTMLTextBlockSource[]): Node[] {
  if (!options.parseHTMLFlow || !htmlBlocks.size) return blocks;
  const segments: readonly MarkdownHTMLFlowSegment[] = Object.freeze(blocks.map(node => Object.freeze(
    htmlBlocks.has(node) ? { kind: 'html' as const, html: htmlBlocks.get(node)! } : { kind: 'node' as const, node },
  )));
  let issue: MarkdownHTMLFlowFallback;
  try {
    // Deferred list paragraphs are appended after headings/code are parsed.
    // Expose direct text-block sources in their actual current block order.
    const order = new Map(blocks.map((node, index) => [node, index]));
    const orderedSources = [...sources].sort((a, b) => (order.get(a.blocks[0]) ?? blocks.length) - (order.get(b.blocks[0]) ?? blocks.length));
    const projected = options.parseHTMLFlow(segments, schema, htmlFlowContext(orderedSources, schema, references, options));
    if (projected !== null) {
      if (!Array.isArray(projected)) throw new TypeError('HTML flow adapter must return a block array.');
      for (const node of projected) {
        if (!(node instanceof Node) || node.type.isInline || node.type === schema.topNodeType) {
          throw new TypeError('HTML flow adapter must return schema block nodes.');
        }
        schema.validate(node);
      }
      if (projected.length && !matchesContentExpression(projected, schema.topNodeType.spec.content ?? '')) {
        throw new TypeError('HTML flow adapter result does not match document content.');
      }
      return [...projected];
    }
    issue = { reason: 'declined', message: 'HTML flow adapter declined conversion; inert HTML blocks retained.' };
  } catch (error) {
    issue = { reason: 'error', message: error instanceof Error ? error.message : 'HTML flow adapter failed; inert HTML blocks retained.' };
  }
  options.onHTMLFlowFallback?.(Object.freeze(issue));
  // Inline adapters and nested containers may already have consumed HTML.
  // Returning their speculative nodes would make "inert fallback" lossy (for
  // example, an inline </pre> disappears before a surrounding table rejects
  // its flow). Reparse only this failed container without HTML adapters. Keep
  // other dialect options, and do not repeat conversion callbacks/reporters.
  return parseBlocks(lines, schema, references, {
    ...options,
    parseHTMLFlow: undefined, parseHTMLBlock: undefined, parseHTMLInline: undefined,
    parseHTMLParagraph: undefined, onHTMLParagraphFallback: undefined,
    onHTMLFlowFallback: undefined, onHTMLBlockFallback: undefined, onHTMLInlineFallback: undefined,
    onTeXTableIssue: undefined,
  });
}

function references(markdown: string, schema: Schema, options: MarkdownImportOptions): { lines: string[]; definitions: References } {
  const definitions = new Map<string, ReferenceDefinition>();
  const originalLines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const sourceLines = originalLines.map(line => line.replace(/^((?: {0,3}>| *(?:[-*+]|\d{1,9}[.)]))?)(\t+)/u, (_, marker, tabs) => (
    marker + ' '.repeat(tabs.length * 4 - marker.length % 4)
  )));
  const lines: string[] = [];
  let fence: MarkdownFence | null = null;
  let paragraphOpen = false;
  for (let index = 0; index < sourceLines.length;) {
    // Claim complete math before tab expansion or definition discovery can
    // mutate its opaque TeX. Containers recurse with their structural prefix removed.
    const tex = !fence ? texBlockAt(originalLines, index, schema, options) : null;
    if (tex) {
      lines.push(...originalLines.slice(index, tex.end));
      index = tex.end;
      paragraphOpen = false;
      continue;
    }
    const line = sourceLines[index];
    const quote = BLOCKQUOTE.exec(line);
    if (quote && !fence) {
      const prefixes: string[] = [];
      const contents: string[] = [];
      let cursor = index;
      for (; cursor < sourceLines.length; cursor++) {
        const nested = BLOCKQUOTE.exec(sourceLines[cursor]);
        if (!nested) break;
        prefixes.push(nested[0]);
        contents.push(sourceLines[cursor].slice(nested[0].length));
      }
      const extracted = references(contents.join('\n'), schema, options);
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
    const semanticDisclosure = schema.nodes.details && /^\s*<\/?(?:details|summary)(?=[\t >])/iu.test(line);
    if (schema.nodes.paragraph && markdownEmptyParagraph(line)) {
      lines.push(line);
      index++;
      paragraphOpen = false;
      continue;
    }
    const rawHTML = !semanticDisclosure && markdownHTMLBlock(line, paragraphOpen);
    if (rawHTML) {
      const end = markdownHTMLBlockEnd(sourceLines, index, rawHTML);
      lines.push(...sourceLines.slice(index, end));
      index = end;
      paragraphOpen = false;
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
    const marker = listMarker(line);
    if (marker && marker.indent < 4 && !thematicBreak(line)
      && (!paragraphOpen || startsBlock(sourceLines, index, definitions, schema, options))) {
      const item = collectListItem(sourceLines, index, schema, definitions, options);
      const extracted = references(item.lines.join('\n'), schema, options);
      extracted.definitions.forEach((definition, name) => {
        if (!definitions.has(name)) definitions.set(name, definition);
      });
      lines.push(...sourceLines.slice(index, item.nextIndex));
      index = item.nextIndex;
      paragraphOpen = false;
      continue;
    }
    const footnote = footnoteDefinitionAt(sourceLines, index, schema);
    if (footnote) {
      lines.push(...sourceLines.slice(index, footnote.nextIndex));
      index = footnote.nextIndex;
      paragraphOpen = false;
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

function footnoteDefinitionAt(lines: readonly string[], index: number, schema: Schema): {
  definition: MarkdownFootnoteDefinition; nextIndex: number;
} | null {
  if (!schema.nodes.footnote_reference || !schema.nodes.footnote_definition) return null;
  const opening = /^ {0,3}\[\^([^\]]+)\]:[ \t]*(.*)$/.exec(lines[index]);
  if (!opening) return null;
  const id = decodeMarkdownText(opening[1]);
  try { schema.nodes.footnote_definition.create({ id }, [paragraph(schema, '', new Map())]); }
  catch { return null; }
  const content = [opening[2]];
  let cursor = index + 1;
  while (cursor < lines.length) {
    const continuation = /^(?: {4}|\t)(.*)$/.exec(lines[cursor]);
    if (continuation) { content.push(continuation[1]); cursor++; continue; }
    if (!lines[cursor].trim() && /^(?: {4}|\t)/.test(lines[cursor + 1] ?? '')) {
      content.push(''); cursor++; continue;
    }
    break;
  }
  return { definition: Object.freeze({ id, lines: Object.freeze(content) }), nextIndex: cursor };
}

function extractFootnoteDefinitions(
  markdown: string,
  schema: Schema,
  options: MarkdownImportOptions,
): { markdown: string; definitions: readonly MarkdownFootnoteDefinition[] } {
  if (!schema.nodes.footnote_reference || !schema.nodes.footnote_definition) {
    return { markdown, definitions: [] };
  }
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const definitions: MarkdownFootnoteDefinition[] = [];
  let fence: MarkdownFence | null = null;
  let paragraphOpen = false;
  for (let index = 0; index < lines.length;) {
    if (fence) {
      if (closesMarkdownFence(lines[index], fence)) fence = null;
      paragraphOpen = false;
      index++;
      continue;
    }
    fence = markdownFence(lines[index]);
    if (fence) { paragraphOpen = false; index++; continue; }
    const semanticDisclosure = schema.nodes.details && /^\s*<\/?(?:details|summary)(?=[\t >])/iu.test(lines[index]);
    if (schema.nodes.paragraph && markdownEmptyParagraph(lines[index])) {
      index++;
      paragraphOpen = false;
      continue;
    }
    const rawHTML = !semanticDisclosure && markdownHTMLBlock(lines[index], paragraphOpen);
    if (rawHTML) {
      index = markdownHTMLBlockEnd(lines, index, rawHTML);
      paragraphOpen = false;
      continue;
    }
    const tex = texBlockAt(lines, index, schema, options);
    if (tex) { index = tex.end; paragraphOpen = false; continue; }
    const marker = listMarker(lines[index]);
    if (marker && marker.indent < 4 && !thematicBreak(lines[index])
      && (!paragraphOpen || startsBlock(lines, index, new Map(), schema, options))) {
      const item = collectListItem(lines, index, schema, new Map(), options);
      definitions.push(...extractFootnoteDefinitions(item.lines.join('\n'), schema, options).definitions);
      index = item.nextIndex;
      paragraphOpen = false;
      continue;
    }
    if (BLOCKQUOTE.test(lines[index])) {
      const contents: string[] = [];
      while (index < lines.length) {
        const quote = BLOCKQUOTE.exec(lines[index]);
        if (!quote) break;
        contents.push(lines[index++].slice(quote[0].length));
      }
      definitions.push(...extractFootnoteDefinitions(contents.join('\n'), schema, options).definitions);
      paragraphOpen = false;
      continue;
    }
    const footnote = footnoteDefinitionAt(lines, index, schema);
    if (footnote) {
      definitions.push(footnote.definition);
      index = footnote.nextIndex;
      paragraphOpen = false;
      continue;
    }
    paragraphOpen = Boolean(lines[index].trim())
      && (paragraphOpen || indentedCodeLine(lines[index]) === null)
      && !startsBlock(lines, index, new Map(), schema, options);
    index++;
  }
  // Keep container source intact; parseBlocks consumes definitions only after
  // its shared list/quote boundaries have been resolved.
  return { markdown, definitions: Object.freeze(definitions) };
}

export class MarkdownImporter {
  parse(markdown: string, schema: Schema, options: MarkdownImportOptions = {}): Node {
    const footnotes = extractFootnoteDefinitions(markdown, schema, options);
    // A terminal line ending terminates the last physical line; split() must
    // not turn it into extra code content when a fence is left open at EOF.
    const source = references(footnotes.markdown.replace(/\r\n$|[\r\n]$/u, ''), schema, options);
    const blocks = parseBlocks(source.lines, schema, source.definitions, options);
    const definitions = footnotes.definitions.map((definition) => {
      const content = parseBlocks(definition.lines, schema, source.definitions, options);
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
  parseWithSource(markdown: string, schema: Schema, options: MarkdownImportOptions = {}): MarkdownSourceImportResult {
    return MarkdownSourceSnapshot.parse(markdown, schema, options);
  }

  static parse(markdown: string, schema: Schema, options: MarkdownImportOptions = {}): Node { return new MarkdownImporter().parse(markdown, schema, options); }

  static parseWithSource(markdown: string, schema: Schema, options: MarkdownImportOptions = {}): MarkdownSourceImportResult {
    return new MarkdownImporter().parseWithSource(markdown, schema, options);
  }
}
