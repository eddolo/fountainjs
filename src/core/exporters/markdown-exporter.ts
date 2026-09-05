import type { EditorState } from '../state';
import type { Node } from '../schema';
import { fontFamilyCSS } from '../../text-style/values';
import { MarkdownSourceSnapshot, type MarkdownLineEnding } from '../importers/markdown-importer';
import { escapeMarkdownEntityOpeners } from '../markdown-entities';

export type MarkdownLinkStyle = 'inline' | 'reference';
export type MarkdownLossKind = 'node' | 'mark' | 'attribute';

export interface MarkdownExportLoss {
  readonly kind: MarkdownLossKind;
  readonly type: string;
  readonly path: readonly number[];
  readonly detail: string;
}

export interface MarkdownExportOptions {
  /** Emit ordinary inline destinations or deterministic reference definitions. */
  linkStyle?: MarkdownLinkStyle;
  /** Receives each lossy projection after it is recorded in the returned report. */
  onLoss?: (loss: MarkdownExportLoss) => void;
}

export interface MarkdownExportResult {
  readonly markdown: string;
  readonly losses: readonly MarkdownExportLoss[];
}

export type MarkdownSourcePreservation = 'exact' | 'blocks' | 'mapped-blocks' | 'frontmatter' | 'canonical';

export interface MarkdownSourceExportResult extends MarkdownExportResult {
  /**
   * `exact` returns the original source string unchanged; `blocks` additionally
   * retains aligned separators; `mapped-blocks` retains uniquely mapped source
   * through structural edits; `frontmatter` retains only the inert frontmatter
   * prefix; `canonical` is a normal semantic export.
   */
  readonly preservation: MarkdownSourcePreservation;
}

interface ReferenceDefinition {
  readonly id: string;
  readonly href: string;
  readonly title: string;
}

interface RenderContext {
  readonly options: MarkdownExportOptions;
  readonly losses: MarkdownExportLoss[];
  readonly references: Map<string, ReferenceDefinition>;
}

const SUPPORTED_MARKS = new Set(['code', 'strong', 'em', 'strike', 'link', 'highlight']);
const TEXT_STYLE_MARKS = new Set(['text_color', 'highlight', 'font_family', 'font_size', 'line_height']);
const LIST_TYPES = new Set(['bullet_list', 'ordered_list', 'task_list']);

function escapeInline(text: string): string {
  return escapeMarkdownEntityOpeners(text.replace(/([\\`*_[\]<>])/g, '\\$1'));
}

function codeSpan(text: string): string {
  let longestRun = 0;
  for (const match of text.matchAll(/`+/gu)) longestRun = Math.max(longestRun, match[0].length);
  const delimiterLength = longestRun + 1;
  const delimiter = '`'.repeat(delimiterLength);
  const needsPadding = text.startsWith('`')
    || text.endsWith('`')
    || (text.startsWith(' ') && text.endsWith(' ') && /[^ ]/u.test(text));
  return needsPadding ? `${delimiter} ${text} ${delimiter}` : `${delimiter}${text}${delimiter}`;
}

function escapeHTML(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeTitle(value: unknown): string {
  const escaped = String(value ?? '').replace(/([\\"])/g, '\\$1').replace(/[\r\n]+/g, ' ');
  return escapeMarkdownEntityOpeners(escaped);
}

function destination(value: unknown): string {
  const href = String(value ?? '');
  const needsAngles = /[\s()<>]/.test(href);
  const escaped = needsAngles ? href.replace(/([\\<>])/g, '\\$1') : href;
  const protectedHref = escapeMarkdownEntityOpeners(escaped);
  return needsAngles ? `<${protectedHref}>` : protectedHref;
}

function report(
  context: RenderContext,
  kind: MarkdownLossKind,
  type: string,
  path: readonly number[],
  detail: string,
): void {
  const loss = Object.freeze({ kind, type, path: Object.freeze([...path]), detail });
  context.losses.push(loss);
  try { context.options.onLoss?.(loss); }
  catch { /* Reporting cannot make otherwise valid serialization fail. */ }
}

function reference(context: RenderContext, href: unknown, title: unknown): string {
  const normalizedHref = String(href ?? '');
  const normalizedTitle = String(title ?? '');
  const key = `${normalizedHref}\u0000${normalizedTitle}`;
  let definition = context.references.get(key);
  if (!definition) {
    definition = Object.freeze({
      id: `ref-${context.references.size + 1}`,
      href: normalizedHref,
      title: normalizedTitle,
    });
    context.references.set(key, definition);
  }
  return definition.id;
}

function link(
  label: string,
  href: unknown,
  title: unknown,
  context: RenderContext,
  image = false,
): string {
  const prefix = image ? '!' : '';
  // Reference definitions require a destination. Preserve a semantic empty
  // link inline even when the rest of the document uses reference style.
  if (context.options.linkStyle === 'reference' && (image || String(href ?? '').trim())) {
    return `${prefix}[${label}][${reference(context, href, title)}]`;
  }
  const suffix = title ? ` "${escapeTitle(title)}"` : '';
  return `${prefix}[${label}](${destination(href)}${suffix})`;
}

function reportNodeAttributes(
  node: Node,
  context: RenderContext,
  path: readonly number[],
  tableAlignmentRepresented = false,
): void {
  const name = node.type.name;
  if (!tableAlignmentRepresented && ['paragraph', 'heading'].includes(name) && node.attrs.align && node.attrs.align !== 'left') {
    report(context, 'attribute', name, path, 'Text alignment is not represented by ordinary Markdown.');
  }
  if (name === 'code_block' && node.attrs.lineNumbers === false) {
    report(context, 'attribute', name, path, 'The code-block line-number preference is not represented by Markdown fences.');
  }
  if (['inline_math', 'math_block'].includes(name) && node.attrs.ariaLabel) {
    report(context, 'attribute', name, path, 'The accessible math label is not represented by TeX delimiters.');
  }
  if (['image_super', 'inline_image'].includes(name)) {
    const nonDefaultLayout = node.attrs.width !== '100%'
      || node.attrs.height !== 'auto'
      || node.attrs.align !== 'center'
      || Boolean(node.attrs.srcset)
      || Boolean(node.attrs.sizes)
      || node.attrs.loading !== 'lazy'
      || node.attrs.decoding !== 'async'
      || (name === 'image_super' && Boolean(node.attrs.caption));
    if (nonDefaultLayout) {
      report(context, 'attribute', name, path, 'Image layout, responsive-source, loading, and caption metadata may be projected or omitted.');
    }
  }
  if (['table_header', 'table_cell'].includes(name)) {
    if (Number(node.attrs.colspan) !== 1 || Number(node.attrs.rowspan) !== 1 || node.attrs.colwidth) {
      report(context, 'attribute', name, path, 'Markdown tables cannot represent merged cells or stored column widths.');
    }
    if (name === 'table_header' && node.attrs.scope !== 'col') {
      report(context, 'attribute', name, path, 'Markdown tables cannot represent a non-column header scope.');
    }
  }
}

function rubyBaseHTML(node: Node, context: RenderContext, path: readonly number[]): string {
  let value = escapeHTML(node.text ?? '');
  for (const mark of [...node.marks].reverse()) {
    const name = mark.type.name;
    if (name === 'strong') value = `<strong>${value}</strong>`;
    else if (name === 'em') value = `<em>${value}</em>`;
    else if (name === 'underline') value = `<u>${value}</u>`;
    else if (name === 'strike') value = `<s>${value}</s>`;
    else if (name === 'code') value = `<code>${value}</code>`;
    else if (name === 'subscript') value = `<sub>${value}</sub>`;
    else if (name === 'superscript') value = `<sup>${value}</sup>`;
    else if (name === 'highlight') value = `<mark style="background-color:${escapeHTML(mark.attrs.color)}">${value}</mark>`;
    else if (name === 'text_color') value = `<span style="color:${escapeHTML(mark.attrs.color)}">${value}</span>`;
    else if (name === 'font_family') value = `<span style="font-family:${escapeHTML(fontFamilyCSS(mark.attrs.family))}">${value}</span>`;
    else if (name === 'font_size') value = `<span style="font-size:${escapeHTML(mark.attrs.size)}">${value}</span>`;
    else if (name === 'line_height') value = `<span style="line-height:${escapeHTML(mark.attrs.lineHeight)}">${value}</span>`;
    else if (name === 'link') {
      const title = mark.attrs.title ? ` title="${escapeHTML(mark.attrs.title)}"` : '';
      const target = mark.attrs.target === '_self' ? '_self' : '_blank';
      value = `<a href="${escapeHTML(mark.attrs.href)}"${title} target="${target}">${value}</a>`;
    } else report(context, 'mark', name, path, 'This custom mark cannot be represented inside semantic ruby HTML and is omitted.');
  }
  return value;
}

function needsTextStyleHTML(node: Node): boolean {
  return node.marks.some((mark) => (
    ['text_color', 'font_family', 'font_size', 'line_height'].includes(mark.type.name)
      || (mark.type.name === 'highlight' && mark.attrs.color !== '#fff3a3')
  ));
}

function textStyleHTML(node: Node, context: RenderContext, path: readonly number[]): string {
  const styles: string[] = [];
  node.marks.forEach((mark) => {
    if (mark.type.name === 'text_color') styles.push(`color:${String(mark.attrs.color)}`);
    else if (mark.type.name === 'highlight') styles.push(`background-color:${String(mark.attrs.color)}`);
    else if (mark.type.name === 'font_family') styles.push(`font-family:${fontFamilyCSS(mark.attrs.family)}`);
    else if (mark.type.name === 'font_size') styles.push(`font-size:${String(mark.attrs.size)}`);
    else if (mark.type.name === 'line_height') styles.push(`line-height:${String(mark.attrs.lineHeight)}`);
  });
  let value = escapeHTML(node.text ?? '');
  for (const mark of [...node.marks].reverse().filter((mark) => !TEXT_STYLE_MARKS.has(mark.type.name))) {
    const name = mark.type.name;
    if (name === 'strong') value = `<strong>${value}</strong>`;
    else if (name === 'em') value = `<em>${value}</em>`;
    else if (name === 'underline') value = `<u>${value}</u>`;
    else if (name === 'strike') value = `<s>${value}</s>`;
    else if (name === 'code') value = `<code>${value}</code>`;
    else if (name === 'subscript') value = `<sub>${value}</sub>`;
    else if (name === 'superscript') value = `<sup>${value}</sup>`;
    else if (name === 'link') {
      const title = mark.attrs.title ? ` title="${escapeHTML(mark.attrs.title)}"` : '';
      const target = mark.attrs.target === '_self' ? '_self' : '_blank';
      value = `<a href="${escapeHTML(mark.attrs.href)}"${title} target="${target}">${value}</a>`;
    } else report(context, 'mark', name, path, 'This custom mark cannot be represented inside lossless text-style HTML and is omitted.');
  }
  return `<span data-fountain-text-style="true" style="${escapeHTML(styles.join(';'))}">${value}</span>`;
}

function inline(node: Node, context: RenderContext, path: readonly number[], preserveMarkBoundary = false): string {
  reportNodeAttributes(node, context, path);
  if (!node.isText) {
    if (node.type.name === 'hard_break') return '  \n';
    if (node.type.name === 'footnote_reference') return `[^${String(node.attrs.id)}]`;
    if (node.type.name === 'inline_math') return `$${String(node.attrs.latex ?? '')}$`;
    if (node.type.name === 'inline_image') {
      return link(escapeInline(String(node.attrs.alt ?? '')), node.attrs.src, node.attrs.title, context, true);
    }
    if (node.type.name === 'ruby') {
      const base = node.content
        .map((child, index) => rubyBaseHTML(child, context, [...path, index]))
        .join('');
      return `<ruby data-fountain-ruby="true"><rb>${base}</rb><rp>(</rp><rt>${escapeHTML(node.attrs.rt)}</rt><rp>)</rp></ruby>`;
    }
    if (node.type.name === 'mention' || node.type.name === 'emoji') {
      report(context, 'node', node.type.name, path, 'Typed identity and fallback metadata are projected to readable text.');
      return escapeInline(node.textContent);
    }
    report(context, 'node', node.type.name, path, node.content.length
      ? 'Unsupported inline node structure is flattened to its child content.'
      : 'Unsupported inline atom is projected to its plain-text value.');
    return node.content.length
      ? node.content.map((child, index) => inline(child, context, [...path, index])).join('')
      : escapeInline(node.textContent);
  }

  if (preserveMarkBoundary) {
    const linkIndex = node.marks.findIndex((mark) => mark.type.name === 'link');
    const linkMark = linkIndex > 0 ? undefined : node.marks[linkIndex];
    const value = textStyleHTML(node.withMarks(node.marks.filter((mark) => mark !== linkMark)), context, path);
    return linkMark ? link(value, linkMark.attrs.href, linkMark.attrs.title, context) : value;
  }
  if (needsTextStyleHTML(node)) return textStyleHTML(node, context, path);

  node.marks.forEach((mark) => {
    if (!SUPPORTED_MARKS.has(mark.type.name)) {
      report(context, 'mark', mark.type.name, path, 'This mark has no built-in Markdown representation and is omitted.');
    } else if (mark.type.name === 'link' && mark.attrs.target !== '_blank') {
      report(context, 'attribute', 'link', path, 'The link target is not represented by Markdown.');
    } else if (mark.type.name === 'highlight' && mark.attrs.color !== '#fff3a3') {
      report(context, 'attribute', 'highlight', path, 'The custom highlight color is projected to the default Markdown highlight.');
    }
  });
  let text = node.marks.some((mark) => mark.type.name === 'code')
    ? codeSpan(node.text ?? '')
    : escapeInline(node.text ?? '');
  const strongIndex = node.marks.findIndex((mark) => mark.type.name === 'strong');
  const emIndex = node.marks.findIndex((mark) => mark.type.name === 'em');
  const emDelimiter = strongIndex >= 0 && strongIndex < emIndex ? '_' : '*';
  for (const mark of [...node.marks].reverse().filter((item) => item.type.name !== 'code')) {
    if (mark.type.name === 'strong') text = `**${text}**`;
    else if (mark.type.name === 'em') text = `${emDelimiter}${text}${emDelimiter}`;
    else if (mark.type.name === 'strike') text = `~~${text}~~`;
    else if (mark.type.name === 'link') text = link(text, mark.attrs.href, mark.attrs.title, context);
    else if (mark.type.name === 'highlight') text = `==${text}==`;
  }
  return text;
}

function sharedEmphasis(left: Node | undefined, right: Node | undefined): boolean {
  return Boolean(left?.isText && right?.isText && left.marks.some((mark) => (
    (mark.type.name === 'strong' || mark.type.name === 'em')
    && right.marks.some((candidate) => candidate.eq(mark))
  )));
}

function inlineContent(node: Node, context: RenderContext, path: readonly number[]): string {
  return node.content.map((child, index) => {
    const marked = child.isText && child.marks.some((mark) => mark.type.name === 'strong' || mark.type.name === 'em');
    const preserve = marked && (
      /^\s|\s$/u.test(child.text ?? '')
      || sharedEmphasis(node.content[index - 1], child)
      || sharedEmphasis(child, node.content[index + 1])
      || child.marks.some((mark, markIndex) => child.marks.findIndex((candidate) => candidate.type === mark.type) < markIndex)
    );
    return inline(child, context, [...path, index], preserve);
  }).join('');
}

function tableCell(node: Node, context: RenderContext, path: readonly number[], depth: number): string {
  reportNodeAttributes(node, context, path);
  if (node.content.length !== 1 || node.content[0]?.type.name !== 'paragraph') {
    report(context, 'node', node.type.name, path, 'Multiple or non-paragraph cell blocks are flattened into one Markdown table cell.');
  }
  return node.content
    .map((child, index) => render(child, context, [...path, index], depth, true))
    .join(' ')
    .replace(/\|/g, '\\|')
    .replace(/\n+/g, ' ');
}

function tableAlignment(cell: Node | undefined): 'left' | 'center' | 'right' {
  const align = cell?.content[0]?.attrs.align;
  return align === 'center' || align === 'right' ? align : 'left';
}

function longestMarkerRun(value: string, marker: '`' | '~'): number {
  let longest = 0;
  let current = 0;
  for (const character of value) {
    if (character === marker) {
      current += 1;
      longest = Math.max(longest, current);
    } else current = 0;
  }
  return longest;
}

function fencedCode(node: Node): string {
  const value = node.textContent;
  const language = String(node.attrs.language ?? '').trim().split(/\s+/u)[0] ?? '';
  const marker: '`' | '~' = language.includes('`') ? '~' : '`';
  const fence = marker.repeat(Math.max(3, longestMarkerRun(value, marker) + 1));
  return `${fence}${language}\n${value}\n${fence}`;
}

function withLineEnding(value: string, lineEnding: MarkdownLineEnding): string {
  return value.replace(/\r\n|\r|\n/gu, lineEnding);
}

function withSourceFrontmatter(source: MarkdownSourceSnapshot, body: string): string {
  const frontmatter = source.frontmatter?.raw ?? '';
  const separator = frontmatter
    && !frontmatter.endsWith('\n')
    && !frontmatter.endsWith('\r')
    && body
    ? source.lineEnding
    : '';
  return `${frontmatter}${separator}${body}`;
}

function render(
  node: Node,
  context: RenderContext,
  path: readonly number[] = [],
  depth = 0,
  tableAlignmentRepresented = false,
): string {
  reportNodeAttributes(node, context, path, tableAlignmentRepresented);
  const children = () => node.content
    .map((child, index) => render(child, context, [...path, index], depth))
    .join('');
  switch (node.type.name) {
    case 'doc': return node.content.map((child, index) => render(child, context, [index])).join('\n\n').replace(/\n{3,}/g, '\n\n');
    case 'text': return inline(node, context, path);
    case 'paragraph': return inlineContent(node, context, path);
    case 'heading': return `${'#'.repeat(Number(node.attrs.level) || 1)} ${inlineContent(node, context, path)}`;
    case 'blockquote': return node.content
      .map((child, index) => render(child, context, [...path, index], depth))
      .join('\n\n')
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    case 'details': {
      const summary = node.content[0];
      const label = summary
        ? render(summary, context, [...path, 0], depth).replace(/\s*\n\s*/g, ' ')
        : 'Details';
      const body = node.content.slice(1)
        .map((child, index) => render(child, context, [...path, index + 1], depth))
        .join('\n\n');
      return `<details${node.attrs.open ? ' open' : ''}>\n<summary>${label}</summary>\n\n${body}\n</details>`;
    }
    case 'details_summary': return inlineContent(node, context, path);
    case 'bullet_list': return node.content.map((child, index) => `${'  '.repeat(depth)}- ${render(child, context, [...path, index], depth + 1)}`).join('\n');
    case 'ordered_list': return node.content.map((child, index) => `${'  '.repeat(depth)}${(Number(node.attrs.start) || 1) + index}. ${render(child, context, [...path, index], depth + 1)}`).join('\n');
    case 'task_list': return node.content.map((child, index) => `${'  '.repeat(depth)}- [${child.attrs.checked ? 'x' : ' '}] ${render(child, context, [...path, index], depth + 1)}`).join('\n');
    case 'list_item': case 'task_item': return node.content.map((child, index) => {
      const value = render(child, context, [...path, index], depth);
      if (index === 0) return value;
      if (LIST_TYPES.has(child.type.name)) return `\n${value}`;
      const indentation = '  '.repeat(depth);
      return `\n\n${indentation}${value.replace(/\n/g, `\n${indentation}`)}`;
    }).join('');
    case 'code_block': return fencedCode(node);
    case 'horizontal_rule': return '---';
    case 'hard_break': return '  \n';
    case 'math_block': return `$$\n${String(node.attrs.latex ?? '')}\n$$`;
    case 'image_super': {
      const image = link(escapeInline(String(node.attrs.alt ?? '')), node.attrs.src, node.attrs.title, context, true);
      return `${image}${node.attrs.caption ? `\n_${escapeInline(String(node.attrs.caption))}_` : ''}`;
    }
    case 'audio':
      report(context, 'node', node.type.name, path, 'Typed audio is projected to a link and cannot be reconstructed from Markdown alone.');
      return `${link(`Audio${node.attrs.title ? `: ${escapeInline(String(node.attrs.title))}` : ''}`, node.attrs.src, '', context)}${node.attrs.caption ? `\n_${escapeInline(String(node.attrs.caption))}_` : ''}`;
    case 'video':
      report(context, 'node', node.type.name, path, 'Typed video is projected to a link and cannot be reconstructed from Markdown alone.');
      return `${link(`Video${node.attrs.title ? `: ${escapeInline(String(node.attrs.title))}` : ''}`, node.attrs.src, '', context)}${node.attrs.caption ? `\n_${escapeInline(String(node.attrs.caption))}_` : ''}`;
    case 'file_attachment':
      report(context, 'node', node.type.name, path, 'Typed file metadata is projected to a link and cannot be reconstructed from Markdown alone.');
      return `${link(escapeInline(String(node.attrs.name || 'Download file')), node.attrs.src, '', context)}${node.attrs.description ? `\n_${escapeInline(String(node.attrs.description))}_` : ''}`;
    case 'embed':
      report(context, 'node', node.type.name, path, 'Provider and sandbox metadata are projected to a link and cannot be reconstructed from Markdown alone.');
      return `${link(`Embedded content: ${escapeInline(String(node.attrs.title || node.attrs.provider || 'Open'))}`, node.attrs.src, '', context)}${node.attrs.caption ? `\n_${escapeInline(String(node.attrs.caption))}_` : ''}`;
    case 'table': {
      const firstRow = node.content[0];
      const alignments = firstRow?.content.map(tableAlignment) ?? [];
      return node.content.map((row, rowIndex) => {
        const cells = row.content.map((cell, cellIndex) => tableCell(cell, context, [...path, rowIndex, cellIndex], depth));
        const delimiter = alignments.map((align) => align === 'center' ? ':---:' : align === 'right' ? '---:' : ':---');
        return `| ${cells.join(' | ')} |${rowIndex === 0 ? `\n| ${delimiter.join(' | ')} |` : ''}`;
      }).join('\n');
    }
    case 'table_row': case 'table_header': case 'table_cell': return children();
    case 'footnote_definition': {
      const body = node.content
        .map((child, index) => render(child, context, [...path, index], depth))
        .join('\n\n');
      const [first = '', ...rest] = body.split('\n');
      return `[^${String(node.attrs.id)}]: ${first}${rest.length
        ? `\n${rest.map((line) => line ? `    ${line}` : '').join('\n')}`
        : ''}`;
    }
    default:
      report(context, 'node', node.type.name, path, node.content.length
        ? 'Unsupported block node structure is flattened to its child content.'
        : 'Unsupported block atom is projected to its plain-text value.');
      return node.content.length ? children() : escapeInline(node.textContent);
  }
}

function definitions(context: RenderContext): string {
  if (!context.references.size) return '';
  return [...context.references.values()].map((item) => (
    `[${item.id}]: ${destination(item.href)}${item.title ? ` "${escapeTitle(item.title)}"` : ''}`
  )).join('\n');
}

export class MarkdownExporter {
  exportWithReport(stateOrNode: EditorState | Node, options: MarkdownExportOptions = {}): MarkdownExportResult {
    const node = 'doc' in stateOrNode ? stateOrNode.doc : stateOrNode;
    const context: RenderContext = { options, losses: [], references: new Map() };
    const body = render(node, context).trimEnd();
    const referenceDefinitions = definitions(context);
    return Object.freeze({
      markdown: referenceDefinitions ? `${body}\n\n${referenceDefinitions}` : body,
      losses: Object.freeze([...context.losses]),
    });
  }

  export(stateOrNode: EditorState | Node, options: MarkdownExportOptions = {}): string {
    return this.exportWithReport(stateOrNode, options).markdown;
  }

  /**
   * Preserves a captured source string exactly until the model changes. After a
   * change, recognized frontmatter and safely mapped unchanged blocks can remain
   * exact while every other region is rendered canonically. Unknown syntax in a
   * changed or unmatched block is not claimed to survive a visual edit.
   */
  exportWithSource(
    stateOrNode: EditorState | Node,
    source: MarkdownSourceSnapshot,
    options: MarkdownExportOptions = {},
  ): MarkdownSourceExportResult {
    if (!(source instanceof MarkdownSourceSnapshot)) {
      throw new TypeError('Markdown source must come from MarkdownImporter.parseWithSource().');
    }
    const node = 'doc' in stateOrNode ? stateOrNode.doc : stateOrNode;
    if (source.matches(node)) {
      return Object.freeze({
        markdown: source.source,
        losses: Object.freeze([]),
        preservation: 'exact' as const,
      });
    }

    const mappedBlocks = node.type.name === 'doc' ? source.mapBlocks(node) : null;
    const originalIndexes = new Map(source.blocks.map((block, index) => [block, index]));
    const structureChanged = Boolean(mappedBlocks && (
      node.content.length !== source.blocks.length
      || mappedBlocks.some((block, index) => block !== null && originalIndexes.get(block) !== index)
    ));

    if (!structureChanged && node.type.name === 'doc'
      && source.blocks.length === node.content.length && source.blocks.length > 0) {
      const context: RenderContext = { options, losses: [], references: new Map() };
      reportNodeAttributes(node, context, []);
      let preservedBlocks = 0;
      const body = source.leading + node.content.map((block, index) => {
        const captured = source.blocks[index];
        let rendered: string;
        if (captured.matches(block)) {
          preservedBlocks += 1;
          rendered = captured.source;
        } else {
          rendered = withLineEnding(render(block, context, [index]).trimEnd(), source.lineEnding);
        }
        return `${rendered}${captured.separatorAfter}`;
      }).join('');
      // Reference-style output needs a new document-level definition section;
      // fall back rather than risk colliding with source-owned definitions.
      if (preservedBlocks > 0 && context.references.size === 0) {
        return Object.freeze({
          markdown: withSourceFrontmatter(source, body),
          losses: Object.freeze([...context.losses]),
          preservation: 'blocks' as const,
        });
      }
    }

    if (structureChanged && mappedBlocks) {
      const context: RenderContext = { options, losses: [], references: new Map() };
      reportNodeAttributes(node, context, []);
      let preservedBlocks = 0;
      const renderedBlocks = node.content.map((block, index) => {
        const captured = mappedBlocks[index];
        if (captured) {
          preservedBlocks += 1;
          return captured.source;
        }
        return withLineEnding(render(block, context, [index]).trimEnd(), source.lineEnding);
      });
      // Structural output uses canonical separators. This avoids assigning
      // source-owned whitespace to a different neighbor after a move/delete.
      if (preservedBlocks > 0 && context.references.size === 0) {
        const body = renderedBlocks.join(`${source.lineEnding}${source.lineEnding}`);
        return Object.freeze({
          markdown: withSourceFrontmatter(source, body),
          losses: Object.freeze([...context.losses]),
          preservation: 'mapped-blocks' as const,
        });
      }
    }
    const canonical = this.exportWithReport(node, options);
    const markdown = withLineEnding(canonical.markdown, source.lineEnding);
    if (!source.frontmatter) {
      return Object.freeze({ ...canonical, markdown, preservation: 'canonical' as const });
    }
    return Object.freeze({
      ...canonical,
      markdown: withSourceFrontmatter(source, markdown),
      preservation: 'frontmatter' as const,
    });
  }

  static exportWithReport(stateOrNode: EditorState | Node, options?: MarkdownExportOptions): MarkdownExportResult {
    return new MarkdownExporter().exportWithReport(stateOrNode, options);
  }

  static export(stateOrNode: EditorState | Node, options?: MarkdownExportOptions): string {
    return new MarkdownExporter().export(stateOrNode, options);
  }

  static exportWithSource(
    stateOrNode: EditorState | Node,
    source: MarkdownSourceSnapshot,
    options?: MarkdownExportOptions,
  ): MarkdownSourceExportResult {
    return new MarkdownExporter().exportWithSource(stateOrNode, source, options);
  }
}
