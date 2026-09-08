import {
  Mark,
  Node as FountainNode,
  type Attributes,
  type DOMParseRule,
  type HTMLParseRule,
  type MarkType,
  type NodeType,
  type Schema,
} from '../schema';
import { matchesContentExpression } from '../schema/content-expression';
import { isSafeURL } from '../url';
import { htmlTableSpan, orderedHTMLTableRows, remainingHTMLTableRows } from './html-table';
import { htmlOrderedListStart } from './html-list';
import { importDefinitionList } from './html-definition-list';

const HAS_EMOJI = /\p{Extended_Pictographic}/u;

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
    try { result.push(schema.node('emoji', { name: unicodeEmojiName(segment), emoji: segment }, [], undefined, marks)); }
    catch { result.push(schema.text(segment, marks)); }
  });
  flush();
  return result;
}

type BrowserParseRule = DOMParseRule | HTMLParseRule;

function parseRules(spec: { parseHTML?: readonly HTMLParseRule[]; parseDOM?: readonly DOMParseRule[] }): BrowserParseRule[] {
  return [...(spec.parseHTML ?? []), ...(spec.parseDOM ?? [])];
}

function parseRulePriority(rule: BrowserParseRule): number {
  return Number.isFinite(rule.priority) ? Number(rule.priority) : 50;
}

function matchesRule(element: Element, rule: BrowserParseRule): boolean {
  try { return Boolean(rule.tag) && element.matches(rule.tag); }
  catch { return false; }
}

function attrsFromRule(element: HTMLElement, rule: BrowserParseRule): Attributes | false {
  try {
    const getAttrs = rule.getAttrs as ((candidate: HTMLElement) => Attributes | null | false) | undefined;
    const value = getAttrs?.(element) ?? {};
    if (value === false) return false;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null ? value : false;
  } catch { return false; }
}

function ruleContentElement(element: HTMLElement, rule: BrowserParseRule): HTMLElement | null {
  if (!rule.contentElement) return element;
  try { return element.querySelector<HTMLElement>(rule.contentElement); }
  catch { return null; }
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

function configuredMarks(element: HTMLElement, schema: Schema): Mark[] {
  const matches: Array<{ type: MarkType; rule: BrowserParseRule; order: number }> = [];
  Object.values(schema.marks).forEach((type, order) => {
    parseRules(type.spec).forEach((rule) => {
      if (matchesRule(element, rule)) matches.push({ type, rule, order });
    });
  });
  matches.sort((left, right) => parseRulePriority(right.rule) - parseRulePriority(left.rule) || left.order - right.order);
  const result: Mark[] = [];
  matches.forEach(({ type, rule }) => {
    if (result.some((mark) => mark.type === type)) return;
    const attrs = attrsFromRule(element, rule);
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
  element: HTMLElement,
  schema: Schema,
  inline: boolean,
  inheritedMarks: readonly Mark[] = [],
): FountainNode | null {
  const matches: Array<{ type: NodeType; rule: BrowserParseRule; order: number }> = [];
  Object.values(schema.nodes).forEach((type, order) => {
    if (type.name === 'doc' || type.name === 'text' || type.isInline !== inline) return;
    parseRules(type.spec).forEach((rule) => {
      if (matchesRule(element, rule)) matches.push({ type, rule, order });
    });
  });
  matches.sort((left, right) => parseRulePriority(right.rule) - parseRulePriority(left.rule) || left.order - right.order);

  for (const { type, rule } of matches) {
    const attrs = attrsFromRule(element, rule);
    const contentRoot = ruleContentElement(element, rule);
    if (attrs === false || !contentRoot) continue;
    const expression = type.spec.content;
    const candidates: FountainNode[][] = type.spec.atom || !expression
      ? [[]]
      : [
          inlineChildren(contentRoot, schema, inheritedMarks),
          blockChildren(contentRoot, schema),
        ];
    for (const content of candidates) {
      if (expression && !matchesContentExpression(content, expression)) continue;
      try {
        const node = type.create(attrs, content, undefined, inheritedMarks);
        schema.validate(node);
        return node;
      } catch { /* Try the next content shape or parse rule. */ }
    }
  }
  return null;
}

function directChild(element: Element, tagName: string): HTMLElement | null {
  return Array.from(element.children).find((child): child is HTMLElement => (
    child instanceof HTMLElement && child.tagName.toLowerCase() === tagName
  )) ?? null;
}

/**
 * Ruby accepts both WHATWG shapes used in the wild:
 * `<ruby><rb>base</rb><rt>reading</rt></ruby>` and
 * `<ruby>base<rt>reading</rt></ruby>`. Presentation-only `<rp>` fallbacks are
 * never persisted. Malformed ruby degrades to its readable base content.
 */
function configuredRuby(
  element: HTMLElement,
  schema: Schema,
  inheritedMarks: readonly Mark[],
): FountainNode[] | null {
  const type = schema.nodes.ruby;
  if (!type || element.tagName.toLowerCase() !== 'ruby') return null;
  const annotationElement = directChild(element, 'rt');
  const annotation = annotationElement?.textContent?.trim() ?? '';
  const explicitBase = directChild(element, 'rb');
  let baseRoot: globalThis.Node;
  if (explicitBase) baseRoot = explicitBase;
  else {
    const fragment = element.ownerDocument.createElement('span');
    element.childNodes.forEach((child) => {
      if (child instanceof HTMLElement && ['rt', 'rp'].includes(child.tagName.toLowerCase())) return;
      fragment.appendChild(child.cloneNode(true));
    });
    baseRoot = fragment;
  }
  const base = inlineChildren(baseRoot, schema, inheritedMarks);
  if (!annotation || !base.length || base.some((node) => !node.isText)) return base;
  try {
    const ruby = type.create({ rt: annotation }, base);
    schema.validate(ruby);
    return [ruby];
  } catch { return base; }
}

function inlineChildren(parent: globalThis.Node, schema: Schema, marks: readonly Mark[] = []): FountainNode[] {
  const result: FountainNode[] = [];
  parent.childNodes.forEach((child) => {
    if (child.nodeType === globalThis.Node.TEXT_NODE) {
      if (child.textContent) result.push(...textNodes(child.textContent, schema, marks));
      return;
    }
    if (!(child instanceof HTMLElement)) return;
    const tag = child.tagName.toLowerCase();
    const ruby = configuredRuby(child, schema, marks);
    if (ruby) { result.push(...ruby); return; }
    const customNode = configuredNode(child, schema, true, marks);
    if (customNode) { result.push(customNode); return; }
    if (tag === 'br' && schema.nodes.hard_break) {
      result.push(schema.node('hard_break', {}, [], undefined, marks));
      return;
    }
    if (tag === 'img' && schema.nodes.inline_image) {
      const image = imageNode(child as HTMLImageElement, schema, 'inline_image', undefined, marks);
      if (image) result.push(image);
      return;
    }
    if (child.getAttribute('data-fountain-math') === 'inline' && schema.nodes.inline_math) {
      const latex = child.getAttribute('data-latex') ?? child.textContent ?? '';
      const ariaLabel = child.getAttribute('data-math-aria-label') ?? '';
      try { result.push(schema.node('inline_math', { latex, ariaLabel }, [], undefined, marks)); }
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
        }, [], undefined, marks));
      } catch { result.push(...textNodes(child.textContent ?? '', schema, marks)); }
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
        }, [], undefined, marks));
      } catch { result.push(...textNodes(emoji || child.textContent || '', schema, marks)); }
      return;
    }
    result.push(...inlineChildren(child, schema, elementMarks(child, schema, marks)));
  });
  if (!result.length && marks.length) result.push(schema.text('', marks));
  return result;
}

/** The same inline-format rules apply to a block and to an inline wrapper. */
function elementMarks(child: HTMLElement, schema: Schema, marks: readonly Mark[] = []): Mark[] {
    const tag = child.tagName.toLowerCase();
    const nextMarks: Mark[] = [];
    configuredMarks(child, schema).forEach((mark) => addMark(nextMarks, mark));
    const markName = ({ strong: 'strong', b: 'strong', em: 'em', i: 'em', u: 'underline', s: 'strike', del: 'strike', code: 'code', mark: 'highlight', sub: 'subscript', sup: 'superscript' } as Record<string, string>)[tag];
    if (markName === 'highlight') addSchemaMark(nextMarks, schema, markName, {
      color: colorValue(child.style.backgroundColor) ?? '#fff3a3',
    });
    else if (markName) addSchemaMark(nextMarks, schema, markName);
    const weight = child.style.fontWeight.toLowerCase();
    if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 500) addSchemaMark(nextMarks, schema, 'strong');
    if (child.style.fontStyle.toLowerCase() === 'italic') addSchemaMark(nextMarks, schema, 'em');
    const decoration = `${child.style.textDecoration} ${child.style.textDecorationLine}`.toLowerCase();
    if (decoration.includes('underline')) addSchemaMark(nextMarks, schema, 'underline');
    if (decoration.includes('line-through')) addSchemaMark(nextMarks, schema, 'strike');
    const color = colorValue(child.style.color);
    if (color) addSchemaMark(nextMarks, schema, 'text_color', { color });
    const background = colorValue(child.style.backgroundColor);
    if (background) addSchemaMark(nextMarks, schema, 'highlight', { color: background });
    if (tag === 'a' && schema.marks.link) {
      const href = child.getAttribute('href') ?? '';
      const anchor = child as HTMLAnchorElement;
      if (child.hasAttribute('href') && isSafeURL(href, { allowEmpty: true })) {
        addSchemaMark(nextMarks, schema, 'link', {
          href,
          title: anchor.title,
          target: anchor.target === '_self' ? '_self' : '_blank',
        });
      }
    }
    return [...marks.filter(mark => !nextMarks.some(local => local.type === mark.type)), ...nextMarks];
}

function imageSize(value: string, fallback: string): string {
  const normalized = value.trim();
  if (/^(?:auto|\d+(?:\.\d+)?(?:px|%|rem|em|vw|vh))$/.test(normalized)) return normalized;
  if (/^\d+(?:\.\d+)?$/.test(normalized) && Number(normalized) > 0) return `${normalized}px`;
  return fallback;
}

function imageNode(
  image: HTMLImageElement,
  schema: Schema,
  type: 'image_super' | 'inline_image',
  container?: HTMLElement,
  marks: readonly Mark[] = [],
): FountainNode | null {
  const src = image.getAttribute('src') ?? '';
  if (!isSafeURL(src, { allowDataImage: true }) || !schema.nodes[type]) return null;
  const block = type === 'image_super';
  const width = imageSize(
    container?.style.width || container?.style.maxWidth || image.style.width || image.getAttribute('width') || '',
    block ? '100%' : 'auto',
  );
  const height = imageSize(image.style.height || image.getAttribute('height') || '', block ? 'auto' : '1em');
  try {
    return schema.node(type, {
      src,
      alt: image.alt,
      title: image.title,
      width,
      height,
      align: ['left', 'center', 'right'].includes(container?.dataset.align ?? '') ? container?.dataset.align : 'center',
      srcset: image.getAttribute('srcset') ?? '',
      sizes: image.getAttribute('sizes') ?? '',
      loading: image.getAttribute('loading') === 'eager' ? 'eager' : 'lazy',
      decoding: ['auto', 'sync', 'async'].includes(image.getAttribute('decoding') ?? '') ? image.getAttribute('decoding') : 'async',
      ...(block ? { caption: container?.querySelector(':scope > figcaption')?.textContent ?? '' } : {}),
    }, [], undefined, marks);
  } catch { return null; }
}

function mediaTracks(element: HTMLMediaElement): readonly Record<string, unknown>[] {
  return Array.from(element.querySelectorAll(':scope > track')).flatMap((track) => {
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

function mediaSizeFromElement(element: HTMLElement, fallback: string): string {
  return imageSize(element.style.width || element.getAttribute('width') || '', fallback);
}

function playbackNode(
  element: HTMLMediaElement,
  schema: Schema,
  kind: 'audio' | 'video',
  container?: HTMLElement,
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
    preload: ['none', 'metadata', 'auto'].includes(element.getAttribute('preload') ?? '') ? element.getAttribute('preload') : 'metadata',
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

function fileNode(element: HTMLAnchorElement, schema: Schema, container?: HTMLElement): FountainNode | null {
  const src = element.getAttribute('href') ?? '';
  if (!schema.nodes.file_attachment || !isSafeURL(src)) return null;
  try {
    return schema.node('file_attachment', {
      src,
      name: element.dataset.name || element.textContent?.trim() || 'Download file',
      mimeType: element.dataset.mimeType ?? '',
      size: Math.max(0, Number(element.dataset.size) || 0),
      description: container?.querySelector(':scope > figcaption')?.textContent ?? '',
      downloadName: element.getAttribute('download') ?? '',
    });
  } catch { return null; }
}

function embedNode(element: HTMLIFrameElement, schema: Schema, container?: HTMLElement): FountainNode | null {
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

function alignment(element: Element): 'left' | 'center' | 'right' | 'justify' {
  const value = (element as HTMLElement).style.textAlign || element.getAttribute('align') || 'left';
  return ['left', 'center', 'right', 'justify'].includes(value) ? value as 'left' | 'center' | 'right' | 'justify' : 'left';
}

function paragraph(element: Element, schema: Schema): FountainNode {
  const content = inlineChildren(element, schema);
  return schema.node('paragraph', { align: alignment(element) }, content.length ? content : [schema.text('')]);
}

function tableCellWidths(cell: Element, colspan: number): number[] | null {
  const declared = (cell.getAttribute('data-colwidth') ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number);
  if (declared.length === colspan && declared.every((width) => Number.isInteger(width) && width >= 40 && width <= 2_000)) {
    return declared;
  }
  const styleWidth = Math.round(Number.parseFloat((cell as HTMLElement).style.width));
  if (colspan === 1 && Number.isInteger(styleWidth) && styleWidth >= 40 && styleWidth <= 2_000) return [styleWidth];
  return null;
}

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'dt', 'dd', 'fieldset',
  'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'img', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary',
  'table', 'ul', 'audio', 'video', 'iframe',
]);

function hasConfiguredBlockRule(element: HTMLElement, schema: Schema): boolean {
  return Object.values(schema.nodes).some((type) => type.isBlock && type.name !== 'doc'
    && parseRules(type.spec).some((rule) => matchesRule(element, rule)));
}

function hasStructuralContent(element: HTMLElement, schema: Schema): boolean {
  if (BLOCK_TAGS.has(element.tagName.toLowerCase()) || element.matches('a[data-fountain-file]') || hasConfiguredBlockRule(element, schema)) return true;
  // An explicit inline node owns its content, even if its HTML contains block
  // descendants (for example an application-defined atomic preview).
  if (Object.values(schema.nodes).some(type => type.isInline
    && parseRules(type.spec).some(rule => matchesRule(element, rule)))) return false;
  return [...element.children].some(child => child instanceof HTMLElement && hasStructuralContent(child, schema));
}

function blockChildren(element: HTMLElement, schema: Schema, inlineParagraphAttrs: Attributes = {}): FountainNode[] {
  const result: FountainNode[] = [];
  let inlineFragment = element.ownerDocument.createDocumentFragment();
  const flushInline = () => {
    const content = inlineChildren(inlineFragment, schema);
    const meaningful = content.some((node) => !node.isText || /[^\t\n\f\r ]/u.test(node.textContent) || node.marks.length);
    if (meaningful && schema.nodes.paragraph) result.push(schema.node('paragraph', inlineParagraphAttrs, content));
    inlineFragment = element.ownerDocument.createDocumentFragment();
  };
  element.childNodes.forEach((child) => {
    const structural = child instanceof HTMLElement && hasStructuralContent(child, schema);
    if (structural) {
      flushInline();
      result.push(...block(child as HTMLElement, schema));
    } else {
      inlineFragment.appendChild(child.cloneNode(true));
    }
  });
  flushInline();
  return inheritElementMarks(element, result, schema);
}

function listItemContent(element: Element, schema: Schema): FountainNode[] {
  const result: FountainNode[] = [];
  let inlineFragment = element.ownerDocument.createDocumentFragment();
  const flushInline = () => {
    const content = inlineChildren(inlineFragment, schema);
    const meaningful = content.some((node) => !node.isText || /[^\t\n\f\r ]/u.test(node.textContent) || node.marks.length);
    if (meaningful) result.push(schema.node('paragraph', {}, content));
    inlineFragment = element.ownerDocument.createDocumentFragment();
  };
  element.childNodes.forEach((child) => {
    if (child instanceof HTMLInputElement && child.type === 'checkbox') return;
    if (child instanceof HTMLElement && hasStructuralContent(child, schema)) {
      flushInline();
      result.push(...block(child, schema));
      return;
    }
    inlineFragment.appendChild(child.cloneNode(true));
  });
  flushInline();
  // A list item accepts block+, including a code block or heading first.
  // Only an actually empty item needs an editable paragraph fallback.
  if (!result.length) {
    result.unshift(schema.node('paragraph', {}, [schema.text('')]));
  }
  return inheritElementMarks(element, result, schema);
}

function block(element: Element, schema: Schema): FountainNode[] {
  return inheritElementMarks(element, projectBlock(element, schema), schema);
}

function inheritElementMarks(element: Element, nodes: FountainNode[], schema: Schema): FountainNode[] {
  const marks = element instanceof HTMLElement ? elementMarks(element, schema) : [];
  const inherit = (node: FountainNode): FountainNode => {
    const children = node.content.map(inherit);
    let result = children.some((child, index) => child !== node.content[index]) ? node.copy(children) : node;
    if (node.type.isInline) {
      const combined = [...marks.filter(mark => !node.marks.some(local => local.type === mark.type)), ...node.marks];
      if (combined.length !== node.marks.length || combined.some((mark, index) => !mark.eq(node.marks[index]))) result = result.withMarks(combined);
    }
    return result;
  };
  return marks.length ? nodes.map(inherit) : nodes;
}

function projectBlock(element: Element, schema: Schema): FountainNode[] {
  const tag = element.tagName.toLowerCase();
  const customNode = configuredNode(element as HTMLElement, schema, false);
  if (customNode) return [customNode];
  if (tag === 'dl') {
    const list = importDefinitionList(element as HTMLElement, schema, item => blockChildren(item, schema),
      item => configuredNode(item, schema, false));
    if (list) return [list];
  }
  if (element.getAttribute('data-fountain-math') === 'block' && schema.nodes.math_block) {
    const latex = element.getAttribute('data-latex') ?? element.textContent ?? '';
    const ariaLabel = element.getAttribute('data-math-aria-label') ?? '';
    try { return [schema.node('math_block', { latex, ariaLabel })]; }
    catch { return latex ? [schema.node('paragraph', {}, [schema.text(latex)])] : []; }
  }
  if (/^h[1-6]$/.test(tag)) return [schema.node('heading', { level: Number(tag[1]), align: alignment(element) }, inlineChildren(element, schema))];
  if (tag === 'p') return [paragraph(element, schema)];
  if (tag === 'blockquote') {
    const children = blockChildren(element as HTMLElement, schema);
    return [schema.node('blockquote', {}, children.length ? children : [paragraph(element, schema)])];
  }
  if (tag === 'pre') return [schema.node('code_block', {
    language: element.getAttribute('data-language') || directChild(element, 'code')?.className.match(/(?:^|\s)language-(\S+)(?=\s|$)/u)?.[1] || 'text',
    lineNumbers: true,
  }, [schema.text(element.textContent ?? '')])];
  if (tag === 'hr') return [schema.node('horizontal_rule')];
  if (tag === 'ul' || tag === 'ol') {
    const isTask = element.getAttribute('data-type') === 'task-list';
    const itemType = isTask ? 'task_item' : 'list_item';
    const items = Array.from(element.children).filter((child) => child.tagName.toLowerCase() === 'li').map((item) => {
      return schema.node(
        itemType,
        isTask ? { checked: item.getAttribute('data-checked') === 'true' || item.querySelector('input')?.checked === true } : {},
        listItemContent(item, schema),
      );
    });
    const listType = isTask ? 'task_list' : tag === 'ol' ? 'ordered_list' : 'bullet_list';
    const start = htmlOrderedListStart(element.getAttribute('start'));
    return [schema.node(listType, tag === 'ol' ? { start: start >= 0 ? start : 1 } : {}, items)];
  }
  if (tag === 'figure') {
    const mediaType = element.getAttribute('data-fountain-media');
    const selector = mediaType === 'audio' || mediaType === 'video' ? mediaType
      : mediaType === 'file' ? 'a[data-fountain-file]' : mediaType === 'embed' ? 'iframe' : 'img';
    const media = Array.from(element.children).filter(child => child.matches(selector));
    const captions = Array.from(element.children).filter(child => child.tagName.toLowerCase() === 'figcaption');
    const previews = mediaType === 'file' ? Array.from(element.children).filter(child => child.matches('img.fountain-file__preview')
      && child.getAttribute('src') === media[0]?.getAttribute('href')
      && child.getAttribute('alt') === `Preview of ${media[0]?.getAttribute('data-name')}`) : [];
    const fallback = () => blockChildren(element as HTMLElement, schema);
    // A media atom may consume only one media child and an optional plain
    // caption. Rich captions and other authored blocks must remain editable.
    if (media.length !== 1 || captions.length > 1 || previews.length > 1 || captions.some(caption => caption.children.length)
      || Array.from(element.childNodes).some(child => child.nodeType === 3 ? /[^\t\n\f\r ]/u.test(child.textContent ?? '') : child.nodeType === 1 && child !== media[0] && !captions.includes(child as Element) && !previews.includes(child as Element))) return fallback();
    if (mediaType === 'audio') {
      const media = element.querySelector<HTMLAudioElement>(':scope > audio');
      const node = media ? playbackNode(media, schema, 'audio', element as HTMLElement) : null;
      return node ? [node] : fallback();
    }
    if (mediaType === 'video') {
      const media = element.querySelector<HTMLVideoElement>(':scope > video');
      const node = media ? playbackNode(media, schema, 'video', element as HTMLElement) : null;
      return node ? [node] : fallback();
    }
    if (mediaType === 'file') {
      const link = element.querySelector<HTMLAnchorElement>(':scope > a[data-fountain-file]');
      const node = link ? fileNode(link, schema, element as HTMLElement) : null;
      return node ? [node] : fallback();
    }
    if (mediaType === 'embed') {
      const frame = element.querySelector<HTMLIFrameElement>(':scope > iframe');
      const node = frame ? embedNode(frame, schema, element as HTMLElement) : null;
      return node ? [node] : fallback();
    }
    const image = imageNode(media[0] as HTMLImageElement, schema, 'image_super', element as HTMLElement);
    return image ? [image] : fallback();
  }
  if (tag === 'table') {
    const captions = Array.from(element.querySelectorAll(':scope > caption')).flatMap(caption => {
      const blocks = blockChildren(caption as HTMLElement, schema);
      return blocks.length ? blocks : [paragraph(caption, schema)];
    });
    const sourceRows = Array.from(element.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr, :scope > tr'));
    const remaining = remainingHTMLTableRows(sourceRows, row => row.parentElement);
    const rows = orderedHTMLTableRows(sourceRows, row => row.parentElement?.tagName ?? '').map((row) => {
      const node = schema.node('table_row', {},
      Array.from(row.children).filter((cell) => /^(td|th)$/i.test(cell.tagName)).map((cell) => {
        const colspan = Math.max(1, Math.min(100, htmlTableSpan(cell.getAttribute('colspan')) ?? 1));
        const rowSpan = htmlTableSpan(cell.getAttribute('rowspan'));
        const rowspan = Math.max(1, Math.min(100, rowSpan === 0 ? remaining.get(row)! : rowSpan ?? 1));
        const content = blockChildren(cell as HTMLElement, schema, { align: alignment(cell) });
        return schema.node(
          cell.tagName.toLowerCase() === 'th' ? 'table_header' : 'table_cell',
          {
            colspan,
            rowspan,
            colwidth: tableCellWidths(cell, colspan),
            ...(cell.tagName.toLowerCase() === 'th' ? { scope: cell.getAttribute('scope') || 'col' } : {}),
          },
          content.length ? content : [paragraph(cell, schema)],
        );
      }),
      );
      const marked = inheritElementMarks(row, [node], schema);
      return row.parentElement && row.parentElement !== element ? inheritElementMarks(row.parentElement, marked, schema)[0] : marked[0];
    });
    return [...captions, ...rows.length ? [schema.node('table', {}, rows)] : []];
  }
  if (tag === 'img') {
    const image = imageNode(element as HTMLImageElement, schema, 'image_super');
    return image ? [image] : [];
  }
  if (tag === 'audio' || tag === 'video') {
    const media = playbackNode(element as HTMLMediaElement, schema, tag);
    return media ? [media] : [];
  }
  if (tag === 'a' && element.hasAttribute('data-fountain-file')) {
    const file = fileNode(element as HTMLAnchorElement, schema);
    return file ? [file] : [];
  }
  if (tag === 'iframe' && element.hasAttribute('data-fountain-embed')) {
    const embed = embedNode(element as HTMLIFrameElement, schema);
    return embed ? [embed] : [];
  }
  const nested = blockChildren(element as HTMLElement, schema);
  return nested.length ? nested : [paragraph(element, schema)];
}

export class HTMLImporter {
  parse(html: string, schema: Schema): FountainNode {
    if (typeof DOMParser === 'undefined') throw new Error('HTMLImporter requires a browser DOMParser (or a DOM shim in Node.js).');
    const body = new DOMParser().parseFromString(html, 'text/html').body;
    const blocks = blockChildren(body, schema);
    if (!blocks.length && body.textContent) blocks.push(schema.node('paragraph', {}, [schema.text(body.textContent)]));
    const document = schema.topNodeType.create({}, blocks.length ? blocks : [schema.node('paragraph', {}, [schema.text('')])]);
    schema.validate(document);
    return document;
  }

  static parse(html: string, schema: Schema): FountainNode { return new HTMLImporter().parse(html, schema); }
}
