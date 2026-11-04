import { isParagraphLayout, type ParagraphBorder, type ParagraphLayout } from '../core/paragraph-layout';
import { readWordParagraphFormatting, type readWordStyleSheet, type WordStyleReadIssue } from './style-reader';
import { createWordRunStyleCascade, WORD_PARAGRAPH_BORDER_SIDES, type WordTableTextFormatting } from './style-cascade';
import type { XMLElement } from './xml-types';
import type { Node } from '../core/schema';
import { wordStyleChild, wordStyleReference } from './style-projection';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const SUPPORTED = new Set(['jc', 'spacing', 'ind', 'keepNext', 'keepLines', 'pageBreakBefore', 'contextualSpacing', 'shd', 'pBdr']);
const EMPTY_STYLES = createWordRunStyleCascade({ styles: [] });

/** Spacing groups are a rule dependency, not a general Word-style binding.
 * Retain every member (including omitted/off neighbours) of a group with a
 * declaration somewhere in the imported document. Unused style identities do
 * not add foreign-format metadata to otherwise ordinary Fountain paragraphs.
 */
export function retainWordSpacingGroups(blocks: readonly Node[], warn?: (path: readonly number[], caption: boolean) => void): readonly Node[] {
  const used = new Set<string>();
  const keys = ['layout', 'captionLayout'] as const;
  for (const block of blocks) block.descendants(node => {
    for (const key of keys) {
      const layout = node.attrs[key];
      if (isParagraphLayout(layout) && layout.spacingGroup !== undefined && layout.contextualSpacing !== undefined) used.add(layout.spacingGroup);
    }
  });
  const visit = (node: Node, path: readonly number[]): Node => {
    let result = node;
    if (node.childCount) {
      const content = node.content.map((child, index) => visit(child, [...path, index]));
      if (content.some((child, index) => child !== node.content[index])) result = node.copy(content);
    }
    for (const key of keys) {
      const layout = result.attrs[key];
      if (!isParagraphLayout(layout) || layout.spacingGroup === undefined) continue;
      if (used.has(layout.spacingGroup)) {
        if (key === 'captionLayout' || node.type.spec.paragraphFlow !== 'text') warn?.(path, key === 'captionLayout');
        continue;
      }
      const { spacingGroup, ...declarations } = layout;
      result = result.withAttrs({ ...result.attrs, [key]: declarations });
    }
    return result;
  };
  return blocks.map((block, index) => visit(block, [index]));
}

function isWord(element: XMLElement, local: string) {
  const colon = element.name.indexOf(':');
  return element.name.slice(colon + 1) === local && element.namespaces[colon < 0 ? '' : element.name.slice(0, colon)] === W;
}

function paragraphIssue(issue: WordStyleReadIssue) {
  return issue.code === 'unresolved-paragraph-properties' || issue.code === 'invalid-paragraph-property';
}

/** Materialize the supported effective Word paragraph appearance into Fountain's
 * generic layout attribute. The spacing identity is opaque application data;
 * it does not retain or bind the original Word style definition.
 */
export function projectWordParagraphStyle(properties: XMLElement | undefined,
  sheet: ReturnType<typeof readWordStyleSheet> | undefined,
  warn: (code: string, message: string) => void, table?: WordTableTextFormatting, numberingProperties?: XMLElement): { readonly align: 'left' | 'center' | 'right' | 'justify'; readonly alignExplicit?: true; readonly layout?: ParagraphLayout } {
  const paragraphStyle = wordStyleReference(properties, 'pStyle');
  const filtered = properties && {
    ...properties,
    children: properties.children.filter(item => typeof item === 'string'
      || SUPPORTED.has(item.name.slice(item.name.indexOf(':') + 1)) && isWord(item, item.name.slice(item.name.indexOf(':') + 1))),
  };
  const directIssues: WordStyleReadIssue[] = [];
  const direct = readWordParagraphFormatting(filtered, directIssues);
  const numberingIssues: WordStyleReadIssue[] = [];
  // The list boundary resolves numbering tabs separately from paragraph styles.
  const numbering = readWordParagraphFormatting(numberingProperties && { ...numberingProperties,
    children: numberingProperties.children.filter(item => typeof item === 'string' || !isWord(item, 'tabs')),
  }, numberingIssues);
  for (const issue of numberingIssues) warn(issue.code, `Word numbering paragraph formatting: ${issue.property} is not fully represented.`);
  const resolved = (sheet ?? EMPTY_STYLES).resolveParagraph({ paragraphStyle, direct, table, numbering });
  if (table?.paragraphs.length && resolved.paragraphChain.includes('Normal')) warn('table-normal-style-precedence-unverified',
    'Word Normal/document-default equivalence can alter table paragraph precedence. The explicit cascade is retained, but this combination still requires native Word verification.');
  const used = new Set(resolved.paragraphChain);
  for (const issue of [...(sheet?.issues.filter(item => paragraphIssue(item) && (item.styleId === undefined || used.has(item.styleId))) ?? []), ...directIssues]) {
    warn(issue.code, `Word ${issue.styleId === undefined ? 'defaults/direct paragraph formatting' : `style ${issue.styleId}`}: ${issue.property} is not fully represented.`);
  }
  const source = resolved.formatting;
  const alignment = source.align === 'both' ? 'justify' : source.align;
  const align = ['left', 'center', 'right', 'justify'].includes(alignment ?? '')
    ? alignment as 'left' | 'center' | 'right' | 'justify'
    : 'left';
  if (source.align !== undefined && !['left', 'center', 'right', 'both', 'justify'].includes(source.align)) {
    warn('paragraph-alignment-not-imported', `Word paragraph alignment ${source.align} is not represented; left alignment was used.`);
  }
  // After resolving every supported level of the Word style cascade, omission
  // means no added paragraph spacing and normal single line spacing. Leaving
  // these values absent would import the host's browser margins/line height,
  // then acquire a different generated Normal style on DOCX export/reopen.
  // This is effective geometry, not preservation of the original XML omission.
  const layout: { -readonly [K in keyof ParagraphLayout]: ParagraphLayout[K] } = {
    unit: 'pt', spacingBefore: 0, spacingAfter: 0,
    lineHeight: 1, lineHeightUnit: 'multiple', lineHeightRule: 'auto',
    keepWithNext: false, keepLinesTogether: false, pageBreakBefore: false,
  };
  // All paragraphs with a known identity participate, including a neighbour
  // with an omitted/off rule. Appearance and ancestry never define equality.
  // The unnamed default is separate from every explicitly defined style.
  const spacingGroup = resolved.paragraphStyle === undefined
    ? paragraphStyle === undefined ? 'word:implicit' : undefined
    : `word:style:${resolved.paragraphStyle}`;
  if (spacingGroup !== undefined && isParagraphLayout({ unit: 'pt', spacingGroup })) {
    layout.spacingGroup = spacingGroup;
    if (source.contextualSpacing !== undefined) layout.contextualSpacing = source.contextualSpacing;
  } else if (source.contextualSpacing !== undefined) warn('paragraph-contextual-spacing-not-imported',
    'The effective Word contextual rule has no representable, resolved paragraph style identity. Declared spacing remains; no same-style relationship was invented.');
  if (source.spacingBefore !== undefined) layout.spacingBefore = source.spacingBefore / 20;
  if (source.spacingAfter !== undefined) layout.spacingAfter = source.spacingAfter / 20;
  if (source.line !== undefined) {
    const rule = source.lineRule ?? 'auto';
    layout.lineHeight = rule === 'auto' ? source.line / 240 : source.line / 20;
    layout.lineHeightUnit = rule === 'auto' ? 'multiple' : 'pt';
    layout.lineHeightRule = rule;
  } else if (source.lineRule !== undefined) {
    warn('paragraph-line-rule-without-height', 'Word paragraph lineRule has no line value and was omitted.');
  }
  if (source.indentLeft !== undefined) layout.indentStart = source.indentLeft / 20;
  if (source.indentRight !== undefined) layout.indentEnd = source.indentRight / 20;
  if (typeof source.firstLine === 'number') layout.firstLineIndent = source.firstLine / 20;
  if (typeof source.hanging === 'number') layout.hangingIndent = source.hanging / 20;
  if (source.keepNext !== undefined) layout.keepWithNext = source.keepNext;
  if (source.keepLines !== undefined) layout.keepLinesTogether = source.keepLines;
  if (source.pageBreakBefore !== undefined) layout.pageBreakBefore = source.pageBreakBefore;
  if (source.background && /^[\da-f]{6}$/i.test(source.background)) layout.background = `#${source.background.toLowerCase()}`;
  const borders: Partial<Record<(typeof WORD_PARAGRAPH_BORDER_SIDES)[number], ParagraphBorder>> = {};
  for (const side of WORD_PARAGRAPH_BORDER_SIDES) {
    const border = source.borders?.[side];
    if (!border) continue;
    if (border.value !== 'single') {
      warn('paragraph-border-style-not-imported', `Word ${side} paragraph border ${border.value} is not represented.`);
      continue;
    }
    if (border.size === undefined || border.size <= 0) {
      warn('paragraph-border-size-not-imported', `Word ${side} paragraph border has no usable width.`);
      continue;
    }
    let color = border.color;
    if (color === undefined || color === 'auto') {
      color = '000000';
      warn('paragraph-border-auto-color-normalized', `Word ${side} paragraph border auto color was materialized as black.`);
    }
    if (!/^[\da-f]{6}$/i.test(color)) continue;
    borders[side] = Object.freeze({ style: 'solid', color: `#${color.toLowerCase()}`, width: border.size / 8,
      ...(border.space === undefined ? {} : { space: border.space }) });
  }
  if (Object.keys(borders).length) layout.borders = Object.freeze(borders);
  return Object.freeze({ align, ...(source.align === 'left' ? { alignExplicit: true as const } : {}), ...(Object.keys(layout).length > 1 ? { layout: Object.freeze(layout) as ParagraphLayout } : {}) });
}
