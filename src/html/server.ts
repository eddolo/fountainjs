import { is as matchesSelector, selectAll } from 'css-select';
import { parseFragment, type ParserError } from 'parse5';
import {
  adapter as htmlparser2Adapter,
  type Htmlparser2TreeAdapterMap,
} from 'parse5-htmlparser2-tree-adapter';

import {
  Mark,
  Node as FountainNode,
  type Attributes,
  type DOMParseRule,
  type HTMLParseElement,
  type HTMLParseRule,
  type MarkType,
  type NodeType,
  type Schema,
} from '../core/schema';
import { matchesContentExpression } from '../core/schema/content-expression';
import { isSafeURL } from '../core/url';

type RawNode = Htmlparser2TreeAdapterMap['node'];
type RawParent = Htmlparser2TreeAdapterMap['parentNode'];
type RawElement = Htmlparser2TreeAdapterMap['element'];
type ParseRule = HTMLParseRule | DOMParseRule;

const HAS_EMOJI = /\p{Extended_Pictographic}/u;
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
  maxInputBytes?: number;
  maxNodes?: number;
  maxDepth?: number;
  maxAttributesPerElement?: number;
  maxAttributeValueLength?: number;
  maxParseErrors?: number;
}

export type ServerHTMLImportIssueCode =
  | 'html-parse-error'
  | 'invalid-selector'
  | 'unsupported-dom-rule';

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

export class HTMLImportLimitError extends RangeError {
  readonly limit: keyof Required<ServerHTMLImporterOptions>;

  constructor(limit: keyof Required<ServerHTMLImporterOptions>, message: string) {
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
  matches(selector: string): boolean;
  querySelector(selector: string): SourceElement | null;
  querySelectorAll(selector: string): readonly SourceElement[];
}

type SourceNode = SourceText | SourceElement;

interface ImportContext {
  readonly issues: ServerHTMLImportIssue[];
  readonly issueKeys: Set<string>;
}

function boundedOption(
  name: keyof Required<ServerHTMLImporterOptions>,
  supplied: number | undefined,
): number {
  const value = supplied ?? DEFAULT_LIMITS[name];
  if (!Number.isSafeInteger(value) || value < 1 || value > HARD_LIMITS[name]) {
    throw new RangeError(`${name} must be an integer between 1 and ${HARD_LIMITS[name]}.`);
  }
  return value;
}

function normalizeOptions(options: ServerHTMLImporterOptions): Required<ServerHTMLImporterOptions> {
  return {
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
  'font-style': 'fontStyle',
  'font-weight': 'fontWeight',
  height: 'height',
  'line-height': 'lineHeight',
  'max-width': 'maxWidth',
  'text-align': 'textAlign',
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

function wrapNode(node: RawNode): SourceNode | null {
  if (htmlparser2Adapter.isTextNode(node)) {
    return Object.freeze({ kind: 'text', textContent: htmlparser2Adapter.getTextNodeContent(node) });
  }
  return htmlparser2Adapter.isElementNode(node) ? new ServerElement(node) : null;
}

function wrapChildren(parent: RawParent): SourceNode[] {
  return htmlparser2Adapter.getChildNodes(parent).flatMap((node) => {
    const wrapped = wrapNode(node);
    return wrapped ? [wrapped] : [];
  });
}

class ServerElement implements SourceElement {
  readonly kind = 'element' as const;
  readonly raw: RawElement;
  readonly tagName: string;
  readonly style: Readonly<Record<string, string>>;
  readonly dataset: Readonly<Record<string, string | undefined>>;

  constructor(raw: RawElement) {
    this.raw = raw;
    this.tagName = htmlparser2Adapter.getTagName(raw).toLowerCase();
    this.style = parseStyle(this.getAttribute('style') ?? '');
    const dataset: Record<string, string> = Object.create(null) as Record<string, string>;
    htmlparser2Adapter.getAttrList(raw).forEach(({ name, value }) => {
      if (name.startsWith('data-')) dataset[camelCaseDataName(name.slice(5))] = value;
    });
    this.dataset = Object.freeze(dataset);
  }

  get childNodes(): readonly SourceNode[] { return wrapChildren(this.raw); }
  get children(): readonly SourceElement[] {
    return this.childNodes.filter((node): node is SourceElement => node.kind === 'element');
  }
  get textContent(): string { return rawText(this.raw); }

  getAttribute(name: string): string | null {
    const value = htmlparser2Adapter.getAttrList(this.raw)
      .find((attribute) => attribute.name.toLowerCase() === name.toLowerCase())?.value;
    return value ?? null;
  }

  hasAttribute(name: string): boolean { return this.getAttribute(name) !== null; }

  matches(selector: string): boolean { return matchesSelector<RawNode, RawElement>(this.raw, selector); }

  querySelector(selector: string): SourceElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): readonly SourceElement[] {
    return selectAll<RawNode, RawElement>(selector, this.raw.children, { context: this.raw })
      .map((element) => new ServerElement(element));
  }
}

function rootSource(parent: RawParent): SourceParent & { children: readonly SourceElement[] } {
  const childNodes = wrapChildren(parent);
  return Object.freeze({
    childNodes,
    children: childNodes.filter((node): node is SourceElement => node.kind === 'element'),
    textContent: rawText(parent as RawNode),
  });
}

function validateTree(parent: RawParent, limits: Required<ServerHTMLImporterOptions>): void {
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

function unicodeEmojiName(value: string): string {
  return `unicode-${Array.from(value).map((character) => character.codePointAt(0)?.toString(16)).join('-')}`;
}

function textNodes(value: string, schema: Schema, marks: readonly Mark[]): FountainNode[] {
  if (!value || !schema.nodes.emoji || !HAS_EMOJI.test(value)) return value ? [schema.text(value, marks)] : [];
  const segments = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value), (part) => part.segment)
    : Array.from(value);
  const result: FountainNode[] = [];
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
  return result;
}

function parseRulePriority(rule: ParseRule): number {
  return Number.isFinite(rule.priority) ? Number(rule.priority) : 50;
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
  try {
    const getAttrs = portable
      ? (rule.getAttrs as ((candidate: HTMLParseElement) => Attributes | null | false) | undefined)
      : undefined;
    const value = getAttrs?.(element) ?? {};
    if (value === false || !value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null ? value : false;
  } catch { return false; }
}

function configuredRules(
  spec: { parseHTML?: readonly HTMLParseRule[]; parseDOM?: readonly DOMParseRule[] },
): Array<{ rule: ParseRule; portable: boolean }> {
  return [
    ...(spec.parseHTML ?? []).map((rule) => ({ rule, portable: true })),
    ...(spec.parseDOM ?? []).map((rule) => ({ rule, portable: false })),
  ];
}

function ruleContentElement(
  element: SourceElement,
  rule: ParseRule,
  contribution: string,
  context: ImportContext,
): SourceElement | null {
  if (!rule.contentElement) return element;
  try { return element.querySelector(rule.contentElement); }
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

function addMark(marks: Mark[], mark: Mark): void {
  if (!marks.some((candidate) => candidate.type === mark.type)) marks.push(mark);
}

function addSchemaMark(marks: Mark[], schema: Schema, name: string, attrs: Attributes = {}): void {
  const type = schema.marks[name];
  if (!type || marks.some((mark) => mark.type === type)) return;
  try { marks.push(type.create(attrs)); }
  catch { /* Invalid imported attributes leave the content unmarked. */ }
}

function configuredMarks(element: SourceElement, schema: Schema, context: ImportContext): Mark[] {
  const matches: Array<{
    type: MarkType;
    rule: ParseRule;
    portable: boolean;
    order: number;
  }> = [];
  Object.values(schema.marks).forEach((type, order) => {
    configuredRules(type.spec).forEach(({ rule, portable }) => {
      if (matchingRule(element, rule, `mark:${type.name}`, context)) matches.push({ type, rule, portable, order });
    });
  });
  matches.sort((left, right) => parseRulePriority(right.rule) - parseRulePriority(left.rule) || left.order - right.order);
  const result: Mark[] = [];
  matches.forEach(({ type, rule, portable }) => {
    if (result.some((mark) => mark.type === type)) return;
    const attrs = attrsFromRule(element, rule, portable, `mark:${type.name}`, context);
    if (attrs === false) return;
    try { result.push(type.create(attrs)); }
    catch { /* Invalid extension attributes decline this rule. */ }
  });
  return result;
}

function colorValue(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(normalized)?.[1];
  if (hex) return `#${hex.length === 3 ? Array.from(hex, (part) => `${part}${part}`).join('') : hex}`;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*(?:1(?:\.0+)?|100%))?\s*\)$/i.exec(normalized);
  if (!rgb) return null;
  const values = rgb.slice(1, 4).map(Number);
  if (values.some((part) => part < 0 || part > 255)) return null;
  return `#${values.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function configuredNode(
  element: SourceElement,
  schema: Schema,
  inline: boolean,
  inheritedMarks: readonly Mark[],
  context: ImportContext,
): FountainNode | null {
  const matches: Array<{
    type: NodeType;
    rule: ParseRule;
    portable: boolean;
    order: number;
  }> = [];
  Object.values(schema.nodes).forEach((type, order) => {
    if (type.name === 'doc' || type.name === 'text' || type.isInline !== inline) return;
    configuredRules(type.spec).forEach(({ rule, portable }) => {
      if (matchingRule(element, rule, `node:${type.name}`, context)) matches.push({ type, rule, portable, order });
    });
  });
  matches.sort((left, right) => parseRulePriority(right.rule) - parseRulePriority(left.rule) || left.order - right.order);

  for (const { type, rule, portable } of matches) {
    const contribution = `node:${type.name}`;
    const attrs = attrsFromRule(element, rule, portable, contribution, context);
    const contentRoot = ruleContentElement(element, rule, contribution, context);
    if (attrs === false || !contentRoot) continue;
    const expression = type.spec.content;
    const candidates: FountainNode[][] = type.spec.atom || !expression
      ? [[]]
      : [
          inlineChildren(contentRoot, schema, inheritedMarks, context),
          blockChildren(contentRoot, schema, context),
        ];
    for (const content of candidates) {
      if (expression && !matchesContentExpression(content, expression)) continue;
      try {
        const node = type.create(attrs, content);
        schema.validate(node);
        return node;
      } catch { /* Try the next content shape or parse rule. */ }
    }
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
  const base = inlineChildren(baseRoot, schema, inheritedMarks, context);
  if (!annotation || !base.length || base.some((node) => !node.isText)) return base;
  try {
    const ruby = type.create({ rt: annotation }, base);
    schema.validate(ruby);
    return [ruby];
  } catch { return base; }
}

function inlineChildren(
  parent: SourceParent,
  schema: Schema,
  marks: readonly Mark[] = [],
  context: ImportContext,
): FountainNode[] {
  const result: FountainNode[] = [];
  parent.childNodes.forEach((child) => {
    if (child.kind === 'text') {
      if (child.textContent) result.push(...textNodes(child.textContent, schema, marks));
      return;
    }
    const tag = child.tagName;
    const ruby = configuredRuby(child, schema, marks, context);
    if (ruby) { result.push(...ruby); return; }
    const customNode = configuredNode(child, schema, true, marks, context);
    if (customNode) { result.push(customNode); return; }
    if (tag === 'br' && schema.nodes.hard_break) { result.push(schema.node('hard_break')); return; }
    if (tag === 'img' && schema.nodes.inline_image) {
      const image = imageNode(child, schema, 'inline_image');
      if (image) result.push(image);
      return;
    }
    if (child.getAttribute('data-fountain-math') === 'inline' && schema.nodes.inline_math) {
      const latex = child.getAttribute('data-latex') ?? child.textContent;
      const ariaLabel = child.getAttribute('data-math-aria-label') ?? '';
      try { result.push(schema.node('inline_math', { latex, ariaLabel })); }
      catch { if (latex) result.push(schema.text(latex, marks)); }
      return;
    }
    if (child.hasAttribute('data-fountain-mention') && schema.nodes.mention) {
      const id = child.getAttribute('data-id') ?? '';
      const href = child.getAttribute('href') ?? '';
      try {
        result.push(schema.node('mention', {
          id,
          label: child.getAttribute('data-label') ?? '',
          trigger: child.getAttribute('data-trigger') ?? '@',
          kind: child.getAttribute('data-kind') ?? 'mention',
          href: href && isSafeURL(href) ? href : '',
        }));
      } catch { result.push(...textNodes(child.textContent, schema, marks)); }
      return;
    }
    if (child.hasAttribute('data-fountain-emoji') && schema.nodes.emoji) {
      const emoji = child.getAttribute('data-emoji') ?? '';
      const fallback = child.getAttribute('data-fallback-image')
        ?? child.querySelector('img')?.getAttribute('src')
        ?? '';
      try {
        result.push(schema.node('emoji', {
          name: child.getAttribute('data-name') ?? unicodeEmojiName(emoji),
          emoji,
          fallbackImage: fallback && isSafeURL(fallback, { allowDataImage: true }) ? fallback : '',
        }));
      } catch { result.push(...textNodes(emoji || child.textContent, schema, marks)); }
      return;
    }
    const nextMarks = [...marks];
    configuredMarks(child, schema, context).forEach((mark) => addMark(nextMarks, mark));
    const markName = ({
      strong: 'strong', b: 'strong', em: 'em', i: 'em', u: 'underline', s: 'strike',
      del: 'strike', code: 'code', mark: 'highlight', sub: 'subscript', sup: 'superscript',
    } as Record<string, string>)[tag];
    if (markName === 'highlight') addSchemaMark(nextMarks, schema, markName, {
      color: colorValue(child.style.backgroundColor ?? '') ?? '#fff3a3',
    });
    else if (markName) addSchemaMark(nextMarks, schema, markName);
    const weight = (child.style.fontWeight ?? '').toLowerCase();
    if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 500) addSchemaMark(nextMarks, schema, 'strong');
    if ((child.style.fontStyle ?? '').toLowerCase() === 'italic') addSchemaMark(nextMarks, schema, 'em');
    const decoration = `${child.style.textDecoration ?? ''} ${child.style.textDecorationLine ?? ''}`.toLowerCase();
    if (decoration.includes('underline')) addSchemaMark(nextMarks, schema, 'underline');
    if (decoration.includes('line-through')) addSchemaMark(nextMarks, schema, 'strike');
    const color = colorValue(child.style.color ?? '');
    if (color) addSchemaMark(nextMarks, schema, 'text_color', { color });
    const background = colorValue(child.style.backgroundColor ?? '');
    if (background) addSchemaMark(nextMarks, schema, 'highlight', { color: background });
    if (tag === 'a' && schema.marks.link) {
      const href = child.getAttribute('href') ?? '';
      if (isSafeURL(href)) addSchemaMark(nextMarks, schema, 'link', {
        href,
        title: child.getAttribute('title') ?? '',
        target: child.getAttribute('target') === '_self' ? '_self' : '_blank',
      });
    }
    result.push(...inlineChildren(child, schema, nextMarks, context));
  });
  return result;
}

function imageSize(value: string, fallback: string): string {
  const normalized = value.trim();
  if (/^(?:auto|\d+(?:\.\d+)?(?:px|%|rem|em|vw|vh))$/.test(normalized)) return normalized;
  if (/^\d+(?:\.\d+)?$/.test(normalized) && Number(normalized) > 0) return `${normalized}px`;
  return fallback;
}

function imageNode(
  image: SourceElement,
  schema: Schema,
  type: 'image_super' | 'inline_image',
  container?: SourceElement,
): FountainNode | null {
  const src = image.getAttribute('src') ?? '';
  if (!isSafeURL(src, { allowDataImage: true }) || !schema.nodes[type]) return null;
  const blockImage = type === 'image_super';
  const width = imageSize(
    container?.style.width
      || container?.style.maxWidth
      || image.style.width
      || image.getAttribute('width')
      || '',
    blockImage ? '100%' : 'auto',
  );
  const height = imageSize(image.style.height || image.getAttribute('height') || '', blockImage ? 'auto' : '1em');
  try {
    return schema.node(type, {
      src,
      alt: image.getAttribute('alt') ?? '',
      title: image.getAttribute('title') ?? '',
      width,
      height,
      align: ['left', 'center', 'right'].includes(container?.dataset.align ?? '') ? container?.dataset.align : 'center',
      srcset: image.getAttribute('srcset') ?? '',
      sizes: image.getAttribute('sizes') ?? '',
      loading: image.getAttribute('loading') === 'eager' ? 'eager' : 'lazy',
      decoding: ['auto', 'sync', 'async'].includes(image.getAttribute('decoding') ?? '')
        ? image.getAttribute('decoding')
        : 'async',
      ...(blockImage ? { caption: container?.querySelector(':scope > figcaption')?.textContent ?? '' } : {}),
    });
  } catch { return null; }
}

function mediaTracks(element: SourceElement): readonly Record<string, unknown>[] {
  return element.querySelectorAll(':scope > track').flatMap((track) => {
    const src = track.getAttribute('src') ?? '';
    const kind = track.getAttribute('kind') ?? '';
    if (!isSafeURL(src) || !['subtitles', 'captions', 'descriptions', 'chapters', 'metadata'].includes(kind)) return [];
    return [{
      src,
      kind,
      srclang: track.getAttribute('srclang') ?? '',
      label: track.getAttribute('label') ?? '',
      default: track.hasAttribute('default'),
    }];
  });
}

function mediaSizeFromElement(element: SourceElement, fallback: string): string {
  return imageSize(element.style.width || element.getAttribute('width') || '', fallback);
}

function playbackNode(
  element: SourceElement,
  schema: Schema,
  kind: 'audio' | 'video',
  container?: SourceElement,
): FountainNode | null {
  const type = schema.nodes[kind];
  const src = element.getAttribute('src') ?? element.querySelector('source')?.getAttribute('src') ?? '';
  if (!type || !isSafeURL(src)) return null;
  const crossOrigin = element.getAttribute('crossorigin') ?? '';
  const common = {
    src,
    title: element.getAttribute('title') ?? '',
    caption: container?.querySelector(':scope > figcaption')?.textContent ?? '',
    controls: element.hasAttribute('controls'),
    autoplay: element.hasAttribute('autoplay'),
    loop: element.hasAttribute('loop'),
    muted: element.hasAttribute('muted'),
    preload: ['none', 'metadata', 'auto'].includes(element.getAttribute('preload') ?? '')
      ? element.getAttribute('preload')
      : 'metadata',
    controlsList: element.getAttribute('controlslist') ?? '',
    crossOrigin: ['', 'anonymous', 'use-credentials'].includes(crossOrigin) ? crossOrigin : '',
    disableRemotePlayback: element.hasAttribute('disableremoteplayback'),
    tracks: mediaTracks(element),
  };
  try {
    return type.create(kind === 'video' ? {
      ...common,
      poster: element.getAttribute('poster') ?? '',
      width: mediaSizeFromElement(container ?? element, '100%'),
      height: imageSize(element.style.height || element.getAttribute('height') || '', 'auto'),
      align: ['left', 'center', 'right'].includes(container?.dataset.align ?? '') ? container?.dataset.align : 'center',
      playsInline: element.hasAttribute('playsinline'),
    } : common);
  } catch { return null; }
}

function fileNode(element: SourceElement, schema: Schema, container?: SourceElement): FountainNode | null {
  const src = element.getAttribute('href') ?? '';
  if (!schema.nodes.file_attachment || !isSafeURL(src)) return null;
  try {
    return schema.node('file_attachment', {
      src,
      name: element.dataset.name || element.textContent.trim() || 'Download file',
      mimeType: element.dataset.mimeType ?? '',
      size: Math.max(0, Number(element.dataset.size) || 0),
      description: container?.querySelector(':scope > figcaption')?.textContent ?? '',
      downloadName: element.getAttribute('download') ?? '',
    });
  } catch { return null; }
}

function embedNode(element: SourceElement, schema: Schema, container?: SourceElement): FountainNode | null {
  const src = element.getAttribute('src') ?? '';
  if (!schema.nodes.embed || !isSafeURL(src)) return null;
  try {
    return schema.node('embed', {
      src,
      provider: container?.dataset.provider ?? '',
      title: element.getAttribute('title')?.trim() || 'Embedded content',
      caption: container?.querySelector(':scope > figcaption')?.textContent ?? '',
      width: mediaSizeFromElement(container ?? element, '100%'),
      height: imageSize(element.style.height || element.getAttribute('height') || '', '360px'),
      align: ['left', 'center', 'right'].includes(container?.dataset.align ?? '') ? container?.dataset.align : 'center',
      allow: element.getAttribute('allow') ?? '',
      sandbox: element.getAttribute('sandbox') ?? '',
      allowFullscreen: element.hasAttribute('allowfullscreen'),
    });
  } catch { return null; }
}

function alignment(element: SourceElement): 'left' | 'center' | 'right' | 'justify' {
  const value = element.style.textAlign || element.getAttribute('align') || 'left';
  return ['left', 'center', 'right', 'justify'].includes(value)
    ? value as 'left' | 'center' | 'right' | 'justify'
    : 'left';
}

function paragraph(element: SourceElement, schema: Schema, context: ImportContext): FountainNode {
  const content = inlineChildren(element, schema, [], context);
  return schema.node('paragraph', { align: alignment(element) }, content.length ? content : [schema.text('')]);
}

function tableCellWidths(cell: SourceElement, colspan: number): number[] | null {
  const declared = (cell.getAttribute('data-colwidth') ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number);
  if (declared.length === colspan && declared.every((width) => Number.isInteger(width) && width >= 40 && width <= 2_000)) {
    return declared;
  }
  const styleWidth = Math.round(Number.parseFloat(cell.style.width ?? ''));
  if (colspan === 1 && Number.isInteger(styleWidth) && styleWidth >= 40 && styleWidth <= 2_000) return [styleWidth];
  return null;
}

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset',
  'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'img', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary',
  'table', 'ul', 'audio', 'video', 'iframe',
]);

function hasConfiguredBlockRule(element: SourceElement, schema: Schema, context: ImportContext): boolean {
  return Object.values(schema.nodes).some((type) => type.isBlock && type.name !== 'doc'
    && configuredRules(type.spec).some(({ rule }) => matchingRule(element, rule, `node:${type.name}`, context)));
}

function inlineGroup(content: readonly SourceNode[]): SourceParent {
  return { childNodes: content, textContent: content.map((node) => node.textContent).join('') };
}

function blockChildren(element: SourceElement, schema: Schema, context: ImportContext): FountainNode[] {
  const result: FountainNode[] = [];
  let pending: SourceNode[] = [];
  const flushInline = () => {
    const content = inlineChildren(inlineGroup(pending), schema, [], context);
    const meaningful = content.some((node) => !node.isText || node.textContent.trim().length > 0);
    if (meaningful && schema.nodes.paragraph) result.push(schema.node('paragraph', {}, content));
    pending = [];
  };
  element.childNodes.forEach((child) => {
    const structural = child.kind === 'element'
      && (BLOCK_TAGS.has(child.tagName) || hasConfiguredBlockRule(child, schema, context));
    if (structural) {
      flushInline();
      result.push(...block(child, schema, context));
    } else pending.push(child);
  });
  flushInline();
  return result;
}

function listItemContent(element: SourceElement, schema: Schema, context: ImportContext): FountainNode[] {
  const result: FountainNode[] = [];
  let pending: SourceNode[] = [];
  const flushInline = () => {
    const content = inlineChildren(inlineGroup(pending), schema, [], context);
    const meaningful = content.some((node) => !node.isText || node.textContent.trim().length > 0);
    if (meaningful) result.push(schema.node('paragraph', {}, content));
    pending = [];
  };
  element.childNodes.forEach((child) => {
    if (child.kind === 'element' && child.tagName === 'input' && child.getAttribute('type') === 'checkbox') return;
    if (child.kind === 'element' && (BLOCK_TAGS.has(child.tagName) || hasConfiguredBlockRule(child, schema, context))) {
      flushInline();
      result.push(...block(child, schema, context));
      return;
    }
    pending.push(child);
  });
  flushInline();
  if (!result.length || result[0]?.type.name !== 'paragraph') {
    result.unshift(schema.node('paragraph', {}, [schema.text('')]));
  }
  return result;
}

function block(element: SourceElement, schema: Schema, context: ImportContext): FountainNode[] {
  const tag = element.tagName;
  const customNode = configuredNode(element, schema, false, [], context);
  if (customNode) return [customNode];
  if (element.getAttribute('data-fountain-math') === 'block' && schema.nodes.math_block) {
    const latex = element.getAttribute('data-latex') ?? element.textContent;
    const ariaLabel = element.getAttribute('data-math-aria-label') ?? '';
    try { return [schema.node('math_block', { latex, ariaLabel })]; }
    catch { return latex ? [schema.node('paragraph', {}, [schema.text(latex)])] : []; }
  }
  if (/^h[1-6]$/.test(tag)) {
    return [schema.node('heading', { level: Number(tag[1]), align: alignment(element) }, inlineChildren(element, schema, [], context))];
  }
  if (tag === 'p') return [paragraph(element, schema, context)];
  if (tag === 'blockquote') {
    const children = blockChildren(element, schema, context);
    return [schema.node('blockquote', {}, children.length ? children : [paragraph(element, schema, context)])];
  }
  if (tag === 'pre') {
    const codeClass = element.querySelector('code')?.getAttribute('class') ?? '';
    return [schema.node('code_block', {
      language: element.getAttribute('data-language') || codeClass.match(/language-([\w-]+)/)?.[1] || 'text',
      lineNumbers: true,
    }, [schema.text(element.textContent)])];
  }
  if (tag === 'hr') return [schema.node('horizontal_rule')];
  if (tag === 'ul' || tag === 'ol') {
    const isTask = element.getAttribute('data-type') === 'task-list';
    const itemType = isTask ? 'task_item' : 'list_item';
    const items = element.children.filter((child) => child.tagName === 'li').map((item) => schema.node(
      itemType,
      isTask ? {
        checked: item.getAttribute('data-checked') === 'true'
          || item.querySelector('input')?.hasAttribute('checked') === true,
      } : {},
      listItemContent(item, schema, context),
    ));
    const listType = isTask ? 'task_list' : tag === 'ol' ? 'ordered_list' : 'bullet_list';
    return [schema.node(listType, tag === 'ol' ? { start: Number(element.getAttribute('start')) || 1 } : {}, items)];
  }
  if (tag === 'figure') {
    const mediaType = element.getAttribute('data-fountain-media');
    if (mediaType === 'audio') {
      const media = element.querySelector(':scope > audio');
      const node = media ? playbackNode(media, schema, 'audio', element) : null;
      return node ? [node] : [];
    }
    if (mediaType === 'video') {
      const media = element.querySelector(':scope > video');
      const node = media ? playbackNode(media, schema, 'video', element) : null;
      return node ? [node] : [];
    }
    if (mediaType === 'file') {
      const link = element.querySelector(':scope > a[data-fountain-file]');
      const node = link ? fileNode(link, schema, element) : null;
      return node ? [node] : [];
    }
    if (mediaType === 'embed') {
      const frame = element.querySelector(':scope > iframe');
      const node = frame ? embedNode(frame, schema, element) : null;
      return node ? [node] : [];
    }
    const images = element.querySelectorAll(':scope > img');
    if (images.length !== 1) {
      return element.querySelectorAll('img')
        .map((candidate) => imageNode(candidate, schema, 'image_super'))
        .filter((candidate): candidate is FountainNode => Boolean(candidate));
    }
    const image = imageNode(images[0] as SourceElement, schema, 'image_super', element);
    return image ? [image] : [];
  }
  if (tag === 'table') {
    const rows = element.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr').map((row) => schema.node(
      'table_row',
      {},
      row.children.filter((cell) => /^(td|th)$/i.test(cell.tagName)).map((cell) => {
        const colspan = Math.max(1, Math.min(100, Number(cell.getAttribute('colspan')) || 1));
        const rowspan = Math.max(1, Math.min(100, Number(cell.getAttribute('rowspan')) || 1));
        return schema.node(
          cell.tagName === 'th' ? 'table_header' : 'table_cell',
          {
            colspan,
            rowspan,
            colwidth: tableCellWidths(cell, colspan),
            ...(cell.tagName === 'th' ? { scope: cell.getAttribute('scope') || 'col' } : {}),
          },
          [paragraph(cell, schema, context)],
        );
      }),
    ));
    return rows.length ? [schema.node('table', {}, rows)] : [];
  }
  if (tag === 'img') {
    const image = imageNode(element, schema, 'image_super');
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

  parseWithReport(html: string, schema: Schema): ServerHTMLImportResult {
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
    const fragment = parseFragment<Htmlparser2TreeAdapterMap>(html, {
      treeAdapter: htmlparser2Adapter,
      onParseError: (error) => {
        if (issues.filter((issue) => issue.code === 'html-parse-error').length < this.options.maxParseErrors) {
          issues.push(parseErrorIssue(error));
        }
      },
    });
    validateTree(fragment, this.options);
    const root = rootSource(fragment);
    const blocks = root.children.flatMap((element) => block(element, schema, context));
    if (!blocks.length && root.textContent) {
      blocks.push(schema.node('paragraph', {}, [schema.text(root.textContent)]));
    }
    const document = schema.topNodeType.create(
      {},
      blocks.length ? blocks : [schema.node('paragraph', {}, [schema.text('')])],
    );
    schema.validate(document);
    return Object.freeze({ document, issues: Object.freeze([...issues]) });
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
