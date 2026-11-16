import { readListLayout } from '../list-layout';
import {
  Mark,
  Node as FountainNode,
  type Attributes,
  type Schema,
} from '../schema';
import { textNodes, explicitHTMLEmphasis, mergeHTMLBlockMarks, mergeHTMLMarks, relativeHTMLContent, projectHTMLFormatting, projectHTMLLink } from './html-marks';
import { projectHTMLInlineAtom, projectHTMLMath } from './html-inline-atoms';
import { embedNode, fileNode, playbackNode, projectImage, projectMediaFigure } from './html-media';
import { importHTMLComment } from '../html-comment';
import { importHTMLAnonymousFlow, restoreHTMLFlowCaret } from '../html-flow';
import { readExplicitEmphasis, readExplicitQuoteAppearance } from '../explicit-emphasis';
import { readParagraphLayout } from '../paragraph-layout';
import { preformattedContent } from './html-preformatted';
import { readTextAlignmentAttributes, readTextDirection, readContainerDirection } from '../text-direction';
import { projectHTMLTable } from './html-table';
import { htmlOrderedListStart } from './html-list';
import { importDefinitionList } from './html-definition-list';
import { readHTMLDocumentPageSettings } from './html-page-settings';
import { HTML_BLOCK_TAGS, createHTMLRuleNode, hasHTMLRule, matchingHTMLRules, projectHTMLRuby, readHTMLRuleAttributes, type HTMLImportRule } from './html-rules';

function matchesRule(element: Element, rule: HTMLImportRule): boolean {
  try { return Boolean(rule.tag) && element.matches(rule.tag); }
  catch { return false; }
}

function ruleContentElement(element: HTMLElement, rule: HTMLImportRule): HTMLElement | null {
  if (!rule.contentElement) return element;
  try { return element.querySelector<HTMLElement>(rule.contentElement); }
  catch { return null; }
}

function configuredMarks(element: HTMLElement, schema: Schema): Mark[] {
  const matches = matchingHTMLRules(schema.marks, rule => matchesRule(element, rule));
  const result: Mark[] = [];
  matches.forEach(({ type, rule }) => {
    if (result.some((mark) => mark.type === type)) return;
    const attrs = readHTMLRuleAttributes(element, rule);
    if (attrs === false) return;
    try { result.push(type.create(attrs)); }
    catch { /* Invalid extension attributes decline this rule. */ }
  });
  return result;
}

function configuredNode(
  element: HTMLElement,
  schema: Schema,
  inline: boolean,
  inheritedMarks: readonly Mark[] = [],
): FountainNode | null {
  const matches = matchingHTMLRules(schema.nodes, rule => matchesRule(element, rule),
    type => type.name !== 'doc' && type.name !== 'text' && type.isInline === inline);

  for (const { type, rule } of matches) {
    const attrs = readHTMLRuleAttributes(element, rule);
    const contentRoot = ruleContentElement(element, rule);
    if (attrs === false || !contentRoot) continue;
    const expression = type.spec.content;
    const candidates: FountainNode[][] = type.spec.atom || !expression
      ? [[]]
      : type.spec.code && expression === 'text*'
      ? [inlineChildren(contentRoot, schema, inheritedMarks, true)]
      : [
          inlineChildren(contentRoot, schema, inheritedMarks),
          blockChildren(contentRoot, schema),
        ];
    // Empty inline projection must not win over real children in block*.
    if (/^block[+*?]$/.test(expression ?? '')) candidates.reverse();
    for (const candidate of candidates) {
      const content = relativeHTMLContent(restoreHTMLFlowCaret(type.name, contentRoot, candidate, schema), inheritedMarks);
      const node = createHTMLRuleNode(type, attrs, content, inheritedMarks, schema);
      if (node) return node;
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
  return projectHTMLRuby(type, annotation, inlineChildren(baseRoot, schema, inheritedMarks), inheritedMarks, schema);
}

function inlineChildren(parent: globalThis.Node, schema: Schema, marks: readonly Mark[] = [], literalText = false): FountainNode[] {
  const result: FountainNode[] = [];
  parent.childNodes.forEach((child) => {
    if (child.nodeType === globalThis.Node.COMMENT_NODE) {
      const comment = importHTMLComment(child.textContent ?? '', schema, marks);
      if (comment) result.push(comment);
      return;
    }
    if (child.nodeType === globalThis.Node.TEXT_NODE) {
      if (child.textContent) result.push(...(literalText ? [schema.text(child.textContent, marks)] : textNodes(child.textContent, schema, marks)));
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
    const atom = projectHTMLInlineAtom(child, schema, marks);
    if (atom) { result.push(...atom); return; }
    result.push(...inlineChildren(child, schema, elementMarks(child, schema, marks), literalText));
  });
  if (!result.length && marks.length) result.push(schema.text('', marks));
  return result;
}

/** The same inline-format rules apply to a block and to an inline wrapper. */
function elementMarks(child: HTMLElement, schema: Schema, marks: readonly Mark[] = []): Mark[] {
  const tag = child.tagName.toLowerCase();
  const local = projectHTMLFormatting(child, tag, schema, () => configuredMarks(child, schema)).marks;
  if (tag === 'a') projectHTMLLink(child, schema, local);
  return mergeHTMLMarks(local, marks, tag);
}

function imageNode(
  image: HTMLElement,
  schema: Schema,
  type: 'image_super' | 'inline_image',
  container?: HTMLElement,
  marks: readonly Mark[] = [],
): FountainNode | null {
  return projectImage(image, schema, type, caption => inlineChildren(caption, schema), container, marks);
}

function alignment(element: Element, direction: Readonly<Attributes>): Attributes {
  return readTextAlignmentAttributes(element, (element as HTMLElement).style.textAlign, direction);
}

function paragraph(element: Element, schema: Schema, childContext = false): FountainNode {
  const content = inlineChildren(element, schema);
  // Only a literally childless writer marker can suppress the normal caret
  // leaf. Text, media, comments and even whitespace must use ordinary parsing.
  const childless = element.getAttribute('data-fountain-empty') === 'block' && element.childNodes.length === 0;
  const dir = readTextDirection(element, schema, childContext);
  return schema.node('paragraph', { ...alignment(element, dir), ...dir, ...readExplicitEmphasis(element), ...readParagraphLayout(element) }, content.length ? content : childless ? [] : [schema.text('')]);
}

function preformattedChildren(element: Element, schema: Schema): FountainNode[] {
  return preformattedContent<globalThis.Node>(element, schema, {
    kind: node => node.nodeType === globalThis.Node.TEXT_NODE ? 'text' : node.nodeType === globalThis.Node.ELEMENT_NODE ? 'element' : 'ignore',
    children: node => Array.from(node.childNodes),
    tag: node => node instanceof Element ? node.tagName.toLowerCase() : '',
    text: node => node.textContent ?? '',
    marks: (node, marks) => node instanceof HTMLElement ? elementMarks(node, schema, marks) : marks,
  });
}

function hasConfiguredBlockRule(element: HTMLElement, schema: Schema): boolean {
  return Object.values(schema.nodes).some((type) => type.isBlock && type.name !== 'doc'
    && hasHTMLRule(type.spec, rule => matchesRule(element, rule)));
}

function hasStructuralContent(element: HTMLElement, schema: Schema): boolean {
  if (HTML_BLOCK_TAGS.has(element.tagName.toLowerCase()) || element.matches('a[data-fountain-file]') || hasConfiguredBlockRule(element, schema)) return true;
  // An explicit inline node owns its content, even if its HTML contains block
  // descendants (for example an application-defined atomic preview).
  if (Object.values(schema.nodes).some(type => type.isInline
    && hasHTMLRule(type.spec, rule => matchesRule(element, rule)))) return false;
  return [...element.children].some(child => child instanceof HTMLElement && hasStructuralContent(child, schema));
}

function blockChildren(element: HTMLElement, schema: Schema, inlineParagraphAttrs: Attributes = {}): FountainNode[] {
  const dir = readTextDirection(element, schema, true);
  const align = alignment(element, dir);
  if (dir.dir || align.alignExplicit || align.align !== 'left') inlineParagraphAttrs = { ...align, ...dir, ...inlineParagraphAttrs };
  const result: FountainNode[] = [];
  let inlineFragment = element.ownerDocument.createDocumentFragment();
  const flushInline = () => {
    const content = inlineChildren(inlineFragment, schema);
    const meaningful = content.some((node) => !node.isText || /[^\t\n\f\r ]/u.test(node.textContent) || node.marks.length);
    const flow = !Object.keys(inlineParagraphAttrs).length && importHTMLAnonymousFlow(content, schema);
    if (flow) result.push(flow);
    else if (meaningful && schema.nodes.paragraph) result.push(schema.node('paragraph', inlineParagraphAttrs, content));
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
  const dir = readTextDirection(element, schema, true);
  const align = alignment(element, dir);
  const attrs = dir.dir || align.alignExplicit || align.align !== 'left' ? { ...align, ...dir } : {};
  const result: FountainNode[] = [];
  let inlineFragment = element.ownerDocument.createDocumentFragment();
  const flushInline = () => {
    const content = inlineChildren(inlineFragment, schema);
    const meaningful = content.some((node) => !node.isText || /[^\t\n\f\r ]/u.test(node.textContent) || node.marks.length);
    if (meaningful) result.push(schema.node('paragraph', attrs, content));
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
    result.unshift(schema.node('paragraph', attrs, [schema.text('')]));
  }
  return inheritElementMarks(element, result, schema);
}

function block(element: Element, schema: Schema): FountainNode[] {
  return inheritElementMarks(element, projectBlock(element, schema), schema);
}

// Weak keys and weak node membership keep parsed DOM trees out of retained
// document/history state. A wrapper can be visited by blockChildren and block;
// each source element must contribute its emphasis level only once.
const blockEmphasis = new WeakMap<Element, WeakSet<FountainNode>>();

function inheritElementMarks(element: Element, nodes: FountainNode[], schema: Schema): FountainNode[] {
  const marks = element instanceof HTMLElement ? elementMarks(element, schema) : [];
  const tag = element.tagName.toLowerCase();
  let seen = explicitHTMLEmphasis(tag) ? blockEmphasis.get(element) : undefined;
  if (explicitHTMLEmphasis(tag) && !seen) blockEmphasis.set(element, seen = new WeakSet());
  const inherit = (node: FountainNode): FountainNode => {
    // An inline container owns the enclosing scope; its children already own
    // their local scopes. Applying the same wrapper to both doubles emphasis.
    const children = node.type.isInline ? relativeHTMLContent(node.content, marks, true) : node.content.map(inherit);
    let result = children.some((child, index) => child !== node.content[index]) ? node.copy(children) : node;
    if (node.type.isInline) {
      const combined = seen?.has(node) ? node.marks : mergeHTMLBlockMarks(node.marks, marks, tag);
      if (combined.length !== node.marks.length || combined.some((mark, index) => !mark.eq(node.marks[index]))) result = result.withMarks(combined);
      seen?.add(result);
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
      item => configuredNode(item, schema, false), undefined, item => readContainerDirection(item, schema));
    if (list) return [list];
  }
  const math = projectHTMLMath(element, schema, 'block');
  if (math) return math;
  if (/^h[1-6]$/.test(tag)) {
    const dir = readTextDirection(element, schema);
    const content = inlineChildren(element, schema);
    // Only a writer-marked, literally empty heading restores a text leaf.
    // Ordinary childless HTML and source children keep their existing meaning.
    const emptyText = !content.length && !element.childNodes.length && element.getAttribute('data-fountain-empty') === 'text';
    return [schema.node('heading', { level: Number(tag[1]), ...alignment(element, dir), ...dir, ...readExplicitEmphasis(element), ...readParagraphLayout(element) }, emptyText ? [schema.text('')] : content)];
  }
  if (tag === 'p') return [paragraph(element, schema)];
  if (tag === 'blockquote') {
    const children = blockChildren(element as HTMLElement, schema);
    return [schema.node('blockquote', { ...readExplicitQuoteAppearance(element), ...readContainerDirection(element, schema) }, children.length ? children : [paragraph(element, schema, true)])];
  }
  if (tag === 'pre') return [schema.node('code_block', {
    language: element.getAttribute('data-language') || directChild(element, 'code')?.className.match(/(?:^|\s)language-(\S+)(?=\s|$)/u)?.[1] || 'text',
    lineNumbers: element.getAttribute('data-line-numbers') !== 'false',
    ...readParagraphLayout(element),
    ...(schema.nodes.code_block.spec.attrs?.dir ? readTextDirection(element, schema) : {}),
  }, preformattedChildren(element, schema))];
  if (tag === 'hr') return [schema.node('horizontal_rule')];
  if (tag === 'ul' || tag === 'ol') {
    const isTask = element.getAttribute('data-type') === 'task-list';
    const items = Array.from(element.children).filter((child) => child.tagName.toLowerCase() === 'li').map((item) => {
      const task = item.getAttribute('data-type') === 'task-item' || isTask && item.getAttribute('data-type') !== 'list-item';
      const itemType = task ? 'task_item' : 'list_item';
      return schema.node(
        itemType,
        { ...readContainerDirection(item, schema), ...(!task && schema.nodes[itemType]?.spec.attrs?.layout ? readListLayout(item) : {}), ...(task ? { checked: item.getAttribute('data-checked') === 'inapplicable' ? 'inapplicable' : item.getAttribute('data-checked') === 'true' || item.querySelector('input')?.checked === true } : {}) },
        listItemContent(item, schema),
      );
    });
    const listType = tag === 'ol' ? 'ordered_list' : isTask ? 'task_list' : 'bullet_list';
    const start = htmlOrderedListStart(element.getAttribute('start'));
    return [schema.node(listType, { ...readContainerDirection(element, schema), ...(!isTask && schema.nodes[listType]?.spec.attrs?.layout ? readListLayout(element) : {}), ...(tag === 'ol' ? { start: start >= 0 ? start : 1 } : {}) }, items)];
  }
  if (tag === 'figure') {
    const figure = element as HTMLElement;
    const hasExtraText = Array.from(figure.childNodes).some(child => child.nodeType === 3 && /[^\t\n\f\r ]/u.test(child.textContent ?? ''));
    const node = projectMediaFigure(figure, Array.from(figure.children) as HTMLElement[], hasExtraText, schema,
      image => imageNode(image, schema, 'image_super', figure));
    return node ? [node] : blockChildren(figure, schema);
  }
  if (tag === 'table') {
    const captions = Array.from(element.querySelectorAll(':scope > caption')).flatMap(caption => {
      const blocks = blockChildren(caption as HTMLElement, schema);
      return blocks.length ? blocks : [paragraph(caption, schema)];
    });
    const table = projectHTMLTable(element as HTMLElement, schema, {
      rows: Array.from(element.querySelectorAll<HTMLElement>(':scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr, :scope > tr')),
      groupKey: row => row.parentElement,
      groupName: row => row.parentElement?.tagName ?? '',
      cells: row => Array.from(row.children) as HTMLElement[],
      blocks: (cell, attrs) => blockChildren(cell, schema, attrs),
      paragraph: cell => paragraph(cell, schema, true),
      inheritRowMarks: (row, node) => {
        const marked = inheritElementMarks(row, [node], schema);
        return row.parentElement && row.parentElement !== element ? inheritElementMarks(row.parentElement, marked, schema)[0] : marked[0];
      },
    });
    return table ? [...captions, table] : captions;
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
    const { pageSettings } = readHTMLDocumentPageSettings(body);
    const htmlSourceEnvelope = readHTMLDocumentEnvelope(body);
    const blocks = blockChildren(body, schema);
    if (!blocks.length && body.textContent) blocks.push(schema.node('paragraph', {}, [schema.text(body.textContent)]));
    const document = schema.topNodeType.create({ ...(pageSettings ? { pageSettings } : {}), ...(htmlSourceEnvelope ? { htmlSourceEnvelope } : {}) }, blocks.length ? blocks : [schema.node('paragraph', {}, [schema.text('')])]);
    schema.validate(document);
    return document;
  }

  static parse(html: string, schema: Schema): FountainNode { return new HTMLImporter().parse(html, schema); }
}
import { readHTMLDocumentEnvelope } from '../html-document-envelope';
