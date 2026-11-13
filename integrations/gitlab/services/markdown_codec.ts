import { CoreSchemaSpec, MarkdownExporter, MarkdownSourceSnapshot, isSafeURL,
  type HTMLParseElement, type Node, type Schema, type SchemaSpec } from 'fountainjs-editor';
import { ServerHTMLImporter, type ServerHTMLImporterOptions } from 'fountainjs-editor/html/server';
import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';
import type { SerializedContentCodec } from './serialized_content';
import type { GitLabRenderResponse } from './asset_resolver';
import { gitlabMathNodes, normalizeGitLabMath, serializeGitLabMath } from './math';
import { normalizeGitLabCodeRendering, normalizeGitLabDiagrams } from './code_rendering';
import { gitlabAlertNodes, hydrateGitLabAlertTitles, normalizeGitLabAlerts } from './alerts';
import { gitlabMediaNodes, gitlabMediaSource, normalizeGitLabMedia, type GitLabPlayableKind } from './media';

export interface GitLabMarkdownIssue { stage: 'import' | 'export'; code: string; message: string; path?: readonly number[] }
export class GitLabMarkdownConversionError extends Error {
  constructor(readonly issues: readonly GitLabMarkdownIssue[], readonly originalMarkdown?: string) {
    super('GitLab Markdown conversion cannot complete without the reported adapter. Retain the original source and inspect the current document.');
    this.name = 'GitLabMarkdownConversionError';
  }
}
const stringValue = (value: unknown): boolean => typeof value === 'string' && value.length <= 10_000;
const canonical = { default: undefined, validate: (value: unknown) => value === undefined || isSafeURL(value) };
const unescapeOriginal = (value: string): string => value.replace(/&(?:amp|lt|gt|quot|#39);/gu,
  match => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[match]!);
function labelChannels(value: unknown): number[] | null {
  if (typeof value !== 'string') return null;
  const hex = value.match(/^#([a-f\d]{3}|[a-f\d]{6})$/iu)?.[1];
  if (hex) {
    const expanded = hex.length === 3 ? [...hex].map(character => character.repeat(2)).join('') : hex;
    return [0, 2, 4].map(index => Number.parseInt(expanded.slice(index, index + 2), 16));
  }
  const rgb = value.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/iu)?.slice(1).map(Number);
  return rgb && rgb.every(channel => channel <= 255) ? rgb : null;
}
function labelForeground(value: unknown): string {
  const channels = labelChannels(value)!;
  const luminance = channels.map(channel => channel / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000' : '#fff';
}

/** GitLab-owned source attributes remain distinct from navigable display URLs. */
export function createGitLabSchemaSpec(base: SchemaSpec = CoreSchemaSpec, mediaLabels?: Readonly<Record<GitLabPlayableKind, string>>): SchemaSpec {
  if (!base.nodes.inline_image || !base.marks?.link) throw new TypeError('The GitLab schema requires inline images and links.');
  const image = base.nodes.inline_image, link = base.marks.link;
  const imageAttrs = (element: HTMLParseElement) => {
    const child = element.tagName.toLowerCase() === 'img' ? element : element.querySelectorAll?.('img')[0];
    if (!child) return false;
    const src = child.getAttribute('data-src') || child.getAttribute('src') || '';
    const ownLink = element.tagName.toLowerCase() === 'a' ? element.getAttribute('href') : undefined;
    const externalCanonical = ownLink && ownLink === src && /^https?:\/\//iu.test(ownLink) ? ownLink : undefined;
    const original = child.getAttribute('data-canonical-src') || element.getAttribute('data-canonical-src') || externalCanonical || undefined;
    if (!isSafeURL(src, { allowDataImage: true }) || original !== undefined && !isSafeURL(original)) return false;
    const size = (name: 'width' | 'height') => {
      const value = child.style[name] || child.getAttribute(name) || 'auto';
      return /^\d+(?:\.\d+)?$/u.test(value) ? `${value}px` : value;
    };
    return { src, gitlabCanonicalSrc: original, gitlabCanonicalMissing: Boolean(child.getAttribute('data-src') && !original),
      gitlabIntrinsicSize: !child.getAttribute('width') && !child.getAttribute('height') && !child.style.width && !child.style.height,
      alt: child.getAttribute('alt') ?? '', title: child.getAttribute('title') ?? '', width: size('width'), height: size('height') };
  };
  return { ...base, nodes: { ...base.nodes, ...gitlabMathNodes(base), ...gitlabAlertNodes(), ...gitlabMediaNodes(mediaLabels),
    inline_image: { ...image, attrs: { ...image.attrs, gitlabCanonicalSrc: canonical,
      gitlabIntrinsicSize: { default: false, validate: value => typeof value === 'boolean' },
      gitlabCanonicalMissing: { default: false, validate: value => typeof value === 'boolean' } },
      parseHTML: [{ tag: 'a.no-attachment-icon', priority: 200, getAttrs: imageAttrs },
        { tag: 'img[data-src], img[data-canonical-src]', priority: 200, getAttrs: imageAttrs }, ...(image.parseHTML ?? [])] },
    gitlab_reference: { group: 'inline', inline: true, atom: true,
      attrs: { original: { validate: stringValue }, label: { validate: stringValue }, referenceType: { validate: stringValue },
        href: { validate: value => isSafeURL(value) }, title: { default: '', validate: stringValue },
        color: { default: '', validate: value => value === '' || labelChannels(value) !== null } },
      parseHTML: [{ tag: 'a[data-reference-type][data-original]:not([data-link="true"])', priority: 250, getAttrs: element => {
        const href = element.getAttribute('href');
        if (!isSafeURL(href)) return false;
        const child = element.querySelectorAll?.('span')[0];
        const color = child?.getAttribute('style')?.match(/(?:^|;)\s*background-color\s*:\s*([^;]+)/iu)?.[1].trim() ?? '';
        return { original: unescapeOriginal(element.getAttribute('data-original')!), label: element.textContent, color,
          referenceType: element.getAttribute('data-reference-type')!, href, title: element.getAttribute('title') ?? '' };
      } }], toText: node => String(node.attrs.label),
      toDOM: node => ['a', { href: node.attrs.href, title: node.attrs.title, rel: 'noopener noreferrer',
        'data-fountain-gitlab-reference': node.attrs.referenceType, 'data-reference-type': node.attrs.referenceType,
        'data-original': node.attrs.original, style: node.attrs.color ? `background-color:${String(node.attrs.color)};color:${labelForeground(node.attrs.color)}` : undefined }, String(node.attrs.label)] },
    gitlab_placeholder: { group: 'inline', inline: true, atom: true,
      attrs: { original: { validate: stringValue }, value: { validate: stringValue } },
      parseHTML: [{ tag: 'span[data-placeholder]', priority: 250, getAttrs: element => ({
        original: element.getAttribute('data-placeholder')!, value: element.textContent,
      }) }], toText: node => String(node.attrs.value),
      toDOM: node => ['span', { 'data-fountain-gitlab-placeholder': 'true' }, String(node.attrs.value)] },
  }, marks: { ...base.marks,
    link: { ...link, attrs: { ...link.attrs, gitlabCanonicalSrc: canonical },
      parseHTML: [{ tag: 'a[data-canonical-src], a[data-original-href], a[data-link-reference="true"]', priority: 200, getAttrs: element => {
        const href = element.getAttribute('href'), original = element.getAttribute('data-canonical-src') || element.getAttribute('data-original-href') || undefined;
        if (!isSafeURL(href, { allowEmpty: true }) || original !== undefined && !isSafeURL(original)) return false;
        return { href, gitlabCanonicalSrc: original, title: element.getAttribute('data-reference-type') ? '' : element.getAttribute('title') ?? '' };
      } }, ...(link.parseHTML ?? [])] },
  } };
}

type RawNode = DefaultTreeAdapterMap['node'];
type RawElement = DefaultTreeAdapterMap['element'];
const attr = (element: RawElement, name: string): string | undefined => element.attrs.find(item => item.name === name)?.value;
const setAttr = (element: RawElement, name: string, value: string): void => {
  const existing = element.attrs.find(item => item.name === name);
  if (existing) existing.value = value;
  else element.attrs.push({ name, value });
};
function normalizeGitLabRendering(html: string, options: ServerHTMLImporterOptions, source: string, schema: Schema): string {
  const maxBytes = options.maxInputBytes ?? 1_048_576;
  if (new TextEncoder().encode(html).length > maxBytes) throw new Error('GitLab rendering exceeds the configured HTML byte limit.');
  const fragment = parseFragment(html), elements: RawElement[] = [], stack: [RawNode, number][] = [[fragment, 0]];
  let count = 0;
  while (stack.length) {
    const [node, depth] = stack.pop()!;
    if (++count > (options.maxNodes ?? 50_000) || depth > (options.maxDepth ?? 128)) throw new Error('GitLab rendering exceeds configured structural limits.');
    if ('tagName' in node) elements.push(node);
    if ('childNodes' in node) for (let index = node.childNodes.length - 1; index >= 0; index--) stack.push([node.childNodes[index]!, depth + 1]);
  }
  const checkboxes = new Map<RawElement, RawElement[]>();
  for (const input of elements) {
    if (input.tagName !== 'input' || attr(input, 'type') !== 'checkbox') continue;
    let parent = input.parentNode;
    while (parent && 'tagName' in parent && parent.tagName !== 'li') parent = parent.parentNode;
    if (parent && 'tagName' in parent && parent.tagName === 'li') {
      const owned = checkboxes.get(parent) ?? [];
      owned.push(input); checkboxes.set(parent, owned);
    }
  }
  const math = normalizeGitLabMath(elements);
  const diagrams = normalizeGitLabDiagrams(elements);
  const media = normalizeGitLabMedia(elements.filter(element => !diagrams.handled.has(element)), source, schema);
  const alerts = normalizeGitLabAlerts(elements, source);
  const codeIssues = normalizeGitLabCodeRendering(elements.filter(element => !math.handled.has(element) && !diagrams.handled.has(element)));
  const issues: GitLabMarkdownIssue[] = [
    ...math.issues, ...alerts.issues, ...media.issues, ...[...diagrams.issues, ...codeIssues].map(issue => ({ stage: 'import' as const, ...issue })),
  ];
  for (const element of elements) {
    if (math.handled.has(element) || alerts.handled.has(element) || media.handled.has(element) || diagrams.handled.has(element)) continue;
    const classes = (attr(element, 'class') ?? '').split(/\s+/u);
    if (attr(element, 'dir') === 'auto' && (attr(element, 'align')
      || /(?:^|;)\s*text-align\s*:/iu.test(attr(element, 'style') ?? ''))) {
      setAttr(element, 'data-fountain-align-explicit', 'true');
    }
    if (classes.some(name => ['katex', 'katex-display', 'js-render-math', 'frontmatter', 'mermaid', 'md-suggestion',
      'blob-embed', 'footnotes', 'footnote-ref', 'footnote-backref', 'js-render-iframe', 'section-nav',
      'markdown-alert', 'gfm-color_chip', 'idiff', 'audio-container', 'video-container', 'inapplicable'].includes(name))
      || attr(element, 'data-diagram') || attr(element, 'data-math-style')
      || attr(element, 'data-lang-params') === 'frontmatter'
      || ['mermaid', 'suggestion'].includes(attr(element, 'data-canonical-lang') ?? '')
      || (attr(element, 'data-canonical-src') ?? '').endsWith('drawio.svg')
      || classes.includes('task-table-item')) {
      issues.push({ stage: 'import', code: 'specialized-renderer', message: 'This specialized GitLab rendering requires a source-aware document adapter before visual editing.' });
    }
    if (element.tagName !== 'ul' || !classes.includes('task-list')) continue;
    const items = element.childNodes.filter((node): node is RawElement => 'tagName' in node && node.tagName === 'li');
    if (items.some(item => !(attr(item, 'class') ?? '').split(/\s+/u).includes('task-list-item'))) {
      issues.push({ stage: 'import', code: 'mixed-task-list', message: 'A mixed task/bullet list requires a lossless mixed-list adapter.' }); continue;
    }
    setAttr(element, 'data-type', 'task-list');
    for (const item of items) {
      const owned = checkboxes.get(item), input = owned?.[0];
      if (!input || owned!.length !== 1) { issues.push({ stage: 'import', code: 'task-source', message: 'A GitLab task item requires one unambiguous own checkbox state.' }); continue; }
      setAttr(item, 'data-checked', input.attrs.some(value => value.name === 'checked') ? 'true' : 'false');
      input.parentNode!.childNodes = input.parentNode!.childNodes.filter(child => child !== input);
    }
  }
  if (issues.length) throw new GitLabMarkdownConversionError(issues);
  return serialize(fragment);
}

/** Explicit GitLab conversion boundary; known unhandled expansions remain errors. */
export class GitLabMarkdownCodec implements SerializedContentCodec {
  private readonly sources = new WeakMap<Node, MarkdownSourceSnapshot>();
  constructor(private readonly options: {
    renderMarkdown(markdown: string, options?: { signal: AbortSignal }): Promise<GitLabRenderResponse>;
    html?: ServerHTMLImporterOptions;
  }) {}

  async deserialize({ schema, markdown, signal }: { schema: Schema; markdown: string; signal: AbortSignal }): Promise<{ document: Node }> {
    if (signal.aborted) throw new Error('GitLab Markdown rendering was cancelled.');
    if (!schema.nodes.gitlab_reference || !schema.nodes.gitlab_placeholder) throw new Error('Use the explicit GitLab schema adapter.');
    try {
      const parser = new ServerHTMLImporter(this.options.html);
      const response = markdown ? await this.options.renderMarkdown(markdown, { signal }) : { body: '<p></p>' };
      if (signal.aborted) throw new Error('GitLab Markdown rendering was cancelled.');
      if (!response || typeof response.body !== 'string') throw new Error('The actual GitLab host renderer must return a body string.');
      if (response.references?.commands) throw new GitLabMarkdownConversionError([{ stage: 'import', code: 'quick-actions', message: 'Quick-action source requires a dedicated document adapter before visual editing.' }]);
      const result = parser.parseWithReport(normalizeGitLabRendering(response.body, parser.options, markdown, schema), schema);
      if (result.issues.length) throw new GitLabMarkdownConversionError(result.issues.map(issue => ({ stage: 'import', code: issue.code, message: issue.message })));
      const document = hydrateGitLabAlertTitles(result.document);
      schema.validate(document);
      const source = MarkdownSourceSnapshot.capture(markdown, document);
      document.descendants(node => { this.sources.set(node, source); });
      return { document };
    } catch (error) {
      if (error instanceof GitLabMarkdownConversionError) throw new GitLabMarkdownConversionError(error.issues, markdown);
      throw new GitLabMarkdownConversionError([{ stage: 'import', code: signal.aborted ? 'cancelled' : 'render-or-parse-failed',
        message: signal.aborted ? 'GitLab conversion was cancelled.' : 'The host renderer or bounded HTML conversion failed; original Markdown is retained.' }], markdown);
    }
  }

  serializeWithReport({ doc }: { doc: Node }): { markdown: string; preservation: 'exact' | 'canonical'; issues: readonly GitLabMarkdownIssue[] } {
    const sources = new Set<MarkdownSourceSnapshot>();
    doc.descendants(node => { const source = this.sources.get(node); if (source) sources.add(source); });
    if (sources.size === 1) {
      const source = sources.values().next().value!;
      if (source.matches(doc)) return { markdown: source.source, preservation: 'exact', issues: [] };
    }
    const issues: GitLabMarkdownIssue[] = [], tokens = new Map<string, string>();
    let prefix = 'FOUNTAINGITLABSOURCETOKEN';
    const encoded = JSON.stringify(doc.toJSON());
    while (encoded.includes(prefix)) prefix += 'X';
    const project = (node: Node, path: number[]): Node => {
      if (node.type.name === 'inline_image' || node.type.name === 'gitlab_media') {
        if (node.attrs.gitlabCanonicalMissing) issues.push({ stage: 'export', code: 'canonical-image-source', path,
          message: 'The renderer omitted the canonical image address. Keep source editing until its original address can be mapped exactly.' });
        if (node.type.name === 'inline_image' && (node.attrs.align !== 'center' || node.attrs.srcset || node.attrs.sizes
          || node.attrs.loading !== 'lazy' || node.attrs.decoding !== 'async' || node.attrs.docxInlineDistances !== undefined))
          issues.push({ stage: 'export', code: 'media-layout', path, message: 'This image presentation needs a dedicated GitLab source representation.' });
        try {
          const source = gitlabMediaSource(node.type.schema, { canonical: String(node.attrs.gitlabCanonicalSrc ?? node.attrs.src),
            alt: String(node.attrs.alt ?? ''), title: String(node.attrs.title ?? ''),
            width: node.attrs.gitlabIntrinsicSize && node.attrs.width === '100%' ? 'auto' : String(node.attrs.width ?? 'auto'),
            height: String(node.attrs.height ?? 'auto') });
          const token = `${prefix}${tokens.size}END`; tokens.set(token, source);
          return project(doc.type.schema.text(token, node.marks), path);
        } catch (error) {
          issues.push({ stage: 'export', code: 'media-source', path, message: error instanceof Error ? error.message : 'Invalid media source.' });
          return doc.type.schema.text('');
        }
      }
      if (node.type.name === 'gitlab_alert') {
        if (path.some((_, index) => ['table_cell', 'table_header'].includes(path.slice(0, index).reduce((value, part) => value.child(part), doc).type.name)))
          issues.push({ stage: 'export', code: 'alert-table-source', path, message: 'Alerts in table cells need a dedicated GitLab table representation.' });
        const title = node.child(0).textContent.trim();
        const token = `${prefix}${tokens.size}END`;
        tokens.set(token, `[!${String(node.attrs.kind)}]${title ? ` ${title}` : ''}`);
        return node.type.schema.node('blockquote', {}, [node.type.schema.node('paragraph', {}, [node.type.schema.text(token)]),
          ...node.content.slice(1).map((child, index) => project(child, [...path, index + 1]))]);
      }
      if (['inline_math', 'math_block'].includes(node.type.name)) {
        let ancestor = doc;
        for (const index of path.slice(0, -1)) {
          ancestor = ancestor.child(index);
          if (['table_cell', 'table_header'].includes(ancestor.type.name) && /[|\r\n]/u.test(String(node.attrs.latex ?? ''))) {
            issues.push({ stage: 'export', code: 'math-table-source', path,
              message: 'Math with table delimiters or physical newlines needs a source-aware GitLab table adapter.' });
          }
        }
        const parent = path.slice(0, -1).reduce((node, index) => node.child(index), doc);
        const raw = serializeGitLabMath(node, parent.content[path.at(-1)! + 1], path, issues);
        if (node.type.name === 'math_block') {
          const latex = String(node.attrs.latex ?? '');
          return node.type.schema.node('code_block', { language: 'math' }, [
            node.type.schema.text(latex.endsWith('\n') ? latex.slice(0, -1) : latex),
          ]);
        }
        const token = `${prefix}${tokens.size}END`; tokens.set(token, raw);
        return project(doc.type.schema.text(token, node.marks), path);
      }
      if (['gitlab_reference', 'gitlab_placeholder'].includes(node.type.name)) {
        const token = `${prefix}${tokens.size}END`;
        let original = String(node.attrs.original);
        if (node.type.name === 'gitlab_reference') {
          if (node.marks.some(mark => ['code', 'link'].includes(mark.type.name))) {
            issues.push({ stage: 'export', code: 'reference-mark-context', path,
              message: 'Code or link formatting would turn this reference into literal text or an ordinary link. Remove that formatting to retain the reference.' });
          }
          const parent = path.slice(0, -1).reduce((ancestor, index) => ancestor.child(index), doc);
          const index = path.at(-1)!;
          const touches = (neighbor: Node | undefined, before: boolean): boolean => {
            if (!neighbor || neighbor.marks.length !== node.marks.length
              || !neighbor.marks.every(mark => node.marks.some(candidate => mark.eq(candidate)))) return false;
            return neighbor.isText ? (before ? /\S$/u : /^\S/u).test(neighbor.text ?? '')
              : ['gitlab_reference', 'gitlab_placeholder'].includes(neighbor.type.name);
          };
          // GitLab resolves each HTML text node separately. Keep this atom's text
          // boundary instead of guessing each reference kind's different lexical rules.
          if (touches(parent.content[index - 1], true) || touches(parent.content[index + 1], false)) {
            original = `<span>${original.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</span>`;
          }
        }
        tokens.set(token, original);
        return project(doc.type.schema.text(token, node.marks), path);
      }
      const attrs = { ...node.attrs };
      if (attrs.dir === 'auto') {
        delete attrs.dir; // GitLab adds automatic direction while rendering ordinary Markdown.
        if (attrs.align === 'start' && !attrs.alignExplicit) delete attrs.align;
      }
      const marks = node.marks.map(mark => mark.type.name === 'link' && typeof mark.attrs.gitlabCanonicalSrc === 'string'
        ? mark.type.create({ ...mark.attrs, href: mark.attrs.gitlabCanonicalSrc, gitlabCanonicalSrc: undefined, htmlHref: undefined }) : mark);
      let text = node.text;
      const retainedMarks = marks.filter(mark => {
        const tag = ({ highlight: 'mark', underline: 'u', subscript: 'sub', superscript: 'sup' } as Record<string, string>)[mark.type.name];
        if (!tag) return true;
        if (!node.isText || marks.some(candidate => candidate.type.name === 'code')) {
          issues.push({ stage: 'export', code: 'formatted-atom-or-code', path, message: 'This combined atom/code formatting requires an explicit GitLab serializer.' });
          return true;
        }
        if (mark.type.name === 'highlight' && mark.attrs.color !== '#fff3a3') {
          issues.push({ stage: 'export', code: 'highlight-color', path, message: 'GitLab default highlight markup does not retain this custom highlight color.' });
        }
        const open = `${prefix}${tokens.size}END`; tokens.set(open, `<${tag}>`);
        const close = `${prefix}${tokens.size}END`; tokens.set(close, `</${tag}>`);
        text = open + (text ?? '') + close;
        return false;
      });
      const content = node.content.map((child, index) => project(child, [...path, index]));
      if (text === node.text && retainedMarks.length === node.marks.length && retainedMarks.every((mark, index) => mark === node.marks[index])
        && content.every((child, index) => child === node.child(index))
        && Object.keys(attrs).length === Object.keys(node.attrs).length
        && Object.entries(attrs).every(([key, value]) => value === node.attrs[key])) return node;
      return node.type.create(attrs, content, text, retainedMarks);
    };
    const exported = new MarkdownExporter().exportWithReport(project(doc, []), { omitTrailingCaret: true });
    issues.push(...exported.losses.map(loss => ({ stage: 'export' as const, code: loss.kind + ':' + loss.type, message: loss.detail, path: loss.path })));
    let markdown = exported.markdown;
    for (const [token, original] of tokens) markdown = markdown.replaceAll(token, () => original);
    return { markdown, preservation: 'canonical', issues };
  }
  serialize(input: { doc: Node }): string {
    const result = this.serializeWithReport(input);
    if (result.issues.length) throw new GitLabMarkdownConversionError(result.issues);
    return result.markdown;
  }
}
