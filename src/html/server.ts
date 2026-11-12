import { readListLayout } from '../core/list-layout';
import { compile as compileSelector, selectAll } from 'css-select';
import { parse as parseDocument, parseFragment, type ParserError } from 'parse5';
import {
  adapter as htmlparser2Adapter,
  type Htmlparser2TreeAdapterMap,
} from 'parse5-htmlparser2-tree-adapter';

import {
  Mark,
  Node as FountainNode,
  type Attributes,
  type HTMLParseElement,
  type HTMLSourceTokens,
  type Schema,
} from '../core/schema';
import { textNodes, explicitHTMLEmphasis, mergeHTMLBlockMarks, mergeHTMLMarks, relativeHTMLContent, projectHTMLFormatting, projectHTMLLink, type HTMLLinkProjectionIssue } from '../core/importers/html-marks';
import { projectHTMLInlineAtom, projectHTMLMath } from '../core/importers/html-inline-atoms';
import { embedNode, fileNode, playbackNode, projectImage, projectMediaFigure } from '../core/importers/html-media';
import { importHTMLComment } from '../core/html-comment';
import { importHTMLAnonymousFlow, restoreHTMLFlowCaret } from '../core/html-flow';
import { readExplicitEmphasis, readExplicitQuoteAppearance } from '../core/explicit-emphasis';
import { readParagraphLayout } from '../core/paragraph-layout';
import { readTextAlignmentAttributes, readTextDirection, readContainerDirection, readSharedDirectionSource } from '../core/text-direction';
import { projectHTMLTable } from '../core/importers/html-table';
import { htmlOrderedListStart } from '../core/importers/html-list';
import { preformattedContent } from '../core/importers/html-preformatted';
import { importDefinitionList } from '../core/importers/html-definition-list';
import { readHTMLDocumentPageSettings } from '../core/importers/html-page-settings';
import type { DocumentPageSettings } from '../core/page-settings';
import type { MarkdownHTMLFlowBlockSource, MarkdownHTMLFlowContext, MarkdownHTMLFlowSegment, MarkdownHTMLFlowTextBlockSource, MarkdownHTMLInlineSegment, MarkdownHTMLParagraphContext } from '../core/importers/markdown-importer';
import { markdownHTMLTokenEnd } from '../core/markdown-html';
import { HTML_BLOCK_TAGS, createHTMLRuleNode, hasHTMLRule, matchingHTMLRules, projectHTMLRuby, readHTMLRuleAttributes, type HTMLImportRule as ParseRule } from '../core/importers/html-rules';

type RawNode = Htmlparser2TreeAdapterMap['node'];
type SelectorCache = Map<string, (node: RawNode) => boolean>;
type RawParent = Htmlparser2TreeAdapterMap['parentNode'];
type RawElement = Htmlparser2TreeAdapterMap['element'];

const TABLE_PROJECTION_MESSAGES = {
  'row-order': 'Table rows were placed in native header/body/footer order. Source row-group order and repeat-on-print behavior are not retained.',
  'zero-rowspan': 'Zero rowspan was resolved to the remaining source row-group rows. The imported span is explicit, not a live row-group rule.',
  'span-limit': 'Table spans above the supported 100-row/column limit were clamped; table geometry may differ.',
};

const DEFAULT_LIMITS = Object.freeze({
  maxInputBytes: 1_048_576,
  maxNodes: 50_000,
  maxDepth: 128,
  maxAttributesPerElement: 100,
  maxAttributeValueLength: 65_536,
  maxParseErrors: 25,
});
const HARD_LIMITS = Object.freeze({
  maxInputBytes: 8_388_608,
  maxNodes: 250_000,
  maxDepth: 256,
  maxAttributesPerElement: 256,
  maxAttributeValueLength: 1_048_576,
  maxParseErrors: 100,
});

export interface ServerHTMLImporterOptions {
  /** Expose bounded parser-input lexemes to schema rules. Off by default. */
  sourceTokens?: boolean;
  maxInputBytes?: number;
  maxNodes?: number;
  maxDepth?: number;
  maxAttributesPerElement?: number;
  maxAttributeValueLength?: number;
  maxParseErrors?: number;
}

export type ServerHTMLImportLimit = Exclude<keyof ServerHTMLImporterOptions, 'sourceTokens'>;

export type ServerHTMLImportIssueCode =
  | 'html-parse-error'
  | 'invalid-selector'
  | 'unsupported-dom-rule'
  | 'invalid-rule-result'
  | 'unmapped-block-wrapper'
  | 'unmapped-inline-element'
  | 'discarded-html-comment'
  | 'rejected-url'
  | 'normalized-link-url'
  | 'document-shell-omitted'
  | 'invalid-page-settings'
  | 'inline-html-projection'
  | 'preformatted-html-projection'
  | 'paragraph-flow-projection'
  | 'text-block-flow-projection'
  | 'formatted-whitespace-block'
  | 'block-html-projection';

export interface ServerHTMLImportIssue {
  readonly code: ServerHTMLImportIssueCode;
  readonly message: string;
  readonly selector?: string;
  readonly contribution?: string;
  readonly line?: number;
  readonly column?: number;
}

export interface ServerHTMLImportResult {
  readonly document: FountainNode;
  readonly issues: readonly ServerHTMLImportIssue[];
}

export interface ServerHTMLInlineImportResult {
  readonly nodes: readonly FountainNode[];
  readonly issues: readonly ServerHTMLImportIssue[];
}

/** Converted blocks without the caret paragraph required by an empty document. */
export interface ServerHTMLFragmentImportResult {
  readonly nodes: readonly FountainNode[];
  readonly issues: readonly ServerHTMLImportIssue[];
}

export class HTMLImportLimitError extends RangeError {
  readonly limit: ServerHTMLImportLimit;

  constructor(limit: ServerHTMLImportLimit, message: string) {
    super(message);
    this.name = 'HTMLImportLimitError';
    this.limit = limit;
  }
}

interface SourceText {
  readonly kind: 'text';
  readonly textContent: string;
}

interface SourceParent {
  readonly childNodes: readonly SourceNode[];
  readonly textContent: string;
}

interface SourceElement extends HTMLParseElement, SourceParent {
  readonly kind: 'element';
  readonly raw: RawElement;
  readonly tagName: string;
  readonly children: readonly SourceElement[];
  readonly parentElement: SourceElement | null;
  matches(selector: string): boolean;
  querySelector(selector: string): SourceElement | null;
  querySelectorAll(selector: string): readonly SourceElement[];
}

interface SourceInput {
  readonly text: string;
  readonly origin: HTMLSourceTokens['origin'];
}

interface SourceComment {
  readonly kind: 'comment';
  readonly raw: RawNode;
  readonly data: string;
  readonly textContent: '';
}

type SourceNode = SourceText | SourceComment | SourceElement;

interface ImportContext {
  /** Code-context text stays text; do not turn source emoji into document atoms. */
  readonly literalText?: boolean;
  /** Validated schema-owned literal sources, never live raw-text DOM nodes. */
  readonly literalRawText?: WeakMap<RawElement, FountainNode>;
  commentOrigins?: WeakMap<FountainNode, RawNode>;
  commentSources?: RawNode[];
  commentIssueOffset?: number;
  readonly issues: ServerHTMLImportIssue[];
  readonly issueKeys: Set<string>;
  readonly blockSlots?: {
    readonly attribute: string;
    readonly nodes: readonly FountainNode[];
    readonly offsets: ReadonlyMap<number, number>;
    readonly scopedMarks: WeakMap<RawElement, readonly Mark[]>;
    readonly origins: WeakMap<FountainNode, FountainNode>;
    readonly originals: ReadonlySet<FountainNode>;
  };
  readonly inlineSlots?: {
    readonly tag: string;
    readonly nodes: readonly FountainNode[];
    readonly sharedNodes: ReadonlySet<FountainNode>;
    readonly provenance: WeakMap<FountainNode, number>;
    readonly tokenMarks: ReadonlyMap<number, readonly Mark[]>;
    readonly softBreaks: ReadonlySet<number>;
    readonly adjacentText: ReadonlySet<number>;
    readonly sourceBreaks: ReadonlyMap<number, FountainNode>;
    readonly projectedBreaks: WeakSet<FountainNode>;
    readonly breakVisits: number[];
    readonly codeBlocks: ReadonlyMap<number, FountainNode>;
    readonly codeEndings: ReadonlyMap<number, FountainNode>;
    readonly blockAtoms: ReadonlyMap<number, { readonly tag: 'hr' | 'img' | 'table' | 'p'; readonly node: FountainNode }>;
    readonly atomNodes: ReadonlySet<FountainNode>;
    readonly atomVisits: number[];
  };
}

function mergeInlineMarks(local: readonly Mark[], surrounding: readonly Mark[]): readonly Mark[] {
  return [...surrounding.filter(mark => !local.some(own => own.type === mark.type)), ...local];
}

function boundedOption(
  name: ServerHTMLImportLimit,
  supplied: number | undefined,
): number {
  const value = supplied ?? DEFAULT_LIMITS[name];
  if (!Number.isSafeInteger(value) || value < 1 || value > HARD_LIMITS[name]) {
    throw new RangeError(`${name} must be an integer between 1 and ${HARD_LIMITS[name]}.`);
  }
  return value;
}

function normalizeOptions(options: ServerHTMLImporterOptions): Required<ServerHTMLImporterOptions> {
  if (options.sourceTokens !== undefined && typeof options.sourceTokens !== 'boolean') {
    throw new TypeError('sourceTokens must be a boolean.');
  }
  return {
    sourceTokens: options.sourceTokens ?? false,
    maxInputBytes: boundedOption('maxInputBytes', options.maxInputBytes),
    maxNodes: boundedOption('maxNodes', options.maxNodes),
    maxDepth: boundedOption('maxDepth', options.maxDepth),
    maxAttributesPerElement: boundedOption('maxAttributesPerElement', options.maxAttributesPerElement),
    maxAttributeValueLength: boundedOption('maxAttributeValueLength', options.maxAttributeValueLength),
    maxParseErrors: boundedOption('maxParseErrors', options.maxParseErrors),
  };
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function camelCaseDataName(name: string): string {
  return name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function splitStyleDeclarations(source: string): string[] {
  const declarations: string[] = [];
  let start = 0;
  let quote = '';
  let parentheses = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? '';
    if (quote) {
      if (character === quote && source[index - 1] !== '\\') quote = '';
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '(') { parentheses += 1; continue; }
    if (character === ')') { parentheses = Math.max(0, parentheses - 1); continue; }
    if (character === ';' && parentheses === 0) {
      declarations.push(source.slice(start, index));
      start = index + 1;
    }
  }
  declarations.push(source.slice(start));
  return declarations;
}

const STYLE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  'background-color': 'backgroundColor',
  color: 'color',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'letter-spacing': 'letterSpacing',
  'font-style': 'fontStyle',
  'font-weight': 'fontWeight',
  height: 'height',
  'line-height': 'lineHeight',
  'max-width': 'maxWidth',
  'text-align': 'textAlign',
  'table-layout': 'tableLayout',
  'text-decoration': 'textDecoration',
  'text-decoration-line': 'textDecorationLine',
  width: 'width',
});

function parseStyle(source: string): Readonly<Record<string, string>> {
  const style: Record<string, string> = Object.create(null) as Record<string, string>;
  splitStyleDeclarations(source).forEach((declaration) => {
    const separator = declaration.indexOf(':');
    if (separator < 1) return;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const name = STYLE_NAMES[property];
    if (!name) return;
    style[name] = declaration.slice(separator + 1).trim().replace(/\s*!important\s*$/i, '');
  });
  return Object.freeze(style);
}

function rawText(node: RawNode): string {
  if (htmlparser2Adapter.isTextNode(node)) return htmlparser2Adapter.getTextNodeContent(node);
  if (!htmlparser2Adapter.isElementNode(node) && !('children' in node)) return '';
  return htmlparser2Adapter.getChildNodes(node as RawParent).map((child) => rawText(child)).join('');
}

function wrapNode(node: RawNode, source: SourceInput | undefined, selectors: SelectorCache): SourceNode | null {
  if (htmlparser2Adapter.isCommentNode(node)) {
    return Object.freeze({ kind: 'comment', raw: node, data: htmlparser2Adapter.getCommentNodeContent(node), textContent: '' });
  }
  if (htmlparser2Adapter.isTextNode(node)) {
    return Object.freeze({ kind: 'text', textContent: htmlparser2Adapter.getTextNodeContent(node) });
  }
  return htmlparser2Adapter.isElementNode(node) ? new ServerElement(node, source, selectors) : null;
}

function reportCommentLoss(nodes: readonly FountainNode[], context: ImportContext): void {
  if (!context.commentSources?.length) return;
  const issueStart = context.issues.length;
  const retained = new Set<RawNode>();
  const inspect = (node: FountainNode): void => {
    const original = context.commentOrigins?.get(node);
    if (original) retained.add(original);
    node.content.forEach(inspect);
  };
  nodes.forEach(inspect);
  for (const node of context.commentSources) {
    if (!retained.has(node)) {
      const location = htmlparser2Adapter.getNodeSourceCodeLocation(node);
      reportOnce(context, { code: 'discarded-html-comment',
        message: 'An HTML comment was omitted: the schema, comment data, or containing projection cannot retain it. Original source must be retained separately.',
        ...(location ? { line: location.startLine, column: location.startCol } : {}),
      });
    }
  }
  // Decide retention after projection, but preserve the existing diagnostic
  // phase/order: tree losses precede node/rule and projection diagnostics.
  const comments = context.issues.splice(issueStart);
  context.issues.splice(context.commentIssueOffset ?? 0, 0, ...comments);
}

function wrapChildren(parent: RawParent, source: SourceInput | undefined, selectors: SelectorCache): SourceNode[] {
  return htmlparser2Adapter.getChildNodes(parent).flatMap((node) => {
    const wrapped = wrapNode(node, source, selectors);
    return wrapped ? [wrapped] : [];
  });
}

class ServerElement implements SourceElement {
  readonly #source?: SourceInput;
  readonly #selectors: SelectorCache;
  readonly kind = 'element' as const;
  readonly raw: RawElement;
  readonly tagName: string;
  readonly style: Readonly<Record<string, string>>;
  readonly dataset: Readonly<Record<string, string | undefined>>;

  constructor(raw: RawElement, source: SourceInput | undefined, selectors: SelectorCache) {
    this.#source = source;
    this.#selectors = selectors;
    this.raw = raw;
    this.tagName = htmlparser2Adapter.getTagName(raw).toLowerCase();
    this.style = parseStyle(this.getAttribute('style') ?? '');
    const dataset: Record<string, string> = Object.create(null) as Record<string, string>;
    htmlparser2Adapter.getAttrList(raw).forEach(({ name, value }) => {
      if (name.startsWith('data-')) dataset[camelCaseDataName(name.slice(5))] = value;
    });
    this.dataset = Object.freeze(dataset);
  }

  get childNodes(): readonly SourceNode[] { return wrapChildren(this.raw, this.#source, this.#selectors); }
  get children(): readonly SourceElement[] {
    return this.childNodes.filter((node): node is SourceElement => node.kind === 'element');
  }
  get textContent(): string { return rawText(this.raw); }

  getAttribute(name: string): string | null {
    // The adapter's attributes getter allocates a full object array. Read the
    // same own record in the same order, including foreign adjusted names,
    // without allocating it again for every readonly inspection. No cache:
    // the parser tree remains the sole source of attribute values.
    const wanted = name.toLowerCase();
    for (const attribute in this.raw.attribs) {
      if (Object.hasOwn(this.raw.attribs, attribute) && attribute.toLowerCase() === wanted) {
        return this.raw.attribs[attribute] ?? null;
      }
    }
    return null;
  }

  hasAttribute(name: string): boolean { return this.getAttribute(name) !== null; }
  getAttributeNames(): readonly string[] { return Object.freeze(Object.keys(this.raw.attribs)); }

  getSourceTokens(): HTMLSourceTokens | null {
    if (!this.#source) return null;
    const location = htmlparser2Adapter.getNodeSourceCodeLocation(this.raw);
    if (!location?.startTag) return null;
    return Object.freeze({
      startTag: this.#source.text.slice(location.startTag.startOffset, location.startTag.endOffset),
      endTag: location.endTag ? this.#source.text.slice(location.endTag.startOffset, location.endTag.endOffset) : null,
      origin: this.#source.origin,
    });
  }

  get parentElement(): SourceElement | null {
    const parent = this.raw.parent;
    return parent && htmlparser2Adapter.isElementNode(parent) ? new ServerElement(parent, this.#source, this.#selectors) : null;
  }

  matches(selector: string): boolean {
    let query = this.#selectors.get(selector);
    if (!query) {
      // Relative :has selectors retain scope state even without result caching.
      // Own this bounded cache only within one parsed tree, never on the importer
      // or schema; descendant/query/parent wrappers share that tree's cache.
      query = compileSelector<RawNode, RawElement>(selector, { cacheResults: false });
      if (this.#selectors.size >= 256) this.#selectors.clear();
      this.#selectors.set(selector, query);
    }
    return query(this.raw);
  }

  querySelector(selector: string): SourceElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): readonly SourceElement[] {
    return selectAll<RawNode, RawElement>(selector, this.raw.children, { context: this.raw })
      .map((element) => new ServerElement(element, this.#source, this.#selectors));
  }
}

function rootSource(parent: RawParent, source?: SourceInput): SourceParent {
  const childNodes = wrapChildren(parent, source, new Map());
  return Object.freeze({
    childNodes,
    textContent: rawText(parent as RawNode),
  });
}

function validateTree(parent: RawParent, limits: Required<ServerHTMLImporterOptions>, context: ImportContext): void {
  context.commentOrigins ??= new WeakMap();
  context.commentSources ??= [];
  context.commentIssueOffset = context.issues.length;
  const stack: Array<{ node: RawNode; depth: number }> = htmlparser2Adapter.getChildNodes(parent)
    .map((node) => ({ node, depth: 1 }));
  let count = 0;
  while (stack.length) {
    const current = stack.pop();
    if (!current) break;
    count += 1;
    if (count > limits.maxNodes) {
      throw new HTMLImportLimitError('maxNodes', `HTML contains more than ${limits.maxNodes} nodes.`);
    }
    if (current.depth > limits.maxDepth) {
      throw new HTMLImportLimitError('maxDepth', `HTML nesting exceeds ${limits.maxDepth} levels.`);
    }
    if (htmlparser2Adapter.isCommentNode(current.node)) context.commentSources.push(current.node);
    if (!htmlparser2Adapter.isElementNode(current.node)) continue;
    const attributes = htmlparser2Adapter.getAttrList(current.node);
    if (attributes.length > limits.maxAttributesPerElement) {
      throw new HTMLImportLimitError(
        'maxAttributesPerElement',
        `HTML element <${htmlparser2Adapter.getTagName(current.node)}> has more than ${limits.maxAttributesPerElement} attributes.`,
      );
    }
    if (attributes.some(({ value }) => value.length > limits.maxAttributeValueLength)) {
      throw new HTMLImportLimitError(
        'maxAttributeValueLength',
        `HTML attribute value exceeds ${limits.maxAttributeValueLength} characters.`,
      );
    }
    htmlparser2Adapter.getChildNodes(current.node).forEach((node) => {
      stack.push({ node, depth: current.depth + 1 });
    });
  }
}

function reportOnce(context: ImportContext, issue: ServerHTMLImportIssue): void {
  const key = `${issue.code}:${issue.contribution ?? ''}:${issue.selector ?? ''}:${issue.message}`;
  if (context.issueKeys.has(key)) return;
  context.issueKeys.add(key);
  context.issues.push(Object.freeze(issue));
}

/** Direction on a paragraph is not the direction of its enclosing structure.
 * Keep this loss visible until the receiving container retains that context. */
function reportStructuralDirection(element: SourceElement, node: FountainNode, context: ImportContext, schema: Schema): FountainNode {
  const dir = readTextDirection(element, schema).dir;
  if (dir !== undefined && node.attrs.dir !== dir) reportOnce(context, {
    code: 'block-html-projection',
    message: `${element.tagName} reading direction (${dir}) is not retained on the structural container. Descendant text blocks may retain supported direction, but container layout and a shared automatic context are not preserved.`,
  });
  const shared = readSharedDirectionSource(element);
  if (shared && (!node.type.spec.attrs?.directionGroup || node.attrs.directionGroup !== shared.directionGroup)) reportOnce(context, {
    code: 'block-html-projection',
    message: `${element.tagName} shared automatic direction ownership is not supported by the receiving structural schema. The original grouping is not preserved.`,
  });
  return node;
}

function reportRuleFailure(context: ImportContext, rule: ParseRule, contribution: string, reason: string): void {
  reportOnce(context, {
    code: 'invalid-rule-result',
    message: `Skipped HTML rule for ${contribution}: ${reason}.`,
    selector: rule.tag,
    contribution,
  });
}

function matchingRule(
  element: SourceElement,
  rule: ParseRule,
  contribution: string,
  context: ImportContext,
): boolean {
  try { return Boolean(rule.tag) && element.matches(rule.tag); }
  catch {
    reportOnce(context, {
      code: 'invalid-selector',
      message: `Ignored invalid HTML selector ${JSON.stringify(rule.tag)}.`,
      selector: rule.tag,
      contribution,
    });
    return false;
  }
}

function attrsFromRule(
  element: SourceElement,
  rule: ParseRule,
  portable: boolean,
  contribution: string,
  context: ImportContext,
): Attributes | false {
  if (!portable && rule.getAttrs) {
    reportOnce(context, {
      code: 'unsupported-dom-rule',
      message: `Skipped browser-only attribute reader for ${contribution}; provide parseHTML to make it server-portable.`,
      selector: rule.tag,
      contribution,
    });
    return false;
  }
  return portable ? readHTMLRuleAttributes(element, rule, reason => reportRuleFailure(context, rule, contribution, reason)) : {};
}

function ruleContentElement(
  element: SourceElement,
  rule: ParseRule,
  contribution: string,
  context: ImportContext,
): SourceElement | null {
  if (!rule.contentElement) return element;
  try {
    const content = element.querySelector(rule.contentElement);
    if (!content) reportRuleFailure(context, rule, contribution, 'content selector matched no element');
    return content;
  }
  catch {
    reportOnce(context, {
      code: 'invalid-selector',
      message: `Ignored invalid content selector ${JSON.stringify(rule.contentElement)}.`,
      selector: rule.contentElement,
      contribution,
    });
    return null;
  }
}

function configuredMarks(element: SourceElement, schema: Schema, context: ImportContext): Mark[] {
  const matches = matchingHTMLRules(schema.marks, (rule, type) => matchingRule(element, rule, `mark:${type.name}`, context));
  const result: Mark[] = [];
  matches.forEach(({ type, rule, portable }) => {
    if (result.some((mark) => mark.type === type)) return;
    const attrs = attrsFromRule(element, rule, portable, `mark:${type.name}`, context);
    if (attrs === false) return;
    try { result.push(type.create(attrs)); }
    catch { reportRuleFailure(context, rule, `mark:${type.name}`, 'attributes did not satisfy the mark schema'); }
  });
  return result;
}

function configuredNode(
  element: SourceElement,
  schema: Schema,
  inline: boolean,
  inheritedMarks: readonly Mark[],
  context: ImportContext,
): FountainNode | null {
  const retained = inline ? context.literalRawText?.get(element.raw) : undefined;
  if (retained) return inheritedMarks.length ? retained.withMarks(inheritedMarks) : retained;
  const matches = matchingHTMLRules(schema.nodes, (rule, type) => matchingRule(element, rule, `node:${type.name}`, context),
    type => type.name !== 'doc' && type.name !== 'text' && type.isInline === inline);

  for (const { type, rule, portable } of matches) {
    const contribution = `node:${type.name}`;
    const attrs = attrsFromRule(element, rule, portable, contribution, context);
    if (attrs === false) continue;
    const contentRoot = ruleContentElement(element, rule, contribution, context);
    if (!contentRoot) continue;
    const expression = type.spec.content;
    const candidates: Array<(branch: ImportContext) => FountainNode[]> = type.spec.atom || !expression
      ? [() => []]
      : type.spec.code && expression === 'text*'
      ? [branch => inlineChildren(contentRoot, schema, inheritedMarks, { ...branch, literalText: true })]
      : [
          branch => inlineChildren(contentRoot, schema, inheritedMarks, branch),
          branch => blockChildren(contentRoot, schema, branch),
        ];
    // Empty inline projection also satisfies block*. Try actual blocks first
    // so atom-only or empty-paragraph sections do not silently lose children.
    if (/^block[+*?]$/.test(expression ?? '')) candidates.reverse();
    for (const candidate of candidates) {
      // Only report losses from the projection actually accepted by the schema.
      // A speculative inline interpretation of block content is not data loss.
      // Nested projections share source/comment identity and literal-source
      // policy. Only speculative diagnostics and visit lists are isolated.
      const branch: ImportContext = { ...context, issues: [], issueKeys: new Set(),
        // A rejected content shape may traverse generated hard breaks. Commit
        // its visit evidence only if this projection is actually accepted.
        inlineSlots: context.inlineSlots ? { ...context.inlineSlots, breakVisits: [], atomVisits: [] } : undefined,
        blockSlots: context.blockSlots,
      };
      const absolute = restoreHTMLFlowCaret(type.name, contentRoot, candidate(branch), schema);
      const content = relativeHTMLContent(absolute, inheritedMarks);
      content.forEach((node, index) => {
        const before = absolute[index];
        if (node === before) return;
        const origin = branch.blockSlots?.originals.has(before) ? before : branch.blockSlots?.origins.get(before);
        if (origin) branch.blockSlots?.origins.set(node, origin);
        const provenance = branch.inlineSlots?.provenance.get(before);
        if (provenance !== undefined) branch.inlineSlots?.provenance.set(node, provenance);
        const comment = branch.commentOrigins?.get(before);
        if (comment) branch.commentOrigins?.set(node, comment);
      });
      const node = createHTMLRuleNode(type, attrs, content, inheritedMarks, schema);
      if (!node) continue;
      branch.inlineSlots?.breakVisits.forEach(offset => context.inlineSlots!.breakVisits.push(offset));
      branch.inlineSlots?.atomVisits.forEach(offset => context.inlineSlots!.atomVisits.push(offset));
      branch.issues.forEach(issue => reportOnce(context, issue));
      return node;
    }
    reportRuleFailure(context, rule, contribution, 'no content and attribute projection satisfied the node schema');
  }
  return null;
}

function directChild(element: SourceElement, tagName: string): SourceElement | null {
  return element.children.find((child) => child.tagName === tagName) ?? null;
}

function configuredRuby(
  element: SourceElement,
  schema: Schema,
  inheritedMarks: readonly Mark[],
  context: ImportContext,
): FountainNode[] | null {
  const type = schema.nodes.ruby;
  if (!type || element.tagName !== 'ruby') return null;
  const annotation = directChild(element, 'rt')?.textContent.trim() ?? '';
  const explicitBase = directChild(element, 'rb');
  const baseRoot: SourceParent = explicitBase ?? {
    childNodes: element.childNodes.filter((child) => child.kind !== 'element' || !['rt', 'rp'].includes(child.tagName)),
    textContent: '',
  };
  return projectHTMLRuby(type, annotation, inlineChildren(baseRoot, schema, inheritedMarks, context), inheritedMarks, schema);
}

const HTML_LINK_ISSUES = {
  'html-carrier': { code: 'invalid-rule-result', contribution: 'mark:link',
    message: 'An invalid or mismatched HTML link source carrier was ignored; the visible destination remains authoritative.' },
  'native-carrier': { code: 'invalid-rule-result', contribution: 'mark:link',
    message: 'An invalid or mismatched native link source carrier was ignored; the visible destination remains authoritative.' },
  normalized: { code: 'normalized-link-url',
    message: 'Link destination data was normalized without HTML-source navigation support in the declared schema; original browser behavior is not retained. Inspect the destination before following it.' },
  'normalized-with-source': { code: 'normalized-link-url',
    message: 'Link control data is stored percent-encoded with a bound HTML-source spelling that preserves browser navigation. Inspect the stored and rendered destinations before following it.' },
  'invalid-normalized': { code: 'invalid-rule-result', contribution: 'mark:link',
    message: 'A normalized link destination did not satisfy the declared link schema; readable content was retained unlinked.' },
  rejected: { code: 'rejected-url', message: 'Unsafe link URLs were omitted; readable link text was retained.' },
} satisfies Record<HTMLLinkProjectionIssue, ServerHTMLImportIssue>;

function elementMarks(child: SourceElement, schema: Schema, marks: readonly Mark[], context: ImportContext, reportUnknown: boolean): Mark[] {
  const tag = child.tagName;
  const { marks: local, hasConfiguredMarks, nativeMark } = projectHTMLFormatting(child, tag, schema,
    () => configuredMarks(child, schema, context));
  if (reportUnknown && !hasConfiguredMarks && tag !== 'span' && tag !== 'a' && !(nativeMark && schema.marks[nativeMark])) reportOnce(context, {
    code: 'unmapped-inline-element',
    message: 'Unmapped inline HTML elements were removed. Readable descendant content was retained, but their identity, attributes, and behavior were not preserved.',
  });
  // The built-in link mark owns navigation. Registered projections may also
  // own named anchors and bookmarks.
  if (tag === 'a') {
    if (reportUnknown && !hasConfiguredMarks
      && (!child.hasAttribute('href') || !schema.marks.link || child.hasAttribute('id') || child.hasAttribute('name'))) reportOnce(context, {
      code: 'unmapped-inline-element', contribution: 'element:a',
      message: 'An HTML anchor wrapper, bookmark identity or unsupported navigation was omitted. Readable descendants and supported link formatting remain; named-anchor references are not preserved by the built-in link mark.',
    });
    projectHTMLLink(child, schema, local, issue => reportOnce(context, { ...HTML_LINK_ISSUES[issue] }));
  }
  return mergeHTMLMarks(local, marks, tag);
}

function inlineChildren(
  parent: SourceParent,
  schema: Schema,
  marks: readonly Mark[] = [],
  context: ImportContext,
): FountainNode[] {
  const result: FountainNode[] = [];
  parent.childNodes.forEach((child) => {
    if (child.kind === 'comment') {
      const comment = importHTMLComment(child.data, schema, marks);
      if (comment) {
        context.commentOrigins!.set(comment, child.raw);
        result.push(comment);
      }
      return;
    }
    if (child.kind === 'text') {
      if (child.textContent) result.push(...(context.literalText ? [schema.text(child.textContent, marks)] : textNodes(child.textContent, schema, marks)));
      return;
    }
    const tag = child.tagName;
    const slots = context.inlineSlots;
    if (slots && tag === slots.tag) {
      const index = Number(child.getAttribute('data-index'));
      const original = slots.nodes[index];
      if (!original || !Number.isSafeInteger(index) || child.childNodes.length) {
        throw new Error('Inline HTML changed a protected Markdown node slot.');
      }
      const combined = mergeInlineMarks(original.marks, marks);
      const node = !slots.sharedNodes.has(original) && combined.length === original.marks.length && combined.every((mark, offset) => mark.eq(original.marks[offset]))
        ? original : original.withMarks(combined);
      slots.provenance.set(node, index);
      result.push(node);
      return;
    }
    const offset = slots ? htmlparser2Adapter.getNodeSourceCodeLocation(child.raw)?.startOffset : undefined;
    if (offset !== undefined && slots?.blockAtoms.has(offset)) {
      throw new Error('HTML recovery cannot flatten a protected Markdown block atom into inline content; literal source retained.');
    }
    const localMarks = offset === undefined ? [] : slots?.tokenMarks.get(offset) ?? [];
    const atomMarks = localMarks.length ? mergeInlineMarks(localMarks, marks) : marks;
    const sourceBreak = offset === undefined ? undefined : slots?.sourceBreaks.get(offset);
    if (sourceBreak && tag === 'br') {
      slots!.breakVisits.push(offset!);
      const node = sourceBreak.withMarks(mergeInlineMarks(sourceBreak.marks, marks));
      slots!.projectedBreaks.add(node);
      result.push(node);
      return;
    }
    const ruby = configuredRuby(child, schema, marks, context);
    if (ruby) { result.push(...ruby.map(node => localMarks.length ? node.withMarks(mergeInlineMarks(localMarks, node.marks)) : node)); return; }
    const customNode = configuredNode(child, schema, true, marks, context);
    if (customNode) { result.push(localMarks.length ? customNode.withMarks(mergeInlineMarks(localMarks, customNode.marks)) : customNode); return; }
    if (tag === 'br' && schema.nodes.hard_break) {
      result.push(schema.node('hard_break', {}, [], undefined, atomMarks));
      return;
    }
    if (tag === 'img' && schema.nodes.inline_image) {
      const image = imageNode(child, schema, 'inline_image', context, undefined, atomMarks);
      if (image) result.push(image);
      return;
    }
    const atom = projectHTMLInlineAtom(child, schema, atomMarks, marks);
    if (atom) { result.push(...atom); return; }
    const nextMarks = elementMarks(child, schema, marks, context, true);
    result.push(...inlineChildren(child, schema, nextMarks, context));
  });
  if (!result.length && marks.length) result.push(schema.text('', marks));
  return result;
}

function imageNode(
  image: SourceElement,
  schema: Schema,
  type: 'image_super' | 'inline_image',
  context: ImportContext,
  container?: SourceElement,
  marks: readonly Mark[] = [],
): FountainNode | null {
  return projectImage(image, schema, type, caption => inlineChildren(caption, schema, [], context), container, marks, () => {
    reportOnce(context, {
      code: 'rejected-url',
      message: 'Images with missing or unsafe source URLs were omitted.',
    });
  });
}

function alignment(element: SourceElement, direction: Readonly<Attributes>): Attributes {
  return readTextAlignmentAttributes(element, element.style.textAlign, direction);
}

function paragraph(element: SourceElement, schema: Schema, context: ImportContext, childContext = false): FountainNode {
  const content = inlineChildren(element, schema, [], context);
  // Match the browser importer: a marker never takes precedence over source
  // children, including comments, whitespace or unsupported descendant tags.
  const childless = element.getAttribute('data-fountain-empty') === 'block' && element.childNodes.length === 0;
  const dir = readTextDirection(element, schema, childContext);
  return schema.node('paragraph', { ...alignment(element, dir), ...dir, ...readExplicitEmphasis(element), ...readParagraphLayout(element) }, content.length ? content : childless ? [] : [schema.text('')]);
}

function preformattedChildren(element: SourceElement, schema: Schema, context: ImportContext): FountainNode[] {
  return preformattedContent<SourceNode>(element, schema, {
    kind: node => node.kind === 'comment' ? 'ignore' : node.kind,
    children: node => node.kind === 'element' ? node.childNodes : [],
    tag: node => node.kind === 'element' ? node.tagName : '',
    text: node => node.textContent,
    marks: (node, marks) => node.kind === 'element' && htmlparser2Adapter.getNamespaceURI(node.raw) === 'http://www.w3.org/1999/xhtml'
      ? elementMarks(node, schema, marks, context, true) : marks,
  });
}

function hasProjectedPreformattedMarkup(element: SourceElement): boolean {
  const accepted = ['data-language', 'data-line-numbers', 'data-fountain-code-theme', 'dir', 'data-fountain-paragraph-layout',
    'data-fountain-direction-group', 'data-fountain-direction-origin'];
  if (element.getAttributeNames?.().some(name => !accepted.includes(name))) return true;
  return element.childNodes.some(child => child.kind !== 'text' && !(child.kind === 'element' && child.tagName === 'code'
    && child.getAttributeNames?.().every(name => name === 'class')
    && (child.getAttribute('class') ?? '').split(/\s+/u).every(name => !name || /^language-\S+$/u.test(name))
    && child.childNodes.every(node => node.kind === 'text')));
}

function hasConfiguredBlockRule(element: SourceElement, schema: Schema, context: ImportContext): boolean {
  return Object.values(schema.nodes).some((type) => type.isBlock && type.name !== 'doc'
    && hasHTMLRule(type.spec, rule => matchingRule(element, rule, `node:${type.name}`, context)));
}

function hasStructuralContent(element: SourceElement, schema: Schema, context: ImportContext): boolean {
  if (HTML_BLOCK_TAGS.has(element.tagName) || element.matches('a[data-fountain-file]') || hasConfiguredBlockRule(element, schema, context)) return true;
  // Keep registered inline nodes authoritative over their own HTML subtree.
  if (Object.values(schema.nodes).some(type => type.isInline
    && hasHTMLRule(type.spec, rule => matchingRule(element, rule, `node:${type.name}`, context)))) return false;
  return element.children.some(child => hasStructuralContent(child, schema, context));
}

function inlineGroup(content: readonly SourceNode[]): SourceParent {
  return { childNodes: content, textContent: content.map((node) => node.textContent).join('') };
}

function blockChildren(element: SourceParent, schema: Schema, context: ImportContext, inlineParagraphAttrs: Attributes = {}): FountainNode[] {
  const dir = element instanceof ServerElement ? readTextDirection(element, schema, true) : {};
  const align: Attributes = element instanceof ServerElement ? alignment(element, dir) : {};
  if (element instanceof ServerElement && (dir.dir || align.alignExplicit || align.align !== 'left')) inlineParagraphAttrs = { ...align, ...dir, ...inlineParagraphAttrs };
  const result: FountainNode[] = [];
  let pending: SourceNode[] = [];
  const flushInline = () => {
    const content = inlineChildren(inlineGroup(pending), schema, [], context);
    const meaningful = content.some((node) => !node.isText || /[^\t\n\f\r ]/u.test(node.textContent) || node.marks.length);
    const flow = !Object.keys(inlineParagraphAttrs).length && importHTMLAnonymousFlow(content, schema);
    if (flow) result.push(flow);
    else if (meaningful && schema.nodes.paragraph) result.push(schema.node('paragraph', inlineParagraphAttrs, content));
    pending = [];
  };
  element.childNodes.forEach((child) => {
    const structural = child.kind === 'element' && hasStructuralContent(child, schema, context);
    if (structural) {
      flushInline();
      result.push(...block(child, schema, context));
    } else pending.push(child);
  });
  flushInline();
  return element instanceof ServerElement ? inheritElementMarks(element, result, schema, context) : result;
}

function listItemContent(element: SourceElement, schema: Schema, context: ImportContext): FountainNode[] {
  const dir = readTextDirection(element, schema, true);
  const align = alignment(element, dir);
  const attrs = dir.dir || align.alignExplicit || align.align !== 'left' ? { ...align, ...dir } : {};
  const result: FountainNode[] = [];
  let pending: SourceNode[] = [];
  const flushInline = () => {
    const content = inlineChildren(inlineGroup(pending), schema, [], context);
    const meaningful = content.some((node) => !node.isText || /[^\t\n\f\r ]/u.test(node.textContent) || node.marks.length);
    if (meaningful) result.push(schema.node('paragraph', attrs, content));
    pending = [];
  };
  element.childNodes.forEach((child) => {
    if (child.kind === 'element' && child.tagName === 'input' && child.getAttribute('type') === 'checkbox') return;
    if (child.kind === 'element' && hasStructuralContent(child, schema, context)) {
      flushInline();
      result.push(...block(child, schema, context));
      return;
    }
    pending.push(child);
  });
  flushInline();
  // Match browser import: preserve valid first-child blocks without inserting
  // an authored-looking empty paragraph before them.
  if (!result.length) {
    result.unshift(schema.node('paragraph', attrs, [schema.text('')]));
  }
  return inheritElementMarks(element, result, schema, context);
}

function inheritBlockMarks(node: FountainNode, marks: readonly Mark[], slots?: ImportContext['blockSlots'], inlineSlots?: ImportContext['inlineSlots'], commentOrigins?: ImportContext['commentOrigins'], tag = '', seen?: WeakSet<FountainNode>): FountainNode {
  if (!marks.length) return node;
  if (inlineSlots?.atomNodes.has(node) && node.type.name === 'image_super') {
    throw new Error('HTML formatting or links around a Markdown block image require an inline-image projection; literal source retained.');
  }
  const children = node.type.isInline ? relativeHTMLContent(node.content, marks, true)
    : node.content.map(child => inheritBlockMarks(child, marks, slots, inlineSlots, commentOrigins, tag, seen));
  let result = children.some((child, index) => child !== node.content[index]) ? node.copy(children) : node;
  if (node.type.isInline) {
    const combined = seen?.has(node) ? node.marks : mergeHTMLBlockMarks(node.marks, marks, tag);
    if (combined.length !== node.marks.length || combined.some((mark, index) => !mark.eq(node.marks[index]))) {
      result = result.withMarks(combined);
    }
    seen?.add(result);
  }
  const origin = slots?.originals.has(node) ? node : slots?.origins.get(node);
  if (origin && result !== node) slots?.origins.set(result, origin);
  const index = inlineSlots?.provenance.get(node);
  if (index !== undefined && result !== node) inlineSlots?.provenance.set(result, index);
  const commentOrigin = commentOrigins?.get(node);
  if (commentOrigin && result !== node) commentOrigins?.set(result, commentOrigin);
  return result;
}

function block(element: SourceElement, schema: Schema, context: ImportContext): FountainNode[] {
  return inheritElementMarks(element, projectBlock(element, schema, context), schema, context);
}

const blockEmphasis = new WeakMap<RawElement, WeakSet<FountainNode>>();

function inheritElementMarks(element: SourceElement, nodes: FountainNode[], schema: Schema, context: ImportContext): FountainNode[] {
  const slots = context.blockSlots;
  const marks = slots ? slots.scopedMarks.get(element.raw) : elementMarks(element, schema, [], context, false);
  // Protected-block slots already contain the complete computed source scope;
  // overlay it once by type. Ordinary HTML keeps each actual emphasis element.
  const tag = slots ? '' : element.tagName;
  let seen = explicitHTMLEmphasis(tag) ? blockEmphasis.get(element.raw) : undefined;
  if (explicitHTMLEmphasis(tag) && !seen) blockEmphasis.set(element.raw, seen = new WeakSet());
  return marks?.length ? nodes.map(node => inheritBlockMarks(node, marks, slots, context.inlineSlots, context.commentOrigins, tag, seen)) : nodes;
}

function projectBlock(element: SourceElement, schema: Schema, context: ImportContext): FountainNode[] {
  const tag = element.tagName;
  const location = htmlparser2Adapter.getNodeSourceCodeLocation(element.raw)?.startOffset;
  const atom = location === undefined ? undefined : context.inlineSlots?.blockAtoms.get(location);
  if (atom) {
    if (tag !== atom.tag || element.childNodes.length) throw new Error('HTML recovery changed a protected Markdown block atom.');
    context.inlineSlots!.atomVisits.push(location!);
    return [atom.node];
  }
  if (context.blockSlots && element.hasAttribute(context.blockSlots.attribute)) {
    const index = Number(element.getAttribute(context.blockSlots.attribute));
    const offset = htmlparser2Adapter.getNodeSourceCodeLocation(element.raw)?.startOffset;
    if (offset === undefined || context.blockSlots.offsets.get(offset) !== index
      || !context.blockSlots.nodes[index] || element.childNodes.length) {
      throw new Error('HTML flow changed a protected Markdown block slot.');
    }
    return [context.blockSlots.nodes[index]];
  }
  const customNode = configuredNode(element, schema, false, [], context);
  if (customNode) return [customNode];
  if (tag === 'dl') {
    const branch: ImportContext = { ...context, issues: [], issueKeys: new Set(),
      inlineSlots: context.inlineSlots ? { ...context.inlineSlots, breakVisits: [], atomVisits: [] } : undefined };
    const list = importDefinitionList(element, schema, item => blockChildren(item, schema, branch),
      item => configuredNode(item, schema, false, [], branch), () => {
      reportOnce(branch, { code: 'unmapped-block-wrapper', message: 'Definition-list grouping wrappers were removed; term and description order was retained.' });
    }, item => readContainerDirection(item, schema));
    if (list) {
      branch.inlineSlots?.breakVisits.forEach(offset => context.inlineSlots!.breakVisits.push(offset));
      branch.inlineSlots?.atomVisits.forEach(offset => context.inlineSlots!.atomVisits.push(offset));
      branch.issues.forEach(issue => reportOnce(context, issue));
      return [reportStructuralDirection(element, list, context, schema)];
    }
  }
  const math = projectHTMLMath(element, schema, 'block');
  if (math) return math;
  if (/^h[1-6]$/.test(tag)) {
    const dir = readTextDirection(element, schema);
    const content = inlineChildren(element, schema, [], context);
    const emptyText = !content.length && !element.childNodes.length && element.getAttribute('data-fountain-empty') === 'text';
    return [schema.node('heading', { level: Number(tag[1]), ...alignment(element, dir), ...dir, ...readExplicitEmphasis(element), ...readParagraphLayout(element) }, emptyText ? [schema.text('')] : content)];
  }
  if (tag === 'p') return [paragraph(element, schema, context)];
  if (tag === 'blockquote') {
    const children = blockChildren(element, schema, context);
    return [reportStructuralDirection(element, schema.node('blockquote', { ...readExplicitQuoteAppearance(element), ...readContainerDirection(element, schema) }, children.length ? children : [paragraph(element, schema, context, true)]), context, schema)];
  }
  if (tag === 'pre') {
    const codeClass = directChild(element, 'code')?.getAttribute('class') ?? '';
    const slots = context.inlineSlots;
    let content: FountainNode[];
    if (slots) {
      let previousIndex: number | undefined;
      let previousCR = false;
      const preLocation = htmlparser2Adapter.getNodeSourceCodeLocation(element.raw);
      const preMarks = slots.tokenMarks.get(preLocation?.startOffset ?? -1) ?? [];
      // The placeholder tags suppress HTML's initial-LF rule. An empty original
      // text node must not consume that rule, but a real tag/mark boundary does.
      const first = element.childNodes[0];
      const firstIndex = first?.kind === 'element' && first.tagName === slots.tag
        && htmlparser2Adapter.getNodeSourceCodeLocation(first.raw)?.startOffset === preLocation?.startTag?.endOffset
        ? Number(first.getAttribute('data-index')) : undefined;
      let emptyInitial = false;
      content = inlineChildren(element, schema, [], context).flatMap(node => {
        const index = slots.provenance.get(node);
        // Both a real <br> and its following renderer LF occupy a line inside
        // pre. Keep the LF token separately; do not merge away a visible line.
        if (slots.projectedBreaks.has(node) || node.type.name === 'hard_break') {
          if (Object.keys(node.attrs).length) throw new Error('Preformatted HTML cannot discard hard-break attributes; literal source retained.');
          previousIndex = undefined;
          previousCR = false;
          emptyInitial = false;
          return [schema.text('\n', node.marks)];
        }
        if (!node.isText) {
          throw new Error('Preformatted HTML cannot flatten an inline atom; literal source retained.');
        }
        const originalText = index !== undefined && slots.softBreaks.has(index) ? '\n' : node.text!;
        const adjacent = index !== undefined && previousIndex === index - 1 && slots.adjacentText.has(index);
        const skipLF = adjacent && previousCR && originalText.startsWith('\n');
        let value = (skipLF ? originalText.slice(1) : originalText).replace(/\r\n?/gu, '\n');
        // A Markdown renderer's terminal LF belongs to the generated code
        // wrapper, not to the code buffer. Retain it when flattened inside a
        // different raw pre, but keep only the empty provenance carrier in its
        // own generated pre. No authored newline is trimmed or guessed away.
        const generatedCode = preLocation && slots.codeBlocks.get(preLocation.startOffset);
        if (generatedCode && index !== undefined && slots.codeEndings.get(index) === generatedCode) value = '';
        previousCR = originalText ? originalText.endsWith('\r') : adjacent && previousCR;
        previousIndex = index;
        const sourceMarks = index === undefined ? [] : slots.nodes[index].marks;
        const initial = (firstIndex !== undefined && index === firstIndex || emptyInitial && adjacent)
          && sourceMarks.length === preMarks.length && sourceMarks.every((mark, position) => mark === preMarks[position]);
        emptyInitial = initial && originalText.length === 0;
        if (initial && value.startsWith('\n')) value = value.slice(1);
        const result = value === node.text ? node : node.withText(value);
        if (index !== undefined) slots.provenance.set(result, index);
        return result;
      });
      reportOnce(context, {
        code: 'preformatted-html-projection',
        message: 'Preformatted HTML became a code block. Supported text marks remain in the document and safe HTML; explicit HTML breaks and physical soft breaks were restored, CR/CRLF normalized as HTML newlines, and HTML initial-LF handling applied. Other inline atoms require a specialized adapter.',
      });
    } else {
      content = preformattedChildren(element, schema, context);
      if (hasProjectedPreformattedMarkup(element)) reportOnce(context, {
        code: 'preformatted-html-projection',
        message: 'Preformatted HTML became a code buffer with supported text formatting and literal newlines. This projection notice is not a loss count: unrepresented metadata, comments, media and block layout still require a specialized adapter. Keep the original file when those properties matter.',
      });
    }
    return [reportStructuralDirection(element, schema.node('code_block', {
      language: element.getAttribute('data-language') || codeClass.match(/(?:^|\s)language-(\S+)(?=\s|$)/u)?.[1] || 'text',
      lineNumbers: element.getAttribute('data-line-numbers') !== 'false',
      ...readParagraphLayout(element),
      ...(schema.nodes.code_block.spec.attrs?.dir ? readTextDirection(element, schema) : {}),
    }, content), context, schema)];
  }
  if (tag === 'hr') return [schema.node('horizontal_rule')];
  if (tag === 'ul' || tag === 'ol') {
    const isTask = element.getAttribute('data-type') === 'task-list';
    const itemType = isTask ? 'task_item' : 'list_item';
    const items = element.children.filter((child) => child.tagName === 'li').map((item) => schema.node(
      itemType,
      { ...readContainerDirection(item, schema), ...(!isTask && schema.nodes[itemType]?.spec.attrs?.layout ? readListLayout(item) : {}), ...(isTask ? {
        checked: item.getAttribute('data-checked') === 'true'
          || item.querySelector('input')?.hasAttribute('checked') === true,
      } : {}) },
      listItemContent(item, schema, context),
    ));
    const listType = isTask ? 'task_list' : tag === 'ol' ? 'ordered_list' : 'bullet_list';
    const start = htmlOrderedListStart(element.getAttribute('start'));
    if (tag === 'ol' && (start < 0 || element.hasAttribute('reversed')
      || (element.hasAttribute('type') && element.getAttribute('type') !== '1')
      || element.children.some(child => child.tagName === 'li' && child.hasAttribute('value')))) {
      reportOnce(context, {
        code: 'block-html-projection',
        message: 'Ordered-list numbering was normalized. Negative starts, reversed numbering, non-decimal marker types and per-item value overrides are not retained by the supplied list schema.',
      });
    }
    return [reportStructuralDirection(element, schema.node(listType, { ...readContainerDirection(element, schema), ...(!isTask && schema.nodes[listType]?.spec.attrs?.layout ? readListLayout(element) : {}), ...(tag === 'ol' ? { start: start >= 0 ? start : 1 } : {}) }, items), context, schema)];
  }
  if (tag === 'figure') {
    const children = element.childNodes;
    const hasExtraText = children.some(child => child.kind === 'text' && /[^\t\n\f\r ]/u.test(child.textContent));
    const node = projectMediaFigure(element, children.filter(child => child.kind === 'element'), hasExtraText, schema,
      image => imageNode(image, schema, 'image_super', context, element));
    if (node) return [node];
    reportOnce(context, { code: 'unmapped-block-wrapper', message: 'A figure could not be represented as one media node with its supported caption. Its supported descendants were imported in order; figure grouping and wrapper attributes were not preserved.' });
    return blockChildren(element, schema, context);
  }
  if (tag === 'table') {
    const captions = element.querySelectorAll(':scope > caption').flatMap(caption => {
      reportOnce(context, { code: 'unmapped-block-wrapper', message: 'Table captions were retained as editable blocks before the table; caption association, placement and attributes were not preserved.' });
      const blocks = blockChildren(caption, schema, context);
      return blocks.length ? blocks : [paragraph(caption, schema, context)];
    });
    const table = projectHTMLTable(element, schema, {
      rows: element.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr, :scope > tr'),
      groupKey: row => row.raw.parent,
      groupName: row => row.raw.parent && 'name' in row.raw.parent ? row.raw.parent.name : '',
      cells: row => row.children,
      blocks: (cell, attrs) => blockChildren(cell, schema, context, attrs),
      paragraph: cell => paragraph(cell, schema, context, true),
      inheritRowMarks: (row, node) => {
        const marked = inheritElementMarks(row, [node], schema, context);
        const parent = row.raw.parent;
        return parent && parent !== element.raw && htmlparser2Adapter.isElementNode(parent)
          ? inheritElementMarks(row.parentElement!, marked, schema, context)[0] : marked[0];
      },
      report: issue => reportOnce(context, { code: 'block-html-projection', message: TABLE_PROJECTION_MESSAGES[issue] }),
    });
    return table ? [...captions, reportStructuralDirection(element, table, context, schema)] : captions;
  }
  if (tag === 'img') {
    const image = imageNode(element, schema, 'image_super', context);
    return image ? [image] : [];
  }
  if (tag === 'audio' || tag === 'video') {
    const media = playbackNode(element, schema, tag);
    return media ? [media] : [];
  }
  if (tag === 'a' && element.hasAttribute('data-fountain-file')) {
    const file = fileNode(element, schema);
    return file ? [file] : [];
  }
  if (tag === 'iframe' && element.hasAttribute('data-fountain-embed')) {
    const embed = embedNode(element, schema);
    return embed ? [embed] : [];
  }
  // Recognizing a tag as block-level is not the same as representing its
  // wrapper in the schema. Every path reaching this fallback removes it.
  reportOnce(context, {
    code: 'unmapped-block-wrapper',
    message: 'Unmapped HTML block wrappers were removed. Descendant content was imported using the schema; wrapper identity, attributes, and behavior were not preserved.',
  });
  const nested = blockChildren(element, schema, context);
  return nested.length ? nested : [paragraph(element, schema, context)];
}

function parseErrorIssue(error: ParserError): ServerHTMLImportIssue {
  return Object.freeze({
    code: 'html-parse-error',
    message: `HTML parser recovered from ${error.code}.`,
    line: error.startLine,
    column: error.startCol,
  });
}

/**
 * Standards-oriented, DOM-free HTML importer for Node.js and other ESM server
 * runtimes. It never reads `window`, `document`, `DOMParser`, or HTMLElement.
 */
export class ServerHTMLImporter {
  readonly options: Readonly<Required<ServerHTMLImporterOptions>>;

  constructor(options: ServerHTMLImporterOptions = {}) {
    this.options = Object.freeze(normalizeOptions(options));
  }

  parse(html: string, schema: Schema): FountainNode {
    return this.parseWithReport(html, schema).document;
  }

  /** Apply HTML scopes to original Markdown nodes without an HTML round trip. */
  parseInline(segments: readonly MarkdownHTMLInlineSegment[], schema: Schema): readonly FountainNode[] {
    return this.parseInlineWithReport(segments, schema).nodes;
  }

  /**
   * DOM-free opt-in Markdown adapter. Throws if HTML recovery consumes, moves,
   * duplicates, or replaces a protected Markdown node. MarkdownImporter catches
   * this and retains its inert source interpretation. Not a lossless HTML import.
   */
  parseInlineWithReport(segments: readonly MarkdownHTMLInlineSegment[], schema: Schema): ServerHTMLInlineImportResult {
    return this.parseInlineContent(segments, schema, false);
  }

  /** Recover an HTML paragraph into blocks while preserving original inline nodes. */
  parseParagraph(segments: readonly MarkdownHTMLInlineSegment[], schema: Schema, context?: MarkdownHTMLParagraphContext): readonly FountainNode[] {
    return this.parseParagraphWithReport(segments, schema, context).nodes;
  }

  parseParagraphWithReport(segments: readonly MarkdownHTMLInlineSegment[], schema: Schema, context?: MarkdownHTMLParagraphContext): ServerHTMLFragmentImportResult {
    return this.parseInlineContent(segments, schema, true, !context?.tightList);
  }

  static parseParagraph(segments: readonly MarkdownHTMLInlineSegment[], schema: Schema, context?: MarkdownHTMLParagraphContext): readonly FountainNode[] {
    return new ServerHTMLImporter().parseParagraph(segments, schema, context);
  }

  private parseInlineContent(segments: readonly MarkdownHTMLInlineSegment[], schema: Schema, paragraphMode: boolean, wrapParagraph = true, wholeContainer = false, generated?: { breaks: ReadonlyMap<MarkdownHTMLInlineSegment, FountainNode>; lineFeeds: ReadonlySet<FountainNode>; codeBlocks: ReadonlyMap<MarkdownHTMLInlineSegment, FountainNode>; codeEndings: ReadonlyMap<FountainNode, FountainNode>; blockAtoms: ReadonlyMap<MarkdownHTMLInlineSegment, { readonly tag: 'hr' | 'img' | 'table' | 'p'; readonly node: FountainNode }> }): ServerHTMLInlineImportResult {
    const usedNames = new Set<string>();
    let preOpen = false;
    for (const segment of segments) {
      if (segment.kind === 'html') {
        if (!wholeContainer && (!segment.html || markdownHTMLTokenEnd(segment.html, 0) !== segment.html.length)) {
          throw new TypeError('An inline HTML segment must contain exactly one raw HTML token.');
        }
        const pre = /^<(\/?)pre(?=[\t\n\r\f />])/iu.exec(segment.html);
        if (pre && !wholeContainer) {
          if (Boolean(pre[1]) !== preOpen) throw new Error('Preformatted HTML must close within one paragraph without nested or orphan pre tags; literal source retained.');
          preOpen = !pre[1];
        }
        for (const match of segment.html.toLowerCase().matchAll(/fountain-markdown-slot-\d+/gu)) usedNames.add(match[0]);
        segment.marks.forEach(mark => {
          if (mark.type.schema !== schema) throw new TypeError('Inline HTML token marks must use the supplied schema.');
        });
      } else {
        if (!(segment.node instanceof FountainNode) || !segment.node.type.isInline) throw new TypeError('Expected an inline Markdown node.');
        schema.validate(segment.node);
        if (segment.softBreak !== undefined && (segment.softBreak !== true || !segment.node.isText || segment.node.text !== ' ')) {
          throw new TypeError('A soft-break segment must be a space text node.');
        }
        if (segment.textRun !== undefined && (!Number.isSafeInteger(segment.textRun) || segment.textRun < 0)) {
          throw new TypeError('Text-run provenance must be a nonnegative safe integer.');
        }
      }
    }
    if (preOpen) throw new Error('Preformatted HTML spans a paragraph boundary; literal source retained.');
    let suffix = 0;
    while (usedNames.has(`fountain-markdown-slot-${suffix}`)) suffix += 1;
    const tag = `fountain-markdown-slot-${suffix}`;
    const originals: FountainNode[] = [];
    const seenNodes = new Set<FountainNode>();
    const sharedNodes = new Set<FountainNode>();
    const tokenMarks = new Map<number, readonly Mark[]>();
    const softBreaks = new Set<number>();
    const adjacentText = new Set<number>();
    const sourceBreaks = new Map<number, FountainNode>();
    const codeBlocks = new Map<number, FountainNode>();
    const codeEndings = new Map<number, FountainNode>();
    const blockAtoms = new Map<number, { readonly tag: 'hr' | 'img' | 'table' | 'p'; readonly node: FountainNode }>();
    let previousSegment: MarkdownHTMLInlineSegment | undefined;
    const wrapped = paragraphMode && wrapParagraph;
    const parts: string[] = wrapped ? ['<p>'] : [];
    let offset = wrapped ? 3 : 0;
    for (const segment of segments) {
      let part: string;
      if (segment.kind === 'html') {
        tokenMarks.set(offset, segment.marks);
        const sourceBreak = generated?.breaks.get(segment);
        if (sourceBreak) sourceBreaks.set(offset, sourceBreak);
        const sourceCode = generated?.codeBlocks.get(segment);
        if (sourceCode) codeBlocks.set(offset, sourceCode);
        const atom = generated?.blockAtoms.get(segment);
        if (atom) blockAtoms.set(offset, atom);
        part = segment.html;
      } else {
        part = `<${tag} data-index="${originals.length}"></${tag}>`;
        if (seenNodes.has(segment.node)) sharedNodes.add(segment.node);
        seenNodes.add(segment.node);
        originals.push(segment.node);
        const codeEnding = generated?.codeEndings.get(segment.node);
        if (codeEnding) codeEndings.set(originals.length - 1, codeEnding);
        if (segment.softBreak || generated?.lineFeeds.has(segment.node)) softBreaks.add(originals.length - 1);
        if (previousSegment?.kind === 'node' && previousSegment.node.isText && segment.node.isText
          && previousSegment.textRun === segment.textRun
          && previousSegment.node.marks.length === segment.node.marks.length
          && previousSegment.node.marks.every((mark, index) => mark.eq(segment.node.marks[index]))) adjacentText.add(originals.length - 1);
      }
      previousSegment = segment;
      parts.push(part);
      offset += part.length;
      if (offset > this.options.maxInputBytes) throw new HTMLImportLimitError('maxInputBytes', 'Inline HTML and protected node slots exceed the input limit.');
    }
    if (wrapped) parts.push('</p>');
    const html = parts.join('');
    if (utf8Length(html) > this.options.maxInputBytes) throw new HTMLImportLimitError('maxInputBytes', 'Inline HTML and protected node slots exceed the input limit.');
    const issues: ServerHTMLImportIssue[] = [];
    const provenance = new WeakMap<FountainNode, number>();
    const context: ImportContext = {
      issues, issueKeys: new Set(), ...(wholeContainer ? { literalRawText: new WeakMap<RawElement, FountainNode>() } : {}), inlineSlots: { tag, nodes: originals, sharedNodes, provenance, tokenMarks, softBreaks, adjacentText, sourceBreaks, codeBlocks, codeEndings, blockAtoms, atomNodes: new Set([...blockAtoms.values()].map(atom => atom.node)), atomVisits: [], projectedBreaks: new WeakSet(), breakVisits: [] },
    };
    const fragment = parseFragment<Htmlparser2TreeAdapterMap>(html, {
      treeAdapter: htmlparser2Adapter, sourceCodeLocationInfo: true,
      onParseError: error => {
        // An EOF inside a tag discards its entire token, potentially including
        // all raw Markdown source. Protected-node checks cannot detect that
        // loss when the input consists only of raw HTML. Refuse speculative
        // whole-document conversion so the Markdown importer keeps its inert
        // source projection. Complete opening tags may still be HTML-repaired.
        // This guard is independent of the bounded diagnostic budget.
        if (wholeContainer && error.code === 'eof-in-tag') {
          throw new Error('HTML recovery cannot preserve an unfinished HTML tag; inert Markdown source retained.');
        }
        if (issues.length < this.options.maxParseErrors) issues.push(parseErrorIssue(error));
      },
    });
    validateTree(fragment, this.options, context);
    const root = rootSource(fragment, this.options.sourceTokens ? { text: html, origin: 'markdown-projection' } : undefined);
    const inspect = (parent: SourceParent) => {
      for (const child of parent.childNodes) {
        if (child.kind !== 'element') continue;
        if (wholeContainer && /^(script|style|textarea)$/u.test(child.tagName)) {
          const literal = configuredNode(child, schema, true, [], context);
          if (literal?.type.spec.code && literal.type.spec.content === 'text*'
            && literal.content.every(node => node.isText && !node.marks.length)
            && literal.textContent === child.textContent) {
            context.literalRawText!.set(child.raw, literal);
            // These are parser raw-text elements: their body is one literal
            // string, not HTML descendants or protected Markdown node slots.
            // The existing provenance check below still refuses swallowed slots.
            continue;
          }
        }
        if ((!paragraphMode && HTML_BLOCK_TAGS.has(child.tagName) && child.tagName !== 'img') || /^(script|style|textarea|title|iframe|xmp|plaintext|svg|math|template|select|option)$/u.test(child.tagName)) {
          throw new Error(`Inline HTML <${child.tagName}> requires a block or specialized adapter; literal source retained.`);
        }
        inspect(child);
      }
    };
    inspect(root);
    const nodes = paragraphMode ? blockChildren(root, schema, context) : inlineChildren(root, schema, [], context);
    const found: number[] = [];
    const verify = (node: FountainNode) => {
      const index = provenance.get(node);
      if (index !== undefined) found.push(index);
      else node.content.forEach(verify);
    };
    nodes.forEach(node => { schema.validate(node); verify(node); });
    if (wholeContainer) {
      const inspectWhitespace = (node: FountainNode): void => {
        if (node.type.name === 'paragraph' && node.content.length
          && node.content.every(child => child.isText && !/[^\t\n\f\r ]/u.test(child.text ?? ''))
          && node.content.some(child => child.marks.length)) reportOnce(context, {
          code: 'formatted-whitespace-block',
          message: 'HTML recovery produced a whitespace-only formatted paragraph. Its formatting is retained, but editable paragraph spacing can differ from the original HTML layout.',
        });
        node.content.forEach(inspectWhitespace);
      };
      nodes.forEach(inspectWhitespace);
    }
    if (found.length !== originals.length || found.some((index, position) => index !== position)) {
      throw new Error('Inline HTML recovery did not preserve every Markdown node exactly once in order; literal source retained.');
    }
    const expectedBreaks = [...sourceBreaks.keys()];
    const visitedBreaks = context.inlineSlots!.breakVisits;
    if (visitedBreaks.length !== expectedBreaks.length || visitedBreaks.some((offset, index) => offset !== expectedBreaks[index])) {
      throw new Error('HTML recovery changed generated Markdown hard-break order or count; literal source retained.');
    }
    const expectedAtoms = [...blockAtoms.keys()];
    const visitedAtoms = context.inlineSlots!.atomVisits;
    if (visitedAtoms.length !== expectedAtoms.length || visitedAtoms.some((offset, index) => offset !== expectedAtoms[index])) {
      throw new Error('HTML recovery changed protected Markdown block atom order or count; literal source retained.');
    }
    if (segments.some(segment => segment.kind === 'html')) reportOnce(context, {
      code: 'inline-html-projection',
      message: 'Inline HTML was projected into schema content. Tag identity, unsupported attributes/styles, unsafe URLs, and comments without an accepted schema projection are not preserved; this is not lossless HTML conversion.',
    });
    reportCommentLoss(nodes, context);
    return Object.freeze({ nodes: Object.freeze(nodes), issues: Object.freeze([...issues]) });
  }

  static parseInline(segments: readonly MarkdownHTMLInlineSegment[], schema: Schema): readonly FountainNode[] {
    return new ServerHTMLImporter().parseInline(segments, schema);
  }

  /**
   * Explicit source reprojection of containers containing raw HTML and pristine
   * text-only Markdown paragraphs. Unlike parseFlow, paragraph block identities
   * may change. Custom block data, modified projections and atoms are refused.
   */
  parseParagraphFlow(segments: readonly MarkdownHTMLFlowSegment[], schema: Schema, context?: MarkdownHTMLFlowContext): readonly FountainNode[] {
    return this.parseParagraphFlowWithReport(segments, schema, context).nodes;
  }

  parseParagraphFlowWithReport(segments: readonly MarkdownHTMLFlowSegment[], schema: Schema, context?: MarkdownHTMLFlowContext): ServerHTMLFragmentImportResult {
    if (!context) throw new Error('Paragraph flow recovery requires Markdown parser source context.');
    return this.projectTextBlockFlow(segments, schema, context.readParagraphSources().map(source => ({ ...source, kind: 'paragraph' })), false);
  }

  /** Explicit pristine paragraph/heading/code source projection; not identity-preserving parseFlow. */
  parseTextBlockFlow(segments: readonly MarkdownHTMLFlowSegment[], schema: Schema, context?: MarkdownHTMLFlowContext): readonly FountainNode[] {
    return this.parseTextBlockFlowWithReport(segments, schema, context).nodes;
  }

  parseTextBlockFlowWithReport(segments: readonly MarkdownHTMLFlowSegment[], schema: Schema, context?: MarkdownHTMLFlowContext): ServerHTMLFragmentImportResult {
    if (!context?.readTextBlockSources) throw new Error('Text-block flow recovery requires Markdown parser text-block source context.');
    return this.projectTextBlockFlow(segments, schema, context.readBlockSources?.() ?? context.readTextBlockSources(), true, Boolean(context.readBlockSources));
  }

  static parseTextBlockFlow(segments: readonly MarkdownHTMLFlowSegment[], schema: Schema, context?: MarkdownHTMLFlowContext): readonly FountainNode[] {
    return new ServerHTMLImporter().parseTextBlockFlow(segments, schema, context);
  }

  private projectTextBlockFlow(segments: readonly MarkdownHTMLFlowSegment[], schema: Schema, sources: readonly MarkdownHTMLFlowBlockSource[], structural: boolean, recursive = false): ServerHTMLFragmentImportResult {
    if (segments.length > this.options.maxNodes || sources.length > this.options.maxNodes) {
      throw new HTMLImportLimitError('maxNodes', 'Paragraph flow exceeds the node limit.');
    }
    const byBlock = new Map<FountainNode, MarkdownHTMLFlowBlockSource>();
    for (const paragraph of sources) {
      if (paragraph.blocks.length !== 1 || byBlock.has(paragraph.blocks[0])) {
        throw new Error('Paragraph flow cannot replace modified or ambiguous paragraph projections.');
      }
      byBlock.set(paragraph.blocks[0], paragraph);
    }
    // Only combine adjacent text for comparison; never trim whitespace, erase
    // marks/attributes or flatten an atom. The original blocks remain untouched.
    const normalized = (nodes: readonly FountainNode[]): FountainNode[] => {
      const result: FountainNode[] = [];
      for (const node of nodes) {
        if (!node.isText) {
          if (!structural || !node.type.isInline) throw new Error('Paragraph flow cannot flatten an inline atom.');
          result.push(node);
          continue;
        }
        const previous = result.at(-1);
        if (previous?.isText && previous.withText(node.text!).eq(node)) result[result.length - 1] = previous.withText(previous.text! + node.text!);
        else result.push(node);
      }
      return result;
    };
    const stream: MarkdownHTMLInlineSegment[] = [];
    const generatedBreaks = new Map<MarkdownHTMLInlineSegment, FountainNode>();
    const generatedLineFeeds = new Set<FountainNode>();
    const generatedCodeBlocks = new Map<MarkdownHTMLInlineSegment, FountainNode>();
    const generatedCodeEndings = new Map<FountainNode, FountainNode>();
    const generatedAtoms = new Map<MarkdownHTMLInlineSegment, { readonly tag: 'hr' | 'img' | 'table' | 'p'; readonly node: FountainNode }>();
    let newline = true;
    const raw = (html: string) => { stream.push({ kind: 'html', html, marks: [] }); if (html) newline = html.endsWith('\n'); };
    const cr = () => { if (!newline) raw('\n'); };
    const used = new Set<FountainNode>();
    const taskLists: FountainNode[] = [];
    let count = 0;
    const emit = (paragraph: MarkdownHTMLFlowBlockSource, depth = 0, insideTask = false): void => {
      if (++count > this.options.maxNodes) throw new HTMLImportLimitError('maxNodes', 'Structural flow exceeds its node limit.');
      if (depth > this.options.maxDepth) throw new HTMLImportLimitError('maxDepth', 'Structural flow exceeds its depth limit.');
      if (paragraph.blocks.length !== 1 || used.has(paragraph.blocks[0])) throw new Error('Structural flow requires unique source blocks.');
      const node = paragraph.blocks[0];
      used.add(node);
      schema.validate(node);
      if (paragraph.kind === 'unsupported') throw new Error('Structural flow refuses unsupported block syntax.');
      if (paragraph.kind === 'html') { cr(); raw(paragraph.html); cr(); return; }
      if (paragraph.kind === 'thematicBreak' || paragraph.kind === 'image') {
        const image = paragraph.kind === 'image';
        const expected = image ? schema.node('image_super', {
          src: paragraph.src, alt: paragraph.alt, title: paragraph.title, width: '100%', caption: '',
        }) : schema.node('horizontal_rule');
        if (!node.eq(expected)) throw new Error('Structural flow refuses modified Markdown block atoms.');
        const tag = image ? 'img' : 'hr';
        // Offsets bind these syntax-derived void tags to the ORIGINAL node.
        // Source-authored tags cannot spoof them, and no attributes or media
        // bytes pass through HTML parsing. Missing/reordered visits refuse flow.
        const opening: MarkdownHTMLInlineSegment = { kind: 'html', html: `<${tag} />`, marks: [] };
        generatedAtoms.set(opening, { tag, node });
        cr(); stream.push(opening); newline = false; cr();
        return;
      }
      if (paragraph.kind === 'table') {
        if (node.type.name !== 'table' || paragraph.rows.length !== node.childCount
          || paragraph.rows.some((row, index) => row.cells.length !== node.child(index).childCount)) {
          throw new Error('Structural flow refuses modified Markdown table geometry.');
        }
        // Reconstruct only the pristine schema projection from fresh parser
        // cell syntax (including references), never from exported HTML/JSON.
        // Keep the ORIGINAL subtree, complete defaults, marks and identities.
        const expected = schema.node('table', {}, paragraph.rows.map(row => schema.node('table_row', {},
          row.cells.map(cell => schema.node(row.header ? 'table_header' : 'table_cell', {}, [schema.node('paragraph',
            { align: cell.align, ...(cell.explicitLeft && schema.nodes.paragraph?.spec.attrs?.alignExplicit ? { alignExplicit: true } : {}) }, normalized(cell.segments.map(part => part.kind === 'node'
              ? part.node : schema.text(part.html.replace(/\n/gu, ' '), part.marks)))),
          ])),
        )));
        if (!node.eq(expected)) throw new Error('Structural flow refuses modified Markdown table projections.');
        const opening: MarkdownHTMLInlineSegment = { kind: 'html', html: '<table></table>', marks: [] };
        generatedAtoms.set(opening, { tag: 'table', node });
        cr(); stream.push(opening); newline = false; cr();
        return;
      }
      if (paragraph.kind === 'empty') {
        if (Object.keys(node.attrs).some(key => key !== 'align') || node.content.some(child => !child.isText || child.text || child.marks.length)
          || !node.eq(schema.node('paragraph', {}, node.content))) throw new Error('Structural flow refuses modified empty placeholders.');
        // An explicit saved empty paragraph is real document content. Carry
        // its exact node through the existing offset-bound block-slot guard;
        // implicit list/quote caret fillers keep their previous behavior.
        if (paragraph.explicit) {
          const opening: MarkdownHTMLInlineSegment = { kind: 'html', html: '<p></p>', marks: [] };
          generatedAtoms.set(opening, { tag: 'p', node });
          cr(); stream.push(opening); newline = false; cr();
        }
        return;
      }
      if (paragraph.kind === 'taskList' || paragraph.kind === 'taskItem') {
        const list = paragraph.kind === 'taskList';
        const attrs = list ? {} : { checked: paragraph.checked };
        if (Object.keys(node.attrs).some(key => list || key !== 'checked')
          || !node.eq(schema.node(list ? 'task_list' : 'task_item', attrs, node.content))) throw new Error('Structural flow refuses custom or modified task attributes.');
        const children = paragraph.children.flatMap(child => child.blocks);
        if (children.length !== node.content.length || children.some((child, index) => child !== node.content[index])) throw new Error('Structural flow refuses modified task projections.');
        if (list) taskLists.push(node);
        cr();
        raw(list ? '<ul data-type="task-list">' : `<li data-type="task-item" data-checked="${paragraph.checked}">`);
        for (const child of paragraph.children) emit(child, depth + 1, true);
        raw(list ? '</ul>' : '</li>'); cr();
        return;
      }
      if (paragraph.kind === 'container') {
        if (!['blockquote', 'ul', 'ol', 'li'].includes(paragraph.tag)
          || (paragraph.tag === 'ol' && (!Number.isSafeInteger(paragraph.start) || paragraph.start! < 0))) throw new Error('Invalid structural source tag/start.');
        const type = { blockquote: 'blockquote', ul: 'bullet_list', ol: 'ordered_list', li: 'list_item' }[paragraph.tag];
        const attrs = paragraph.tag === 'ol' ? { start: paragraph.start } : {};
        if (Object.keys(node.attrs).some(key => paragraph.tag !== 'ol' || key !== 'start')
          || !node.eq(schema.node(type, attrs, node.content))) throw new Error('Structural flow refuses custom or modified container attributes.');
        const children = paragraph.children.flatMap(child => child.blocks);
        if (children.length !== node.content.length || children.some((child, index) => child !== node.content[index])) throw new Error('Structural flow refuses modified container projections.');
        if (paragraph.tag !== 'li') cr();
        raw(`<${paragraph.tag}${paragraph.tag === 'ol' && paragraph.start !== 1 ? ` start="${paragraph.start}"` : ''}>`);
        if (paragraph.tag !== 'li') cr();
        for (const child of paragraph.children) emit(child, depth + 1, insideTask);
        if (paragraph.tag !== 'li') cr();
        raw(`</${paragraph.tag}>`); cr();
        return;
      }
      const allowed = paragraph.kind === 'heading' ? ['align', 'level'] : paragraph.kind === 'code' ? ['language', 'lineNumbers'] : ['align'];
      if (Object.keys(node.attrs).some(key => !allowed.includes(key))) {
        throw new Error('Paragraph flow refuses changed paragraph content, marks or custom attributes.');
      }
      const type = paragraph.kind === 'code' ? 'code_block' : paragraph.kind;
      const attrs = paragraph.kind === 'code' ? { language: paragraph.language, lineNumbers: true }
        : paragraph.kind === 'heading' ? { level: paragraph.level, align: 'left' } : { align: 'left' };
      const original = schema.node(type, attrs, normalized(paragraph.segments.map(part => part.kind === 'node'
        ? part.node : schema.text(part.html.replace(/\n/gu, ' '), part.marks))));
      const current = node.copy(normalized(node.content));
      if (!current.eq(original)) throw new Error('Paragraph flow refuses changed paragraph content, marks or custom attributes.');
      const tight = paragraph.kind === 'paragraph' && paragraph.tightList && !insideTask;
      const tag = paragraph.kind === 'heading' ? `h${paragraph.level}` : 'p';
      if (recursive && !tight) cr();
      if (paragraph.kind === 'code') {
        // Only syntax-derived language metadata is emitted, never arbitrary node attributes.
        const language = paragraph.language.replace(/[&<>"']/gu, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
        // Tasks preserve their Fountain subtree, not a rendered CommonMark
        // code stream: do not introduce an inline code mark or renderer LF.
        if (insideTask) raw(`<pre data-language="${language}">`);
        else {
          const opening: MarkdownHTMLInlineSegment = { kind: 'html', html: `<pre><code class="language-${language}">`, marks: [] };
          generatedCodeBlocks.set(opening, node);
          stream.push(opening);
          newline = false;
        }
      } else if (!tight) raw(`<${tag}>`);
      for (const part of paragraph.segments) {
        if (structural && !insideTask && part.kind === 'node' && part.node.type.name === 'hard_break'
          && !Object.keys(part.node.attrs).length && !part.node.content.length && !part.node.marks.length) {
          const generated: MarkdownHTMLInlineSegment = { kind: 'html', html: '<br />', marks: [] };
          generatedBreaks.set(generated, part.node);
          stream.push(generated);
          // Renderer LF after br is invisible under normal HTML whitespace
          // rules. Keep an empty protected carrier outside pre; restore LF only
          // inside pre, without introducing an editable newline or leading space.
          const carrier = schema.text('');
          generatedLineFeeds.add(carrier);
          stream.push({ kind: 'node', node: carrier });
          newline = true;
          continue;
        }
        stream.push(part);
        if (part.kind === 'html') { if (part.html) newline = part.html.endsWith('\n'); }
        else if (part.node.text) newline = Boolean(part.softBreak) || (!part.node.marks.length && part.node.text.endsWith('\n'));
      }
      if (paragraph.kind === 'code' && !insideTask && paragraph.finalLineBreak) {
        const ending = schema.text('');
        generatedLineFeeds.add(ending);
        generatedCodeEndings.set(ending, node);
        stream.push({ kind: 'node', node: ending });
      }
      raw(paragraph.kind === 'code' ? insideTask ? '</pre>\n' : '</code></pre>\n' : tight ? recursive ? '' : '\n' : `</${tag}>\n`);
    };
    for (const segment of segments) {
      if (segment.kind === 'html') {
        if (typeof segment.html !== 'string') throw new TypeError('Expected raw HTML block text.');
        if (recursive) cr();
        raw(segment.html + '\n');
        continue;
      }
      const source = byBlock.get(segment.node);
      if (!source) throw new Error('Text-block flow requires an unambiguous source for every Markdown block.');
      emit(source);
    }
    if ([...byBlock].some(([node, source]) => source.kind !== 'html' && !used.has(node))) throw new Error('Paragraph flow source context contains unmatched blocks.');
    const result = this.parseInlineContent(stream, schema, true, false, true, {
      breaks: generatedBreaks, lineFeeds: generatedLineFeeds, codeBlocks: generatedCodeBlocks, codeEndings: generatedCodeEndings,
      blockAtoms: generatedAtoms,
    });
    // Task syntax is an extension, not ordinary CommonMark list text. Reject
    // HTML repair/raw-text scopes that erase, duplicate or alter any task tree.
    // A refusal rolls back the entire speculative flow at the importer boundary.
    if (taskLists.length) {
      const projected: FountainNode[] = [];
      const visit = (node: FountainNode): void => {
        if (node.type.name === 'task_list') projected.push(node);
        node.content.forEach(visit);
      };
      result.nodes.forEach(visit);
      if (projected.length !== taskLists.length || projected.some((node, index) => !node.eq(taskLists[index]))) {
        throw new Error('Structural flow cannot change or flatten a task list; original source retained.');
      }
    }
    return Object.freeze({ nodes: result.nodes, issues: Object.freeze([...result.issues, Object.freeze({
      code: structural ? 'text-block-flow-projection' as const : 'paragraph-flow-projection' as const,
      message: structural
        ? 'Markdown source was reprojected across HTML boundaries using text-block, plain hard-break and available list/quote syntax. Inline nodes retain their data; conversions that would flatten them are refused. Block grouping/identity and HTML layout may change; custom block data, modified projections and unsupported blocks are refused. This is explicit source projection, not identity-preserving block flow or lossless HTML.'
        : 'Markdown paragraph source was reprojected across HTML block boundaries. Paragraph grouping/identity and HTML layout may change; custom paragraph data and inline atoms are refused. This is an explicit source projection, not identity-preserving block flow or lossless HTML.',
    })]) });
  }

  static parseParagraphFlow(segments: readonly MarkdownHTMLFlowSegment[], schema: Schema, context?: MarkdownHTMLFlowContext): readonly FountainNode[] {
    return new ServerHTMLImporter().parseParagraphFlow(segments, schema, context);
  }

  /** Resolve HTML scopes without HTML-serializing Markdown blocks; only added mark paths are copied. */
  parseFlow(segments: readonly MarkdownHTMLFlowSegment[], schema: Schema): readonly FountainNode[] {
    return this.parseFlowWithReport(segments, schema).nodes;
  }

  parseFlowWithReport(segments: readonly MarkdownHTMLFlowSegment[], schema: Schema): ServerHTMLFragmentImportResult {
    const usedNames = new Set<string>();
    let bytes = 0;
    for (const segment of segments) {
      if (segment.kind === 'html') {
        if (typeof segment.html !== 'string') throw new TypeError('Expected raw HTML block text.');
        bytes += utf8Length(segment.html);
        if (bytes > this.options.maxInputBytes) throw new HTMLImportLimitError('maxInputBytes', 'HTML flow exceeds the input limit.');
        for (const match of segment.html.toLowerCase().matchAll(/data-fountain-block-slot-\d+/gu)) usedNames.add(match[0]);
      } else {
        if (!(segment.node instanceof FountainNode) || segment.node.type.isInline || segment.node.type === schema.topNodeType) {
          throw new TypeError('Expected a Markdown block from the supplied schema.');
        }
        schema.validate(segment.node);
      }
    }
    let suffix = 0;
    while (usedNames.has(`data-fountain-block-slot-${suffix}`)) suffix++;
    const attribute = `data-fountain-block-slot-${suffix}`;
    const originals: FountainNode[] = [];
    const offsets = new Map<number, number>();
    const parts: string[] = [];
    let offset = 0;
    for (const segment of segments) {
      const part = segment.kind === 'html' ? segment.html
        : `<div ${attribute}="${originals.length}"></div>`;
      if (segment.kind === 'node') {
        offsets.set(offset, originals.length);
        originals.push(segment.node);
      }
      parts.push(part, '\n');
      offset += part.length + 1;
      if (offset > this.options.maxInputBytes) throw new HTMLImportLimitError('maxInputBytes', 'HTML flow and protected blocks exceed the input limit.');
    }
    const html = parts.join('');
    if (utf8Length(html) > this.options.maxInputBytes) throw new HTMLImportLimitError('maxInputBytes', 'HTML flow and protected blocks exceed the input limit.');
    const issues: ServerHTMLImportIssue[] = [];
    const scopedMarks = new WeakMap<RawElement, readonly Mark[]>();
    const origins = new WeakMap<FountainNode, FountainNode>();
    const originalsSet = new Set(originals);
    const context: ImportContext = { issues, issueKeys: new Set(), blockSlots: {
      attribute, nodes: originals, offsets, scopedMarks, origins, originals: originalsSet,
    } };
    const fragment = parseFragment<Htmlparser2TreeAdapterMap>(html, {
      treeAdapter: htmlparser2Adapter, sourceCodeLocationInfo: true,
      onParseError: error => {
        if (error.code === 'eof-in-tag') {
          throw new Error('HTML recovery cannot preserve an unfinished HTML tag; inert Markdown source retained.');
        }
        if (issues.length < this.options.maxParseErrors) issues.push(parseErrorIssue(error));
      },
    });
    validateTree(fragment, this.options, context);
    const root = rootSource(fragment, this.options.sourceTokens ? { text: html, origin: 'markdown-projection' } : undefined);
    // Raw-text scopes need a source-aware projection, not a formatting overlay.
    const inspect = (parent: SourceParent, specialized = false, inherited: readonly Mark[] = []): void => {
      for (const child of parent.childNodes) {
        if (child.kind !== 'element') continue;
        const scoped = specialized || /^(pre|script|style|textarea|title|iframe|xmp|plaintext|svg|math|template|select|option)$/u.test(child.tagName);
        if (child.hasAttribute(attribute) && specialized) {
          throw new Error('HTML flow requires specialized parsing inside a protected Markdown block; inert source retained.');
        }
        const marks = child.hasAttribute(attribute) ? inherited
          : mergeInlineMarks(elementMarks(child, schema, [], context, false), inherited);
        scopedMarks.set(child.raw, marks);
        inspect(child, scoped, marks);
      }
    };
    inspect(root);
    const nodes = blockChildren(root, schema, context);
    const found: FountainNode[] = [];
    const verify = (node: FountainNode): void => {
      const original = originalsSet.has(node) ? node : origins.get(node);
      if (original) found.push(original);
      else node.content.forEach(verify);
    };
    nodes.forEach(node => { schema.validate(node); verify(node); });
    if (found.length !== originals.length || found.some((node, index) => node !== originals[index])) {
      throw new Error('HTML flow recovery did not preserve every Markdown block exactly once in order; inert source retained.');
    }
    if (segments.some(segment => segment.kind === 'html')) reportOnce(context, {
      code: 'block-html-projection',
      message: 'HTML block scopes were projected into schema content. Unsupported wrappers, attributes, layout and comments may be omitted; this is not lossless HTML conversion.',
    });
    reportCommentLoss(nodes, context);
    return Object.freeze({ nodes: Object.freeze(nodes), issues: Object.freeze([...issues]) });
  }

  static parseFlow(segments: readonly MarkdownHTMLFlowSegment[], schema: Schema): readonly FountainNode[] {
    return new ServerHTMLImporter().parseFlow(segments, schema);
  }

  parseWithReport(html: string, schema: Schema): ServerHTMLImportResult {
    const result = this.parseContent(html, schema, true);
    const document = schema.topNodeType.create(
      { ...(result.pageSettings ? { pageSettings: result.pageSettings } : {}), ...(result.htmlSourceEnvelope ? { htmlSourceEnvelope: result.htmlSourceEnvelope } : {}) },
      result.nodes.length ? result.nodes : [schema.node('paragraph', {}, [schema.text('')])],
    );
    schema.validate(document);
    return Object.freeze({ document, issues: result.issues });
  }

  parseFragment(html: string, schema: Schema): readonly FountainNode[] {
    return this.parseFragmentWithReport(html, schema).nodes;
  }

  parseFragmentWithReport(html: string, schema: Schema): ServerHTMLFragmentImportResult {
    return this.parseContent(html, schema, false);
  }

  private parseContent(html: string, schema: Schema, documentMode: boolean): ServerHTMLFragmentImportResult & { readonly pageSettings?: DocumentPageSettings; readonly htmlSourceEnvelope?: HTMLDocumentEnvelope } {
    if (typeof html !== 'string') throw new TypeError('HTML input must be a string.');
    const inputBytes = utf8Length(html);
    if (inputBytes > this.options.maxInputBytes) {
      throw new HTMLImportLimitError(
        'maxInputBytes',
        `HTML input is ${inputBytes} bytes; the configured maximum is ${this.options.maxInputBytes}.`,
      );
    }
    const issues: ServerHTMLImportIssue[] = [];
    const context: ImportContext = { issues, issueKeys: new Set() };
    const parse = documentMode ? parseDocument<Htmlparser2TreeAdapterMap> : parseFragment<Htmlparser2TreeAdapterMap>;
    const fragment = parse(html, {
      treeAdapter: htmlparser2Adapter,
      sourceCodeLocationInfo: this.options.sourceTokens,
      // DOMParser's detached HTML documents use the disabled scripting mode.
      // Keep fragment/Markdown interpretation backward compatible.
      scriptingEnabled: !documentMode,
      onParseError: (error) => {
        // Bare snippets are a supported document-import input, not a warning
        // merely because they do not carry a page's optional doctype envelope.
        if (documentMode && error.code === 'missing-doctype') return;
        if (issues.filter((issue) => issue.code === 'html-parse-error').length < this.options.maxParseErrors) {
          issues.push(parseErrorIssue(error));
        }
      },
    });
    validateTree(fragment, this.options, context);
    let root = rootSource(fragment, this.options.sourceTokens ? { text: html, origin: 'html-input' } : undefined);
    let pageSettings: DocumentPageSettings | undefined;
    let htmlSourceEnvelope: HTMLDocumentEnvelope | undefined;
    if (documentMode) {
      const shell = root.childNodes.find((node): node is SourceElement => node.kind === 'element' && node.tagName === 'html');
      const head = shell?.children.find(node => node.tagName === 'head');
      const body = shell?.children.find(node => node.tagName === 'body');
      const settings = readHTMLDocumentPageSettings(body);
      pageSettings = settings.pageSettings;
      htmlSourceEnvelope = readHTMLDocumentEnvelope(body);
      if (settings.invalid) reportOnce(context, {
        code: 'invalid-page-settings', message: 'Invalid or oversized Fountain body page-settings metadata was omitted; visible document content remains.',
      });
      if (!body || head?.children.length || [shell, head, body].some(node => node && htmlparser2Adapter.getAttrList(node.raw).length)) {
        reportOnce(context, {
          code: 'document-shell-omitted',
          message: 'The HTML document body and valid Fountain page settings were imported. Head metadata, stylesheets, other document-shell attributes and non-body framesets are not preserved; external resources are not fetched.',
        });
      }
      root = body ?? { childNodes: [], textContent: '' };
    }
    const blocks = blockChildren(root, schema, context);
    if (!blocks.length && root.textContent) {
      blocks.push(schema.node('paragraph', {}, [schema.text(root.textContent)]));
    }
    blocks.forEach(node => schema.validate(node));
    reportCommentLoss(blocks, context);
    return Object.freeze({ nodes: Object.freeze(blocks), issues: Object.freeze([...issues]), ...(pageSettings ? { pageSettings } : {}), ...(htmlSourceEnvelope ? { htmlSourceEnvelope } : {}) });
  }

  static parseFragment(html: string, schema: Schema, options: ServerHTMLImporterOptions = {}): readonly FountainNode[] {
    return new ServerHTMLImporter(options).parseFragment(html, schema);
  }

  static parseFragmentWithReport(
    html: string,
    schema: Schema,
    options: ServerHTMLImporterOptions = {},
  ): ServerHTMLFragmentImportResult {
    return new ServerHTMLImporter(options).parseFragmentWithReport(html, schema);
  }

  static parse(html: string, schema: Schema, options: ServerHTMLImporterOptions = {}): FountainNode {
    return new ServerHTMLImporter(options).parse(html, schema);
  }

  static parseWithReport(
    html: string,
    schema: Schema,
    options: ServerHTMLImporterOptions = {},
  ): ServerHTMLImportResult {
    return new ServerHTMLImporter(options).parseWithReport(html, schema);
  }
}
import { readHTMLDocumentEnvelope, type HTMLDocumentEnvelope } from '../core/html-document-envelope';
