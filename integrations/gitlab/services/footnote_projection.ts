import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { CoreSchemaSpec, MarkdownImporter, Schema } from 'fountainjs-editor';
import { GitLabFootnotePositions, type GitLabFootnoteSpan } from './footnote_positions';
import type { GitLabFootnoteProbe } from './footnote_rendering';

type Element = DefaultTreeAdapterMap['element'];
type RawNode = DefaultTreeAdapterMap['node'];
export interface GitLabFootnoteDefinition {
  readonly label: string;
  readonly span: GitLabFootnoteSpan;
  readonly element: Element;
}
export interface GitLabFootnoteReference {
  readonly label: string;
  readonly span: GitLabFootnoteSpan;
  readonly element: Element;
  readonly definition: GitLabFootnoteDefinition;
}
const attr = (element: Element, name: string) => element.attrs.find(item => item.name === name)?.value;
const ownText = (element: Element) => element.childNodes.every(node => 'value' in node)
  ? element.childNodes.map(node => 'value' in node ? node.value : '').join('') : undefined;
const sourceLabel = /^\[\^([^\]\u0000-\u0020\u007f]{1,4096})\]/u;
const linkProbeSchema = new Schema(CoreSchemaSpec);

/** Inspect actual host structure; generated anchor suffixes never become IDs. */
export function inspectGitLabFootnoteProjection(source: string, html: string, options: {
  maxBytes?: number; maxNodes?: number; maxDepth?: number; probe?: GitLabFootnoteProbe; expectedDefinitions?: number;
} = {}) {
  const maxBytes = options.maxBytes ?? 1_048_576;
  if (new TextEncoder().encode(html).length > maxBytes) throw new Error('Footnote HTML exceeds the configured byte limit.');
  const index = new GitLabFootnotePositions(source, maxBytes);
  const fragment = parseFragment(html), elements: Element[] = [];
  const pending: [RawNode, number][] = [[fragment, 0]];
  let count = 0;
  while (pending.length) {
    const [node, depth] = pending.pop()!;
    if (++count > (options.maxNodes ?? 50_000) || depth > (options.maxDepth ?? 128))
      throw new Error('Footnote HTML exceeds configured structural limits.');
    if ('tagName' in node) elements.push(node);
    if ('childNodes' in node) for (let child = node.childNodes.length - 1; child >= 0; child--) pending.push([node.childNodes[child]!, depth + 1]);
  }
  const issues: string[] = [];
  const definitions: GitLabFootnoteDefinition[] = [], references: GitLabFootnoteReference[] = [];
  const sections = elements.filter(element => element.tagName === 'section' && attr(element, 'data-footnotes') !== undefined);
  if (sections.length > 1) issues.push('multiple-footnote-sections');
  const read = (element: Element, definition: boolean) => {
    const span = index.read(attr(element, 'data-sourcepos') ?? '');
    const text = span ? source.slice(span.from, span.to) : '';
    const match = sourceLabel.exec(text);
    if (!span || !match || (definition ? text[match[0].length] !== ':' : match[0] !== text)) {
      issues.push('footnote-source-position'); return undefined;
    }
    return { label: match[1]!, span, element };
  };
  for (const section of sections) {
    const lists = section.childNodes.filter((node): node is Element => 'tagName' in node && node.tagName === 'ol');
    if (lists.length !== 1 || section.childNodes.some(node => node !== lists[0] && (!('value' in node) || node.value.trim()))) {
      issues.push('footnote-section-content'); continue;
    }
    const list = lists[0]!;
    if (attr(list, 'start') !== undefined && attr(list, 'start') !== '1') issues.push('footnote-order');
    for (const child of list.childNodes) {
      if ('value' in child && !child.value.trim()) continue;
      if (!('tagName' in child) || child.tagName !== 'li' || attr(child, 'value') !== undefined) {
        issues.push('footnote-definition-content'); continue;
      }
      const definition = read(child, true);
      if (definition) definitions.push(definition);
    }
  }
  if (options.expectedDefinitions !== undefined && (!Number.isSafeInteger(options.expectedDefinitions)
    || options.expectedDefinitions < 0 || options.expectedDefinitions !== definitions.length))
    issues.push('footnote-omitted-definitions');
  const probe = options.probe;
  let carrier: Element | undefined;
  if (probe) {
    if (probe.source !== source) throw new Error('Footnote probe must match the exact renderer input.');
    const from = probe.insertion, to = from + probe.prefix.length;
    const carriers = elements.filter(element => {
      if (element.tagName !== 'p') return false;
      const span = index.read(attr(element, 'data-sourcepos') ?? '');
      const first = element.childNodes[0];
      return span && span.from >= from && span.to <= to && source.slice(span.from, span.to).startsWith(probe.marker + ' ')
        && first && 'value' in first && first.value.startsWith(probe.marker + ' ');
    });
    if (carriers.length !== 1 || carriers[0]!.parentNode !== fragment) issues.push('footnote-probe-carrier');
    else carrier = carriers[0];
  }
  for (const element of elements) {
    if (element.tagName !== 'a' || attr(element, 'data-footnote-ref') === undefined) continue;
    const parent = element.parentNode;
    if (!parent || !('tagName' in parent) || parent.tagName !== 'sup' || parent.childNodes.length !== 1) {
      issues.push('footnote-reference-content'); continue;
    }
    const reference = read(parent, false);
    const number = ownText(element);
    // Generated anchors are only joins inside this one response, never stored
    // identities. Exact links take precedence: duplicate labels can make the
    // host's repeated reference point at a different definition with the same
    // displayed number. Ordinary repeated links lack an exact target, so their
    // verified host ordinal supplies the fallback relation.
    const href = attr(element, 'href');
    const exact = href?.startsWith('#') ? definitions.find(item => attr(item.element, 'id') === href.slice(1)) : undefined;
    const ordinal = number && /^[1-9]\d{0,3}$/u.test(number) ? definitions[Number(number) - 1] : undefined;
    const definition = ordinal ? exact ?? ordinal : undefined;
    if (!reference || !definition) { issues.push('footnote-reference-target'); continue; }
    references.push({ ...reference, definition });
  }
  const renderedReferences = [...references];
  if (probe && carrier) {
    const descendants = new Set<RawNode>(), queue: RawNode[] = [carrier];
    while (queue.length) { const node = queue.pop()!; descendants.add(node); if ('childNodes' in node) queue.push(...node.childNodes); }
    // The probe may contain unresolved candidates; its entire verified root
    // paragraph is owned diagnostic content, never part of the final document.
    fragment.childNodes = fragment.childNodes.filter(node => node !== carrier);
    carrier.parentNode = null;
    for (let i = references.length - 1; i >= 0; i--) if (descendants.has(references[i]!.element)) references.splice(i, 1);
  }
  return { fragment, elements, sections, definitions, references, renderedReferences, issues, sourceIndex: index };
}

/** Produce native footnote carriers without renderer-owned back-reference UI. */
export function normalizeGitLabFootnoteProjection(source: string, html: string, options: {
  maxBytes?: number; maxNodes?: number; maxDepth?: number; probe?: GitLabFootnoteProbe; expectedDefinitions?: number;
  idFactory?: () => string;
} = {}) {
  const graph = inspectGitLabFootnoteProjection(source, html, options);
  const { definitions, references, issues } = graph;
  const ids = new Map<GitLabFootnoteDefinition, string>(), occupied = new Set<string>();
  const idFactory = options.idFactory ?? (() => globalThis.crypto.randomUUID());
  if (options.probe && options.expectedDefinitions === undefined) issues.push('footnote-probe-source-count');
  if (options.probe?.insertion === 0 && source[options.probe.prefix.length] === '\uFEFF') issues.push('footnote-probe-bom');
  if (issues.length) return { ...graph, html: undefined };
  if (new Set(definitions.map(definition => definition.label)).size !== definitions.length) {
    issues.push('footnote-duplicate-label');
    return { ...graph, html: undefined };
  }
  const chrome = new Map<GitLabFootnoteDefinition, Element[]>();
  const authoredLinks = new Map<Element, { name: string; value: string }[]>();
  // Check all ownership before removing anything. Source-authored raw HTML can
  // carry these reserved attributes too; a marker attribute alone is not proof.
  definitions.forEach((definition, ordinal) => {
    const expected = new Set(Array.from({ length: Math.max(1, graph.renderedReferences.filter(reference => reference.definition === definition).length) },
      (_, index) => index === 0 ? String(ordinal + 1) : `${ordinal + 1}-${index + 1}`));
    const seen = new Set<string>(), links: Element[] = [], pending: RawNode[] = [...definition.element.childNodes];
    while (pending.length) {
      const node = pending.pop()!;
      if (!('tagName' in node)) continue;
      if (node.tagName === 'a' && attr(node, 'data-footnote-backref') !== undefined) {
        const key = attr(node, 'data-footnote-backref-idx');
        const allowed = ['href', 'data-footnote-backref', 'data-footnote-backref-idx', 'aria-label', 'title', 'class'];
        const content = node.childNodes.every(child => 'value' in child && child.value === '↩'
          || 'tagName' in child && child.tagName === 'sup' && child.attrs.length === 0 && /^\d+$/u.test(ownText(child) ?? ''));
        if (!key || !expected.has(key) || seen.has(key) || attr(node, 'data-sourcepos') !== undefined
          || !/^#fnref-[^\s]+$/u.test(attr(node, 'href') ?? '') || node.attrs.some(item => !allowed.includes(item.name))
          || !content || !node.parentNode) issues.push('footnote-backref-source');
        else { seen.add(key); links.push(node); }
      } else {
        if (node.tagName === 'a' && (attr(node, 'class') ?? '').split(/\s+/u).includes('footnote-backref')) {
          const span = graph.sourceIndex.read(attr(node, 'data-sourcepos') ?? '');
          const parsed = span ? new MarkdownImporter().parse(source.slice(span.from, span.to), linkProbeSchema) : undefined;
          const text = parsed?.childCount === 1 && parsed.child(0).childCount === 1 ? parsed.child(0).child(0) : undefined;
          const mark = text?.isText && text.marks.length === 1 && text.marks[0]!.type.name === 'link' ? text.marks[0] : undefined;
          if (!mark || ownText(node) !== text!.text || !String(mark.attrs.href).startsWith('#fnref-')) issues.push('footnote-authored-backref-source');
          else authoredLinks.set(node, [{ name: 'href', value: String(mark.attrs.href) },
            { name: 'data-canonical-src', value: String(mark.attrs.href) },
            ...(mark.attrs.title ? [{ name: 'title', value: String(mark.attrs.title) }] : [])]);
        }
        pending.push(...node.childNodes);
      }
    }
    if ([...expected].some(key => !seen.has(key))) issues.push('footnote-backref-source');
    chrome.set(definition, links);
  });
  if (issues.length) return { ...graph, html: undefined };
  for (const [element, attrs] of authoredLinks) element.attrs = attrs;
  for (const definition of definitions) {
    const id = idFactory();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(id) || occupied.has(id))
      throw new Error('Footnote IDs must be safe and unique.');
    occupied.add(id); ids.set(definition, id);
    for (const node of chrome.get(definition)!) {
      const siblings = node.parentNode!.childNodes, index = siblings.indexOf(node);
      const previous = siblings[index - 1];
      if (previous && 'value' in previous && previous.value.endsWith(' ')) previous.value = previous.value.slice(0, -1);
      node.parentNode!.childNodes = siblings.filter(child => child !== node);
      node.parentNode = null;
    }
  }
  if (issues.length) return { ...graph, html: undefined };
  for (const reference of references) {
    const element = reference.element;
    element.attrs = [{ name: 'data-fountain-footnote-reference', value: ids.get(reference.definition)! },
      { name: 'data-gitlab-footnote-label', value: reference.label },
      { name: 'data-gitlab-footnote-original-label', value: reference.label },
      { name: 'data-gitlab-footnote-target-label', value: reference.definition.label }];
    element.childNodes = [];
  }
  for (const section of graph.sections) {
    if (!section.parentNode) { issues.push('footnote-section-owner'); continue; }
    const order = (definition: GitLabFootnoteDefinition) => references.findIndex(reference => reference.definition === definition);
    const owned = definitions.filter(definition => {
      const parent = definition.element.parentNode;
      return parent && 'parentNode' in parent && parent.parentNode === section;
    }).sort((left, right) => {
      const a = order(left), b = order(right);
      return a < 0 && b < 0 ? left.span.from - right.span.from : a < 0 ? 1 : b < 0 ? -1 : a - b;
    });
    const parent = section.parentNode, index = parent.childNodes.indexOf(section);
    const replacement = owned.map(definition => {
      const element = definition.element;
      element.tagName = element.nodeName = 'aside';
      element.attrs = [{ name: 'data-fountain-footnote-definition', value: ids.get(definition)! },
        { name: 'data-gitlab-footnote-label', value: definition.label }];
      if (element.childNodes.every(child => 'value' in child && !child.value.trim())) {
        element.childNodes = [{ nodeName: 'p', tagName: 'p', attrs: [], namespaceURI: element.namespaceURI,
          childNodes: [], parentNode: element }];
      }
      element.parentNode = parent;
      return element;
    });
    parent.childNodes.splice(index, 1, ...replacement);
    section.parentNode = null;
  }
  if (options.probe) {
    // Probe insertion is at a complete-line boundary after validated metadata.
    // Rebase every remaining host position to the original renderer input so
    // the existing math/media/frontmatter/quick-action adapters stay authoritative.
    const probe = options.probe;
    const beforeLines = (source.slice(0, probe.insertion).match(/\r\n|[\r\n]/gu) ?? []).length;
    const addedLines = (probe.prefix.match(/\r\n|[\r\n]/gu) ?? []).length;
    const pending: RawNode[] = [...graph.fragment.childNodes];
    while (pending.length) {
      const node = pending.pop()!;
      if ('tagName' in node) {
        const position = node.attrs.find(item => item.name === 'data-sourcepos');
        if (position) {
          const match = /^(\d+):(\d+)-(\d+):(\d+)$/u.exec(position.value);
          if (!match) { issues.push('footnote-probe-position'); continue; }
          const rebase = (value: string) => Number(value) > beforeLines + addedLines ? Number(value) - addedLines : Number(value);
          if ([Number(match[1]), Number(match[3])].some(line => line > beforeLines && line <= beforeLines + addedLines))
            issues.push('footnote-probe-position');
          else position.value = `${rebase(match[1]!)}:${match[2]}-${rebase(match[3]!)}:${match[4]}`;
        }
      }
      if ('childNodes' in node) pending.push(...node.childNodes);
    }
  }
  return { ...graph, ids, html: issues.length ? undefined : serialize(graph.fragment) };
}
