import {
  AllSelection,
  CellSelection,
  GapSelection,
  NodeSelection,
  setMark,
  unsetMark,
  type Editor,
  type Mark,
} from '../core';
import { getNodeAtPath, getTextLeaves, getTextRangeSegments } from '../core/transaction/path';
import {
  normalizeFontFamily,
  normalizeFontSize,
  normalizeLineHeight,
  normalizeTextStyleColor,
} from './values';

export type TextStyleMarkName = 'text_color' | 'highlight' | 'font_family' | 'font_size' | 'line_height';

export interface ActiveTextStyle {
  readonly color?: string;
  readonly backgroundColor?: string;
  readonly fontFamily?: string;
  readonly fontSize?: string;
  readonly lineHeight?: string;
  /** Properties with different values across the current selection. */
  readonly mixed: readonly (keyof Omit<ActiveTextStyle, 'mixed'>)[];
}

function selectedMarkSets(editor: Editor): readonly (readonly Mark[])[] {
  const { doc, selection, storedMarks } = editor.state;
  if (selection instanceof GapSelection) return [];
  if (selection.kind === 'text') {
    if (selection.isCollapsed) return [storedMarks];
    return getTextRangeSegments(doc, selection.path, selection.from, selection.endPath, selection.to)
      .filter((segment) => segment.to > segment.from)
      .map((segment) => segment.node.marks);
  }
  if (selection instanceof NodeSelection) {
    return getTextLeaves(getNodeAtPath(doc, selection.nodePath)).map((leaf) => leaf.node.marks);
  }
  if (selection instanceof CellSelection) {
    return selection.cellPaths.flatMap((path) => getTextLeaves(getNodeAtPath(doc, path)).map((leaf) => leaf.node.marks));
  }
  if (selection instanceof AllSelection) return getTextLeaves(doc).map((leaf) => leaf.node.marks);
  return [];
}

function commonAttribute(
  markSets: readonly (readonly Mark[])[],
  markName: TextStyleMarkName,
  attribute: string,
): { value?: string; mixed: boolean } {
  if (!markSets.length) return { mixed: false };
  const values = markSets.map((marks) => {
    const value = marks.find((mark) => mark.type.name === markName)?.attrs[attribute];
    return typeof value === 'string' ? value : null;
  });
  const first = values[0];
  if (!values.every((value) => value === first)) return { mixed: true };
  return typeof first === 'string' ? { value: first, mixed: false } : { mixed: false };
}

/** Reads common style values without collapsing a mixed selection to its first leaf. */
export function getActiveTextStyle(editor: Editor): ActiveTextStyle {
  const markSets = selectedMarkSets(editor);
  const properties = {
    color: commonAttribute(markSets, 'text_color', 'color'),
    backgroundColor: commonAttribute(markSets, 'highlight', 'color'),
    fontFamily: commonAttribute(markSets, 'font_family', 'family'),
    fontSize: commonAttribute(markSets, 'font_size', 'size'),
    lineHeight: commonAttribute(markSets, 'line_height', 'lineHeight'),
  } as const;
  const mixed = Object.entries(properties)
    .filter(([, result]) => result.mixed)
    .map(([name]) => name as keyof typeof properties);
  return Object.freeze({
    ...Object.fromEntries(Object.entries(properties)
      .filter(([, result]) => result.value !== undefined)
      .map(([name, result]) => [name, result.value])),
    mixed: Object.freeze(mixed),
  });
}

function apply(
  editor: Editor,
  markName: TextStyleMarkName,
  attribute: string,
  value: unknown,
  normalize: (candidate: unknown) => string | null,
): boolean {
  const normalized = normalize(value);
  return normalized !== null && setMark(editor, markName, { [attribute]: normalized });
}

export function setTextColor(editor: Editor, color: string): boolean {
  return apply(editor, 'text_color', 'color', color, normalizeTextStyleColor);
}

export function unsetTextColor(editor: Editor): boolean {
  return unsetMark(editor, 'text_color');
}

export function setBackgroundColor(editor: Editor, color: string): boolean {
  return apply(editor, 'highlight', 'color', color, normalizeTextStyleColor);
}

export function unsetBackgroundColor(editor: Editor): boolean {
  return unsetMark(editor, 'highlight');
}

export function setFontFamily(editor: Editor, family: string): boolean {
  return apply(editor, 'font_family', 'family', family, normalizeFontFamily);
}

export function unsetFontFamily(editor: Editor): boolean {
  return unsetMark(editor, 'font_family');
}

export function setFontSize(editor: Editor, size: string | number): boolean {
  return apply(editor, 'font_size', 'size', size, normalizeFontSize);
}

export function unsetFontSize(editor: Editor): boolean {
  return unsetMark(editor, 'font_size');
}

export function setLineHeight(editor: Editor, lineHeight: string | number): boolean {
  return apply(editor, 'line_height', 'lineHeight', lineHeight, normalizeLineHeight);
}

export function unsetLineHeight(editor: Editor): boolean {
  return unsetMark(editor, 'line_height');
}
