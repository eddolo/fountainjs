import {
  Selection,
  type Editor,
} from '../core';
import { getNodeAtPath } from '../core/transaction/path';

export type InvisibleCharacterKind =
  | 'space'
  | 'no-break-space'
  | 'tab'
  | 'line-feed'
  | 'carriage-return'
  | 'crlf'
  | 'zero-width-space'
  | 'zero-width-non-joiner'
  | 'zero-width-joiner'
  | 'word-joiner'
  | 'byte-order-mark'
  | 'bidi-control'
  | 'soft-hyphen'
  | 'combining-grapheme-joiner'
  | 'unpaired-surrogate'
  | 'control';

export type IntegritySeverity = 'informational' | 'warning';

export interface InvisibleCharacter {
  readonly kind: InvisibleCharacterKind;
  /** UTF-16 string offset, matching Fountain text selections. */
  readonly index: number;
  readonly length: number;
  readonly text: string;
  readonly codePoints: readonly string[];
  readonly name: string;
  readonly marker: string;
  readonly severity: IntegritySeverity;
}

export interface InvisibleScanOptions {
  readonly spaces?: boolean;
  readonly lineEndings?: boolean;
  readonly tabs?: boolean;
  readonly noBreakSpaces?: boolean;
  readonly zeroWidth?: boolean;
  readonly bidiControls?: boolean;
  readonly softHyphens?: boolean;
  readonly controls?: boolean;
  readonly maxInputLength?: number;
  readonly maxFindings?: number;
}

export interface UnicodeCodePointInspection {
  readonly index: number;
  readonly length: number;
  readonly text: string;
  readonly codePoint: string;
  readonly decimal: number;
  readonly utf8: readonly number[];
  readonly utf8Hex: string;
  readonly invisible?: InvisibleCharacterKind;
  readonly name?: string;
}

export interface LineEndingInspection {
  readonly lf: number;
  readonly crlf: number;
  readonly cr: number;
  readonly mixed: boolean;
}

export type UnicodeNormalizationForm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD';

export interface UnicodeNormalizationInspection {
  readonly supported: boolean;
  readonly currentForms: readonly UnicodeNormalizationForm[];
  readonly differsFrom: readonly UnicodeNormalizationForm[];
}

export interface TextIntegrityReport {
  readonly text: string;
  readonly utf8: readonly number[];
  readonly utf8Hex: string;
  readonly codePoints: readonly UnicodeCodePointInspection[];
  readonly invisibleCharacters: readonly InvisibleCharacter[];
  readonly lineEndings: LineEndingInspection;
  readonly normalization: UnicodeNormalizationInspection;
  readonly truncated: boolean;
  readonly accessibleSummary: string;
}

export interface TextSanitizationPolicy {
  readonly zeroWidthSpace?: 'remove';
  readonly zeroWidthNonJoiner?: 'remove';
  readonly zeroWidthJoiner?: 'remove';
  readonly wordJoiner?: 'remove';
  readonly byteOrderMark?: 'remove';
  readonly bidiControls?: 'remove';
  readonly softHyphen?: 'remove';
  readonly combiningGraphemeJoiner?: 'remove';
  readonly unpairedSurrogate?: 'remove' | 'replacement-character';
  readonly controls?: 'remove';
  readonly noBreakSpace?: 'space';
  readonly tabs?: 'spaces';
  readonly tabSize?: number;
  readonly lineEndings?: 'lf' | 'crlf';
  readonly normalization?: UnicodeNormalizationForm;
}

export interface TextSanitizationEdit {
  readonly kind: InvisibleCharacterKind | 'normalization';
  /** UTF-16 offsets in the original input for character-level edits. */
  readonly from: number;
  readonly to: number;
  readonly before: string;
  readonly after: string;
  readonly reason: string;
}

export interface TextSanitizationPreview {
  readonly source: string;
  readonly result: string;
  readonly changed: boolean;
  readonly policy: Readonly<TextSanitizationPolicy>;
  readonly edits: readonly TextSanitizationEdit[];
  readonly before: TextIntegrityReport;
  readonly after: TextIntegrityReport;
}

export interface SelectionSanitizationPreview extends TextSanitizationPreview {
  readonly path: readonly number[];
  readonly from: number;
  readonly to: number;
}

interface CharacterDescriptor {
  readonly kind: InvisibleCharacterKind;
  readonly name: string;
  readonly marker: string;
  readonly severity: IntegritySeverity;
}

const CHARACTER_DESCRIPTORS: Readonly<Record<number, CharacterDescriptor>> = Object.freeze({
  0x0009: { kind: 'tab', name: 'CHARACTER TABULATION', marker: '→', severity: 'informational' },
  0x000a: { kind: 'line-feed', name: 'LINE FEED', marker: '↵', severity: 'informational' },
  0x000d: { kind: 'carriage-return', name: 'CARRIAGE RETURN', marker: '␍', severity: 'warning' },
  0x0020: { kind: 'space', name: 'SPACE', marker: '·', severity: 'informational' },
  0x00a0: { kind: 'no-break-space', name: 'NO-BREAK SPACE', marker: '⍽', severity: 'warning' },
  0x00ad: { kind: 'soft-hyphen', name: 'SOFT HYPHEN', marker: 'SHY', severity: 'warning' },
  0x034f: { kind: 'combining-grapheme-joiner', name: 'COMBINING GRAPHEME JOINER', marker: 'CGJ', severity: 'warning' },
  0x061c: { kind: 'bidi-control', name: 'ARABIC LETTER MARK', marker: 'ALM', severity: 'warning' },
  0x180e: { kind: 'zero-width-space', name: 'MONGOLIAN VOWEL SEPARATOR', marker: 'MVS', severity: 'warning' },
  0x200b: { kind: 'zero-width-space', name: 'ZERO WIDTH SPACE', marker: 'ZWSP', severity: 'warning' },
  0x200c: { kind: 'zero-width-non-joiner', name: 'ZERO WIDTH NON-JOINER', marker: 'ZWNJ', severity: 'warning' },
  0x200d: { kind: 'zero-width-joiner', name: 'ZERO WIDTH JOINER', marker: 'ZWJ', severity: 'warning' },
  0x200e: { kind: 'bidi-control', name: 'LEFT-TO-RIGHT MARK', marker: 'LRM', severity: 'warning' },
  0x200f: { kind: 'bidi-control', name: 'RIGHT-TO-LEFT MARK', marker: 'RLM', severity: 'warning' },
  0x202a: { kind: 'bidi-control', name: 'LEFT-TO-RIGHT EMBEDDING', marker: 'LRE', severity: 'warning' },
  0x202b: { kind: 'bidi-control', name: 'RIGHT-TO-LEFT EMBEDDING', marker: 'RLE', severity: 'warning' },
  0x202c: { kind: 'bidi-control', name: 'POP DIRECTIONAL FORMATTING', marker: 'PDF', severity: 'warning' },
  0x202d: { kind: 'bidi-control', name: 'LEFT-TO-RIGHT OVERRIDE', marker: 'LRO', severity: 'warning' },
  0x202e: { kind: 'bidi-control', name: 'RIGHT-TO-LEFT OVERRIDE', marker: 'RLO', severity: 'warning' },
  0x2060: { kind: 'word-joiner', name: 'WORD JOINER', marker: 'WJ', severity: 'warning' },
  0x2066: { kind: 'bidi-control', name: 'LEFT-TO-RIGHT ISOLATE', marker: 'LRI', severity: 'warning' },
  0x2067: { kind: 'bidi-control', name: 'RIGHT-TO-LEFT ISOLATE', marker: 'RLI', severity: 'warning' },
  0x2068: { kind: 'bidi-control', name: 'FIRST STRONG ISOLATE', marker: 'FSI', severity: 'warning' },
  0x2069: { kind: 'bidi-control', name: 'POP DIRECTIONAL ISOLATE', marker: 'PDI', severity: 'warning' },
  0xfeff: { kind: 'byte-order-mark', name: 'ZERO WIDTH NO-BREAK SPACE / BYTE ORDER MARK', marker: 'BOM', severity: 'warning' },
});

const MAXIMUM_INPUT_LENGTH = 5_000_000;
const MAXIMUM_FINDINGS = 50_000;
const MAXIMUM_CODE_POINTS = 100_000;

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number, name: string): number {
  const selected = value ?? fallback;
  if (!Number.isInteger(selected) || selected < minimum || selected > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return selected;
}

function codePointLabel(value: number): string {
  return `U+${value.toString(16).toUpperCase().padStart(4, '0')}`;
}

function utf8BytesForCodePoint(value: number): readonly number[] {
  // Standard Web UTF-8 encoders replace isolated UTF-16 surrogates with U+FFFD.
  if (value >= 0xd800 && value <= 0xdfff) return Object.freeze([0xef, 0xbf, 0xbd]);
  if (value <= 0x7f) return Object.freeze([value]);
  if (value <= 0x7ff) return Object.freeze([0xc0 | (value >> 6), 0x80 | (value & 0x3f)]);
  if (value <= 0xffff) return Object.freeze([
    0xe0 | (value >> 12),
    0x80 | ((value >> 6) & 0x3f),
    0x80 | (value & 0x3f),
  ]);
  return Object.freeze([
    0xf0 | (value >> 18),
    0x80 | ((value >> 12) & 0x3f),
    0x80 | ((value >> 6) & 0x3f),
    0x80 | (value & 0x3f),
  ]);
}

function hexBytes(bytes: readonly number[]): string {
  return bytes.map((value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function included(descriptor: CharacterDescriptor, options: InvisibleScanOptions): boolean {
  switch (descriptor.kind) {
    case 'space': return options.spaces !== false;
    case 'line-feed': case 'carriage-return': case 'crlf': return options.lineEndings !== false;
    case 'tab': return options.tabs !== false;
    case 'no-break-space': return options.noBreakSpaces !== false;
    case 'zero-width-space': case 'zero-width-non-joiner': case 'zero-width-joiner':
    case 'word-joiner': case 'byte-order-mark': case 'combining-grapheme-joiner':
      return options.zeroWidth !== false;
    case 'bidi-control': return options.bidiControls !== false;
    case 'soft-hyphen': return options.softHyphens !== false;
    case 'unpaired-surrogate':
    case 'control': return options.controls !== false;
  }
}

function controlDescriptor(value: number): CharacterDescriptor | undefined {
  if (value >= 0xd800 && value <= 0xdfff) {
    return { kind: 'unpaired-surrogate', name: 'UNPAIRED UTF-16 SURROGATE', marker: codePointLabel(value), severity: 'warning' };
  }
  if ((value >= 0 && value <= 0x08) || (value >= 0x0b && value <= 0x0c)
    || (value >= 0x0e && value <= 0x1f) || value === 0x7f) {
    return { kind: 'control', name: 'CONTROL CHARACTER', marker: `CTRL ${codePointLabel(value)}`, severity: 'warning' };
  }
  return undefined;
}

function occurrence(
  descriptor: CharacterDescriptor,
  index: number,
  text: string,
  values: readonly number[],
): InvisibleCharacter {
  return Object.freeze({
    ...descriptor,
    index,
    length: text.length,
    text,
    codePoints: Object.freeze(values.map(codePointLabel)),
  });
}

/** Finds invisible and integrity-sensitive characters without changing input. */
export function scanInvisibleCharacters(text: string, options: InvisibleScanOptions = {}): readonly InvisibleCharacter[] {
  if (typeof text !== 'string') throw new TypeError('Integrity scanning requires a string.');
  const maximumLength = boundedInteger(options.maxInputLength, MAXIMUM_INPUT_LENGTH, 1, 50_000_000, 'Maximum input length');
  const maximumFindings = boundedInteger(options.maxFindings, MAXIMUM_FINDINGS, 1, 1_000_000, 'Maximum findings');
  if (text.length > maximumLength) throw new RangeError(`Integrity input exceeds ${maximumLength} UTF-16 code units.`);
  const results: InvisibleCharacter[] = [];
  for (let index = 0; index < text.length && results.length < maximumFindings;) {
    if (text.charCodeAt(index) === 0x0d && text.charCodeAt(index + 1) === 0x0a) {
      const descriptor: CharacterDescriptor = {
        kind: 'crlf', name: 'CARRIAGE RETURN + LINE FEED', marker: 'CRLF', severity: 'informational',
      };
      if (included(descriptor, options)) results.push(occurrence(descriptor, index, '\r\n', [0x0d, 0x0a]));
      index += 2;
      continue;
    }
    const value = text.codePointAt(index) as number;
    const character = String.fromCodePoint(value);
    const descriptor = CHARACTER_DESCRIPTORS[value] ?? controlDescriptor(value);
    if (descriptor && included(descriptor, options)) results.push(occurrence(descriptor, index, character, [value]));
    index += character.length;
  }
  return Object.freeze(results);
}

function lineEndings(text: string): LineEndingInspection {
  let lf = 0;
  let crlf = 0;
  let cr = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 0x0d) {
      if (text.charCodeAt(index + 1) === 0x0a) { crlf += 1; index += 1; }
      else cr += 1;
    } else if (text.charCodeAt(index) === 0x0a) lf += 1;
  }
  const kinds = Number(lf > 0) + Number(crlf > 0) + Number(cr > 0);
  return Object.freeze({ lf, crlf, cr, mixed: kinds > 1 });
}

function normalization(text: string): UnicodeNormalizationInspection {
  if (typeof text.normalize !== 'function') {
    return Object.freeze({ supported: false, currentForms: Object.freeze([]), differsFrom: Object.freeze([]) });
  }
  const forms: UnicodeNormalizationForm[] = ['NFC', 'NFD', 'NFKC', 'NFKD'];
  const currentForms = forms.filter((form) => text.normalize(form) === text);
  return Object.freeze({
    supported: true,
    currentForms: Object.freeze(currentForms),
    differsFrom: Object.freeze(forms.filter((form) => !currentForms.includes(form))),
  });
}

function summary(findings: readonly InvisibleCharacter[], endings: LineEndingInspection, normal: UnicodeNormalizationInspection): string {
  const warnings = findings.filter((finding) => finding.severity === 'warning').length;
  const parts = [`${findings.length} invisible character${findings.length === 1 ? '' : 's'} found`, `${warnings} warning${warnings === 1 ? '' : 's'}`];
  if (endings.mixed) parts.push('mixed line endings');
  if (normal.supported && !normal.currentForms.includes('NFC')) parts.push('text is not NFC-normalized');
  return `${parts.join('; ')}.`;
}

/** Returns code points, UTF-8 bytes, invisibles, line endings, and normalization facts. */
export function inspectTextIntegrity(text: string, options: InvisibleScanOptions = {}): TextIntegrityReport {
  const findings = scanInvisibleCharacters(text, options);
  const maximumCodePoints = Math.min(MAXIMUM_CODE_POINTS, boundedInteger(options.maxFindings, MAXIMUM_FINDINGS, 1, 1_000_000, 'Maximum findings'));
  const points: UnicodeCodePointInspection[] = [];
  const bytes: number[] = [];
  let totalPoints = 0;
  for (let index = 0; index < text.length;) {
    const value = text.codePointAt(index) as number;
    const character = String.fromCodePoint(value);
    const encoded = utf8BytesForCodePoint(value);
    bytes.push(...encoded);
    if (totalPoints < maximumCodePoints) {
      const descriptor = CHARACTER_DESCRIPTORS[value] ?? controlDescriptor(value);
      points.push(Object.freeze({
        index,
        length: character.length,
        text: character,
        codePoint: codePointLabel(value),
        decimal: value,
        utf8: encoded,
        utf8Hex: hexBytes(encoded),
        ...(descriptor ? { invisible: descriptor.kind, name: descriptor.name } : {}),
      }));
    }
    totalPoints += 1;
    index += character.length;
  }
  const endings = lineEndings(text);
  const normal = normalization(text);
  return Object.freeze({
    text,
    utf8: Object.freeze(bytes),
    utf8Hex: hexBytes(bytes),
    codePoints: Object.freeze(points),
    invisibleCharacters: findings,
    lineEndings: endings,
    normalization: normal,
    truncated: totalPoints > maximumCodePoints || findings.length >= (options.maxFindings ?? MAXIMUM_FINDINGS),
    accessibleSummary: summary(findings, endings, normal),
  });
}

function sanitizedReplacement(kind: InvisibleCharacterKind, policy: TextSanitizationPolicy): string | undefined {
  switch (kind) {
    case 'zero-width-space': return policy.zeroWidthSpace === 'remove' ? '' : undefined;
    case 'zero-width-non-joiner': return policy.zeroWidthNonJoiner === 'remove' ? '' : undefined;
    case 'zero-width-joiner': return policy.zeroWidthJoiner === 'remove' ? '' : undefined;
    case 'word-joiner': return policy.wordJoiner === 'remove' ? '' : undefined;
    case 'byte-order-mark': return policy.byteOrderMark === 'remove' ? '' : undefined;
    case 'bidi-control': return policy.bidiControls === 'remove' ? '' : undefined;
    case 'soft-hyphen': return policy.softHyphen === 'remove' ? '' : undefined;
    case 'combining-grapheme-joiner': return policy.combiningGraphemeJoiner === 'remove' ? '' : undefined;
    case 'unpaired-surrogate':
      return policy.unpairedSurrogate === 'remove'
        ? ''
        : policy.unpairedSurrogate === 'replacement-character' ? '\ufffd' : undefined;
    case 'control': return policy.controls === 'remove' ? '' : undefined;
    case 'no-break-space': return policy.noBreakSpace === 'space' ? ' ' : undefined;
    case 'tab': return policy.tabs === 'spaces' ? ' '.repeat(boundedInteger(policy.tabSize, 2, 1, 16, 'Tab size')) : undefined;
    default: return undefined;
  }
}

function policySnapshot(policy: TextSanitizationPolicy): Readonly<TextSanitizationPolicy> {
  if (policy.normalization && !['NFC', 'NFD', 'NFKC', 'NFKD'].includes(policy.normalization)) {
    throw new TypeError('Sanitization normalization must be NFC, NFD, NFKC, or NFKD.');
  }
  if (policy.lineEndings && !['lf', 'crlf'].includes(policy.lineEndings)) {
    throw new TypeError('Sanitization lineEndings must be lf or crlf.');
  }
  if (policy.tabs === 'spaces') boundedInteger(policy.tabSize, 2, 1, 16, 'Tab size');
  return Object.freeze({ ...policy });
}

/** Builds an immutable, non-applying sanitizer preview from explicit choices. */
export function previewTextSanitization(text: string, supplied: TextSanitizationPolicy): TextSanitizationPreview {
  if (!supplied || typeof supplied !== 'object') throw new TypeError('Sanitization requires an explicit policy object.');
  const policy = policySnapshot(supplied);
  const edits: TextSanitizationEdit[] = [];
  let result = '';
  for (let index = 0; index < text.length;) {
    const isCRLF = text.charCodeAt(index) === 0x0d && text.charCodeAt(index + 1) === 0x0a;
    const value = text.codePointAt(index) as number;
    const character = isCRLF ? '\r\n' : String.fromCodePoint(value);
    const descriptor = isCRLF
      ? { kind: 'crlf', name: 'CARRIAGE RETURN + LINE FEED', marker: 'CRLF', severity: 'informational' } as const
      : CHARACTER_DESCRIPTORS[value] ?? controlDescriptor(value);
    let replacement = descriptor ? sanitizedReplacement(descriptor.kind, policy) : undefined;
    if (policy.lineEndings && descriptor && ['line-feed', 'carriage-return', 'crlf'].includes(descriptor.kind)) {
      replacement = policy.lineEndings === 'lf' ? '\n' : '\r\n';
    }
    const after = replacement ?? character;
    result += after;
    if (after !== character && descriptor) {
      edits.push(Object.freeze({
        kind: descriptor.kind,
        from: index,
        to: index + character.length,
        before: character,
        after,
        reason: `${descriptor.name}: explicit ${after ? 'replacement' : 'removal'}`,
      }));
    }
    index += character.length;
  }
  if (policy.normalization) {
    const normalized = result.normalize(policy.normalization);
    if (normalized !== result) {
      edits.push(Object.freeze({
        kind: 'normalization',
        from: 0,
        to: text.length,
        before: result,
        after: normalized,
        reason: `Explicit Unicode ${policy.normalization} normalization`,
      }));
      result = normalized;
    }
  }
  return Object.freeze({
    source: text,
    result,
    changed: result !== text,
    policy,
    edits: Object.freeze(edits),
    before: inspectTextIntegrity(text),
    after: inspectTextIntegrity(result),
  });
}

/** Convenience alias; returns a preview/result and never mutates its input. */
export function sanitizeText(text: string, policy: TextSanitizationPolicy): TextSanitizationPreview {
  return previewTextSanitization(text, policy);
}

/** Inspects one exact single-text selection without reading a DOM selection. */
export function inspectSelectionIntegrity(editor: Editor): TextIntegrityReport | null {
  const { selection, doc } = editor.state;
  if (!selection.isSingleText) return null;
  const node = getNodeAtPath(doc, selection.path);
  if (!node.isText) return null;
  return inspectTextIntegrity((node.text ?? '').slice(selection.from, selection.to));
}

/** Previews sanitization for one exact single-text selection. */
export function previewSelectionSanitization(
  editor: Editor,
  policy: TextSanitizationPolicy,
): SelectionSanitizationPreview | null {
  const { selection, doc } = editor.state;
  if (!selection.isSingleText || selection.isCollapsed) return null;
  const node = getNodeAtPath(doc, selection.path);
  if (!node.isText) return null;
  const source = (node.text ?? '').slice(selection.from, selection.to);
  return Object.freeze({
    ...previewTextSanitization(source, policy),
    path: Object.freeze([...selection.path]),
    from: selection.from,
    to: selection.to,
  });
}

/** Applies an unchanged preview target; stale selection/content fails closed. */
export function applySelectionSanitization(editor: Editor, preview: SelectionSanitizationPreview): boolean {
  const { selection, doc } = editor.state;
  if (!preview.changed || !selection.isSingleText
    || selection.from !== preview.from || selection.to !== preview.to
    || selection.path.length !== preview.path.length
    || selection.path.some((value, index) => preview.path[index] !== value)) return false;
  const node = getNodeAtPath(doc, preview.path);
  if (!node.isText || (node.text ?? '').slice(preview.from, preview.to) !== preview.source) return false;
  const transaction = editor.state.createTransaction()
    .replaceText(preview.path, preview.from, preview.to, preview.result)
    .setSelection(new Selection(preview.path, preview.from, preview.from + preview.result.length));
  return editor.dispatch(transaction);
}
