import { isListLayout, type ListLayout, type ListMarkerStyle } from '../core/list-layout';
import type { ParagraphLayout } from '../core/paragraph-layout';
import type { WordNumberingLevel } from './numbering';
import type { XMLElement } from './xml-types';
import { wordStyleChild } from './style-projection';
import { expandedXMLName, qualifiedWordAttribute as attribute } from './xml-names';

export const WORD_LIST_MARKER_FORMATS: Readonly<Record<ListMarkerStyle, string>> = {
  decimal: 'decimal', 'decimal-leading-zero': 'decimalZero', 'lower-alpha': 'lowerLetter', 'upper-alpha': 'upperLetter',
  'lower-roman': 'lowerRoman', 'upper-roman': 'upperRoman', literal: 'bullet', none: 'none',
};
type Warn = (code: string, message: string) => void;

function numberTab(base: XMLElement | undefined, direct: XMLElement | undefined, warn: Warn): number | undefined {
  const positions = new Map<number, string>();
  for (const properties of [base, direct]) {
    const tabs = wordStyleChild(properties, 'tabs');
    for (const tab of tabs?.children ?? []) {
      if (typeof tab === 'string' || expandedXMLName(tab) !== 'http://schemas.openxmlformats.org/wordprocessingml/2006/main|tab') continue;
      const raw = attribute(tab, 'pos');
      const kind = attribute(tab, 'val');
      if (!raw || !/^-?\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Math.abs(Number(raw)) > 2_000_000 || !kind) {
        warn('list-tab-not-imported', 'Invalid or unbounded Word list tab declaration was not imported.'); continue;
      }
      if (kind === 'clear') positions.delete(Number(raw));
      else positions.set(Number(raw), kind);
      if (!['num', 'clear'].includes(kind)) warn('list-tab-not-imported', 'Non-numbering tab behavior inside this list paragraph is not retained.');
    }
  }
  const values = [...positions].filter(([, kind]) => kind === 'num').map(([position]) => position);
  if (values.length > 1) warn('list-tab-not-imported', 'Multiple numbering tabs need font-dependent tab selection; the supported text origin is retained.');
  return values.length === 1 ? values[0]! / 20 : undefined;
}

/** Lower effective Word coordinates to an absolute intermediate. groupLists
 * converts this to parent-relative list and item geometry exactly once.
 */
export function readWordListLayout(definition: WordNumberingLevel, paragraph: ParagraphLayout, direct: XMLElement | undefined,
  level: number, warn: Warn, font: Pick<ListLayout, 'fontFamily' | 'fontSize'> = {}): ListLayout | undefined {
  const indentStart = paragraph.indentStart ?? 36 * (level + 1);
  const markerOffset = paragraph.firstLineIndent ?? -(paragraph.hangingIndent ?? 18);
  if (paragraph.indentStart === undefined || paragraph.firstLineIndent === undefined && paragraph.hangingIndent === undefined) {
    warn('list-geometry-defaulted', 'Word list indentation is incomplete; Fountain materialized its existing list defaults. This is not original-layout certification.');
  }
  let markerStyle = (Object.keys(WORD_LIST_MARKER_FORMATS) as ListMarkerStyle[]).find(key => WORD_LIST_MARKER_FORMATS[key] === definition.format);
  if (!markerStyle) {
    markerStyle = definition.ordered ? 'decimal' : 'literal';
    warn('list-marker-not-imported', `Word numbering format ${definition.format} became a supported fallback marker.`);
  }
  let markerPrefix = '', markerSuffix = '';
  const text = definition.text ?? (definition.ordered ? `%${level + 1}.` : '•');
  if (definition.text === undefined) warn('list-marker-defaulted', 'Missing Word numbering text became a Fountain default marker.');
  if (markerStyle === 'literal') markerPrefix = text;
  else if (markerStyle !== 'none') {
    const token = `%${level + 1}`;
    const split = text.indexOf(token);
    if (split >= 0 && !/%[1-9]/.test(text.slice(0, split) + text.slice(split + token.length))) {
      markerPrefix = text.slice(0, split); markerSuffix = text.slice(split + token.length);
    } else {
      markerSuffix = '.';
      warn('list-marker-template-not-imported', 'The Word multi-level/custom numbering template cannot be represented by this marker profile; source numbering text was normalized.');
    }
  }
  if (definition.suffix && definition.suffix !== 'tab') warn('list-marker-separator-not-imported', 'Word space/empty marker suffix behavior became the supported tab-position profile.');
  const tab = numberTab(definition.properties, direct, warn);
  const markerAlign = ['left', 'center', 'right'].includes(definition.align ?? '') ? definition.align as ListLayout['markerAlign'] : 'left';
  if (definition.align && definition.align !== markerAlign) warn('list-marker-alignment-not-imported', 'Unsupported Word marker alignment became left alignment.');
  if (tab !== undefined && tab <= indentStart + markerOffset) warn('list-tab-not-imported', 'The numbering tab precedes the marker end/anchor; font-dependent default tab advance is not retained.');
  const layout = { unit: 'pt' as const, indentStart, indentEnd: paragraph.indentEnd ?? 0, markerOffset,
    markerStyle, markerAlign, markerPrefix, markerSuffix, firstLineIndent: tab === undefined || tab <= indentStart + markerOffset ? 0 : tab - indentStart, ...font };
  if (!isListLayout(layout)) {
    warn('list-layout-not-imported', 'The Word marker or geometry is outside the bounded portable list profile.'); return undefined;
  }
  return Object.freeze(layout);
}
