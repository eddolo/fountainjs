import { CoreSchemaSpec, MarkdownExporter, MarkdownSourceSnapshot, isSafeURL,
  type HTMLParseElement, type Mark, type Node, type Schema, type SchemaSpec } from 'fountainjs-editor';
import { ServerHTMLImporter, type ServerHTMLImporterOptions } from 'fountainjs-editor/html/server';
import { parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { hasPendingWikiFile, pendingWikiFile } from './wiki_pending_upload';
import type { GitLabMarkWriter } from './host_configuration';
import type { SerializedContentCodec } from './serialized_content';
import type { GitLabRenderResponse } from './asset_resolver';
import { gitlabMathNodes, normalizeGitLabMath, serializeGitLabMath } from './math';
import { fenceParameters, ordinaryFence, parameterizedGitLabCode, normalizeGitLabCodeRendering, normalizeGitLabDiagrams } from './code_rendering';
import { getGitLabFrontmatter, gitlabFrontmatterCode, hydrateGitLabFrontmatter, normalizeGitLabFrontmatter, serializeGitLabFrontmatter } from './frontmatter';
import { gitlabAlertNodes, hydrateGitLabAlertTitles, normalizeGitLabAlerts } from './alerts';
import { gitlabMediaNodes, gitlabMediaSource, normalizeGitLabMedia, recoverGitLabImageSources, type GitLabPlayableKind } from './media';
import { GitLabQuickActionSourceError, hydrateGitLabQuickActions, serializeGitLabQuickAction, transformGitLabQuickActions } from './quick_actions';
import { gitLabCodeSuggestion, normalizeGitLabSuggestionNodes, serializeGitLabSuggestionNode } from './code_suggestion_node';
import { gitLabContentsNode, normalizeGitLabContents } from './table_of_contents';
import { gitLabTaskItem } from './task_state';
import { normalizeGitLabTasks } from './task_rendering';
import { convertGitLabFootnotes } from './footnote_codec';
import { gitLabFootnoteNodes, validGitLabFootnoteLabel } from './footnote_nodes';

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

// Pipe tables cannot retain spans, multiple paragraphs in a cell, or mixed header roles.
function serializeGitLabHTMLTable(table: Node, tokenPrefix: string, wikiRoom: boolean): string | undefined {
  if (!table.content.some((row, index) => row.content.some(cell =>
    Number(cell.attrs.rowspan) > 1 || Number(cell.attrs.colspan) > 1 || cell.childCount > 1
    || cell.type.name !== (index === 0 ? 'table_header' : 'table_cell')))) return undefined;
  let supported = true;
  table.descendants(node => {
    const name = node.type.name;
    const cell = name === 'table_header' || name === 'table_cell';
    if (!['table', 'table_row', 'table_header', 'table_cell', 'paragraph', 'text'].includes(name)
      || (node !== table && name === 'table') || node.text?.includes(tokenPrefix)
      || Object.entries(node.attrs).some(([key, value]) => value !== node.type.spec.attrs?.[key]?.default
        && !(name === 'table' && key === 'gitlabIsMarkdown') && !(cell && (key === 'rowspan' || key === 'colspan')))) supported = false;
    for (const mark of node.marks) {
      if (!['strong', 'em', 'code', 'link'].includes(mark.type.name)
        || Object.entries(mark.attrs).some(([key, value]) => value !== mark.type.spec.attrs?.[key]?.default
          && !(mark.type.name === 'link' && (key === 'href' || key === 'title'
            || (key === 'htmlHref' && value === mark.attrs.href))))) supported = false;
    }
    return supported;
  });
  if (!supported) return undefined;
  if (wikiRoom) {
    // GitLab's wiki writes plain cell text inline, and successive paragraphs
    // between blank lines. Use explicit HTML for syntax, whitespace or marks
    // whose interpretation could change in that mixed Markdown/HTML context.
    const plain = table.content.every(row => row.content.every(cell =>
      cell.content.every(p => p.childCount === 1 && p.child(0).isText && !p.child(0).marks.length
        && /^(?![0-9]{1,9}\.$)[\p{L}\p{N}]+(?:[ -][\p{L}\p{N}]+)*[.!?]?$/u.test(p.child(0).text!))));
    if (plain) {
      const lines = ['<table>'];
      for (const row of table.content) {
        lines.push('<tr>');
        for (const cell of row.content) {
          const tag = cell.type.name === 'table_header' ? 'th' : 'td';
          const spans = ['colspan','rowspan'].filter(key => Number(cell.attrs[key]) > 1)
            .map(key => ` ${key}="${Number(cell.attrs[key])}"`).join('');
          const paragraphs = cell.content.map(p => p.child(0).text);
          const text = paragraphs.length === 1 ? paragraphs[0] : '\n\n' + paragraphs.join('\n\n') + '\n';
          lines.push(`<${tag}${spans}>${text}</${tag}>`);
        }
        lines.push('</tr>');
      }
      return [...lines,'</table>'].join('\n');
    }
  }
  return MarkdownExporter.export(table, { tableFormat: 'html' });
}

/** GitLab-owned source attributes remain distinct from navigable display URLs. */
export function createGitLabSchemaSpec(base: SchemaSpec = CoreSchemaSpec, mediaLabels?: Readonly<Record<GitLabPlayableKind, string>>, contentsLabel = 'Table of contents', wikiRoom = false): SchemaSpec {
  if (!base.nodes.inline_image || !base.marks?.link) throw new TypeError('The GitLab schema requires inline images and links.');
  const image = base.nodes.inline_image, link = base.marks.link;
  const imageAttrs = (element: HTMLParseElement) => {
    const child = element.tagName.toLowerCase() === 'img' ? element : element.querySelectorAll?.('img')[0];
    if (!child) return false;
    const src = child.getAttribute('data-src') || child.getAttribute('src') || '';
    const original = child.getAttribute('data-canonical-src') || element.getAttribute('data-canonical-src') || undefined;
    if (!isSafeURL(src, { allowDataImage: true }) || original !== undefined && !isSafeURL(original)) return false;
    const size = (name: 'width' | 'height') => {
      const value = child.style[name] || child.getAttribute(name) || 'auto';
      return /^\d+(?:\.\d+)?$/u.test(value) ? `${value}px` : value;
    };
    return { src, gitlabCanonicalSrc: original, gitlabCanonicalMissing: Boolean(child.getAttribute('data-src') && !original),
      gitlabIntrinsicSize: !child.getAttribute('width') && !child.getAttribute('height') && !child.style.width && !child.style.height,
      alt: child.getAttribute('alt') ?? '', title: child.getAttribute('title') ?? '', width: size('width'), height: size('height') };
  };
  return { ...base, nodes: { ...base.nodes, ...gitlabMathNodes(base), ...gitlabAlertNodes(), ...gitlabMediaNodes(mediaLabels), ...gitLabFootnoteNodes(),
    gitlab_code_suggestion: gitLabCodeSuggestion(),
    gitlab_table_of_contents: gitLabContentsNode(contentsLabel),
    ...(base.nodes.direction_scope ? { direction_scope: { ...base.nodes.direction_scope,
      parseHTML: [...(base.nodes.direction_scope.parseHTML ?? []), { tag: 'div[dir]', priority: 55,
        getAttrs: (element: HTMLParseElement) => {
          const dir = element.getAttribute('dir');
          const names = element.getAttributeNames?.();
          if (!['auto', 'ltr', 'rtl'].includes(dir ?? '') || !names
            || names.some(name => !['dir', 'data-sourcepos'].includes(name))) return false;
          return { dir };
        } }],
    } } : {}),
    ...(wikiRoom && base.nodes.table ? { table: { ...base.nodes.table, attrs: { ...base.nodes.table.attrs,
      gitlabIsMarkdown: {default:null,validate:value => value === null || typeof value === 'boolean'},
    } } } : {}),
    ...(wikiRoom && base.nodes.ordered_list ? { ordered_list: { ...base.nodes.ordered_list, attrs: {
      ...base.nodes.ordered_list.attrs,
      gitlabParens: { default: false, validate: value => typeof value === 'boolean' },
    } } } : {}),
    ...(wikiRoom && base.nodes.bullet_list ? { bullet_list: { ...base.nodes.bullet_list, attrs: {
      ...base.nodes.bullet_list.attrs,
      gitlabBullet: { default: undefined, validate: value => value === undefined || value === '-' || value === '+' },
    } } } : {}),
    ...(wikiRoom && base.nodes.task_list ? { task_list: { ...base.nodes.task_list, attrs: {
      ...base.nodes.task_list.attrs,
      gitlabBullet: { default: undefined, validate: value => value === undefined || value === '-' || value === '+' },
    } } } : {}),
    task_item: gitLabTaskItem(base),
    paragraph: { ...base.nodes.paragraph!, attrs: { ...base.nodes.paragraph!.attrs,
      gitlabLiteralSlash: { default: false, validate: value => typeof value === 'boolean' } } },
    code_block: parameterizedGitLabCode(gitlabFrontmatterCode(base.nodes.code_block!)),
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
      toDOM: node => ['a', { href: node.attrs.href, title: node.attrs.title, rel: 'noopener noreferrer', class: 'gl-link gl-underline',
        'data-fountain-gitlab-reference': node.attrs.referenceType, 'data-reference-type': node.attrs.referenceType,
        'data-original': node.attrs.original, style: node.attrs.color ? `background-color:${String(node.attrs.color)};color:${labelForeground(node.attrs.color)}` : undefined }, String(node.attrs.label)] },
    gitlab_placeholder: { group: 'inline', inline: true, atom: true,
      attrs: { original: { validate: stringValue }, value: { validate: stringValue } },
      parseHTML: [{ tag: 'span[data-placeholder]', priority: 250, getAttrs: element => ({
        original: element.getAttribute('data-placeholder')!, value: element.textContent,
      }) }], toText: node => String(node.attrs.value),
      toDOM: node => ['span', { 'data-fountain-gitlab-placeholder': 'true' }, String(node.attrs.value)] },
  }, marks: { ...base.marks,
    ...(wikiRoom ? {gitlab_pending_wiki_file:pendingWikiFile} : {}),
    link: { ...link, attrs: { ...link.attrs, gitlabCanonicalSrc: canonical,
      gitlabWikiLink:{default:undefined,validate:value => value === undefined || value === 'page' || value === 'external'} },
      parseHTML: [{ tag: 'a[data-canonical-src], a[data-original-href], a[data-link-reference="true"]', priority: 200, getAttrs: element => {
        const href = element.getAttribute('href'), original = element.getAttribute('data-canonical-src') || element.getAttribute('data-original-href') || undefined;
        if (!isSafeURL(href, { allowEmpty: true }) || original !== undefined && !isSafeURL(original)) return false;
        return { href, gitlabCanonicalSrc: original, gitlabWikiLink:element.getAttribute('data-gollum') === 'true'
          ? ((element.getAttribute('class') ?? '').split(/\s+/u).includes('gfm-gollum-wiki-page') ? 'page' : 'external') : undefined,
          title: element.getAttribute('data-reference-type') ? '' : element.getAttribute('title') ?? '' };
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
interface WikiBlockOrigin { type: 'bullet_list' | 'task_list' | 'ordered_list' | 'table'; parens?: boolean; bullet?: string; isMarkdown?: boolean }

function normalizeGitLabRendering(html: string, options: ServerHTMLImporterOptions, source: string, schema: Schema, emojiNames: Map<string,string>, supportsContents: boolean, wikiOrigins?: {blocks:WikiBlockOrigin[]; inactive:[number,number][]}): string {
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
  if (wikiOrigins) {
    const lines = source.split(/\r\n?|\n/u);
    for (const element of elements) {
      if (element.tagName !== 'ul' && element.tagName !== 'ol' && element.tagName !== 'table') continue;
      const position = attr(element,'data-sourcepos')?.match(/^(\d+):(\d+)-/u);
      const start = position && lines[Number(position[1]) - 1]?.slice(Number(position[2]) - 1);
      if (element.tagName === 'table') wikiOrigins.blocks.push({type:'table',isMarkdown:Boolean(start && !start.startsWith('<'))});
      else if (element.tagName === 'ol') wikiOrigins.blocks.push({type:'ordered_list',parens:/^\d{1,9}\)(?:\s|$)/u.test(start ?? '')});
      else wikiOrigins.blocks.push({type:(attr(element,'class') ?? '').split(/\s+/u).includes('task-list') ? 'task_list' : 'bullet_list',bullet:start?.match(/^([-+*])(?:\s|$)/u)?.[1]});
    }
  }
  normalizeGitLabContents(elements, source, maxBytes, supportsContents);
  recoverGitLabImageSources(elements, source, schema, maxBytes);
  const tasks = normalizeGitLabTasks(elements, source, wikiOrigins?.inactive);
  const math = normalizeGitLabMath(elements);
  const diagrams = normalizeGitLabDiagrams(elements);
  const media = normalizeGitLabMedia(elements.filter(element => !diagrams.handled.has(element)), source, schema);
  const alerts = normalizeGitLabAlerts(elements, source);
  const frontmatter = normalizeGitLabFrontmatter(elements, source);
  const suggestions = normalizeGitLabSuggestionNodes(elements, source);
  const codeIssues = normalizeGitLabCodeRendering(elements.filter(element => !math.handled.has(element) && !diagrams.handled.has(element) && !suggestions.handled.has(element)), source);
  const issues: GitLabMarkdownIssue[] = [
    ...tasks.issues, ...suggestions.issues.map(issue => ({ stage: 'import' as const, ...issue })), ...math.issues, ...alerts.issues, ...media.issues, ...[...diagrams.issues, ...codeIssues, ...frontmatter.issues].map(issue => ({ stage: 'import' as const, ...issue })),
  ];
  const emojiChecks = new Set<string>();
  const emojiText = new Map<RawNode, DefaultTreeAdapterMap['textNode']>();
  const emojiParents = new Set<DefaultTreeAdapterMap['parentNode']>();
  for (const element of elements) {
    if (math.handled.has(element) || alerts.handled.has(element) || media.handled.has(element) || diagrams.handled.has(element) || frontmatter.handled.has(element)) continue;
    if (element.tagName === 'gl-emoji') {
      const name = attr(element, 'data-name'), child = element.childNodes[0];
      const glyph = child && 'value' in child ? child.value : '';
      if (name && /^[-+a-z0-9_]{1,128}$/u.test(name) && element.childNodes.length === 1 && glyph.length <= 64
        && /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\u200D\uFE0F]+$/u.test(glyph)
        && element.attrs.every(a=>['title','data-name','data-unicode-version'].includes(a.name))) {
        const parent = element.parentNode;
        if (parent && 'childNodes' in parent && 'value' in child && child.nodeName === '#text') {
          // Unwrap as text so neighboring content keeps the same formatting run.
          emojiText.set(element, child);
          emojiParents.add(parent);
          child.parentNode = parent;
          const spelling = glyph + ':' + name + ':';
          if (!emojiChecks.has(spelling)) {
            emojiChecks.add(spelling);
            if (source.includes(':' + name + ':') && !source.includes(glyph)) {
              const previous = emojiNames.get(glyph);
              emojiNames.set(glyph, previous === undefined || previous === name ? name : '');
            }
          }
        }
      }
    }
    const classes = (attr(element, 'class') ?? '').split(/\s+/u);
    if (attr(element, 'dir') === 'auto' && (attr(element, 'align')
      || /(?:^|;)\s*text-align\s*:/iu.test(attr(element, 'style') ?? ''))) {
      setAttr(element, 'data-fountain-align-explicit', 'true');
    }
    if (classes.some(name => ['katex', 'katex-display', 'js-render-math', 'frontmatter', 'mermaid', 'md-suggestion',
      'blob-embed', 'footnotes', 'footnote-ref', 'footnote-backref', 'js-render-iframe', 'section-nav',
      'markdown-alert', 'gfm-color_chip', 'idiff', 'audio-container', 'video-container'].includes(name))
      || attr(element, 'data-diagram') || attr(element, 'data-math-style')
      || attr(element, 'data-lang-params') === 'frontmatter'
      || ['mermaid', 'suggestion'].includes(attr(element, 'data-canonical-lang') ?? '')
      || (attr(element, 'data-canonical-src') ?? '').endsWith('drawio.svg')
      || classes.includes('task-table-item')) {
      issues.push({ stage: 'import', code: 'specialized-renderer', message: 'This specialized GitLab rendering requires a source-aware document adapter before visual editing.' });
    }
  }
  if (issues.length) throw new GitLabMarkdownConversionError(issues);
  for (const parent of emojiParents) parent.childNodes = parent.childNodes.map(child => emojiText.get(child) ?? child);
  return serialize(fragment);
}

function markdownAttributes(node: Node) {
  const attrs = { ...node.attrs };
  if (attrs.dir === 'auto') {
    delete attrs.dir; // GitLab's reader adds automatic direction to ordinary Markdown.
    if (attrs.align === 'start' && !attrs.alignExplicit) delete attrs.align;
  }
  return attrs;
}

function withoutReaderDirection(node: Node): Node {
  if (node.isText) return node;
  const children = node.content.map(withoutReaderDirection);
  if (node.attrs.dir === 'auto' && (node.type.name === 'paragraph' || node.type.name === 'heading'))
    return node.type.create(markdownAttributes(node),children,undefined,node.marks);
  return children.some((child,index) => child !== node.child(index)) ? node.copy(children) : node;
}

const wikiMark = (node: Node) => node.marks.find(mark => mark.type.name === 'link' && mark.attrs.gitlabWikiLink);

// A link can span adjacent text runs. Emit its delimiters once and preserve
// formatting shared by the entire label. A partial style has no Gollum source form.
function wikiLinkChildren(parent: Node, visit: (child: Node, index: number) => Node, encode: (source: string) => string): Node[] {
  const output: Node[] = [];
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i), link = wikiMark(child);
    if (!link) { output.push(visit(child,i)); continue; }
    const start = i, marks = child.marks.filter(mark => mark !== link);
    const target = link.attrs.gitlabCanonicalSrc;
    let label = child.text ?? '';
    while (i+1 < parent.childCount) {
      const next = parent.child(i+1), nextLink = wikiMark(next);
      if (!nextLink || !nextLink.eq(link)) break;
      const other = next.marks.filter(mark => mark !== nextLink);
      if (other.length !== marks.length || !other.every((mark,j) => mark.eq(marks[j])))
        throw new GitLabMarkdownConversionError([{stage:'export',code:'wiki-link-label-format',message:'Formatting within part of a wiki link label requires source editing.'}]);
      label += next.text ?? '';
      i++;
    }
    if (!child.isText || !label.trim() || typeof target !== 'string' || !target.trim() || !isSafeURL(target)
      || [target,label].some(value => /[|\r\n]|\[\[|\]\]/u.test(value) || value !== value.trim()) || link.attrs.title)
      throw new GitLabMarkdownConversionError([{stage:'export',code:'wiki-link-source',message:'The wiki link label or destination cannot be represented losslessly in double brackets.'}]);
    output.push(visit(parent.type.schema.text(encode(label === target ? '[[' + label + ']]' : '[[' + label + '|' + target + ']]'),marks),start));
  }
  return output;
}

// Compare the host preview with an independent parse of the authored source before
// removing reader presentation. A mismatch leaves the original import untouched.
function wikiSeedCandidate(node: Node, trimListSeparator = false): Node {
  if (node.isText) {
    const marks = node.marks.map(mark => mark.type.name === 'link' && mark.attrs.target === '_blank'
      ? mark.type.create({...mark.attrs,target:mark.type.spec.attrs?.target?.default}) : mark);
    const text = trimListSeparator && node.text!.endsWith('\n') && node.text!.length > 1 ? node.text!.slice(0,-1) : node.text!;
    return node.type.schema.text(text,marks);
  }
  const children = node.content.map((child,i) => {
    // GitLab's HTML has a formatting newline between loose label text and its nested list.
    const next = node.content[i+1]?.type.name;
    const beforeList = node.type.name === 'list_item' && child.type.name === 'paragraph' && (next === 'bullet_list' || next === 'ordered_list');
    return wikiSeedCandidate(child,beforeList || (trimListSeparator && i === node.childCount-1));
  });
  return node.type.create(markdownAttributes(node),children,undefined,node.marks);
}

function wikiSeedSourceText(node: Node): Node {
  if (node.type.name === 'code_block' && typeof node.attrs.gitlabFenceSuffix === 'string') {
    // The independent CommonMark parser treats the first info word as the language.
    const info = String(node.attrs.language) + node.attrs.gitlabFenceSuffix;
    return node.withAttrs({...node.attrs,language:info.split(/\s+/u)[0],gitlabFenceSuffix:null});
  }
  if (node.type.name === 'task_item' && node.attrs.checked === 'inapplicable') node = node.withAttrs({...node.attrs,checked:false});
  if (node.isText) return node;
  if (!node.content.some(wikiMark)) {
    const children = node.content.map(wikiSeedSourceText);
    return children.some((child,i) => child !== node.child(i)) ? node.copy(children) : node;
  }
  const output: Node[] = [];
  for (const child of wikiLinkChildren(node,wikiSeedSourceText,source => source)) {
    const last = output.at(-1);
    if (child.isText && last?.isText && child.marks.length === last.marks.length && child.marks.every((mark,i) => mark.eq(last.marks[i])))
      output[output.length-1] = last.withText(last.text! + child.text!);
    else output.push(child);
  }
  return node.copy(output);
}

function withWikiBlockOrigins(document: Node, origins: readonly WikiBlockOrigin[]): Node {
  let index = 0;
  function apply(node: Node): Node {
    if (node.isText) return node;
    let decorated = node;
    if (node.type.name === 'table' || node.type.name === 'ordered_list' || node.type.name === 'bullet_list' || node.type.name === 'task_list') {
      const origin = origins[index++];
      if (origin?.type !== node.type.name) throw new Error('Wiki preview block order does not match the source.');
      if (origin.type === 'table') decorated = node.withAttrs({...node.attrs,gitlabIsMarkdown:origin.isMarkdown});
      else if (origin.parens) decorated = node.withAttrs({...node.attrs,gitlabParens:true});
      else if (origin.bullet === '-' || origin.bullet === '+') decorated = node.withAttrs({...node.attrs,gitlabBullet:origin.bullet});
    }
    const children = node.content.map(apply);
    return children.some((child,i) => child !== node.child(i)) ? decorated.copy(children) : decorated;
  }
  const result = apply(document);
  if (index !== origins.length) throw new Error('Unmapped wiki preview block.');
  return result;
}

/** Explicit GitLab conversion boundary; known unhandled expansions remain errors. */
export class GitLabMarkdownCodec implements SerializedContentCodec {
  private readonly emojiSpellings = new WeakMap<Node, ReadonlyMap<string,string>>();
  private readonly wikiBlockSources = new WeakMap<MarkdownSourceSnapshot, MarkdownSourceSnapshot>();
  private readonly sources = new WeakMap<Node, MarkdownSourceSnapshot>();
  // GitLab shares the parameter value without the separator that introduced it.
  private wikiFenceSpellings = new Map<string,string | null>();
  private wikiReferences?: {source: MarkdownSourceSnapshot; links: Set<string>};
  constructor(private readonly options: {
    renderMarkdown(markdown: string, options?: { signal: AbortSignal }): Promise<GitLabRenderResponse>;
    html?: ServerHTMLImporterOptions;
    preserveWikiSource?: boolean;
    wikiRoom?: boolean;
    wikiFenceSpelling?: (node:Node,path:readonly number[]) => string | undefined;
    nodeWriters?: ReadonlyMap<string, (node: Node) => string>;
    markWriters?: ReadonlyMap<string, GitLabMarkWriter>;
    tableOfContentsLabel?: string;
  }) {}

  async deserialize({ schema, markdown, signal, wikiRoomSeed = false }: { schema: Schema; markdown: string; signal: AbortSignal; wikiRoomSeed?: boolean }): Promise<{ document: Node }> {
    if (signal.aborted) throw new Error('GitLab Markdown rendering was cancelled.');
    if (wikiRoomSeed) this.wikiReferences = undefined;
    if (!schema.nodes.gitlab_reference || !schema.nodes.gitlab_placeholder) throw new Error('Use the explicit GitLab schema adapter.');
    try {
      const parser = new ServerHTMLImporter(this.options.html);
      const renderedSource = transformGitLabQuickActions(markdown);
      const response = markdown ? await this.options.renderMarkdown(renderedSource, { signal }) : { body: '<p></p>' };
      if (signal.aborted) throw new Error('GitLab Markdown rendering was cancelled.');
      if (!response || typeof response.body !== 'string') throw new Error('The actual GitLab host renderer must return a body string.');
      const footnotes = await convertGitLabFootnotes(renderedSource, response.body, { ...this.options, signal, html: parser.options });
      if (footnotes.issues.length || footnotes.html === undefined) throw new GitLabMarkdownConversionError([
        { stage: 'import', code: 'footnote-source', message: 'The complete footnote source/render relationship could not be retained. Original Markdown is retained.' },
        ...footnotes.issues.map(code => ({ stage: 'import' as const, code, message: 'A footnote projection requires its explicit source-aware adapter.' })),
      ]);
      const emojiNames = new Map<string,string>();
      const wikiOrigins = wikiRoomSeed && this.options.wikiRoom ? {blocks:[] as WikiBlockOrigin[],inactive:[] as [number,number][]} : undefined;
      const result = parser.parseWithReport(normalizeGitLabRendering(footnotes.html, parser.options, renderedSource, schema, emojiNames, this.options.tableOfContentsLabel !== undefined,wikiOrigins), schema);
      if (result.issues.length) throw new GitLabMarkdownConversionError(result.issues.map(issue => ({ stage: 'import', code: issue.code, message: issue.message })));
      let document = hydrateGitLabQuickActions(hydrateGitLabFrontmatter(hydrateGitLabAlertTitles(result.document), markdown), renderedSource);
      schema.validate(document);
      let wikiSource: MarkdownSourceSnapshot | undefined;
      const proseOnly = document.content.every(block => ['heading', 'paragraph'].includes(block.type.name));
      if (wikiRoomSeed || (this.options.preserveWikiSource && proseOnly)) {
        // GitLab owns the dialect. Reuse the core's block map only when parsing
        // the same source produces the complete tree returned by GitLab.
        try {
          // GitLab verifies each [~] marker against its rendered checkbox source position.
          // Compare those positions as ordinary pending tasks with the CommonMark parser.
          let comparisonSource = markdown;
          if (wikiOrigins?.inactive.length) {
            const lines = markdown.split(/(\r\n|\r|\n)/u);
            for (const [row,column] of wikiOrigins.inactive) {
              const i = row * 2, line = lines[i];
              if (line?.slice(column-1,column+2) !== '[~]') throw new Error('Wiki task source position mismatch.');
              lines[i] = line.slice(0,column) + ' ' + line.slice(column+1);
            }
            comparisonSource = lines.join('');
          }
          const parsed = MarkdownSourceSnapshot.parse(comparisonSource, schema, wikiOrigins ? {parseHTMLBlock:(html,target) => {
            if (!/^\s*<table[\s>]/iu.test(html)) return null;
            const raw = parser.parseWithReport(html,target);
            return raw.issues.length ? null : raw.document;
          }} : {});
          const prose = wikiOrigins ? wikiSeedCandidate(document) : withoutReaderDirection(document);
          const compared = wikiOrigins ? wikiSeedSourceText(prose) : prose;
          if (parsed.document.eq(compared)) {
            if (wikiRoomSeed) document = wikiOrigins ? withWikiBlockOrigins(prose,wikiOrigins.blocks) : prose;
            if (proseOnly && compared === prose) {
              wikiSource = parsed.source;
              if (wikiRoomSeed && wikiSource.referenceDefinitions) {
                const links = new Set<string>();
                prose.descendants(node => { for (const mark of node.marks) if (mark.type.name === 'link') links.add(JSON.stringify(mark.toJSON())); });
                this.wikiReferences = {source:wikiSource,links};
              }
            }
          }
        } catch {
          // A wiki extension may accept syntax outside the local parser.
          // Its server-rendered tree still has the original source snapshot.
        }
      }
      if (wikiRoomSeed) {
        const spellings = new Map<string,string | null>();
        document.descendants(node => {
          const suffix = node.attrs.gitlabFenceSuffix, params = fenceParameters(suffix);
          if (typeof suffix !== 'string' || !params) return;
          const key = node.attrs.language + ':' + params;
          spellings.set(key,spellings.has(key) && spellings.get(key) !== suffix ? null : suffix);
        });
        this.wikiFenceSpellings = spellings;
      }
      const source = MarkdownSourceSnapshot.capture(markdown, document);
      if (wikiSource) this.wikiBlockSources.set(source,wikiSource);
      document.descendants(node => {
        this.sources.set(node, source);
        if (emojiNames.size && node.isText && /\p{Extended_Pictographic}/u.test(node.text ?? '')) this.emojiSpellings.set(node,emojiNames);
      });
      return { document };
    } catch (error) {
      if (error instanceof GitLabMarkdownConversionError) throw new GitLabMarkdownConversionError(error.issues, markdown);
      if (error instanceof GitLabQuickActionSourceError) throw new GitLabMarkdownConversionError([{ stage: 'import', code: 'quick-action-source',
        message: 'The rendered quick-action text cannot be matched unambiguously to its source. Retain source editing.' }], markdown);
      throw new GitLabMarkdownConversionError([{ stage: 'import', code: signal.aborted ? 'cancelled' : 'render-or-parse-failed',
        message: signal.aborted ? 'GitLab conversion was cancelled.' : 'The host renderer or bounded HTML conversion failed; original Markdown is retained.' }], markdown);
    }
  }

  serializeWithReport({ doc, canonical = false }: { doc: Node; canonical?: boolean }): { markdown: string; preservation: 'exact' | 'canonical' | 'blocks'; issues: readonly GitLabMarkdownIssue[] } {
    if (this.options.wikiRoom && hasPendingWikiFile(doc)) return {markdown:'',preservation:'canonical',issues:[{
      stage:'export',code:'pending-wiki-upload',message:'Wait for the attachment to finish uploading before saving this wiki page.',
    }]};
    const sources = new Set<MarkdownSourceSnapshot>();
    doc.descendants(node => { const source = this.sources.get(node); if (source) sources.add(source); });
    if (!canonical && sources.size === 1) {
      const source = sources.values().next().value!;
      if (source.matches(doc)) return { markdown: source.source, preservation: 'exact', issues: [] };
    }
    // GitLab stores a cleared description as empty source, not an internal caret
    // carrier. Exact authored source above and non-default structure stay intact.
    const paragraph = doc.childCount === 1 ? doc.child(0) : undefined;
    if (paragraph?.type.name === 'paragraph' && (paragraph.childCount === 0
      || paragraph.childCount === 1 && paragraph.child(0).isText && paragraph.child(0).text === '')) {
      const empty = doc.type.schema.node('paragraph', {}, paragraph.childCount ? [doc.type.schema.text('')] : []);
      if (doc.eq(doc.type.create({}, [empty]))) return { markdown: '', preservation: 'canonical', issues: [] };
    }
    const issues: GitLabMarkdownIssue[] = [], tokens = new Map<string, string>();
    let prefix = 'FOUNTAINGITLABSOURCETOKEN';
    const customSources = new Map<Node, string>();
    const customMarks = new Map<Mark, ReturnType<GitLabMarkWriter>>();
    if (this.options.nodeWriters?.size || this.options.markWriters?.size) {
      doc.descendants((node, path) => {
        for (const mark of node.marks) {
          const writer = this.options.markWriters?.get(mark.type.name);
          if (!writer || customMarks.has(mark)) continue;
          try { customMarks.set(mark, writer(mark)); }
          catch (error) {
            issues.push({ stage:'export', code:'custom-mark-source', path,
              message:error instanceof Error ? error.message : 'The host serializer could not write ' + mark.type.name });
          }
        }
        const write = this.options.nodeWriters?.get(node.type.name);
        if (!write) return;
        try { customSources.set(node, write(node)); }
        catch (error) {
          issues.push({ stage: 'export', code: 'custom-node-source', path,
            message: error instanceof Error ? error.message : 'The host serializer could not write ' + node.type.name });
        }
        return false;
      });
      if (issues.length) return { markdown: '', preservation: 'canonical', issues };
    }
    const encoded = JSON.stringify(doc.toJSON());
    const authored = [...customSources.values(), ...Array.from(customMarks.values(), pair => pair.open + '\n' + pair.close)].join('\n');
    while (encoded.includes(prefix) || authored.includes(prefix)) prefix += 'X';
    const noteDefinitions = new Map<string, Node>();
    const noteLabels = new Set<string>();
    doc.descendants((node, path) => {
      if (node.type.name !== 'footnote_definition') return;
      const id = String(node.attrs.id), label = node.attrs.gitlabFootnoteLabel ?? id;
      if (noteDefinitions.has(id) || typeof label !== 'string' || !validGitLabFootnoteLabel(label) || noteLabels.has(label))
        issues.push({ stage: 'export', code: 'footnote-definition-identity', path, message: 'Footnote definitions require unique identities and labels.' });
      noteDefinitions.set(id, node); noteLabels.add(String(label));
    });
    const noteToken = (label: string) => {
      const token = `${prefix}${tokens.size}END`;
      tokens.set(token, label);
      return token;
    };
    const project = (node: Node, path: number[]): Node => {
      if (customSources.has(node)) return node;
      if (node.type.name === 'footnote_reference') {
        const definition = noteDefinitions.get(String(node.attrs.id));
        if (!definition || node.marks.some(mark => ['code', 'link'].includes(mark.type.name)))
          issues.push({ stage: 'export', code: 'footnote-reference-target', path, message: 'A footnote reference requires its own definition and supported formatting.' });
        const label = String(definition?.attrs.gitlabFootnoteLabel ?? definition?.attrs.id ?? node.attrs.id);
        const original = node.attrs.gitlabFootnoteLabel === node.attrs.gitlabFootnoteOriginalLabel
          && node.attrs.gitlabFootnoteTargetLabel === label && validGitLabFootnoteLabel(node.attrs.gitlabFootnoteLabel)
          ? String(node.attrs.gitlabFootnoteLabel) : label;
        const token = `${prefix}${tokens.size}END`; tokens.set(token, `[^${original}]`);
        return doc.type.schema.text(token, node.marks);
      }
      if (node.type.name === 'footnote_definition') return node.type.create({ ...node.attrs,
        id: noteToken(String(node.attrs.gitlabFootnoteLabel ?? node.attrs.id)) }, node.content.map((child, index) => project(child, [...path, index])));
      const command = path.length === 1 ? serializeGitLabQuickAction(node) : undefined;
      if (command !== undefined) {
        const token = `${prefix}${tokens.size}END`; tokens.set(token, command);
        return project(node.type.create(node.attrs, [node.type.schema.text(token)]), path);
      }
      if (node.type.name === 'paragraph' && node.attrs.gitlabLiteralSlash) {
        const first = node.content[0];
        const leadingSlash = first?.isText ? first.text?.match(/^([\t ]*)\//u) : undefined;
        if (first?.isText && leadingSlash && !first.marks.length) {
          const token = `${prefix}${tokens.size}END`; tokens.set(token, '\\/');
          return project(node.type.create({ ...node.attrs, gitlabLiteralSlash: false }, [
            node.type.schema.text(leadingSlash[1] + token + first.text!.slice(leadingSlash[0].length)), ...node.content.slice(1),
          ]), path);
        }
      }
      if (node.type.name === 'code_block' && node.attrs.gitlabFenceSuffix != null) {
        const suffix = node.attrs.gitlabFenceSuffix, params = fenceParameters(suffix);
        const language = String(node.attrs.language);
        const groupSpelling = !canonical && params ? this.wikiFenceSpellings.get(language + ':' + params) : undefined;
        const spelling = groupSpelling === null ? this.options.wikiFenceSpelling?.(node,path) ?? null : groupSpelling;
        if (typeof suffix !== 'string' || !params || !ordinaryFence(language,params) || spelling === null || node.attrs.gitlabFrontmatter) {
          issues.push({stage:'export',code:'code-fence-parameters',path,message:'The code fence parameters need an unambiguous source spelling.'});
          return node;
        }
        const token = `${prefix}${tokens.size}END`;
        tokens.set(token,language + (spelling ?? suffix));
        return node.type.create({...node.attrs,language:token,gitlabFenceSuffix:null},node.content);
      }
      if (node.attrs.gitlabFrontmatter) {
        try {
          const raw = serializeGitLabFrontmatter(node, path);
          const token = `${prefix}${tokens.size}END`;
          if (getGitLabFrontmatter(node)?.kind === 'fence') {
            // Let the normal exporter indent every source line in nested fences.
            tokens.set(token, `${String(node.attrs.language)} frontmatter`);
            return node.type.create({ ...node.attrs, language: token, gitlabFrontmatter: null }, node.content);
          }
          tokens.set(token, raw);
          return node.type.schema.node('paragraph', {}, [node.type.schema.text(token)]);
        } catch (error) {
          issues.push({ stage: 'export', code: 'frontmatter-source', path,
            message: error instanceof Error ? error.message : 'Invalid frontmatter source.' });
          return node.type.schema.node('paragraph');
        }
      }
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
      const attrs = markdownAttributes(node);
      const marks = node.marks.map(mark => mark.type.name === 'link' && typeof mark.attrs.gitlabCanonicalSrc === 'string'
        ? mark.type.create({ ...mark.attrs, href: mark.attrs.gitlabCanonicalSrc, gitlabCanonicalSrc: undefined, htmlHref: undefined }) : mark);
      let text = node.text;
      const originalEmoji = this.emojiSpellings.get(node);
      if (originalEmoji && text && typeof Intl.Segmenter === 'function') {
        // Retain spellings on existing text. Newly typed or pasted characters
        // have no source provenance and serialize as ordinary Unicode.
        const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text);
        text = Array.from(segments, ({ segment }) => {
          const name = originalEmoji.get(segment);
          if (!name) return segment;
          const token = prefix + tokens.size + 'END';
          tokens.set(token, ':' + name + ':');
          return token;
        }).join('');
      }
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
      const projectChild = (child: Node,index: number) => project(child,[...path,index]);
      const content = node.content.some(wikiMark) ? wikiLinkChildren(node,projectChild,noteToken) : node.content.map(projectChild);
      if (text === node.text && retainedMarks.length === node.marks.length && retainedMarks.every((mark, index) => mark === node.marks[index])
        && content.every((child, index) => child === node.child(index))
        && Object.keys(attrs).length === Object.keys(node.attrs).length
        && Object.entries(attrs).every(([key, value]) => value === node.attrs[key])) return node;
      return node.type.create(attrs, content, text, retainedMarks);
    };
    let projected: Node;
    try { projected = project(doc,[]); }
    catch (error) {
      if (!(error instanceof GitLabMarkdownConversionError)) throw error;
      return {markdown:'',preservation:'canonical',issues:[...issues,...error.issues]};
    }
    const paths = new WeakMap<Node, readonly number[]>();
    projected.descendants((node, path) => { paths.set(node, path); });
    const extensionWriters = Object.fromEntries(Array.from(this.options.nodeWriters?.keys() ?? [], name =>
      [name, (node: Node) => customSources.get(node)] as const));
    const markSerializers = Object.fromEntries(Array.from(this.options.markWriters?.keys() ?? [], name =>
      [name, (mark: Mark) => customMarks.get(mark)!] as const));
    const bulletMarker = this.options.wikiRoom ? (node: Node): '+' | '-' | '*' => {
      const marker = node.attrs.gitlabBullet;
      return marker === '+' || marker === '-' ? marker : '*';
    } : undefined;
    const orderedListDelimiter = this.options.wikiRoom ? (node: Node) => node.attrs.gitlabParens ? ')' as const : '.' as const : undefined;
    const tableDelimiterStyle = this.options.wikiRoom ? 'header-width' : 'compact';
    const blockSerializers = {
      ...extensionWriters,
      table: (node: Node) => serializeGitLabHTMLTable(node, prefix, Boolean(this.options.wikiRoom)),
      gitlab_code_suggestion: serializeGitLabSuggestionNode,
      gitlab_table_of_contents: (node: Node) => String(node.attrs.token),
      direction_scope: (node: Node): string | undefined => {
        // GitLab strips Fountain data attributes and bare checkbox inputs. A
        // plain direction container with Markdown children keeps its task/source
        // mapping and lets the actual renderer own specialized descendants.
        if (!['auto', 'ltr', 'rtl'].includes(String(node.attrs.dir)) || node.marks.length
          || Object.entries(node.attrs).some(([key, value]) => key !== 'dir' && value !== undefined)) return undefined;
        const inner = new MarkdownExporter().exportWithReport(node.type.schema.node('doc', {}, node.content),
          { omitTrailingCaret: true, bulletMarker, orderedListDelimiter, tableDelimiterStyle, blockSerializers, inlineSerializers: extensionWriters, markSerializers });
        issues.push(...inner.losses.map(loss => ({ stage: 'export' as const, code: loss.kind + ':' + loss.type,
          message: loss.detail, path: [...(paths.get(node) ?? []), ...loss.path] })));
        return `<div dir="${node.attrs.dir}">\n\n${transformGitLabQuickActions(inner.markdown, 'literal')}\n\n</div>`;
      },
    };
    const exported = new MarkdownExporter().exportWithReport(projected, { omitTrailingCaret: true, bulletMarker, orderedListDelimiter, tableDelimiterStyle, blockSerializers, inlineSerializers: extensionWriters, markSerializers });
    issues.push(...exported.losses.map(loss => ({ stage: 'export' as const, code: loss.kind + ':' + loss.type, message: loss.detail, path: loss.path })));
    if (!canonical && !issues.length && !tokens.size && !customSources.size && !customMarks.size) {
      let source = sources.size === 1 ? this.wikiBlockSources.get(sources.values().next().value!) : undefined;
      // The host recreates node identities on remote edits. Use the verified baseline only while
      // a link from that wiki survives. The exporter maps blocks by their current semantics.
      if (!source && this.wikiReferences && projected.content.every(block => ['heading','paragraph'].includes(block.type.name))) {
        const baseline = this.wikiReferences;
        let linked = false;
        projected.descendants(node => {
          if (!linked) linked = node.marks.some(mark => mark.type.name === 'link' && baseline.links.has(JSON.stringify(mark.toJSON())));
        });
        if (linked) source = baseline.source;
      }
      if (source?.blocks.length && projected.content.every(block => ['heading', 'paragraph'].includes(block.type.name))) {
        const retained = MarkdownExporter.exportWithSource(projected, source, { omitTrailingCaret: true });
        if (!retained.losses.length && ['exact','blocks','mapped-blocks'].includes(retained.preservation))
          return { markdown: retained.markdown, preservation: retained.preservation === 'exact' ? 'exact' : 'blocks', issues };
      }
    }
    // Expand complete markers once, including double-digit footnote indexes.
    const markdown = tokens.size ? exported.markdown.replace(new RegExp(`${prefix}[0-9]+END`, 'gu'),
      token => tokens.get(token) ?? token) : exported.markdown;
    return { markdown, preservation: 'canonical', issues };
  }
  serialize(input: { doc: Node }): string {
    const result = this.serializeWithReport(input);
    if (result.issues.length) throw new GitLabMarkdownConversionError(result.issues);
    return result.markdown;
  }
}
