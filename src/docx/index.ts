import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { Node as FountainNode, type Mark, type Schema } from '../core/schema';
import { isSafeURL } from '../core/url';
import { tableBackground } from '../core/table-background';
import { TableMap } from '../core/table-map';
import { tableRowRepeats } from '../core/table-layout';
import { normalizeFontFamily, normalizeFontSize, normalizeLetterSpacing } from '../text-style/values';
import { PAGE_SETTING_LENGTHS, readDocumentPageSettings, type DocumentPageSettings } from '../core/page-settings';
import { isParagraphLayout, PARAGRAPH_BORDER_SIDES, type ParagraphLayout } from '../core/paragraph-layout';
import { isMathExpression } from '../core/math-expression';
import { serializeDOCXMath, type DOCXMathExpression } from './math';
import { docxMathToTeX, parseDOCXMath } from './math-parser';
import { readWordThemeFonts } from './theme-fonts';
import { readWordStyleSheet } from './style-reader';
import { readWordTableText } from './table-text';
import type { WordTableTextFormatting } from './style-cascade';
import { projectWordRunStyle, wordStyleChild, wordStyleReference } from './style-projection';
import type { XMLElement, XMLChild } from './xml-types';
import { parseDOCXXML as parseXML } from './xml-parser';
import { projectWordParagraphStyle } from './paragraph-style';
import { readWordTableAppearance, wordTableAppearanceXML } from './table-appearance';
import { isTableAppearance, type TableAppearance } from '../core/table-appearance';
import { readWordTableWidth, wordTableWidthXML } from './table-width';
import { createWordTableRegions, mergeWordTableProperties, WORD_TABLE_REGIONS } from './table-style';
export type { DOCXMathExpression } from './math';

export type DOCXIssueSeverity = 'info' | 'warning' | 'error';

export interface DOCXIssue {
  readonly code: string;
  readonly severity: DOCXIssueSeverity;
  readonly message: string;
  readonly path?: readonly number[];
  /** Package location, distinct from a Fountain document path. */
  readonly sourcePart?: string;
}

export interface DOCXPackagePart {
  readonly path: string;
  /** ZIP-declared expanded size, not proof that skipped bytes were validated. */
  readonly declaredBytes: number;
  readonly handling: 'adapter-input' | 'imported-image' | 'unrepresented-media' | 'not-interpreted';
}

export interface DOCXReport {
  readonly format: 'docx';
  readonly fidelity: 'bounded' | 'lossy';
  readonly issues: readonly DOCXIssue[];
}

export interface DOCXImportResult {
  readonly document: FountainNode;
  readonly report: DOCXReport;
  /** Intake inventory, not a semantic coverage or original-byte retention claim. */
  readonly packageParts: readonly DOCXPackagePart[];
}

export interface DOCXExportResult {
  readonly bytes: Uint8Array;
  readonly report: DOCXReport;
}

export interface DOCXLimits {
  readonly maxArchiveBytes?: number;
  readonly maxArchiveEntries?: number;
  readonly maxExpandedBytes?: number;
  readonly maxDocumentXmlBytes?: number;
  readonly maxMediaBytes?: number;
  readonly maxMediaFiles?: number;
  readonly maxXmlNodes?: number;
  readonly maxXmlDepth?: number;
}

export type DOCXImageContentType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

export interface DOCXEmbeddedImage {
  readonly bytes: Uint8Array;
  readonly contentType: DOCXImageContentType;
  readonly fileName: string;
  readonly relationshipId: string;
  readonly alt: string;
  readonly title: string;
  readonly width: string;
  readonly height: string;
}

export interface DOCXExportImage {
  readonly bytes: Uint8Array | ArrayBuffer;
  readonly contentType?: DOCXImageContentType;
}

export interface DOCXImportOptions extends DOCXLimits {
  /** Maps trusted embedded bytes to an application URL. Defaults to a bounded raster data URL. */
  readonly createImageSource?: (image: DOCXEmbeddedImage) => string | undefined;
  /** Opt in to untrusted Fountain TeX metadata only when its uniquely bound
   * equation still matches the saved OMML. Not a general Word-math importer,
   * signature check or guarantee that a host's TeX projection was accurate.
   */
  readonly restoreMathSource?: boolean;
}

export interface DOCXExportOptions extends Pick<DOCXLimits, 'maxMediaBytes' | 'maxMediaFiles'> {
  readonly title?: string;
  readonly creator?: string;
  readonly description?: string;
  readonly page?: 'a4' | 'letter';
  /** Resolves non-data image sources without giving the converter network access. */
  readonly resolveImage?: (source: string, node: FountainNode, path: readonly number[]) => DOCXExportImage | undefined;
  /** Experimental native Word math boundary. Supply semantic data, never raw XML.
   * No TeX parser is selected. Undefined/invalid results retain the text fallback
   * and an explicit loss report. Source/OMML pairs are packaged for inspection;
   * opt-in import restores only uniquely bound, unchanged projections.
   */
  readonly resolveMath?: (node: FountainNode, path: readonly number[]) => DOCXMathExpression | undefined;
}

const DEFAULT_LIMITS: Required<DOCXLimits> = {
  maxArchiveBytes: 25 * 1024 * 1024,
  maxArchiveEntries: 10_000,
  maxExpandedBytes: 80 * 1024 * 1024,
  maxDocumentXmlBytes: 25 * 1024 * 1024,
  maxMediaBytes: 32 * 1024 * 1024,
  maxMediaFiles: 100,
  maxXmlNodes: 500_000,
  maxXmlDepth: 128,
};

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeBase64(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const value = (first << 16) | (second << 8) | third;
    output += BASE64[(value >>> 18) & 63];
    output += BASE64[(value >>> 12) & 63];
    output += index + 1 < bytes.length ? BASE64[(value >>> 6) & 63] : '=';
    output += index + 2 < bytes.length ? BASE64[value & 63] : '=';
  }
  return output;
}

function decodeBase64(source: string): Uint8Array | undefined {
  const value = source.replace(/\s+/g, '');
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return undefined;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const output = new Uint8Array((value.length / 4) * 3 - padding);
  let cursor = 0;
  for (let index = 0; index < value.length; index += 4) {
    const a = BASE64.indexOf(value[index]!);
    const b = BASE64.indexOf(value[index + 1]!);
    const c = value[index + 2] === '=' ? 0 : BASE64.indexOf(value[index + 2]!);
    const d = value[index + 3] === '=' ? 0 : BASE64.indexOf(value[index + 3]!);
    if (a < 0 || b < 0 || c < 0 || d < 0) return undefined;
    const packed = (a << 18) | (b << 12) | (c << 6) | d;
    if (cursor < output.length) output[cursor++] = (packed >>> 16) & 255;
    if (cursor < output.length) output[cursor++] = (packed >>> 8) & 255;
    if (cursor < output.length) output[cursor++] = packed & 255;
  }
  return output;
}

function rasterType(bytes: Uint8Array): DOCXImageContentType | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)) === 'GIF87a') return 'image/gif';
  if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)) === 'GIF89a') return 'image/gif';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return undefined;
}

function extensionFor(contentType: DOCXImageContentType): string {
  return ({ 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/webp': 'webp' } as const)[contentType];
}

interface ParsedParagraph {
  readonly node: FountainNode;
  readonly continuation?: readonly FountainNode[];
  readonly list?: { readonly level: number; readonly ordered: boolean; readonly start: number; readonly id?: string };
  readonly caption?: boolean;
}

function localName(name: string): string {
  return name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : name;
}

function xmlEscape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]!);
}

function elements(element: XMLElement, name?: string): XMLElement[] {
  return element.children.filter((child): child is XMLElement => typeof child !== 'string' && (!name || localName(child.name) === name));
}

function child(element: XMLElement | undefined, name: string): XMLElement | undefined {
  return element && elements(element, name)[0];
}

function descendants(element: XMLElement, name: string): XMLElement[] {
  const result: XMLElement[] = [];
  const visit = (candidate: XMLElement) => {
    for (const item of elements(candidate)) {
      if (localName(item.name) === name) result.push(item);
      visit(item);
    }
  };
  visit(element);
  return result;
}

function attr(element: XMLElement | undefined, name: string): string | undefined {
  if (!element) return undefined;
  return element.attrs[name] ?? Object.entries(element.attrs).find(([key]) => localName(key) === name)?.[1];
}

function textContent(element: XMLElement): string {
  return element.children.map((item) => typeof item === 'string' ? item : textContent(item)).join('');
}

function report(issues: readonly DOCXIssue[]): DOCXReport {
  return Object.freeze({
    format: 'docx' as const,
    fidelity: issues.some((issue) => issue.severity !== 'info') ? 'lossy' as const : 'bounded' as const,
    issues: Object.freeze([...issues]),
  });
}

function mark(schema: Schema, name: string, attrs: Record<string, unknown> = {}): Mark | undefined {
  try { return schema.marks[name]?.create(attrs); }
  catch { return undefined; }
}

const WORD_HIGHLIGHTS: Readonly<Record<string, string>> = {
  black: '#000000', blue: '#0000ff', cyan: '#00ffff', green: '#00ff00', magenta: '#ff00ff',
  red: '#ff0000', yellow: '#ffff00', white: '#ffffff', darkBlue: '#000080', darkCyan: '#008080',
  darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', lightGray: '#c0c0c0',
  darkGray: '#808080',
};

function runTypography(run: XMLElement, issues: DOCXIssue[], path: readonly number[], themeFonts?: ReturnType<typeof readWordThemeFonts>): { family?: string; size?: string; spacing?: string } {
  const properties = child(run, 'rPr');
  const result: { family?: string; size?: string; spacing?: string } = {};
  const fontProperty = (name: string) => {
    const matches = properties ? elements(properties).filter(item => expandedName(item) === `${WORD_NS}|${name}`) : [];
    if (matches.length > 1) throw new Error(`Ambiguous Word run property ${name}.`);
    return matches[0];
  };
  const fontWarning = (code: string, message: string) => issues.push({ code, severity: 'warning', message, path });
  const fonts = fontProperty('rFonts');
  if (fonts) {
    const attribute = (name: string) => wordPageAttribute(fonts, name);
    const materialized = new Map<string, string>();
    const resolveFont = (slot: 'ascii' | 'hAnsi') => {
      const named = attribute(slot); const theme = attribute(`${slot}Theme`);
      if (theme === undefined) return named;
      const resolved = themeFonts?.resolve(theme);
      if (resolved && 'name' in resolved) {
        materialized.set(theme, resolved.name);
        return resolved.name;
      }
      fontWarning('font-theme-not-resolved', `The Word ${slot} theme font was not resolved (${resolved && 'reason' in resolved ? resolved.reason : 'missing-theme-part'}). Any explicit Latin font remains a fallback, not a certified theme match.`);
      return named;
    };
    const ascii = resolveFont('ascii'); const hAnsi = resolveFont('hAnsi');
    const family = ascii ?? hAnsi;
    const normalized = normalizeFontFamily(family);
    if (family !== undefined) {
      if (normalized && !normalized.includes(',')) {
        result.family = normalized;
        for (const [theme, name] of materialized) if (name === family) issues.push({ code: 'theme-font-materialized', severity: 'info', message: `Theme font ${theme} resolved to ${normalized}. Live Word theme bindings are not retained; fonts are not embedded or fetched.`, path });
      }
      else fontWarning('font-family-not-imported', 'The explicit Word font cannot be represented by the receiving font-family mark; text remains.');
    }
    if (['eastAsiaTheme', 'cstheme', 'csTheme'].some(key => attribute(key) !== undefined)) fontWarning('font-theme-not-resolved', 'Script-specific Word theme font selection is not represented by one font-family mark.');
    if ((ascii && hAnsi && ascii !== hAnsi) || ['eastAsia', 'cs', 'hint'].some(key => attribute(key) !== undefined)) fontWarning('script-fonts-not-imported', 'Script-specific Word font selection is not represented by one font-family mark; any explicit Latin font is retained.');
  }
  const sizeElement = fontProperty('sz');
  if (sizeElement) {
    const raw = wordPageAttribute(sizeElement, 'val') ?? '';
    const size = /^\d+$/.test(raw) ? normalizeFontSize(`${Number(raw) / 2}pt`) : null;
    if (size) result.size = size;
    else fontWarning('font-size-not-imported', 'The Word half-point size is invalid or outside the supported 1-384 pt range.');
  }
  const complexSize = fontProperty('szCs');
  if (complexSize && wordPageAttribute(complexSize, 'val') !== (sizeElement && wordPageAttribute(sizeElement, 'val'))) fontWarning('script-font-size-not-imported', 'A separate complex-script font size cannot be represented by the single font-size mark.');
  const spacingElement = fontProperty('spacing');
  if (spacingElement) {
    const raw = wordPageAttribute(spacingElement, 'val') ?? '';
    const twips = /^[+-]?\d+$/.test(raw) ? Number(raw) : NaN;
    const spacing = Number.isSafeInteger(twips) ? normalizeLetterSpacing(`${twips / 20}pt`) : null;
    if (spacing !== null) result.spacing = spacing;
    else fontWarning('character-spacing-not-imported', 'Word character spacing is invalid or outside the supported signed 384 pt range; text remains.');
  }
  return result;
}

function runMarks(run: XMLElement, schema: Schema, hyperlink?: string, issues: DOCXIssue[] = [], path: readonly number[] = [], themeFonts?: ReturnType<typeof readWordThemeFonts>): Mark[] {
  const properties = child(run, 'rPr');
  const result: Mark[] = [];
  const enabled = (name: string) => {
    const value = attr(child(properties, name), 'val');
    return Boolean(child(properties, name)) && value !== '0' && value !== 'false' && value !== 'off' && value !== 'none';
  };
  const add = (value: Mark | undefined) => { if (value && !result.some((item) => item.type === value.type)) result.push(value); };
  const typography = runTypography(run, issues, path, themeFonts);
  for (const [value, name, attribute] of [[typography.family, 'font_family', 'family'], [typography.size, 'font_size', 'size']] as const) {
    if (value === undefined) continue;
    const font = mark(schema, name, { [attribute]: value });
    if (font) add(font);
    else issues.push({ code: name === 'font_family' ? 'font-family-not-imported' : 'font-size-not-imported', severity: 'warning',
      message: `The receiving schema cannot represent Word ${attribute} formatting; text remains.`, path });
  }
  if (typography.spacing !== undefined) {
    const spacing = mark(schema, 'letter_spacing', { spacing: typography.spacing });
    if (spacing) add(spacing);
    else issues.push({ code: 'character-spacing-not-imported', severity: 'warning',
      message: 'The receiving schema cannot represent Word character spacing; text remains.', path });
  }
  if (enabled('b')) add(mark(schema, 'strong'));
  if (enabled('i')) add(mark(schema, 'em'));
  if (enabled('u')) add(mark(schema, 'underline'));
  if (enabled('strike') || enabled('dstrike')) add(mark(schema, 'strike'));
  const style = attr(child(properties, 'rStyle'), 'val')?.toLowerCase();
  if (style?.includes('code')) add(mark(schema, 'code'));
  const color = attr(child(properties, 'color'), 'val');
  if (color && /^[\da-f]{6}$/i.test(color)) add(mark(schema, 'text_color', { color: `#${color.toLowerCase()}` }));
  const highlight = attr(child(properties, 'highlight'), 'val');
  if (highlight && WORD_HIGHLIGHTS[highlight]) add(mark(schema, 'highlight', { color: WORD_HIGHLIGHTS[highlight] }));
  if (hyperlink) add(mark(schema, 'link', { href: hyperlink, title: '', target: '_blank' }));
  return result;
}

interface ImportedRelationship {
  readonly target: string;
  readonly type: 'hyperlink' | 'image';
  readonly external: boolean;
}

interface ImportMediaContext {
  readonly archive: Readonly<Record<string, Uint8Array>>;
  readonly relationships: ReadonlyMap<string, ImportedRelationship>;
  readonly options: DOCXImportOptions;
  readonly restoredMath: ReadonlyMap<XMLElement, FountainNode>;
  readonly importedParts: Set<string>;
  readonly sourcePart?: string;
  readonly footnotes?: ReadonlyMap<string, XMLElement>;
  readonly pageTemplate?: boolean;
  readonly themeFonts?: ReturnType<typeof readWordThemeFonts>;
  readonly styles?: ReturnType<typeof readWordStyleSheet>;
  readonly tableText?: WordTableTextFormatting;
}

function packagePartPath(sourcePart: string, target: string): string | undefined {
  let normalized: string;
  try { normalized = decodeURIComponent(target).replace(/\\/g, '/'); }
  catch { return undefined; }
  if (!normalized || /^[A-Za-z][A-Za-z\d+.-]*:/.test(normalized) || normalized.startsWith('//')) return undefined;
  if (/[\u0000-\u001f?#]/.test(normalized)) return undefined;
  const source = normalized.startsWith('/') ? normalized.slice(1) : `${sourcePart.slice(0, sourcePart.lastIndexOf('/') + 1)}${normalized}`;
  const parts: string[] = [];
  for (const part of source.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return undefined;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}

function wordPartPath(target: string, sourcePart = 'word/document.xml'): string | undefined {
  const result = packagePartPath(sourcePart, target) ?? '';
  return /^word\/media\/[^/]+$/i.test(result) ? result : undefined;
}

function pxFromEMU(value: string | undefined): string {
  const emu = Number(value);
  return Number.isFinite(emu) && emu > 0 ? `${Math.max(1, Math.round(emu / 9525))}px` : 'auto';
}

function embeddedImageNode(
  element: XMLElement,
  schema: Schema,
  media: ImportMediaContext,
  issues: DOCXIssue[],
  path: readonly number[],
): FountainNode | undefined {
  const blip = descendants(element, 'blip')[0];
  const imageData = descendants(element, 'imagedata')[0];
  const relationshipId = attr(blip, 'embed') ?? attr(blip, 'link') ?? attr(imageData, 'id');
  const description = descendants(element, 'docPr')[0];
  const alt = attr(description, 'descr') || attr(description, 'title') || 'Embedded image';
  const title = attr(description, 'title') || '';
  if (!relationshipId) {
    issues.push({ code: 'missing-image-relationship', severity: 'warning', message: 'An embedded Word image had no readable relationship.', path });
    return undefined;
  }
  const relationship = media.relationships.get(relationshipId);
  if (!relationship || relationship.type !== 'image') {
    issues.push({ code: 'missing-image-relationship', severity: 'warning', message: `Image ${relationshipId} has no readable embedded target.`, path });
    return undefined;
  }
  if (relationship.external) {
    issues.push({ code: 'external-image-omitted', severity: 'warning', message: 'A linked external Word image was not fetched; its description was preserved.', path });
    return undefined;
  }
  const partPath = wordPartPath(relationship.target, media.sourcePart);
  const bytes = partPath ? media.archive[partPath] : undefined;
  if (!partPath || !bytes) {
    issues.push({ code: 'missing-image-part', severity: 'warning', message: `Embedded image ${relationshipId} did not resolve to a packaged media file.`, path });
    return undefined;
  }
  const contentType = rasterType(bytes);
  if (!contentType) {
    issues.push({ code: 'unsupported-image-type', severity: 'warning', message: 'An embedded Word image was not a verified PNG, JPEG, GIF, or WebP file.', path });
    return undefined;
  }
  const extent = descendants(element, 'extent')[0];
  const width = pxFromEMU(attr(extent, 'cx'));
  const height = pxFromEMU(attr(extent, 'cy'));
  const image: DOCXEmbeddedImage = Object.freeze({
    bytes: new Uint8Array(bytes), contentType, fileName: partPath.slice(partPath.lastIndexOf('/') + 1),
    relationshipId, alt, title, width, height,
  });
  let source: string | undefined;
  try {
    source = media.options.createImageSource?.(image) ?? `data:${contentType};base64,${encodeBase64(bytes)}`;
  } catch {
    issues.push({ code: 'image-source-failed', severity: 'warning', message: 'The host image-source callback failed; the image description was preserved.', path });
    return undefined;
  }
  if (!isSafeURL(source, { allowDataImage: true })) {
    issues.push({ code: 'unsafe-image-source', severity: 'warning', message: 'The host returned an unsafe image source; the image description was preserved.', path });
    return undefined;
  }
  if (!schema.nodes.inline_image) {
    issues.push({ code: 'missing-image-node', severity: 'warning', message: 'The active schema has no inline_image node; the image description was preserved.', path });
    return undefined;
  }
  const node = schema.node('inline_image', {
    src: source, alt, title, width, height, align: 'center', srcset: '', sizes: '', loading: 'lazy', decoding: 'async',
  });
  media.importedParts.add(partPath);
  return node;
}

function inlineContent(container: XMLElement, schema: Schema, media: ImportMediaContext, issues: DOCXIssue[], path: readonly number[]): FountainNode[] {
  const output: FountainNode[] = [];
  const paragraphStyle = media.styles ? wordStyleReference(wordStyleChild(container, 'pPr'), 'pStyle') : undefined;
  const projectedMarks = (run: XMLElement, hyperlink?: string) => {
    const effective = media.styles ? projectWordRunStyle(run, paragraphStyle, media.styles, (code, message) => {
      if (!issues.some(issue => issue.code === code && issue.message === message && issue.path === path)) issues.push({ code, severity: 'warning', message, path, sourcePart: media.sourcePart ?? 'word/document.xml' });
    }, media.tableText) : run;
    return runMarks(effective, schema, hyperlink, issues, path, media.themeFonts);
  };
  const appendText = (value: string, marks: readonly Mark[], explicitEmpty = false) => {
    if (!value && !explicitEmpty) return;
    const previous = output.at(-1);
    if (previous?.isText && previous.marks.length === marks.length && previous.marks.every((item, index) => item.eq(marks[index]!))) {
      output[output.length - 1] = previous.withText((previous.text ?? '') + value);
    } else output.push(schema.text(value, marks));
  };
  const visit = (element: XMLElement, hyperlink?: string) => {
    const name = localName(element.name);
    if (name === 'fldSimple' && media.pageTemplate) {
      const instruction = (attr(element, 'instr') ?? '').trim();
      const field = /^(PAGE|NUMPAGES)(?:\s+\\\*\s+MERGEFORMAT)?$/i.exec(instruction);
      if (field && schema.nodes.page_field) {
        const firstRun = descendants(element, 'r')[0];
        output.push(schema.node('page_field', { kind: field[1]!.toUpperCase() === 'PAGE' ? 'page-number' : 'page-count' }, [], undefined, firstRun ? projectedMarks(firstRun, hyperlink) : []));
      } else {
        issues.push({ code: 'unsupported-word-field', severity: 'warning', message: 'The Word field was retained only as its cached visible result; its instruction was not executed.', path });
        elements(element).forEach(item => visit(item, hyperlink));
      }
      return;
    }
    if (name === 'sdt') {
      for (const content of contentControlContents(element, issues, path)) {
        elements(content.element).forEach(item => visit(item, hyperlink));
      }
      return;
    }
    if (name === 'oMath' || name === 'oMathPara') {
      const restored = media.restoredMath.get(element);
      if (restored) {
        output.push(restored);
        issues.push({ code: 'math-source-restored-experimental', severity: 'warning', message: 'Restored TeX and its accessibility label from matching, uniquely bound package metadata. Metadata is untrusted; this is not a signature, general OMML conversion or full document round trip.', path });
        return;
      }
      const nodeName = name === 'oMathPara' ? 'math_block' : 'inline_math';
      if (!schema.nodes[nodeName]) {
        issues.push({ code: 'missing-math-node', severity: 'warning', message: `The active schema has no ${nodeName} node. The Word equation remains an explicit placeholder.`, path });
        appendText('[Word equation: math extension unavailable]', []);
        return;
      }
      try {
        const expression = parseDOCXMath(element);
        const latex = docxMathToTeX(expression);
        const ariaLabel = latex.length <= 950 ? `Imported Word equation: ${latex}` : 'Imported Word equation';
        output.push(schema.node(nodeName, { latex, ariaLabel, expression }));
        issues.push({ code: 'office-math-imported-experimental', severity: 'warning', message: 'Supported Word equation semantics were converted to editable TeX. The original OMML source/style is not retained, and native application fidelity is not yet certified.', path });
      } catch (error) {
        issues.push({ code: 'unsupported-office-math', severity: 'warning', message: `This Word equation uses structure outside Fountain's bounded OMML bridge. Keep the original DOCX. ${error instanceof Error ? error.message : String(error)}`, path });
        appendText('[Word equation: unsupported structure]', []);
      }
      return;
    }
    if (name === 'hyperlink') {
      const id = attr(element, 'id');
      const relationship = id ? media.relationships.get(id) : undefined;
      const target = relationship?.type === 'hyperlink' && relationship.external ? relationship.target : undefined;
      if (id && !target) issues.push({ code: 'missing-hyperlink-relationship', severity: 'warning', message: `Hyperlink ${id} has no readable external target.`, path });
      const safeTarget = target && isSafeURL(target, { allowEmpty: false }) ? target : undefined;
      if (target && !safeTarget) issues.push({ code: 'unsafe-hyperlink-omitted', severity: 'warning', message: 'An unsafe Word hyperlink target was omitted while its text was preserved.', path });
      elements(element).forEach((item) => visit(item, safeTarget));
      return;
    }
    if (name === 'r') {
      const marks = projectedMarks(element, hyperlink);
      for (const item of elements(element)) {
        const itemName = localName(item.name);
        if (itemName === 'oMath' || itemName === 'oMathPara') visit(item, hyperlink);
        else if (itemName === 'instrText' && media.pageTemplate) issues.push({ code: 'unsupported-complex-word-field', severity: 'warning', message: 'A complex Word field instruction was not executed or imported; only any cached result remains. Dynamic field conversion needs a supported simple field.', path });
        else if (itemName === 't' || itemName === 'delText' || itemName === 'instrText') {
          // An actual empty native text element retains a caret leaf and its
          // run formatting. Property-only runs and field instructions do not.
          appendText(textContent(item), marks, expandedName(item) === `${WORD_NS}|t`);
        }
        else if (itemName === 'tab') appendText('\t', marks);
        else if (itemName === 'footnoteReference' && media.footnotes) {
          const id = wordNoteId(attr(item, 'id'));
          if (id !== undefined && media.footnotes.has(id) && !media.sourcePart) {
            output.push(schema.node('footnote_reference', { id }, [], undefined, marks));
            if (attr(item, 'customMarkFollows') && !['0', 'false', 'off'].includes(attr(item, 'customMarkFollows')!)) {
              issues.push({ code: 'footnote-custom-mark-normalized', severity: 'warning', message: 'The custom footnote marker was replaced by automatic numbering; following literal text remains.', path });
            }
          } else {
            appendText('[Footnote unavailable]', marks);
            issues.push({ code: 'unresolved-footnote-reference', severity: 'warning', message: 'The footnote reference has no matching definition, or is illegally nested inside a note. A visible placeholder was retained.', path, sourcePart: media.sourcePart ?? 'word/document.xml' });
          }
        }
        else if (itemName === 'footnoteReference' || itemName === 'endnoteReference' || itemName === 'commentReference') {
          issues.push({ code: 'unrepresented-note-reference', severity: 'warning', message: `The ${itemName} marker and its associated content were not imported.`, path, sourcePart: 'word/document.xml' });
        }
        else if (itemName === 'br' || itemName === 'cr') {
          const breakType = itemName === 'br' ? attr(item, 'type') ?? 'textWrapping' : 'textWrapping';
          if (breakType === 'page') {
            if (schema.nodes.page_break) output.push(schema.node('page_break'));
            else {
              appendText('[Page break]', []);
              issues.push({ code: 'missing-page-break-node', severity: 'warning', message: 'The active schema has no page_break node. A visible marker was retained, not a working page boundary.', path });
            }
          } else {
            if (breakType !== 'textWrapping') issues.push({ code: 'unsupported-break-type', severity: 'warning', message: `Word ${breakType} break was represented only as a line break; its column/layout behaviour is not supported.`, path });
            if (attr(item, 'clear') && attr(item, 'clear') !== 'none') issues.push({ code: 'break-clear-not-imported', severity: 'warning', message: 'The line break remains, but its rule for clearing floating objects is not represented.', path });
            if (schema.nodes.hard_break) output.push(schema.node('hard_break', {}, [], undefined, marks));
            else appendText('\n', marks);
          }
        } else if (itemName === 'drawing' || itemName === 'pict' || itemName === 'object') {
          const description = descendants(item, 'docPr')[0];
          const alt = attr(description, 'descr') || attr(description, 'title') || 'Embedded object';
          const image = embeddedImageNode(item, schema, media, issues, path);
          if (image) {
            output.push(image);
            if (itemName === 'object') issues.push({ code: 'embedded-object-preview', severity: 'warning', message: 'An embedded Word object was omitted and its raster preview was imported.', path });
          }
          else appendText(`[${alt}]`, marks);
        }
      }
      return;
    }
    if (name === 'ins') {
      issues.push({ code: 'accepted-insertion', severity: 'info', message: 'Tracked insertion content was imported as accepted text.', path });
      elements(element).forEach((item) => visit(item, hyperlink));
      return;
    }
    if (name === 'del') {
      issues.push({ code: 'omitted-deletion', severity: 'warning', message: 'Tracked deletion content was omitted during import.', path });
      return;
    }
    elements(element).forEach((item) => visit(item, hyperlink));
  };
  elements(container).forEach((item) => visit(item));
  return output;
}

interface NumberingLevel { readonly ordered: boolean; readonly start: number }

function readNumbering(root: XMLElement | undefined): ReadonlyMap<string, NumberingLevel> {
  const levels = new Map<string, NumberingLevel>();
  if (!root) return levels;
  const abstracts = new Map<string, ReadonlyMap<string, NumberingLevel>>();
  for (const abstract of descendants(root, 'abstractNum')) {
    const id = attr(abstract, 'abstractNumId');
    if (!id) continue;
    const map = new Map<string, NumberingLevel>();
    for (const level of elements(abstract, 'lvl')) {
      const index = attr(level, 'ilvl') ?? '0';
      const format = attr(child(level, 'numFmt'), 'val') ?? 'decimal';
      const start = Number(attr(child(level, 'start'), 'val') ?? 1);
      map.set(index, { ordered: format !== 'bullet' && format !== 'none', start: Number.isInteger(start) && start >= 0 ? start : 1 });
    }
    abstracts.set(id, map);
  }
  for (const numbering of descendants(root, 'num')) {
    const numId = attr(numbering, 'numId');
    const abstractId = attr(child(numbering, 'abstractNumId'), 'val');
    if (!numId || !abstractId) continue;
    for (const [level, value] of abstracts.get(abstractId) ?? []) levels.set(`${numId}:${level}`, value);
    for (const override of elements(numbering, 'lvlOverride')) {
      const index = attr(override, 'ilvl') ?? '0';
      const key = `${numId}:${index}`;
      const base = levels.get(key);
      if (!base) continue;
      const definition = child(override, 'lvl');
      const format = attr(child(definition, 'numFmt'), 'val');
      const start = Number(attr(child(override, 'startOverride'), 'val')
        ?? attr(child(definition, 'start'), 'val') ?? base.start);
      levels.set(key, {
        ordered: format ? format !== 'bullet' && format !== 'none' : base.ordered,
        start: Number.isInteger(start) && start >= 0 ? start : base.start,
      });
    }
  }
  return levels;
}

/** Recover explicit emphasis only when Word contains absolute b/i declarations
 * for all text runs and normal emphasis for the paragraph mark. A partial direct
 * override still needs the complete style cascade; do not guess its other runs.
 */
function hasExplicitWordEmphasis(paragraph: XMLElement): boolean {
  const one = (parent: XMLElement | undefined, name: string) => {
    const matches = parent ? elements(parent).filter(item => expandedName(item) === `${WORD_NS}|${name}`) : [];
    if (matches.length > 1) throw new Error(`Ambiguous Word emphasis property ${name}.`);
    return matches[0];
  };
  const value = (properties: XMLElement | undefined, name: string): boolean | undefined => {
    const property = one(properties, name);
    if (!property) return undefined;
    const raw = wordPageAttribute(property, 'val');
    if (raw === undefined || ['1', 'true', 'on'].includes(raw)) return true;
    if (['0', 'false', 'off'].includes(raw)) return false;
    return undefined;
  };
  const paragraphMark = one(one(paragraph, 'pPr'), 'rPr');
  if (value(paragraphMark, 'b') !== false || value(paragraphMark, 'i') !== false) return false;
  return descendants(paragraph, 'r').filter(run => expandedName(run) === `${WORD_NS}|r`
    && elements(run).some(item => ['t', 'footnoteReference', 'tab'].includes(localName(item.name))))
    .every(run => {
      const properties = one(run, 'rPr');
      return value(properties, 'b') !== undefined && value(properties, 'i') !== undefined;
    });
}

function parseParagraph(element: XMLElement, schema: Schema, media: ImportMediaContext, numbering: ReadonlyMap<string, NumberingLevel>, issues: DOCXIssue[], path: readonly number[]): ParsedParagraph {
  const properties = child(element, 'pPr');
  const style = attr(child(properties, 'pStyle'), 'val') ?? '';
  const isQuote = /^(?:(?:intense)?quote|FountainExplicitQuote)$/i.test(style) && Boolean(schema.nodes.blockquote);
  const { align, alignExplicit, layout: geometry } = projectWordParagraphStyle(properties, media.styles, (code, message) => {
    issues.push({ code, severity: 'warning', message, path });
  }, media.tableText);
  const content = inlineContent(element, schema, media, issues, path);
  const fontContext: { fontFamily?: string; fontSize?: number } = {};
  const markProperties = wordStyleChild(properties, 'rPr');
  if (media.styles || markProperties) {
    // Paragraph-mark formatting belongs to the line context, not to each text
    // run. Resolve it separately; never use the first run as a guessed default.
    const run: XMLElement = { name: 'w:r', attrs: {}, namespaces: { w: WORD_NS }, children: markProperties ? [{ ...markProperties,
      children: markProperties.children.filter(item => typeof item !== 'string' && ['rFonts', 'sz', 'szCs', 'rStyle'].some(name => expandedName(item) === `${WORD_NS}|${name}`)),
    }] : [] };
    const effective = media.styles ? projectWordRunStyle(run, wordStyleReference(properties, 'pStyle'), media.styles, (code, message) => {
      if (!issues.some(issue => issue.code === code && issue.message === message && issue.path === path)) issues.push({ code, severity: 'warning', message, path });
    }, media.tableText) : run;
    const font = runTypography(effective, issues, path, media.themeFonts);
    if (wordStyleChild(markProperties, 'spacing') || !content.length && font.spacing !== undefined) issues.push({
      code: 'paragraph-mark-spacing-not-imported', severity: 'warning',
      message: 'Word paragraph-mark/empty-line character spacing is not retained as caret formatting. Text-run spacing is imported separately.', path,
    });
    for (const [value, key, markName] of [[font.family, 'fontFamily', 'font_family'], [font.size, 'fontSize', 'font_size']] as const) {
      if (value === undefined) continue;
      // A browser's paragraph font also inherits into unmarked text. If the
      // source run font is unknown/unrepresentable, doing that would wrongly
      // apply paragraph-mark-only formatting to the text. Keep the limitation
      // visible instead of inventing the missing run font.
      if (content.some(node => (node.isText || node.type.name === 'hard_break') && !node.marks.some(mark => mark.type.name === markName))) {
        issues.push({ code: 'paragraph-font-context-not-imported', severity: 'warning',
          message: `Word paragraph ${key} was not projected: unresolved text-run fonts would inherit paragraph-mark-only formatting. The source mark font is not retained.`, path });
      } else if (key === 'fontFamily') fontContext.fontFamily = value;
      else fontContext.fontSize = Number(value.slice(0, -2));
    }
  }
  const layout = geometry && Object.freeze({ ...geometry, ...fontContext });
  let type = 'paragraph';
  let attrs: Record<string, unknown> = { align, ...(layout ? { layout } : {}) };
  const heading = /^heading([1-6])$/i.exec(style);
  if (heading && schema.nodes.heading) {
    type = 'heading';
    attrs = { level: Number(heading[1]), align, ...(layout ? { layout } : {}) };
  } else if (/code/i.test(style) && schema.nodes.code_block) {
    type = 'code_block';
    attrs = { language: '', ...(layout && schema.nodes.code_block.spec.attrs?.layout ? { layout } : {}) };
    if (layout && !schema.nodes.code_block.spec.attrs?.layout) issues.push({ code: 'code-paragraph-layout-not-imported', severity: 'warning', message: 'The schema cannot represent Word paragraph layout on this code block.', path });
  }
  if ((type === 'paragraph' || type === 'heading') && (media.styles || hasExplicitWordEmphasis(element))) {
    if (schema.nodes[type]?.spec.attrs?.emphasis) attrs.emphasis = 'explicit';
    else if (media.styles) issues.push({ code: 'block-emphasis-not-imported', severity: 'warning', message: 'The schema cannot represent explicit Word block emphasis; host heading/quote defaults may differ.', path });
  }
  if ((type === 'paragraph' || type === 'heading') && alignExplicit) attrs.alignExplicit = true;
  if (type === 'paragraph' && !isQuote && content.length === 1 && content[0]?.type.name === 'inline_image' && schema.nodes.image_super) {
    return { node: schema.node('image_super', { ...content[0].attrs, align, caption: '' }) };
  }
  // Word may put text, page breaks and display equations in one paragraph. Preserve their
  // order as separate Fountain blocks, never force a block into inline content.
  const parts: FountainNode[] = [];
  let inline: FountainNode[] = [];
  const flush = () => {
    if (!inline.length) return;
    if (type === 'code_block' && inline.some(node => !node.isText)) {
      parts.push(schema.node('paragraph', { align, ...(alignExplicit ? { alignExplicit: true } : {}), ...(layout ? { layout } : {}) }, inline));
      issues.push({ code: 'code-style-not-applied', severity: 'warning', message: 'The Word code-styled paragraph contains rich content; it was preserved as a paragraph rather than invalid text-only code.', path });
    } else parts.push(schema.node(type, attrs, inline));
    inline = [];
  };
  for (const node of content) {
    if (node.type.name === 'math_block' || node.type.name === 'page_break') { flush(); parts.push(node); }
    else inline.push(node);
  }
  flush();
  if (!parts.length) parts.push(schema.node(type, attrs));
  if (parts.length > 1 && content.some(node => node.type.name === 'math_block')) issues.push({ code: 'display-math-paragraph-split', severity: 'info', message: 'A mixed Word paragraph was split into prose and display-equation blocks without changing their order.', path });
  if (parts.length > 1 && content.some(node => node.type.name === 'page_break')) issues.push({ code: 'page-break-paragraph-split', severity: 'warning', message: 'An inline Word page break became a Fountain block boundary. Text order and break count remain, but the original shared paragraph identity and spacing need native layout verification.', path });
  if (isQuote) {
    const quoteAttrs: Record<string, unknown> = {};
    if (media.styles || layout) {
      if (schema.nodes.blockquote.spec.attrs?.appearance) quoteAttrs.appearance = 'explicit';
      else issues.push({ code: 'quote-appearance-not-imported', severity: 'warning',
        message: 'The host quote schema cannot neutralize its container decoration; Word-owned borders, spacing or indentation may be doubled.', path });
    }
    return { node: schema.node('blockquote', quoteAttrs, parts) };
  }
  const paragraph = parts[0]!;
  const continuation = parts.slice(1);
  const numPr = child(properties, 'numPr');
  const numId = attr(child(numPr, 'numId'), 'val');
  const level = Number(attr(child(numPr, 'ilvl'), 'val') ?? 0);
  const definition = numId ? numbering.get(`${numId}:${level}`) ?? numbering.get(`${numId}:0`) : undefined;
  if (definition) return { node: paragraph, continuation, list: { level: Math.max(0, Math.min(8, level)), ...definition, id: numId } };
  const listStyle = /^list(bullet|number)(\d+)?$/i.exec(style);
  if (listStyle) return {
    node: paragraph,
    continuation,
    list: {
      level: Math.max(0, Math.min(8, Number(listStyle[2] ?? 1) - 1)),
      ordered: listStyle[1]!.toLowerCase() === 'number',
      start: 1,
    },
  };
  return { node: paragraph, continuation, caption: !continuation.length && /^caption$/i.test(style) };
}

function groupLists(items: readonly ParsedParagraph[], schema: Schema, issues: DOCXIssue[]): FountainNode[] {
  const output: FountainNode[] = [];
  let cursor = 0;
  const parseList = (level: number, ordered: boolean): FountainNode => {
    const listItems: FountainNode[] = [];
    const start = items[cursor]?.list?.start ?? 1;
    const id = items[cursor]?.list?.id;
    while (cursor < items.length) {
      const current = items[cursor]!;
      if (!current.list || current.list.level < level || (current.list.level === level
        && (current.list.ordered !== ordered || current.list.id !== id))) break;
      if (current.list.level > level) {
        if (!listItems.length) {
          issues.push({ code: 'list-level-normalized', severity: 'warning', message: 'A list began below level zero; its nesting was normalized.' });
          return parseList(current.list.level, current.list.ordered);
        }
        const nested = parseList(current.list.level, current.list.ordered);
        const previous = listItems.at(-1)!;
        listItems[listItems.length - 1] = previous.copy([...previous.content, nested]);
        continue;
      }
      cursor += 1;
      const children: FountainNode[] = [current.node, ...current.continuation ?? []];
      while (cursor < items.length && items[cursor]!.list && items[cursor]!.list!.level > level) {
        const nested = items[cursor]!.list!;
        children.push(parseList(nested.level, nested.ordered));
      }
      listItems.push(schema.node('list_item', {}, children));
    }
    return schema.node(ordered ? 'ordered_list' : 'bullet_list', ordered ? { start } : {}, listItems);
  };
  while (cursor < items.length) {
    const current = items[cursor]!;
    if (!current.list) { output.push(current.node, ...current.continuation ?? []); cursor += 1; continue; }
    output.push(parseList(current.list.level, current.list.ordered));
  }
  return output;
}

const DEFINITION_TAG = 'urn:fountainjs:docx:definition:';
const TABLE_HEADER_TAG = 'urn:fountainjs:docx:table-header:';
type DefinitionRole = 'list' | 'term' | 'description';

/** Only our versioned, behavior-free structural controls carry glossary roles.
 * Visible Word content, never hidden source JSON, is authoritative.
 */
function structuralControl(element: XMLElement): { tag: string; content: XMLElement; index: number } | undefined {
  if (expandedName(element) !== `${WORD_NS}|sdt`) return;
  const children = elements(element);
  const properties = children.filter(item => expandedName(item) === `${WORD_NS}|sdtPr`);
  const contents = children.filter(item => expandedName(item) === `${WORD_NS}|sdtContent`);
  if (children.length !== 2 || properties.length !== 1 || contents.length !== 1) return;
  const fields = elements(properties[0]!);
  if (fields.some(item => !['alias', 'id', 'tag'].some(name => expandedName(item) === `${WORD_NS}|${name}`))) return;
  const tags = fields.filter(item => expandedName(item) === `${WORD_NS}|tag`);
  if (tags.length !== 1) return;
  const tag = namespacedAttr(tags[0]!, 'val');
  return tag ? { tag, content: contents[0]!, index: children.indexOf(contents[0]!) } : undefined;
}

function definitionControl(element: XMLElement): { role: DefinitionRole; content: XMLElement; index: number } | undefined {
  const control = structuralControl(element);
  const role = control && (['list', 'term', 'description'] as const).find(value => control.tag === `${DEFINITION_TAG}${value}:v1`);
  return role ? { ...control!, role } : undefined;
}

function parseDefinitionList(element: XMLElement, schema: Schema, media: ImportMediaContext,
  numbering: ReadonlyMap<string, NumberingLevel>, issues: DOCXIssue[], path: readonly number[]): FountainNode[] | undefined {
  const control = definitionControl(element);
  if (control?.role !== 'list') return;
  const entries = elements(control.content).map(definitionControl);
  if (entries.some(entry => !entry || entry.role === 'list')) return;
  // Parse each visible entry exactly once, even with an incompatible host schema.
  // Retrying nested controls through the fallback would multiply work by depth.
  const contents = entries.map((entry, index) => parseBlocks(entry!.content, schema, media, numbering, issues,
    [...path, control.index, index, entry!.index]));
  try {
    const children = entries.map((entry, index) => schema.node(`definition_${entry!.role}`, {},
      contents[index]!.length ? contents[index]! : [schema.node('paragraph')]));
    const node = schema.node('definition_list', {}, children);
    schema.validate(node);
    return [node];
  } catch {
    // Missing/incompatible host roles must not turn readable Word into an error.
    issues.push({ code: 'definition-schema-fallback', severity: 'warning', message: 'The host schema could not restore Word glossary roles; visible content was imported without those roles.', path });
    return contents.flat();
  }
}

function contentControlContents(element: XMLElement, issues: DOCXIssue[], path: readonly number[]): Array<{ element: XMLElement; index: number }> {
  if (expandedName(element) !== `${WORD_NS}|sdt`) {
    issues.push({ code: 'unsupported-content-control-namespace', severity: 'warning', message: 'A non-Word content-control lookalike was not interpreted.', path });
    return [];
  }
  const contents = elements(element).flatMap((value, index) => expandedName(value) === `${WORD_NS}|sdtContent` ? [{ element: value, index }] : []);
  issues.push({ code: 'content-control-unwrapped', severity: 'warning',
    message: 'Word content-control content was imported without its control identity, form behavior, locks or data bindings.', path });
  if (contents.length !== 1) issues.push({ code: 'invalid-content-control', severity: 'warning',
    message: 'A Word content control had missing or multiple content containers; available visible content was retained in order.', path });
  return contents;
}

/** Read visible block content in the body, cells and block content controls.
 * Control properties are never document content or executable form bindings.
 */
function parseBlocks(container: XMLElement, schema: Schema, media: ImportMediaContext,
  numbering: ReadonlyMap<string, NumberingLevel>, issues: DOCXIssue[], path: readonly number[]): FountainNode[] {
  const blocks: FountainNode[] = [];
  const paragraphs: ParsedParagraph[] = [];
  const flush = () => { if (paragraphs.length) blocks.push(...groupLists(paragraphs.splice(0), schema, issues)); };
  const visit = (parent: XMLElement, parentPath: readonly number[]) => {
    for (const [index, item] of elements(parent).entries()) {
      const currentPath = [...parentPath, index];
      const name = localName(item.name);
      if (name === 'p') {
        const parsed = parseParagraph(item, schema, media, numbering, issues, currentPath);
        if (parsed.caption) {
          flush();
          const image = blocks.at(-1);
          if (image?.type.name === 'image_super' && parsed.node.textContent.trim()) {
            const richCaption = parsed.node.content.some((inline) => !inline.isText || inline.marks.length > 0);
            try {
              blocks[blocks.length - 1] = richCaption
                ? schema.node('image_super', { ...image.attrs, caption: '', captionAlign: parsed.node.attrs.align, captionLayout: parsed.node.attrs.layout }, parsed.node.content)
                : schema.node('image_super', { ...image.attrs, caption: parsed.node.textContent, captionAlign: parsed.node.attrs.align, captionLayout: parsed.node.attrs.layout });
            } catch {
              blocks[blocks.length - 1] = schema.node('image_super', { ...image.attrs, caption: parsed.node.textContent });
              issues.push({ code: 'image-caption-rich-content-flattened', severity: 'warning', message: 'The host image schema cannot own rich caption content; the visible caption was retained as plain text.', path: currentPath });
            }
          } else paragraphs.push({ node: parsed.node });
        } else paragraphs.push(parsed);
      } else if (name === 'tbl') {
        flush();
        blocks.push(parseTable(item, schema, media, numbering, issues, currentPath));
      } else if (name === 'sdt') {
        const glossary = parseDefinitionList(item, schema, media, numbering, issues, currentPath);
        if (glossary) { flush(); blocks.push(...glossary); continue; }
        // Inline/row/cell controls have different shapes. This branch only
        // projects block controls in an already established block container.
        const contents = contentControlContents(item, issues, currentPath);
        // Continue the paragraph stream: a control boundary does not restart
        // numbering or separate a caption from its preceding image.
        for (const content of contents) visit(content.element, [...currentPath, content.index]);
      } else if (!['sectPr', 'tcPr'].includes(name)) {
        issues.push({ code: 'unsupported-block', severity: 'warning', message: `Unsupported Word block ${name} was omitted.`, path: currentPath });
      }
    }
  };
  visit(container, path);
  flush();
  return blocks;
}

function tableShading(shading: XMLElement | undefined, issues: DOCXIssue[], path: readonly number[]): string {
  if (!shading || attr(shading, 'val') === 'nil') return '';
  const pattern = attr(shading, 'val') ?? 'clear';
  const solid = pattern === 'solid';
  const value = attr(shading, solid ? 'color' : 'fill');
  if (Object.keys(shading.attrs).some(key => /(?:^|:)theme/.test(key))) {
    issues.push({ code: 'unresolved-table-shading-theme', severity: 'warning', message: 'Table shading theme references are not resolved; the explicit RGB fallback is retained when available.', path });
  }
  if (!['clear', 'solid'].includes(pattern)) {
    issues.push({ code: 'unsupported-table-shading-pattern', severity: 'warning', message: 'The table shading pattern is not represented; its background RGB fill is retained when available.', path });
  }
  if (value && /^[\da-f]{6}$/i.test(value)) return `#${value.toLowerCase()}`;
  if (value && value !== 'auto') issues.push({ code: 'invalid-table-shading-color', severity: 'warning', message: 'An invalid table shading RGB color was omitted.', path });
  return '';
}

const DOCX_TWIPS_PER_PIXEL = 15;
const DOCX_DEFAULT_COLUMN_WIDTH = 160;
const DOCX_MIN_COLUMN_WIDTH = 40;
const DOCX_MAX_COLUMN_WIDTH = 2_000;

function wordColumnWidth(
  value: string | undefined,
  issues: DOCXIssue[],
  path: readonly number[],
  source: 'grid' | 'cell',
): number {
  const twips = Number(value);
  if (!Number.isInteger(twips) || twips <= 0) {
    issues.push({
      code: 'invalid-table-column-width',
      severity: 'warning',
      message: `A Word table ${source} width was missing, non-integer or non-positive and could not be represented.`,
      path,
    });
    return 0;
  }
  const pixels = Math.round(twips / DOCX_TWIPS_PER_PIXEL);
  if (pixels < DOCX_MIN_COLUMN_WIDTH || pixels > DOCX_MAX_COLUMN_WIDTH) {
    issues.push({
      code: 'unsupported-table-column-width',
      severity: 'warning',
      message: `A Word table ${source} width falls outside Fountain's supported ${DOCX_MIN_COLUMN_WIDTH}-${DOCX_MAX_COLUMN_WIDTH}px range and was retained as unknown.`,
      path,
    });
    return 0;
  }
  if (pixels * DOCX_TWIPS_PER_PIXEL !== twips) {
    issues.push({
      code: 'table-column-width-rounded',
      severity: 'info',
      message: `A Word table ${source} width was rounded to Fountain's whole-pixel resolution.`,
      path,
    });
  }
  return pixels;
}

function readTableGrid(element: XMLElement, issues: DOCXIssue[], path: readonly number[]): readonly number[] {
  const tableGrid = child(element, 'tblGrid');
  const columns = tableGrid ? elements(tableGrid, 'gridCol') : [];
  if (!columns.length) return [];
  if (columns.length > 100) {
    issues.push({
      code: 'table-grid-too-wide',
      severity: 'warning',
      message: 'A Word table grid above the supported 100-column limit was not represented as editable column widths.',
      path,
    });
    return [];
  }
  return columns.map((column, index) => wordColumnWidth(attr(column, 'w'), issues, [...path, index], 'grid'));
}

function readCellWidths(
  properties: XMLElement | undefined,
  grid: readonly number[],
  column: number,
  colspan: number,
  issues: DOCXIssue[],
  path: readonly number[],
): readonly number[] | null {
  const gridWidths = Array.from({ length: colspan }, (_, offset) => grid[column + offset] ?? 0);
  const preferred = child(properties, 'tcW');
  const preferredType = attr(preferred, 'type') ?? (preferred ? 'dxa' : '');
  const preferredValue = attr(preferred, 'w');
  if (gridWidths.some(width => width > 0)) {
    if (preferred && preferredType === 'dxa') {
      const preferredTwips = Number(preferredValue);
      const gridTwips = gridWidths.reduce((sum, width) => sum + width * DOCX_TWIPS_PER_PIXEL, 0);
      if (Number.isInteger(preferredTwips) && preferredTwips > 0
        && Math.abs(preferredTwips - gridTwips) > DOCX_TWIPS_PER_PIXEL * colspan) {
        issues.push({
          code: 'table-cell-grid-width-conflict',
          severity: 'warning',
          message: 'A Word cell preferred width conflicts with its table grid; the grid was used as the editable column geometry.',
          path,
        });
      }
    }
    return gridWidths;
  }
  if (!preferred) return null;
  if (preferredType !== 'dxa') {
    issues.push({
      code: 'unsupported-table-cell-width',
      severity: 'warning',
      message: `A Word cell width of type ${preferredType || 'unknown'} cannot be represented as a fixed Fountain column width.`,
      path,
    });
    return null;
  }
  if (colspan !== 1) {
    issues.push({
      code: 'ambiguous-spanned-cell-width',
      severity: 'warning',
      message: 'A preferred width on a spanning Word cell cannot determine its individual column widths without a table grid.',
      path,
    });
    return null;
  }
  const width = wordColumnWidth(preferredValue, issues, path, 'cell');
  return width ? [width] : null;
}

function parseTable(element: XMLElement, schema: Schema, media: ImportMediaContext, numbering: ReadonlyMap<string, NumberingLevel>, issues: DOCXIssue[], path: readonly number[]): FountainNode {
  interface MutableCell { content: FountainNode[]; colspan: number; rowspan: number; scope?: string; continuation: boolean; background: string; colwidth: readonly number[] | null; appearance?: TableAppearance }
  const directProperties = wordStyleChild(element, 'tblPr');
  const warnAppearance = (code: string, message: string) => issues.push({ code, severity: 'warning' as const, message, path });
  const styleId = wordStyleReference(directProperties, 'tblStyle');
  const inherited = media.styles?.resolveTable(styleId, warnAppearance);
  if (inherited?.ids.length) issues.push({ code: 'table-style-materialized', severity: 'info',
    message: `Supported appearance from Word table styles ${inherited.ids.join(' → ')} was materialized as editable table/cell declarations. Live style bindings and original style XML are not retained by native export.`, path });
  const properties = inherited?.table ? mergeWordTableProperties('tblPr', [inherited.table, directProperties]) : directProperties;
  const appearance = readWordTableAppearance(properties, false, warnAppearance);
  const preferredWidth = readWordTableWidth(properties, warnAppearance);
  if (styleId && !media.styles) warnAppearance('table-style-appearance-unresolved', 'The associated Word table style has no available internal style definitions; direct appearance remains.');
  const spacing = wordStyleChild(properties, 'tblCellSpacing');
  if (spacing && wordPageAttribute(spacing, 'w') !== '0') warnAppearance('table-cell-spacing-not-imported', 'Nonzero Word table cell spacing is not represented by the collapsed-border view.');
  const tableLayoutElement = wordStyleChild(properties, 'tblLayout');
  const tableLayout = tableLayoutElement && wordPageAttribute(tableLayoutElement, 'type');
  if (tableLayout && !['fixed', 'autofit'].includes(tableLayout)) {
    issues.push({
      code: 'unsupported-table-layout',
      severity: 'warning',
      message: `Unknown Word table layout ${tableLayout} was omitted; the supported grid is retained.`,
      path,
    });
  }
  const grid = readTableGrid(element, issues, path);
  const sourceRows = elements(element, 'tr');
  // Resolve region positions from the source's grid, not flattened cell indexes.
  const sourceSpan = (cell: XMLElement) => Math.max(1, Number(wordStyleReference(wordStyleChild(cell, 'tcPr'), 'gridSpan') ?? 1) || 1);
  let conditionalWidth = grid.length;
  for (const row of sourceRows) conditionalWidth = Math.max(conditionalWidth, elements(row, 'tc').reduce((sum, cell) => sum + sourceSpan(cell), 0));
  const hasConditions = Boolean(inherited?.regions.size || inherited?.regionalText.size);
  const baseText = readWordTableText(inherited?.text, warnAppearance);
  const rows: MutableCell[][] = [];
  const repetition: boolean[] = [];
  let leadingRepeat = true;
  const active = new Map<number, MutableCell>();
  for (const [rowIndex, row] of sourceRows.entries()) {
    const exceptions = wordStyleChild(row, 'tblPrEx');
    const rowPath = [...path, rowIndex];
    const warnRow = (code: string, message: string) => issues.push({ code, severity: 'warning' as const, message, path: rowPath });
    const rowProperties = hasConditions ? mergeWordTableProperties('tblPr', [properties, exceptions]) : properties;
    const regional = hasConditions ? createWordTableRegions(rowProperties, warnRow) : undefined;
    const offsetProperties = wordStyleChild(row, 'trPr');
    const offsets = wordStyleChild(offsetProperties, 'gridBefore') || wordStyleChild(offsetProperties, 'gridAfter');
    if (hasConditions && offsets) warnRow('table-style-grid-offset-not-imported', 'Word rows with omitted leading/trailing grid cells have no faithful portable grid-offset model; conditional appearance was not guessed for this row.');
    const rowRegions = new Set<string>();
    let sourceColumn = 0;
    for (const sourceCell of elements(row, 'tc')) {
      const span = sourceSpan(sourceCell);
      if (!offsets) for (const name of regional?.(rowIndex, sourceRows.length, sourceColumn, span, conditionalWidth) ?? []) rowRegions.add(name);
      sourceColumn += span;
    }
    // Word's conditional tcMar applies to an entire row even for a corner or
    // column condition. Keep those margins separate from cell-local borders/fill.
    const rowMargins = WORD_TABLE_REGIONS.filter(name => rowRegions.has(name)).map(name => {
      const cell = inherited?.regions.get(name);
      const margin = wordStyleChild(cell, 'tcMar');
      return margin && cell ? { ...cell, children: [margin] } : undefined;
    });
    if (wordStyleChild(exceptions, 'tblW')) issues.push({ code: 'table-row-width-exception-not-imported', severity: 'warning', message: 'Row-specific preferred table widths cannot be represented by one whole-table preference.', path: [...path, rowIndex] });
    if (['tblBorders', 'tblCellMar', 'tblCellSpacing'].some(name => wordStyleChild(exceptions, name))) issues.push({
      code: 'table-row-appearance-exception-not-imported', severity: 'warning',
      message: 'Word row-level border, margin or spacing exceptions are not represented by the direct table/cell appearance profile.', path: [...path, rowIndex],
    });
    const exceptionLayout = attr(child(child(row, 'tblPrEx'), 'tblLayout'), 'type');
    if (exceptionLayout !== undefined) issues.push({ code: 'table-row-layout-exception-not-imported', severity: 'warning', message: 'A Word row-level table layout exception cannot be represented by one whole-table layout mode.', path: [...path, rowIndex] });
    const cells: MutableCell[] = [];
    let column = 0;
    const header = wordStyleChild(wordStyleChild(row, 'trPr'), 'tblHeader');
    const headerValue = header && wordPageAttribute(header, 'val');
    const rowHeader = Boolean(header) && (headerValue === undefined || ['1', 'true', 'on'].includes(headerValue));
    repetition.push(rowHeader);
    if (rowHeader && !leadingRepeat) issues.push({ code: 'nonleading-table-repeat', severity: 'warning',
      message: 'The repeat flag is retained, but Word ignores it after a non-repeating row.', path: [...path, rowIndex] });
    if (!rowHeader) leadingRepeat = false;
    if (rowHeader && !schema.nodes.table_row?.spec.attrs?.repeatHeader) issues.push({ code: 'table-row-repeat-not-imported', severity: 'warning',
      message: 'The receiving row schema cannot retain repeat-on-page intent; cell content and appearance remain.', path: [...path, rowIndex] });
    if (headerValue !== undefined && !['0', 'false', 'off', '1', 'true', 'on'].includes(headerValue)) issues.push({
      code: 'invalid-table-header', severity: 'warning',
      message: 'The Word repeated-header flag is invalid; the row remains ordinary editable cells.', path: [...path, rowIndex],
    });
    for (const [cellIndex, cell] of elements(row, 'tc').entries()) {
      while (active.has(column) && !elements(cell, 'tcPr').length) column += 1;
      const directCellProperties = wordStyleChild(cell, 'tcPr');
      const names = offsets ? [] : regional?.(rowIndex, sourceRows.length, column, sourceSpan(cell), conditionalWidth) ?? [];
      const regionalCell = mergeWordTableProperties('tcPr', names.map(name => {
        const properties = inherited?.regions.get(name);
        return properties && { ...properties, children: elements(properties).filter(item => expandedName(item) !== `${WORD_NS}|tcMar`) };
      }));
      const inheritedCell = mergeWordTableProperties('tcPr', [inherited?.cell, regionalCell, ...rowMargins]);
      const properties = inheritedCell ? mergeWordTableProperties('tcPr', [inheritedCell, directCellProperties]) : directCellProperties;
      const cellAppearance = readWordTableAppearance(properties, true, (code, message) => issues.push({ code, severity: 'warning', message, path: [...path, rowIndex, cellIndex] }));
      const colspan = Math.max(1, Number(attr(child(properties, 'gridSpan'), 'val') ?? 1) || 1);
      const merge = child(properties, 'vMerge');
      const mergeValue = attr(merge, 'val');
      const continuation = Boolean(merge) && mergeValue !== 'restart';
      const shading = wordStyleChild(directCellProperties, 'shd') ?? wordStyleChild(exceptions, 'shd') ?? wordStyleChild(directProperties, 'shd')
        ?? wordStyleChild(inheritedCell, 'shd') ?? wordStyleChild(inherited?.table, 'shd');
      const background = tableShading(shading, issues, [...path, rowIndex, cellIndex]);
      if (continuation) {
        const origin = active.get(column);
        if (origin) {
          origin.rowspan += 1;
          if (Object.keys(cellAppearance).length > 1 && JSON.stringify(cellAppearance) !== JSON.stringify(origin.appearance)) issues.push({
            code: 'table-merged-continuation-appearance-not-imported', severity: 'warning',
            message: 'Distinct border or margin declarations on a merged continuation cannot be represented independently by the whole logical cell; the origin appearance remains.', path: [...path, rowIndex, cellIndex],
          });
          if (background !== origin.background) issues.push({ code: 'table-merged-continuation-shading-not-imported', severity: 'warning',
            message: 'Distinct shading on a merged continuation cannot be represented independently by one logical cell; the origin fill remains.', path: [...path, rowIndex, cellIndex] });
        }
        else issues.push({ code: 'orphan-table-vmerge', severity: 'warning', message: 'An orphaned vertical table merge was ignored.', path: [...path, rowIndex, cellIndex] });
        column += colspan;
        continue;
      }
      // Native repetition says nothing about semantic HTML cell roles. Only a
      // strict, behavior-free Fountain control carries an independent scope.
      const visible = elements(cell).filter(item => expandedName(item) !== `${WORD_NS}|tcPr`);
      const control = visible.length === 1 ? structuralControl(visible[0]!) : undefined;
      const scope = control && ['col', 'row', 'colgroup', 'rowgroup'].find(value => control.tag === `${TABLE_HEADER_TAG}${value}:v1`);
      const cellPath = [...path, rowIndex, cellIndex];
      const regionText = names.map(name => readWordTableText(inherited?.regionalText.get(name), (code, message) => issues.push({ code, severity: 'warning', message, path: cellPath })));
      const tableText = { runs: [...baseText.runs, ...regionText.flatMap(text => text.runs)], paragraphs: [...baseText.paragraphs, ...regionText.flatMap(text => text.paragraphs)] };
      // Replace, never inherit, the containing table context: nested tables own
      // their own table styles, and body/footnote stories keep their own context.
      const paragraphs = parseBlocks(scope ? control!.content : cell, schema, { ...media, tableText }, numbering, issues, cellPath);
      const content = paragraphs.length ? paragraphs : [schema.node('paragraph')];
      const colwidth = readCellWidths(properties, grid, column, colspan, issues, [...path, rowIndex, cellIndex]);
      const cellType = scope && schema.nodes.table_header ? schema.nodes.table_header : schema.nodes.table_cell;
      if (scope && !schema.nodes.table_header) issues.push({ code: 'table-header-role-not-imported', severity: 'warning',
        message: 'The receiving schema has no semantic header cell; visible content was retained as ordinary cells.', path: [...path, rowIndex, cellIndex] });
      if (Object.keys(cellAppearance).length > 1 && !cellType?.spec.attrs?.appearance) issues.push({ code: 'table-cell-appearance-not-imported', severity: 'warning', message: 'The receiving cell schema cannot represent direct border and margin declarations.', path: [...path, rowIndex, cellIndex] });
      const mutable: MutableCell = { content, colspan, rowspan: 1, scope, continuation: false, background, colwidth,
        ...(cellType?.spec.attrs?.appearance && Object.keys(cellAppearance).length > 1 ? { appearance: cellAppearance } : {}) };
      cells.push(mutable);
      if (mergeValue === 'restart') for (let offset = 0; offset < colspan; offset += 1) active.set(column + offset, mutable);
      else for (let offset = 0; offset < colspan; offset += 1) active.delete(column + offset);
      column += colspan;
    }
    rows.push(cells);
  }
  const rowNodes = rows.map((row, index) => schema.node('table_row', schema.nodes.table_row?.spec.attrs?.repeatHeader ? { repeatHeader: repetition[index] } : {}, row.map((cell) => schema.node(
    cell.scope && schema.nodes.table_header ? 'table_header' : 'table_cell',
    cell.scope && schema.nodes.table_header
      ? { colspan: cell.colspan, rowspan: cell.rowspan, colwidth: cell.colwidth, background: cell.background, appearance: cell.appearance, scope: cell.scope }
      : { colspan: cell.colspan, rowspan: cell.rowspan, colwidth: cell.colwidth, background: cell.background, appearance: cell.appearance },
    cell.content,
  ))));
  const layout = tableLayout === 'fixed' ? 'fixed' : tableLayout === 'autofit' ? 'auto' : undefined;
  if (layout === 'fixed' && rowNodes.length) {
    const table = schema.node('table', {}, rowNodes);
    const map = TableMap.create(table);
    if (Array.from({ length: map.width }, (_, column) => map.columnWidth(column)).some(width => width === null)) issues.push({ code: 'fixed-table-grid-incomplete', severity: 'warning', message: 'The fixed Word table has no complete supported column grid; its layout mode is retained, but exact column geometry is unavailable.', path });
  }
  if (layout && !schema.nodes.table?.spec.attrs?.layout) issues.push({ code: 'table-layout-not-imported', severity: 'warning', message: 'The host table schema cannot represent fixed/automatic layout; the grid remains.', path });
  if (!schema.nodes.table?.spec.attrs?.appearance) warnAppearance('table-appearance-not-imported', 'The receiving table schema cannot distinguish source appearance from application defaults.');
  if (preferredWidth && !schema.nodes.table?.spec.attrs?.preferredWidth) warnAppearance('table-preferred-width-not-imported', 'The receiving table schema cannot represent the preferred width; cell grid and content remain.');
  return schema.node('table', { layout, ...(schema.nodes.table?.spec.attrs?.preferredWidth ? { preferredWidth } : {}), ...(schema.nodes.table?.spec.attrs?.appearance ? { appearance } : {}) }, rowNodes.length ? rowNodes : [schema.node('table_row', {}, [schema.node('table_cell', {}, [schema.node('paragraph')])])]);
}

function relationshipMap(root: XMLElement | undefined): ReadonlyMap<string, ImportedRelationship> {
  const map = new Map<string, ImportedRelationship>();
  if (!root) return map;
  for (const relationship of descendants(root, 'Relationship')) {
    const id = attr(relationship, 'Id');
    const target = attr(relationship, 'Target');
    const type = attr(relationship, 'Type') ?? '';
    const kind = /\/hyperlink$/i.test(type) ? 'hyperlink' : /\/image$/i.test(type) ? 'image' : undefined;
    if (id && target && kind) map.set(id, { target, type: kind, external: attr(relationship, 'TargetMode') === 'External' });
  }
  return map;
}

function requiredLimits(options: DOCXLimits): Required<DOCXLimits> {
  const value: Required<DOCXLimits> = {
    maxArchiveBytes: options.maxArchiveBytes ?? DEFAULT_LIMITS.maxArchiveBytes,
    maxArchiveEntries: options.maxArchiveEntries ?? DEFAULT_LIMITS.maxArchiveEntries,
    maxExpandedBytes: options.maxExpandedBytes ?? DEFAULT_LIMITS.maxExpandedBytes,
    maxDocumentXmlBytes: options.maxDocumentXmlBytes ?? DEFAULT_LIMITS.maxDocumentXmlBytes,
    maxMediaBytes: options.maxMediaBytes ?? DEFAULT_LIMITS.maxMediaBytes,
    maxMediaFiles: options.maxMediaFiles ?? DEFAULT_LIMITS.maxMediaFiles,
    maxXmlNodes: options.maxXmlNodes ?? DEFAULT_LIMITS.maxXmlNodes,
    maxXmlDepth: options.maxXmlDepth ?? DEFAULT_LIMITS.maxXmlDepth,
  };
  for (const [name, limit] of Object.entries(value)) if (!Number.isSafeInteger(limit) || limit <= 0) throw new RangeError(`${name} must be a positive safe integer.`);
  return value;
}

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function wordNoteId(value: string | undefined): string | undefined {
  if (!value || !/^\d{1,10}$/.test(value) || Number(value) > 2147483647) return undefined;
  return String(Number(value));
}
const MATH_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const MATH_SOURCE_NS = 'urn:fountainjs:docx:math:v2';
const MATH_SOURCE_PART = 'customXml/fountainMath.xml';
interface MathSourceRecord {
  readonly id: string;
  readonly path: readonly number[];
  readonly source: string;
  readonly ariaLabel: string;
  readonly kind: 'inline_math' | 'math_block';
  readonly omml: string;
}

function expandedName(element: XMLElement, name = element.name, attribute = false): string {
  const separator = name.indexOf(':');
  const prefix = separator < 0 ? '' : name.slice(0, separator);
  const namespace = attribute && separator < 0 ? '' : element.namespaces[prefix];
  if (separator >= 0 && !namespace) throw new Error('Unbound XML namespace.');
  return `${namespace ?? ''}|${localName(name)}`;
}

function namespacedAttr(element: XMLElement, name: string): string | undefined {
  const matches = Object.entries(element.attrs).filter(([key]) => !key.startsWith('xmlns') && expandedName(element, key, true) === `${WORD_NS}|${name}`);
  if (matches.length > 1) throw new Error('Duplicate expanded bookmark attribute.');
  return matches[0]?.[1];
}

/** Compare complete expanded-name trees, not flattened mathematical text.
 * Prefix spelling, attribute order and indentation outside math tokens may
 * change; all properties and token content must otherwise remain identical.
 */
function mathTreeKey(element: XMLElement): string {
  const tree = (node: XMLElement): unknown => {
    const name = expandedName(node);
    const attrs = Object.entries(node.attrs).filter(([key]) => key !== 'xmlns' && !key.startsWith('xmlns:'))
      .map(([key, value]) => [expandedName(node, key, true), value]).sort(([a], [b]) => a!.localeCompare(b!));
    if (new Set(attrs.map(([key]) => key)).size !== attrs.length) throw new Error('Duplicate expanded XML attribute.');
    const content = name === `${MATH_NS}|t` && node.children.every(item => typeof item === 'string')
      ? [node.children.join('')]
      : node.children.filter(item => typeof item !== 'string' || item.trim()).map(item => typeof item === 'string' ? item : tree(item));
    return [name, attrs, content];
  };
  return JSON.stringify(tree(element));
}

function restoreMathSources(document: XMLElement, metadata: XMLElement | undefined, relationships: XMLElement | undefined,
  schema: Schema, limits: Required<DOCXLimits>, issues: DOCXIssue[]): ReadonlyMap<XMLElement, FountainNode> {
  const restored = new Map<XMLElement, FountainNode>();
  if (!metadata) return restored;
  try {
    const relationship = (relationships ? descendants(relationships, 'Relationship') : []).filter(item =>
      expandedName(item) === 'http://schemas.openxmlformats.org/package/2006/relationships|Relationship'
      && item.attrs.Type === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml'
      && item.attrs.Target === '../customXml/fountainMath.xml'
      && (!item.attrs.TargetMode || item.attrs.TargetMode === 'Internal'));
    if (relationship.length !== 1) throw new Error('Missing or ambiguous internal math-source relationship.');
    const envelope = elements(metadata);
    if (envelope.length !== 1 || expandedName(envelope[0]!) !== `${MATH_SOURCE_NS}|mathSources`
      || envelope[0]!.children.some(item => typeof item !== 'string')) throw new Error('Unsupported math-source metadata envelope/version.');
    const records: unknown = JSON.parse(textContent(envelope[0]!));
    if (!Array.isArray(records) || records.length > 128) throw new Error('Math-source metadata exceeds 128 records.');
    const ids = new Set<string>();
    let total = 0;
    for (const value of records) {
      if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).sort().join(',') !== 'ariaLabel,id,kind,omml,path,source'
        || typeof value.id !== 'string' || !/^FountainMath_[1-9][0-9]{0,2}$/.test(value.id) || ids.has(value.id)
        || !['inline_math', 'math_block'].includes(value.kind)
        || typeof value.source !== 'string' || value.source.length > 100_000
        || typeof value.ariaLabel !== 'string' || value.ariaLabel.length > 1_000
        || typeof value.omml !== 'string'
        || !Array.isArray(value.path) || !value.path.length || value.path.length > 128
        || !value.path.every((index: unknown) => Number.isSafeInteger(index) && Number(index) >= 0)) throw new Error('Invalid or duplicate math-source record.');
      ids.add(value.id);
      total += value.source.length + value.omml.length + value.ariaLabel.length;
      if (total > 1_000_000) throw new Error('Math-source records exceed the total character limit.');
    }
    const starts = descendants(document, 'bookmarkStart').filter(item => expandedName(item) === `${WORD_NS}|bookmarkStart`);
    const ends = descendants(document, 'bookmarkEnd').filter(item => expandedName(item) === `${WORD_NS}|bookmarkEnd`);
    const startsByName = new Map<string, XMLElement[]>();
    const startCounts = new Map<string, number>();
    const endCounts = new Map<string, number>();
    for (const start of starts) {
      const name = namespacedAttr(start, 'name') ?? '';
      const id = namespacedAttr(start, 'id') ?? '';
      const named = startsByName.get(name);
      if (named) named.push(start);
      else startsByName.set(name, [start]);
      startCounts.set(id, (startCounts.get(id) ?? 0) + 1);
    }
    for (const end of ends) {
      const id = namespacedAttr(end, 'id') ?? '';
      endCounts.set(id, (endCounts.get(id) ?? 0) + 1);
    }
    const siblings = new Map<XMLElement, readonly XMLChild[]>();
    const collect = (node: XMLElement) => {
      const content = node.children.filter(item => typeof item !== 'string' || item.trim());
      for (const item of elements(node)) {
        if (localName(item.name) === 'bookmarkStart' && ids.has(namespacedAttr(item, 'name') ?? '')) siblings.set(item, content);
        collect(item);
      }
    };
    collect(document);
    for (const record of records as MathSourceRecord[]) {
      try {
        const candidates = startsByName.get(record.id) ?? [];
        if (candidates.length !== 1) throw new Error('Equation bookmark is missing or duplicated.');
        const start = candidates[0]!;
        const id = namespacedAttr(start, 'id');
        if (!id || startCounts.get(id) !== 1 || endCounts.get(id) !== 1) throw new Error('Equation bookmark IDs are ambiguous.');
        const content = siblings.get(start)!;
        const index = content.indexOf(start);
        const math = content[index + 1]; const end = content[index + 2];
        const kind = record.kind === 'math_block' ? 'oMathPara' : 'oMath';
        if (!math || typeof math === 'string' || expandedName(math) !== `${MATH_NS}|${kind}`
          || !end || typeof end === 'string' || expandedName(end) !== `${WORD_NS}|bookmarkEnd`
          || namespacedAttr(end, 'id') !== id) throw new Error('Equation bookmark no longer encloses exactly its projection.');
        const saved = elements(parseXML(record.omml, limits));
        if (saved.length !== 1 || mathTreeKey(math) !== mathTreeKey(saved[0]!)) throw new Error('Equation OMML changed; retained TeX was not restored.');
        const type = schema.nodes[record.kind];
        if (!type || type.isInline !== (record.kind === 'inline_math')) throw new Error('The active schema has no compatible math node.');
        const expression = parseDOCXMath(math);
        const node = type.create({ latex: record.source, ariaLabel: record.ariaLabel, expression });
        schema.validate(node);
        restored.set(math, node);
      } catch (error) {
        issues.push({ code: 'math-source-not-restored', severity: 'warning', message: error instanceof Error ? error.message : String(error), path: record.path });
      }
    }
  } catch (error) {
    restored.clear();
    issues.push({ code: 'invalid-math-source-metadata', severity: 'warning', message: error instanceof Error ? error.message : String(error) });
  }
  return restored;
}

export function importDOCX(input: Uint8Array | ArrayBuffer, schema: Schema, options: DOCXImportOptions = {}): DOCXImportResult {
  const limits = requiredLimits(options);
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > limits.maxArchiveBytes) throw new RangeError(`DOCX archive exceeds ${limits.maxArchiveBytes} bytes.`);
  let expanded = 0;
  let mediaBytes = 0;
  let mediaFiles = 0;
  const wanted = new Set(['word/document.xml', 'word/numbering.xml', 'word/_rels/document.xml.rels']);
  const selectedParts = new Set<string>();
  const entries: Array<readonly [string, number]> = [];
  const entryPaths = new Set<string>();
  if (options.restoreMathSource === true) wanted.add(MATH_SOURCE_PART);
  const archive = unzipSync(bytes, { filter: (file) => {
    if (entries.length >= limits.maxArchiveEntries) throw new RangeError(`DOCX contains more than ${limits.maxArchiveEntries} archive entries.`);
    entries.push([file.name, file.originalSize]);
    entryPaths.add(file.name);
    const isMedia = /^word\/media\/[^/]+$/i.test(file.name);
    if (!wanted.has(file.name) && !isMedia) return false;
    if (selectedParts.has(file.name)) throw new Error('DOCX contains duplicate selected ZIP parts.');
    selectedParts.add(file.name);
    if (file.name === MATH_SOURCE_PART && file.originalSize > 8_000_000) throw new RangeError('DOCX math-source metadata exceeds its expanded byte limit.');
    if (isMedia) {
      mediaFiles += 1;
      mediaBytes += file.originalSize;
      if (mediaFiles > limits.maxMediaFiles) throw new RangeError(`DOCX contains more than ${limits.maxMediaFiles} selected media files.`);
      if (mediaBytes > limits.maxMediaBytes) throw new RangeError(`DOCX media exceeds ${limits.maxMediaBytes} expanded bytes.`);
    }
    expanded += file.originalSize;
    if (file.name === 'word/document.xml' && file.originalSize > limits.maxDocumentXmlBytes) throw new RangeError(`DOCX document.xml exceeds ${limits.maxDocumentXmlBytes} bytes.`);
    if (expanded > limits.maxExpandedBytes) throw new RangeError(`DOCX selected content exceeds ${limits.maxExpandedBytes} expanded bytes.`);
    return true;
  } });
  const documentBytes = archive['word/document.xml'];
  if (!documentBytes) throw new Error('Invalid DOCX: word/document.xml is missing.');
  const parse = (name: string) => archive[name] ? parseXML(strFromU8(archive[name]!), limits) : undefined;
  const readExtraParts = (paths: readonly string[]) => {
    const pending = new Set(paths.filter(path => !selectedParts.has(path)));
    if (!pending.size) return;
    Object.assign(archive, unzipSync(bytes, { filter: file => {
      if (!pending.has(file.name)) return false;
      if (selectedParts.has(file.name)) throw new Error('DOCX contains duplicate selected ZIP parts.');
      selectedParts.add(file.name);
      expanded += file.originalSize;
      if (file.originalSize > limits.maxDocumentXmlBytes || expanded > limits.maxExpandedBytes) throw new RangeError('DOCX story content exceeds the XML or selected expanded byte limit.');
      return true;
    } }));
  };
  const documentXML = parseXML(strFromU8(documentBytes), limits);
  const numbering = readNumbering(parse('word/numbering.xml'));
  const relationshipXML = parse('word/_rels/document.xml.rels');
  const relationships = relationshipMap(relationshipXML);
  const body = descendants(documentXML, 'body')[0];
  if (!body) throw new Error('Invalid DOCX: document body is missing.');
  const issues: DOCXIssue[] = [];
  // Theme/settings are relationship-owned package parts, not trusted filenames
  // or network locations. Read them through the same expansion/XML limits.
  const definitionPart = (kind: 'theme' | 'settings' | 'styles'): { xml?: XMLElement; unavailable?: boolean } => {
    const matches = (relationshipXML ? descendants(relationshipXML, 'Relationship') : []).filter(item =>
      expandedName(item) === `${REL_NS}|Relationship` && item.attrs.Type === `${OFFICE_REL_NS}/${kind}`);
    if (matches.length > 1) throw new Error(`DOCX has ambiguous ${kind} relationships.`);
    const relationship = matches[0];
    if (!relationship) return {};
    if (relationship.attrs.TargetMode && relationship.attrs.TargetMode !== 'Internal') {
      issues.push({ code: `external-${kind}-not-imported`, severity: 'warning', message: `External ${kind} data was not fetched; inherited formatting may be unavailable.`, sourcePart: 'word/_rels/document.xml.rels' });
      return { unavailable: true };
    }
    const target = packagePartPath('word/document.xml', relationship.attrs.Target ?? '');
    if (!target || !entryPaths.has(target)) throw new Error(`DOCX ${kind} relationship has a missing or invalid target.`);
    readExtraParts([target]);
    const xml = parse(target);
    if (kind === 'settings' && (!xml || elements(xml).length !== 1 || expandedName(elements(xml)[0]!) !== `${WORD_NS}|settings`)) throw new Error('Invalid DOCX theme settings root.');
    return { xml };
  };
  const theme = definitionPart('theme');
  const themeSettings = theme.xml ? definitionPart('settings') : {};
  const themeFonts = theme.xml && !themeSettings.unavailable ? readWordThemeFonts(theme.xml, themeSettings.xml) : undefined;
  const stylePart = definitionPart('styles');
  const styles = stylePart.xml ? readWordStyleSheet(stylePart.xml) : undefined;
  let footnotePart: string | undefined;
  let footnoteRels: XMLElement | undefined;
  let footnotes: Map<string, XMLElement> | undefined;
  if (schema.nodes.footnote_reference && schema.nodes.footnote_definition) {
    const noteRelationships = (relationshipXML ? descendants(relationshipXML, 'Relationship') : []).filter(item =>
      expandedName(item) === `${REL_NS}|Relationship` && item.attrs.Type === `${OFFICE_REL_NS}/footnotes`);
    if (noteRelationships.length > 1) throw new Error('DOCX has ambiguous footnotes relationships.');
    const relationship = noteRelationships[0];
    if (relationship && attr(relationship, 'TargetMode') !== 'External') {
      const target = packagePartPath('word/document.xml', attr(relationship, 'Target') ?? '');
      if (!target || !entryPaths.has(target) || selectedParts.has(target)) throw new Error('DOCX footnotes relationship has a missing or invalid target.');
      footnotePart = target;
      const split = target.lastIndexOf('/');
      const relPart = `${target.slice(0, split + 1)}_rels/${target.slice(split + 1)}.rels`;
      readExtraParts([target, relPart, 'word/settings.xml']);
      const root = parse(target);
      const container = root && elements(root).find(item => expandedName(item) === `${WORD_NS}|footnotes`);
      if (!container) throw new Error('Invalid DOCX footnotes root.');
      footnotes = new Map();
      for (const note of elements(container)) {
        if (expandedName(note) !== `${WORD_NS}|footnote`) throw new Error('Invalid DOCX footnote element.');
        let kind = attr(note, 'type');
        if (!kind) {
          const implicit = attr(note, 'id') === '-1' ? 'separator' : attr(note, 'id') === '0' ? 'continuationSeparator' : undefined;
          if (implicit && descendants(note, implicit).some(item => expandedName(item) === `${WORD_NS}|${implicit}`)) {
            kind = implicit;
            if (!issues.some(issue => issue.code === 'footnote-separator-type-inferred' && issue.sourcePart === target)) issues.push({ code: 'footnote-separator-type-inferred', severity: 'warning', message: 'A reserved separator entry omitted its note type. Its native separator marker was recognized; export writes an explicit type.', sourcePart: target });
          }
        }
        if (kind && kind !== 'normal') {
          if (textContent(note).trim() || descendants(note, 'drawing').length) issues.push({ code: 'footnote-separator-not-preserved', severity: 'warning', message: 'Custom footnote separator content was not imported.', sourcePart: target });
          continue;
        }
        const id = wordNoteId(attr(note, 'id'));
        if (id === undefined || footnotes.has(id)) throw new Error('DOCX contains invalid or duplicate footnote IDs.');
        footnotes.set(id, note);
      }
      footnoteRels = parse(relPart);
      for (const [part, xml] of [['word/document.xml', documentXML], ['word/settings.xml', parse('word/settings.xml')]] as const) {
        for (const props of xml ? descendants(xml, 'footnotePr') : []) {
          if (elements(props).some(item => ({ numFmt: 'decimal', numStart: '1', numRestart: 'continuous', pos: 'pageBottom' } as Record<string, string>)[localName(item.name)] !== undefined
            && attr(item, 'val') !== ({ numFmt: 'decimal', numStart: '1', numRestart: 'continuous', pos: 'pageBottom' } as Record<string, string>)[localName(item.name)])) {
            issues.push({ code: 'footnote-numbering-normalized', severity: 'warning', message: 'Custom footnote numbering/restart/placement is not retained; Fountain uses continuous decimal numbering in reference order.', sourcePart: part });
          }
        }
      }
    }
  }
  let restoredMath: ReadonlyMap<XMLElement, FountainNode> = new Map();
  if (options.restoreMathSource === true) {
    try { restoredMath = restoreMathSources(documentXML, parse(MATH_SOURCE_PART), relationshipXML, schema, limits, issues); }
    catch (error) { issues.push({ code: 'invalid-math-source-metadata', severity: 'warning', message: error instanceof Error ? error.message : String(error) }); }
  }
  const importedParts = new Set<string>();
  const media: ImportMediaContext = { archive, relationships, options, restoredMath, importedParts, footnotes, themeFonts, styles };
  const blocks = parseBlocks(body, schema, media, numbering, issues, []);
  const importedStories = new Set<string>();
  const sections = descendants(body, 'sectPr').filter(item => expandedName(item) === `${WORD_NS}|sectPr`);
  const pageSettings = sections.length === 1 ? readWordPageSettings(sections[0]!, issues) : undefined;
  if (pageSettings) {
    readExtraParts(['word/settings.xml']);
    const settings = child(parse('word/settings.xml'), 'settings');
    const unsupported = settings ? elements(settings).filter(item => ['mirrorMargins', 'gutterAtTop', 'bookFoldPrinting', 'bookFoldRevPrinting', 'printTwoOnOne'].includes(localName(item.name)) && !['0', 'false', 'off'].includes(attr(item, 'val') ?? 'true')) : [];
    if (unsupported.length) issues.push({ code: 'document-layout-mode-not-imported', severity: 'warning', message: `Physical dimensions are retained, but ${unsupported.map(item => localName(item.name)).join(', ')} layout behaviour is not represented.`, sourcePart: 'word/settings.xml' });
  }
  if (sections.length > 1) issues.push({ code: 'section-page-settings-not-imported', severity: 'warning', message: 'Multiple sections need section-scoped page settings. Their geometry was not flattened into one global page size or margin set.', sourcePart: 'word/document.xml' });
  if (schema.nodes.page_header || schema.nodes.page_footer) {
    if (sections.length > 1) issues.push({ code: 'section-templates-not-imported', severity: 'warning', message: 'Multiple Word sections require section-scoped templates. Their headers/footers were not flattened into one global template set; retain the original.', sourcePart: 'word/document.xml' });
    else if (sections.length === 1) {
      const section = sections[0]!;
      readExtraParts(['word/settings.xml']);
      const settings = parse('word/settings.xml');
      const on = (item?: XMLElement) => Boolean(item) && !['0', 'false', 'off'].includes(attr(item, 'val') ?? '');
      const firstEnabled = on(child(section, 'titlePg'));
      const evenEnabled = on(settings && descendants(settings, 'evenAndOddHeaders')[0]);
      for (const kind of ['header', 'footer'] as const) {
        if (!schema.nodes[`page_${kind}`]) continue;
        const references = elements(section).filter(item => expandedName(item) === `${WORD_NS}|${kind}Reference`);
        const variants = new Set<string>();
        for (const reference of references) {
          const variant = attr(reference, 'type');
          if (!variant || !['default', 'first', 'even'].includes(variant) || variants.has(variant)) throw new Error('DOCX has invalid or duplicate header/footer variants.');
          variants.add(variant);
          if ((variant === 'first' && !firstEnabled) || (variant === 'even' && !evenEnabled)) {
            issues.push({ code: 'inactive-page-template-not-imported', severity: 'warning', message: 'An inactive first/even template remains in the original package; it was not activated by import.', sourcePart: 'word/document.xml' });
            continue;
          }
          const ids = Object.entries(reference.attrs).filter(([key]) => !key.startsWith('xmlns') && expandedName(reference, key, true) === `${OFFICE_REL_NS}|id`);
          const matches = (relationshipXML ? descendants(relationshipXML, 'Relationship') : []).filter(item => expandedName(item) === `${REL_NS}|Relationship` && item.attrs.Id === ids[0]?.[1]);
          if (ids.length !== 1 || matches.length !== 1 || matches[0]!.attrs.Type !== `${OFFICE_REL_NS}/${kind}`) throw new Error('DOCX header/footer reference has a missing or invalid relationship.');
          const relationship = matches[0]!;
          if (relationship.attrs.TargetMode === 'External') {
            issues.push({ code: 'external-page-template-not-imported', severity: 'warning', message: 'External header/footer content was not fetched.', sourcePart: 'word/_rels/document.xml.rels' });
            continue;
          }
          const target = packagePartPath('word/document.xml', relationship.attrs.Target ?? '');
          if (!target || !entryPaths.has(target) || (selectedParts.has(target) && !importedStories.has(target))) throw new Error('DOCX header/footer relationship has a missing or invalid target.');
          const split = target.lastIndexOf('/');
          const relPart = `${target.slice(0, split + 1)}_rels/${target.slice(split + 1)}.rels`;
          readExtraParts([target, relPart]);
          const root = parse(target);
          const story = root && elements(root).find(item => expandedName(item) === `${WORD_NS}|${kind === 'header' ? 'hdr' : 'ftr'}`);
          if (!story) throw new Error('Invalid DOCX header/footer root.');
          const start = issues.length;
          const content = parseBlocks(story, schema, { ...media, pageTemplate: true, sourcePart: target, relationships: relationshipMap(parse(relPart)), restoredMath: new Map() }, numbering, issues, [blocks.length]);
          for (let index = start; index < issues.length; index++) issues[index] = { ...issues[index]!, sourcePart: target };
          blocks.push(schema.node(`page_${kind}`, { variant }, content.length ? content : [schema.node('paragraph')]));
          importedStories.add(target);
        }
        // Word's first section uses a blank page variant when the switch is on
        // but its reference is absent, not the default template fallback.
        for (const [variant, enabled] of [['first', firstEnabled], ['even', evenEnabled]] as const) {
          if (enabled && !variants.has(variant)) blocks.push(schema.node(`page_${kind}`, { variant }, [schema.node('paragraph')]));
        }
      }
    }
  }
  if (footnotes && footnotePart) {
    const referencedIds = new Set<string>();
    for (const block of blocks) block.descendants(node => { if (node.type.name === 'footnote_reference') referencedIds.add(String(node.attrs.id)); });
    const noteMedia = { ...media, sourcePart: footnotePart, relationships: relationshipMap(footnoteRels), restoredMath: new Map<XMLElement, FountainNode>() };
    for (const [id, note] of footnotes) {
      if (!referencedIds.has(id)) issues.push({ code: 'unreferenced-footnote-definition', severity: 'warning', message: 'A note without a body reference was retained as an editable definition. Reconnect or remove it before native DOCX export.', sourcePart: footnotePart, path: [blocks.length] });
      const issueStart = issues.length;
      const content = parseBlocks(note, schema, noteMedia, numbering, issues, [blocks.length]);
      for (let index = issueStart; index < issues.length; index++) issues[index] = { ...issues[index]!, sourcePart: footnotePart };
      blocks.push(schema.node('footnote_definition', { id }, content.length ? content : [schema.node('paragraph')]));
    }
  }
  // Diagnose omitted story parts without expanding or interpreting their contents.
  // Relationship types identify arbitrary producer-chosen names; conventional
  // names also expose orphaned parts. Never fetch external relationships.
  const omittedStories = new Set<string>();
  for (const relationship of relationshipXML ? descendants(relationshipXML, 'Relationship') : []) {
    if (expandedName(relationship) !== 'http://schemas.openxmlformats.org/package/2006/relationships|Relationship') continue;
    const kind = (attr(relationship, 'Type') ?? '').match(/\/relationships\/(header|footer|footnotes|endnotes|comments)$/)?.[1];
    if (!kind) continue;
    const target = attr(relationship, 'Target') ?? '';
    if (kind === 'footnotes' && footnotes && packagePartPath('word/document.xml', target) === footnotePart) continue;
    if ((kind === 'header' || kind === 'footer') && importedStories.has(packagePartPath('word/document.xml', target) ?? '')) continue;
    // Report the source relationship rather than trusting its target as a path.
    issues.push({ code: `unrepresented-${kind}-relationship`, severity: 'warning', message: `The document references ${kind} content which this importer does not represent. Keep the original DOCX; no external content was fetched.`, sourcePart: 'word/_rels/document.xml.rels' });
    if (attr(relationship, 'TargetMode') !== 'External') {
      const parts: string[] = target.startsWith('/') ? [] : ['word'];
      for (const segment of target.replace(/\\/g, '/').split('/')) {
        if (segment === '..') parts.pop();
        else if (segment && segment !== '.') parts.push(segment);
      }
      const part = parts.join('/');
      if (entryPaths.has(part)) omittedStories.add(part);
    }
  }
  for (const part of entryPaths) {
    if (part !== footnotePart && !importedStories.has(part) && /^word\/(?:header[^/]*|footer[^/]*|footnotes|endnotes|comments)\.xml$/i.test(part)) omittedStories.add(part);
  }
  for (const part of omittedStories) issues.push({ code: 'unrepresented-story-part', severity: 'warning', message: 'This packaged header, footer, note or comment part was not imported. Its text, assets, references and behaviour remain only in the original file.', sourcePart: part });
  const packageParts = Object.freeze(entries.map(([path, declaredBytes]): DOCXPackagePart => {
    const isMedia = /^word\/media\/[^/]+$/i.test(path);
    const handling = importedParts.has(path) ? 'imported-image' : isMedia ? 'unrepresented-media' : selectedParts.has(path) ? 'adapter-input' : 'not-interpreted';
    if (handling === 'unrepresented-media') issues.push({ code: 'unrepresented-media-part', severity: 'warning', message: 'This packaged media file has no imported image node. It may belong to omitted content, be unsupported or be unused; it is not available in the converted document.', sourcePart: path });
    return Object.freeze({ path, declaredBytes, handling });
  }));
  const fallback = schema.nodes.paragraph ? schema.node('paragraph') : undefined;
  const document = schema.node('doc', pageSettings ? { pageSettings } : {}, blocks.length ? blocks : fallback ? [fallback] : []);
  schema.validate(document);
  return Object.freeze({ document, report: report(issues), packageParts });
}

const PAGE_SIZE_KEYS = { width: 'w', height: 'h' } as const;
const PAGE_MARGIN_KEYS = { marginTop: 'top', marginRight: 'right', marginBottom: 'bottom', marginLeft: 'left', headerDistance: 'header', footerDistance: 'footer', gutter: 'gutter' } as const;

function wordPageAttribute(element: XMLElement, local: string): string | undefined {
  const matches = Object.entries(element.attrs).filter(([name]) => name !== 'xmlns' && !name.startsWith('xmlns:') && localName(name) === local && expandedName(element, name, true) === `${WORD_NS}|${local}`);
  if (matches.length > 1) throw new Error(`Ambiguous Word page attribute ${local}.`);
  return matches[0]?.[1];
}

function readWordPageSettings(section: XMLElement, issues: DOCXIssue[]): DocumentPageSettings | undefined {
  const result: Record<string, unknown> = { unit: 'pt' };
  for (const [elementName, keys] of [['pgSz', PAGE_SIZE_KEYS], ['pgMar', PAGE_MARGIN_KEYS]] as const) {
    const matches = elements(section).filter(item => expandedName(item) === `${WORD_NS}|${elementName}`);
    if (matches.length > 1) throw new Error(`Ambiguous Word ${elementName} settings.`);
    const element = matches[0];
    if (!element) continue;
    for (const [key, wordKey] of Object.entries(keys)) {
      const raw = wordPageAttribute(element, wordKey);
      if (raw === undefined) continue;
      const twips = Number(raw);
      const signed = key === 'marginTop' || key === 'marginBottom';
      if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(twips) || twips > (signed ? 2147483647 : 4294967295)
        || twips < (signed ? -2147483648 : 0) || ((key === 'width' || key === 'height') && twips === 0)) {
        issues.push({ code: 'invalid-page-setting', severity: 'warning', message: `Invalid Word page setting ${wordKey} was not imported.`, sourcePart: 'word/document.xml' });
      } else result[key] = twips / 20;
    }
    if (elementName === 'pgSz') {
      const orientation = wordPageAttribute(element, 'orient');
      if (orientation === 'portrait' || orientation === 'landscape') result.orientation = orientation;
      else if (orientation !== undefined) issues.push({ code: 'invalid-page-orientation', severity: 'warning', message: 'The unknown Word page orientation was omitted; explicit width and height remain.', sourcePart: 'word/document.xml' });
    }
  }
  if (Object.keys(result).length === 1) return undefined;
  const unsupported = elements(section).filter(item => ['pgBorders', 'textDirection', 'vAlign', 'rtlGutter', 'paperSrc'].includes(localName(item.name)));
  const columns = child(section, 'cols');
  if (columns && (Number(attr(columns, 'num') ?? 1) > 1 || elements(columns, 'col').length > 1)) unsupported.push(columns);
  if (unsupported.length) issues.push({ code: 'section-layout-not-imported', severity: 'warning', message: `Page dimensions/margins were retained, but ${unsupported.map(item => localName(item.name)).join(', ')} layout behaviour is not represented.`, sourcePart: 'word/document.xml' });
  return Object.freeze(result) as unknown as DocumentPageSettings;
}

function wordPageSettingsXML(node: FountainNode, options: DOCXExportOptions, issues: DOCXIssue[]): string {
  const source = readDocumentPageSettings(node);
  const landscape = source?.orientation === 'landscape';
  const baseWidth = options.page === 'letter' ? 612 : 595.3;
  const baseHeight = options.page === 'letter' ? 792 : 841.9;
  const fallback: Required<Omit<DocumentPageSettings, 'orientation'>> = { unit: 'pt',
    width: landscape ? baseHeight : baseWidth, height: landscape ? baseWidth : baseHeight,
    marginTop: 72, marginRight: 72, marginBottom: 72, marginLeft: 72,
    headerDistance: 36, footerDistance: 36, gutter: 0,
  };
  const values = { ...fallback, ...source };
  if (options.page) {
    values.width = fallback.width; values.height = fallback.height;
    if (source?.width !== undefined || source?.height !== undefined) issues.push({ code: 'page-size-overridden', severity: 'info', message: 'The explicit export page option overrides the document paper dimensions; source orientation and margins are retained.' });
  }
  const defaulted = PAGE_SETTING_LENGTHS.filter(key => source?.[key] === undefined && !(options.page && (key === 'width' || key === 'height')));
  if (defaulted.length) issues.push({ code: 'page-settings-defaulted', severity: 'info', message: `Unspecified page settings use export defaults: ${defaulted.join(', ')}. These explicit values appear on reimport.` });
  if (values.width <= values.marginLeft + values.marginRight + values.gutter || values.height <= Math.max(0, values.marginTop) + Math.max(0, values.marginBottom)) throw new RangeError('Page margins leave no positive Word body area.');
  const twips = (key: typeof PAGE_SETTING_LENGTHS[number]) => {
    const value = values[key];
    const rounded = Math.round(value * 20);
    const signed = key === 'marginTop' || key === 'marginBottom';
    if (!Number.isSafeInteger(rounded) || rounded > (key === 'width' || key === 'height' ? 31680 : signed ? 2147483647 : 4294967295)
      || rounded < (signed ? -2147483648 : 0) || ((key === 'width' || key === 'height') && rounded === 0)) throw new RangeError(`Page setting ${key} cannot be represented in the supported Word range.`);
    if (Math.abs(rounded / 20 - value) > 1e-9) issues.push({ code: 'page-setting-rounded', severity: 'info', message: `${key} was rounded to Word's 1/20-point resolution.` });
    return rounded;
  };
  return `<w:pgSz ${Object.entries(PAGE_SIZE_KEYS).map(([key, name]) => `w:${name}="${twips(key as 'width' | 'height')}"`).join(' ')}${values.orientation ? ` w:orient="${values.orientation}"` : ''}/><w:pgMar ${Object.entries(PAGE_MARGIN_KEYS).map(([key, name]) => `w:${name}="${twips(key as keyof typeof PAGE_MARGIN_KEYS)}"`).join(' ')}/>`;
}

interface ExportedMedia {
  readonly relationshipId: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly contentType: DOCXImageContentType;
}

interface ExportContext {
  readonly footnotes: ReadonlyMap<string, { id: string; node: FountainNode; path: readonly number[] }>;
  readonly numbering: string[];
  readonly numberingDefinitions: string[];
  readonly hyperlinks: Map<string, string>;
  readonly mediaBySource: Map<string, ExportedMedia>;
  readonly media: ExportedMedia[];
  readonly issues: DOCXIssue[];
  readonly options: DOCXExportOptions;
  readonly maxMediaBytes: number;
  readonly maxMediaFiles: number;
  mediaBytes: number;
  nextDrawingId: number;
  nextControlId: number;
  readonly mathSources: MathSourceRecord[];
  mathCharacters: number;
}

function nativeMath(node: FountainNode, context: ExportContext, path: readonly number[]): string | undefined {
  const retained = isMathExpression(node.attrs.expression) ? node.attrs.expression : undefined;
  if (!retained && !context.options.resolveMath) return undefined;
  try {
    const expression = retained ?? context.options.resolveMath?.(node, Object.freeze([...path]));
    if (expression === undefined) return undefined;
    const omml = serializeDOCXMath(expression, node.type.name === 'math_block');
    const source = String(node.attrs.latex ?? '');
    const ariaLabel = String(node.attrs.ariaLabel ?? '');
    if (source.length > 100_000 || context.mathSources.length >= 128) throw new RangeError('DOCX math source exceeds the 128 equation / 100,000 character per-source limit.');
    if (ariaLabel.length > 1_000) throw new RangeError('DOCX math accessibility label exceeds 1,000 characters.');
    if (context.mathCharacters + source.length + omml.length + ariaLabel.length > 1_000_000) throw new RangeError('DOCX math projections exceed the 1,000,000 character total limit.');
    context.mathCharacters += source.length + omml.length + ariaLabel.length;
    const index = context.mathSources.length + 1;
    const id = `FountainMath_${index}`;
    context.mathSources.push({ id, path: [...path], source, ariaLabel, kind: node.type.name as MathSourceRecord['kind'], omml });
    if (node.marks.length) context.issues.push({ code: 'native-math-marks-omitted', severity: 'warning', message: 'Fountain marks around the math node were not applied; the host expression owns math styling.', path });
    context.issues.push({ code: 'native-math-experimental', severity: 'warning', message: 'Host math was exported as OMML with its original source in customXml/fountainMath.xml. Word rendering and source restoration after external edits are not yet certified.', path });
    return `<w:bookmarkStart w:id="${index}" w:name="${id}"/>${omml}<w:bookmarkEnd w:id="${index}"/>`;
  } catch (error) {
    context.issues.push({ code: 'math-projection-failed', severity: 'warning', message: `Native math was rejected; source text was retained. ${error instanceof Error ? error.message : String(error)}`, path });
    return undefined;
  }
}

function exportLimit(value: number | undefined, fallback: number, name: string): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result <= 0) throw new RangeError(`${name} must be a positive safe integer.`);
  return result;
}

function dataImage(source: string, maxBytes: number): { bytes: Uint8Array; contentType: DOCXImageContentType } | undefined {
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([\s\S]+)$/i.exec(source.trim());
  if (!match) return undefined;
  const encodedLength = match[2]!.replace(/\s+/g, '').length;
  if (Math.floor(encodedLength / 4) * 3 > maxBytes + 2) throw new RangeError(`DOCX export media exceeds ${maxBytes} bytes.`);
  const bytes = decodeBase64(match[2]!);
  if (!bytes) return undefined;
  const contentType = match[1]!.toLowerCase() as DOCXImageContentType;
  return { bytes, contentType };
}

function imageMedia(node: FountainNode, context: ExportContext, path: readonly number[]): ExportedMedia | undefined {
  const source = String(node.attrs.src ?? '');
  const existing = context.mediaBySource.get(source);
  if (existing) return existing;
  let supplied: DOCXExportImage | undefined;
  const encoded = dataImage(source, context.maxMediaBytes);
  if (encoded) supplied = encoded;
  else {
    try { supplied = context.options.resolveImage?.(source, node, path); }
    catch {
      context.issues.push({ code: 'image-resolver-failed', severity: 'warning', message: 'The host image resolver failed; readable image text was exported instead.', path });
      return undefined;
    }
  }
  if (!supplied) {
    context.issues.push({ code: 'image-source-unavailable', severity: 'warning', message: 'DOCX export does not fetch image URLs. Supply resolveImage or use a raster data URL; readable image text was exported instead.', path });
    return undefined;
  }
  const bytes = supplied.bytes instanceof Uint8Array ? new Uint8Array(supplied.bytes) : new Uint8Array(supplied.bytes);
  const detected = rasterType(bytes);
  if (!detected) {
    context.issues.push({ code: 'unsupported-image-type', severity: 'warning', message: 'The supplied image was not a verified PNG, JPEG, GIF, or WebP file; readable image text was exported instead.', path });
    return undefined;
  }
  if (supplied.contentType && supplied.contentType !== detected) {
    context.issues.push({ code: 'image-type-mismatch', severity: 'warning', message: `The supplied ${supplied.contentType} label did not match its ${detected} bytes; readable image text was exported instead.`, path });
    return undefined;
  }
  if (context.media.length >= context.maxMediaFiles) throw new RangeError(`DOCX export exceeds ${context.maxMediaFiles} media files.`);
  if (context.mediaBytes + bytes.byteLength > context.maxMediaBytes) throw new RangeError(`DOCX export media exceeds ${context.maxMediaBytes} bytes.`);
  const number = context.media.length + 1;
  const media: ExportedMedia = Object.freeze({
    relationshipId: `rIdImage${number}`,
    fileName: `image${number}.${extensionFor(detected)}`,
    bytes,
    contentType: detected,
  });
  context.mediaBytes += bytes.byteLength;
  context.media.push(media);
  context.mediaBySource.set(source, media);
  return media;
}

function imagePixels(value: unknown, fallback: number): number {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(String(value ?? ''));
  const pixels = match ? Number(match[1]) : fallback;
  return Math.max(1, Math.min(4096, Math.round(pixels)));
}

function imageRun(node: FountainNode, context: ExportContext, path: readonly number[]): string | undefined {
  const media = imageMedia(node, context, path);
  if (!media) return undefined;
  const block = node.type.name === 'image_super';
  const width = imagePixels(node.attrs.width, block ? 640 : 160);
  const height = imagePixels(node.attrs.height, block ? 360 : 120);
  const cx = width * 9525;
  const cy = height * 9525;
  const drawingId = context.nextDrawingId++;
  const alt = xmlEscape(node.attrs.alt ?? '');
  const title = xmlEscape(node.attrs.title ?? '');
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${drawingId}" name="${xmlEscape(media.fileName)}" descr="${alt}" title="${title}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="${xmlEscape(media.fileName)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${media.relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function paragraphFontProperties(layout: ParagraphLayout | undefined, issues: DOCXIssue[], path: readonly number[]): { family: string; size: string } {
  let family = ''; let size = '';
  if (layout?.fontFamily !== undefined) {
    if (layout.fontFamily.includes(',') || /^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|emoji|math|fangsong)$/i.test(layout.fontFamily)) {
      issues.push({ code: 'paragraph-font-family-not-exported', severity: 'warning', message: 'Word cannot represent a CSS fallback stack or generic family as one paragraph font face.', path });
    } else family = `<w:rFonts w:ascii="${xmlEscape(layout.fontFamily)}" w:hAnsi="${xmlEscape(layout.fontFamily)}"/>`;
  }
  if (layout?.fontSize !== undefined) {
    const halfPoints = Math.round(layout.fontSize * 2);
    if (Math.abs(halfPoints / 2 - layout.fontSize) > 1e-9) issues.push({ code: 'paragraph-font-size-rounded', severity: 'warning', message: 'The paragraph font size was rounded to Word half-point resolution.', path });
    size = `<w:sz w:val="${halfPoints}"/>`;
  }
  return { family, size };
}

function runProperties(marks: readonly Mark[], issues: DOCXIssue[] = [], path: readonly number[] = [], explicitEmphasis = false, paragraphFont?: { family: string; size: string }): { xml: string; hyperlink?: string; unsupported: string[] } {
  const properties: string[] = [];
  if (paragraphFont?.family && !marks.some(mark => mark.type.name === 'font_family')) properties.push(paragraphFont.family);
  if (paragraphFont?.size && !marks.some(mark => mark.type.name === 'font_size')) properties.push(paragraphFont.size);
  if (explicitEmphasis && !marks.some(mark => mark.type.name === 'strong')) properties.push('<w:b w:val="0"/>');
  if (explicitEmphasis && !marks.some(mark => mark.type.name === 'em')) properties.push('<w:i w:val="0"/>');
  let hyperlink: string | undefined;
  const unsupported: string[] = [];
  for (const item of marks) {
    switch (item.type.name) {
      case 'font_family': {
        const family = normalizeFontFamily(item.attrs.family);
        // Word names a face, not a CSS fallback stack or generic family.
        if (!family || family.includes(',') || /^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|emoji|math|fangsong)$/i.test(family)) { unsupported.push('font_family'); break; }
        properties.push(`<w:rFonts w:ascii="${xmlEscape(family)}" w:hAnsi="${xmlEscape(family)}"/>`);
        break;
      }
      case 'font_size': {
        const size = normalizeFontSize(item.attrs.size);
        const match = size && /^(\d+(?:\.\d+)?)(pt|px)$/.exec(size);
        if (!match) { unsupported.push('font_size'); break; }
        const points = Number(match[1]) * (match[2] === 'px' ? 0.75 : 1);
        const halfPoints = Math.round(points * 2);
        if (halfPoints < 2 || halfPoints > 768) { unsupported.push('font_size'); break; }
        if (Math.abs(halfPoints / 2 - points) > 1e-9) issues.push({ code: 'font-size-rounded', severity: 'warning', message: 'The font size was rounded to Word half-point resolution.', path });
        if (match[2] === 'px') issues.push({ code: 'font-size-unit-normalized', severity: 'info', message: 'CSS pixels were converted at 96 px per inch; reimport uses physical points.', path });
        properties.push(`<w:sz w:val="${halfPoints}"/>`);
        break;
      }
      case 'letter_spacing': {
        const spacing = normalizeLetterSpacing(item.attrs.spacing);
        const match = spacing && /^(-?\d+(?:\.\d+)?)(pt|px)$/.exec(spacing);
        if (!match) { unsupported.push('letter_spacing'); break; }
        const points = Number(match[1]) * (match[2] === 'px' ? 0.75 : 1);
        const twips = Math.round(points * 20);
        if (Math.abs(twips / 20 - points) > 1e-9) issues.push({ code: 'character-spacing-rounded', severity: 'warning', message: 'Character spacing was rounded to Word twentieth-point resolution.', path });
        if (match[2] === 'px') issues.push({ code: 'character-spacing-unit-normalized', severity: 'info', message: 'CSS pixels were converted at 96 px per inch; reimport uses physical points.', path });
        properties.push(`<w:spacing w:val="${twips}"/>`);
        break;
      }
      case 'strong': properties.push('<w:b/>'); break;
      case 'em': properties.push('<w:i/>'); break;
      case 'underline': properties.push('<w:u w:val="single"/>'); break;
      case 'strike': properties.push('<w:strike/>'); break;
      case 'code': properties.push('<w:rStyle w:val="CodeChar"/>'); break;
      case 'text_color': {
        const color = String(item.attrs.color ?? '').replace('#', '');
        if (/^[\da-f]{6}$/i.test(color)) properties.push(`<w:color w:val="${color.toUpperCase()}"/>`);
        break;
      }
      case 'highlight': {
        const color = String(item.attrs.color ?? '').toLowerCase();
        const named = Object.entries(WORD_HIGHLIGHTS).find(([, value]) => value === color)?.[0];
        if (named) properties.push(`<w:highlight w:val="${named}"/>`);
        else properties.push(`<w:shd w:val="clear" w:color="auto" w:fill="${xmlEscape(color.replace('#', ''))}"/>`);
        break;
      }
      case 'link': hyperlink = String(item.attrs.href ?? ''); break;
      default: unsupported.push(item.type.name);
    }
  }
  return { xml: properties.length ? `<w:rPr>${properties.join('')}</w:rPr>` : '', hyperlink, unsupported };
}

function textRuns(node: FountainNode, context: ExportContext, path: readonly number[], layout: unknown = node.attrs.layout): string {
  if (isParagraphLayout(layout) && (layout.fontFamily === undefined || layout.fontSize === undefined)) {
    context.issues.push({ code: 'paragraph-font-defaulted', severity: 'warning',
      message: 'Unresolved paragraph fonts use generated Word style defaults. Inline fonts remain; line geometry may change.', path });
  }
  const paragraphFont = paragraphFontProperties(isParagraphLayout(layout) ? layout : undefined, context.issues, path);
  return node.content.map((inline, index) => {
    if (inline.type.name === 'page_field') {
      const props = runProperties(inline.marks, context.issues, [...path, index], node.attrs.emphasis === 'explicit', paragraphFont);
      if (props.hyperlink || props.unsupported.length) context.issues.push({ code: 'page-field-mark-omitted', severity: 'warning', message: 'Unsupported marks or links on a page field were omitted.', path: [...path, index] });
      const instruction = inline.attrs.kind === 'page-count' ? 'NUMPAGES' : 'PAGE';
      return `<w:fldSimple w:instr="${instruction}" w:dirty="true"><w:r>${props.xml}<w:t>1</w:t></w:r></w:fldSimple>`;
    }
    if (inline.type.name === 'footnote_reference') {
      const note = context.footnotes.get(String(inline.attrs.id));
      if (!note) throw new Error('DOCX footnote reference has no exportable definition.');
      const properties = runProperties(inline.marks, context.issues, [...path, index], node.attrs.emphasis === 'explicit', paragraphFont);
      if (properties.hyperlink || properties.unsupported.length) context.issues.push({ code: 'footnote-reference-mark-omitted', severity: 'warning', message: 'Unsupported marks or a hyperlink on the footnote marker were not exported.', path: [...path, index] });
      const style = '<w:rStyle w:val="FootnoteReference"/>';
      const rPr = properties.xml ? properties.xml.replace('<w:rPr>', `<w:rPr>${style}`) : `<w:rPr>${style}</w:rPr>`;
      return `<w:r>${rPr}<w:footnoteReference w:id="${note.id}"/></w:r>`;
    }
    if (inline.type.name === 'inline_math') {
      const math = nativeMath(inline, context, [...path, index]);
      if (math) return math;
    }
    if (inline.type.name === 'hard_break') return `<w:r>${runProperties(inline.marks, context.issues, [...path, index], false, paragraphFont).xml}<w:br/></w:r>`;
    if (inline.type.name === 'inline_image') {
      const drawing = imageRun(inline, context, [...path, index]);
      if (drawing) return drawing;
    }
    if (!inline.isText) {
      context.issues.push({ code: 'inline-fallback', severity: 'warning', message: `${inline.type.name} was exported as readable fallback text.`, path: [...path, index] });
    }
    const value = inline.textContent;
    const { xml, hyperlink, unsupported } = runProperties(inline.marks, context.issues, [...path, index], node.attrs.emphasis === 'explicit', paragraphFont);
    unsupported.forEach((name) => context.issues.push({ code: 'unsupported-mark', severity: 'warning', message: `Word export omitted the ${name} mark.`, path: [...path, index] }));
    const preserve = /^\s|\s$|\s{2,}|\t/.test(value) ? ' xml:space="preserve"' : '';
    const pieces = inline.isText && value === '' ? '<w:t/>'
      : value.split('\t').map((part, pieceIndex) => `${pieceIndex ? '<w:tab/>' : ''}${part ? `<w:t${preserve}>${xmlEscape(part)}</w:t>` : ''}`).join('');
    const run = `<w:r>${xml}${pieces}</w:r>`;
    if (!hyperlink) return run;
    if (!isSafeURL(hyperlink, { allowEmpty: false })) {
      context.issues.push({ code: 'unsafe-hyperlink-omitted', severity: 'warning', message: 'An unsafe hyperlink target was omitted from Word output while its text was preserved.', path: [...path, index] });
      return run;
    }
    let id = [...context.hyperlinks.entries()].find(([, target]) => target === hyperlink)?.[0];
    if (!id) { id = `rId${context.hyperlinks.size + 1}`; context.hyperlinks.set(id, hyperlink); }
    return `<w:hyperlink r:id="${id}" w:history="1">${run}</w:hyperlink>`;
  }).join('');
}

type ExportList = { numId: number; level: number; continuation?: boolean };
type DefinitionLayout = { indent: number; term: boolean };
type QuoteProjection = boolean | 'explicit';

function paragraphProperties(node: Pick<FountainNode, 'type' | 'attrs'>, list?: ExportList, quote: QuoteProjection = false, definition?: DefinitionLayout): string {
  const properties: string[] = [];
  if (node.type.name === 'heading') properties.push(`<w:pStyle w:val="Heading${Math.max(1, Math.min(6, Number(node.attrs.level) || 1))}"/>`);
  else if (node.type.name === 'code_block') properties.push('<w:pStyle w:val="Code"/>');
  else if (quote) properties.push(`<w:pStyle w:val="${quote === 'explicit' ? 'FountainExplicitQuote' : 'Quote'}"/>`);
  else if (definition?.term) properties.push('<w:pStyle w:val="FountainDefinitionTerm"/>');
  const layout = isParagraphLayout(node.attrs.layout) ? node.attrs.layout : undefined;
  for (const [key, name] of [['keepWithNext', 'keepNext'], ['keepLinesTogether', 'keepLines'], ['pageBreakBefore', 'pageBreakBefore']] as const) {
    if (layout?.[key] !== undefined) properties.push(`<w:${name} w:val="${layout[key] ? '1' : '0'}"/>`);
  }
  if (list && !list.continuation) properties.push(`<w:numPr><w:ilvl w:val="${list.level}"/><w:numId w:val="${list.numId}"/></w:numPr>`);
  if (layout?.borders) {
    const borders = PARAGRAPH_BORDER_SIDES.flatMap(side => {
      const border = layout.borders?.[side];
      return border ? [`<w:${side} w:val="single" w:sz="${Math.max(1, Math.round(border.width * 8))}" w:space="${Math.max(0, Math.round(border.space ?? 0))}" w:color="${border.color.slice(1).toUpperCase()}"/>`] : [];
    });
    if (borders.length) properties.push(`<w:pBdr>${borders.join('')}</w:pBdr>`);
  }
  if (layout?.background) properties.push(`<w:shd w:val="clear" w:color="auto" w:fill="${layout.background.slice(1).toUpperCase()}"/>`);
  if (layout && (layout.spacingBefore !== undefined || layout.spacingAfter !== undefined || layout.lineHeight !== undefined)) {
    const values = [
      layout.spacingBefore === undefined ? '' : ` w:before="${Math.round(layout.spacingBefore * 20)}"`,
      layout.spacingAfter === undefined ? '' : ` w:after="${Math.round(layout.spacingAfter * 20)}"`,
      layout.lineHeight === undefined ? '' : ` w:line="${Math.round(layout.lineHeight * (layout.lineHeightUnit === 'multiple' ? 240 : 20))}" w:lineRule="${layout.lineHeightRule}"`,
    ].join('');
    properties.push(`<w:spacing${values}/>`);
  }
  const generatedLeft = (definition?.indent ?? 0) + (list ? 720 * (list.level + 1) : quote === true ? 360 : 0);
  const left = layout?.indentStart === undefined ? (generatedLeft || undefined) : Math.round(layout.indentStart * 20);
  const right = layout?.indentEnd === undefined ? undefined : Math.round(layout.indentEnd * 20);
  const firstLine = layout?.firstLineIndent === undefined ? undefined : Math.round(layout.firstLineIndent * 20);
  const hanging = layout?.hangingIndent === undefined ? (list && !list.continuation ? 360 : undefined) : Math.round(layout.hangingIndent * 20);
  if ([left, right, firstLine, hanging].some(value => value !== undefined)) {
    properties.push(`<w:ind${left === undefined ? '' : ` w:left="${left}"`}${right === undefined ? '' : ` w:right="${right}"`}${firstLine === undefined ? '' : ` w:firstLine="${firstLine}"`}${hanging === undefined ? '' : ` w:hanging="${hanging}"`}/>`);
  }
  const declaredAlign = String(node.attrs.align ?? 'left');
  const align = declaredAlign === 'start' ? node.attrs.dir === 'rtl' ? 'right' : 'left'
    : declaredAlign === 'end' ? node.attrs.dir === 'rtl' ? 'left' : 'right' : declaredAlign;
  if (align !== 'left' || node.attrs.alignExplicit === true) properties.push(`<w:jc w:val="${align === 'justify' ? 'both' : xmlEscape(align)}"/>`);
  // One paragraph-mark rPr group only. Inline runs get the same defaults when
  // unmarked, since Word's pPr/rPr is not a text-run formatting declaration.
  const font = paragraphFontProperties(layout, [], []);
  const markProperties = `${node.attrs.emphasis === 'explicit' ? '<w:b w:val="0"/><w:i w:val="0"/>' : ''}${font.family}${font.size}`;
  if (markProperties) properties.push(`<w:rPr>${markProperties}</w:rPr>`);
  return properties.length ? `<w:pPr>${properties.join('')}</w:pPr>` : '';
}

function paragraphXML(node: FountainNode, context: ExportContext, path: readonly number[], list?: ExportList, quote: QuoteProjection = false, definition?: DefinitionLayout): string {
  if (node.attrs.dir !== undefined) context.issues.push({ code: 'text-direction-not-exported', severity: 'warning',
    message: 'HTML block direction is not projected to Word paragraph/run bidi properties. Text remains, but direction and visual ordering require Fountain JSON or HTML.', path });
  if (['start', 'end'].includes(String(node.attrs.align))) context.issues.push({ code: 'logical-alignment-projected', severity: 'warning',
    message: 'Logical start/end alignment became physical left/right using an explicit RTL override, otherwise LTR. Auto/inherited direction is not resolved; use Fountain JSON or HTML for exact semantics.', path });
  return `<w:p>${paragraphProperties(node, list, quote, definition)}${textRuns(node, context, path)}</w:p>`;
}

function exportTableShading(cell: FountainNode, context: ExportContext, path: readonly number[]): string {
  const background = String(cell.attrs.background ?? '');
  let color = tableBackground(background).slice(1);
  if (background && !color) {
    context.issues.push({ code: 'unsupported-table-background', severity: 'warning', message: 'This table background cannot be exported as an RGB Word cell fill.', path });
    return '';
  }
  if (!background) color = cell.type.name === 'table_header' ? 'EDE9FE' : '';
  return color ? `<w:shd w:val="clear" w:color="auto" w:fill="${color.toUpperCase()}"/>` : '';
}

function tableXML(node: FountainNode, context: ExportContext, path: readonly number[]): string {
  const map = TableMap.create(node, path);
  const candidates = Array.from({ length: Math.max(1, map.width) }, () => [] as Array<{ width: number; path: readonly number[] }>);
  for (const cell of map.cells) {
    const widths = Array.isArray(cell.node.attrs.colwidth) ? cell.node.attrs.colwidth.map(Number) : [];
    for (let offset = 0; offset < cell.colspan; offset += 1) {
      const width = widths[offset];
      if (Number.isInteger(width) && width >= DOCX_MIN_COLUMN_WIDTH && width <= DOCX_MAX_COLUMN_WIDTH) {
        candidates[cell.column + offset]?.push({ width, path: cell.path });
      }
    }
  }
  const columnWidths = candidates.map((column, columnIndex) => {
    const selected = column[0]?.width ?? DOCX_DEFAULT_COLUMN_WIDTH;
    if (!column.length && node.attrs.layout === 'fixed') context.issues.push({ code: 'fixed-table-column-width-defaulted', severity: 'warning', message: `Fixed column ${columnIndex + 1} has no stored width; the ${DOCX_DEFAULT_COLUMN_WIDTH} px export default was used.`, path });
    if (column.some(candidate => candidate.width !== selected)) {
      context.issues.push({
        code: 'table-column-width-conflict',
        severity: 'warning',
        message: `Column ${columnIndex + 1} contains conflicting cell widths; the first document-order width was used for the Word table grid.`,
        path: column.find(candidate => candidate.width !== selected)?.path ?? path,
      });
    }
    return selected;
  });
  const cellWidthXML = (column: number, colspan: number) => {
    const twips = columnWidths.slice(column, column + colspan).reduce((sum, width) => sum + width, 0) * DOCX_TWIPS_PER_PIXEL;
    return `<w:tcW w:w="${twips}" w:type="dxa"/>`;
  };
  const continuations = new Map<number, Array<{ column: number; colspan: number; appearance: string }>>();
  let leadingRepeat = true;
  const rows = node.content.map((row, rowIndex) => {
    const pending = [...(continuations.get(rowIndex) ?? [])].sort((left, right) => left.column - right.column);
    let continuationIndex = 0;
    let sourceIndex = 0;
    let column = 0;
    const cells: string[] = [];
    while (sourceIndex < row.content.length || continuationIndex < pending.length) {
      const continuation = pending[continuationIndex];
      if (continuation?.column === column) {
        cells.push(`<w:tc><w:tcPr>${cellWidthXML(column, continuation.colspan)}${continuation.colspan > 1 ? `<w:gridSpan w:val="${continuation.colspan}"/>` : ''}<w:vMerge/>${continuation.appearance}</w:tcPr><w:p/></w:tc>`);
        column += continuation.colspan;
        continuationIndex += 1;
        continue;
      }
      if (continuation && continuation.column < column) { continuationIndex += 1; continue; }
      const cell = row.content[sourceIndex++];
      if (!cell) break;
      const colspan = Math.max(1, Number(cell.attrs.colspan) || 1);
      const rowspan = Math.max(1, Number(cell.attrs.rowspan) || 1);
      const shading = exportTableShading(cell, context, [...path, rowIndex, sourceIndex - 1]);
      const cellAppearance = wordTableAppearanceXML(cell.attrs.appearance, true, (code, message) => context.issues.push({ code, severity: 'warning', message, path: [...path, rowIndex, sourceIndex - 1] }));
      if (rowspan > 1 && cellAppearance) context.issues.push({ code: 'table-merged-cell-appearance-projection', severity: 'warning',
        message: 'Whole-cell appearance is repeated on native vertical-merge fragments; independent fragment borders/margins and native border conflicts are not certified.', path: [...path, rowIndex, sourceIndex - 1] });
      // tcBorders precedes shading; tcMar follows it in native tcPr ordering.
      const paintedAppearance = cellAppearance.replace(/(?=<w:tcMar>)/, shading) + (cellAppearance.includes('<w:tcMar>') ? '' : shading);
      const properties = [
        cellWidthXML(column, colspan),
        colspan > 1 ? `<w:gridSpan w:val="${colspan}"/>` : '',
        rowspan > 1 ? '<w:vMerge w:val="restart"/>' : '',
        paintedAppearance,
      ].join('');
      let content = cell.content.map((block, blockIndex) => blockXML(block, context, [...path, rowIndex, sourceIndex - 1, blockIndex])).join('') || '<w:p/>';
      if (cell.type.name === 'table_header') {
        content = `<w:sdt><w:sdtPr><w:tag w:val="${TABLE_HEADER_TAG}${xmlEscape(cell.attrs.scope)}:v1"/><w:id w:val="${context.nextControlId++}"/></w:sdtPr><w:sdtContent>${content}</w:sdtContent></w:sdt>`;
        context.issues.push({ code: 'table-header-role-extension', severity: 'info',
          message: 'Semantic cell scope uses a versioned behavior-free Fountain content control, separate from native row repetition. Retention after third-party saves is not certified.', path: [...path, rowIndex, sourceIndex - 1] });
      }
      cells.push(`<w:tc><w:tcPr>${properties}</w:tcPr>${content}</w:tc>`);
      for (let offset = 1; offset < rowspan; offset += 1) {
        if (rowIndex + offset >= node.content.length) {
          context.issues.push({ code: 'table-rowspan-clipped', severity: 'warning', message: 'A table rowspan extending beyond the final row was clipped.', path: [...path, rowIndex, sourceIndex - 1] });
          break;
        }
        const target = continuations.get(rowIndex + offset) ?? [];
        target.push({ column, colspan, appearance: paintedAppearance });
        continuations.set(rowIndex + offset, target);
      }
      column += colspan;
      while (continuation && column > continuation.column && continuationIndex < pending.length) continuationIndex += 1;
    }
    const repeats = tableRowRepeats(row);
    if (repeats && !leadingRepeat) context.issues.push({ code: 'nonleading-table-repeat', severity: 'warning',
      message: 'The repeat flag is written, but Word ignores it after a non-repeating row.', path: [...path, rowIndex] });
    if (!repeats) leadingRepeat = false;
    if (row.attrs.repeatHeader === undefined) context.issues.push({ code: 'table-row-repeat-defaulted', severity: 'info',
      message: 'The legacy all-header-cell host default became explicit row repetition on native reimport.', path: [...path, rowIndex] });
    const rowProperties = `<w:trPr><w:tblHeader${repeats ? '' : ' w:val="false"'}/></w:trPr>`;
    return `<w:tr>${rowProperties}${cells.join('')}</w:tr>`;
  }).join('');
  const grid = `<w:tblGrid>${columnWidths.map(width => `<w:gridCol w:w="${width * DOCX_TWIPS_PER_PIXEL}"/>`).join('')}</w:tblGrid>`;
  const fixed = node.attrs.layout === 'fixed';
  const completeGrid = map.width > 0 && Array.from({ length: map.width }, (_, column) => map.columnWidth(column)).every(width => width !== null);
  const tableWidth = wordTableWidthXML(node.attrs.preferredWidth, (code, message) => context.issues.push({ code, severity: 'warning', message, path }))
    ?? (fixed && completeGrid ? `<w:tblW w:w="${columnWidths.reduce((sum, width) => sum + width, 0) * DOCX_TWIPS_PER_PIXEL}" w:type="dxa"/>` : '<w:tblW w:w="5000" w:type="pct"/>');
  if (node.attrs.preferredWidth === undefined) context.issues.push({ code: 'table-width-defaulted', severity: 'info', message: fixed && completeGrid
    ? 'The standard Fountain fixed-grid width became an explicit physical DOCX preference; it appears on reimport.'
    : 'The standard Fountain full host-width default became a 100% page-text-width DOCX preference; it appears on reimport. Host CSS overrides are not represented.', path });
  const layoutXML = node.attrs.layout === undefined ? '' : `<w:tblLayout w:type="${fixed ? 'fixed' : 'autofit'}"/>`;
  const declared = isTableAppearance(node.attrs.appearance);
  const appearance = declared ? wordTableAppearanceXML(node.attrs.appearance, false, (code, message) => context.issues.push({ code, severity: 'warning', message, path }))
    : '<w:tblBorders><w:top w:val="single" w:sz="6" w:color="C9C2D8"/><w:left w:val="single" w:sz="6" w:color="C9C2D8"/><w:bottom w:val="single" w:sz="6" w:color="C9C2D8"/><w:right w:val="single" w:sz="6" w:color="C9C2D8"/><w:insideH w:val="single" w:sz="6" w:color="D9D3E5"/><w:insideV w:val="single" w:sz="6" w:color="D9D3E5"/></w:tblBorders><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar>';
  // OOXML ordering places tblLayout between borders and cell margins.
  const appearanceXML = appearance.replace(/(?=<w:tblCellMar>)/, layoutXML) + (appearance.includes('<w:tblCellMar>') ? '' : layoutXML);
  return `<w:tbl><w:tblPr>${tableWidth}${appearanceXML}</w:tblPr>${grid}${rows}</w:tbl>`;
}

function blockXML(node: FountainNode, context: ExportContext, path: readonly number[], level = 0, quote: QuoteProjection = false, list?: ExportList, definition?: DefinitionLayout): string {
  if (node.type.name === 'math_block') {
    const math = nativeMath(node, context, path);
    if (math) return `<w:p>${paragraphProperties(node, list, quote, definition)}${math}</w:p>`;
  }
  switch (node.type.name) {
    case 'footnote_definition': case 'page_header': case 'page_footer': return '';
    case 'page_break':
      if (path.length > 1) context.issues.push({ code: 'nested-page-break-projection', severity: 'warning', message: 'The nested page break is written natively, but enclosing list/quote identity and table or story layout are not certified on reimport.', path });
      return `<w:p>${paragraphProperties(node, list, quote, definition)}<w:r><w:br w:type="page"/></w:r></w:p>`;
    case 'definition_list': {
      if (node.content.some(entry => !['definition_term', 'definition_description'].includes(entry.type.name))) {
        context.issues.push({ code: 'definition-structure-fallback', severity: 'warning', message: 'A custom glossary structure was exported as separate readable blocks without assigning term or description roles.', path });
        return node.content.map((entry, index) => blockXML(entry, context, [...path, index], level, quote, list, definition)).join('');
      }
      if (list) context.issues.push({ code: 'definition-list-numbered-context', severity: 'warning', message: 'A glossary inside a numbered or bulleted item retains its roles but may reopen outside the enclosing item.', path });
      context.issues.push({ code: 'definition-docx-experimental', severity: 'warning', message: 'Glossary roles use versioned Word content controls. Native Word layout and retention after third-party saves are not yet certified.', path });
      const wrap = (role: DefinitionRole, content: string) => `<w:sdt><w:sdtPr><w:alias w:val="Fountain glossary ${role}"/><w:tag w:val="${DEFINITION_TAG}${role}:v1"/><w:id w:val="${context.nextControlId++}"/></w:sdtPr><w:sdtContent>${content}</w:sdtContent></w:sdt>`;
      for (const [index, item] of [node, ...node.content].entries()) {
        if (Object.keys(item.attrs).length || item.marks.length) context.issues.push({ code: 'definition-metadata-omitted', severity: 'warning', message: 'Custom glossary role attributes and marks are not retained by DOCX; use Fountain JSON for exact persistence.', path: index ? [...path, index - 1] : path });
      }
      return wrap('list', node.content.map((entry, index) => {
        const role = entry.type.name === 'definition_term' ? 'term' : 'description';
        const layout = { indent: (definition?.indent ?? 0) + (role === 'description' ? 360 : 0), term: role === 'term' };
        return wrap(role, entry.content.map((block, blockIndex) => blockXML(block, context, [...path, index, blockIndex], 0, false, undefined, layout)).join(''));
      }).join(''));
    }
    case 'paragraph': case 'heading': case 'code_block': return paragraphXML(node, context, path, list, quote, definition);
    case 'blockquote': return node.content.map((item, index) =>
      blockXML(item, context, [...path, index], level, node.attrs.appearance === 'explicit' ? 'explicit' : true, list, definition)
    ).join('');
    case 'bullet_list': case 'ordered_list': {
      const ordered = node.type.name === 'ordered_list';
      const requested = ordered ? Number(node.attrs.start) : 1;
      const start = Number.isInteger(requested) && requested >= 0 && requested <= 2147483647 ? requested : 1;
      if (requested !== start) {
        context.issues.push({ code: 'ordered-list-start-normalized', severity: 'warning', message: 'DOCX export normalized a list start outside the supported 0–2147483647 range to 1.', path });
      }
      // Each document list has its own instance, including adjacent/restarted
      // lists and lists in table cells. Nested lists must not reset a parent.
      const numId = context.numbering.length + 1;
      const left = 720 * (level + 1) + (definition?.indent ?? 0);
      context.numberingDefinitions.push(`<w:abstractNum w:abstractNumId="${numId}"><w:lvl w:ilvl="${level}"><w:start w:val="${start}"/><w:numFmt w:val="${ordered ? 'decimal' : 'bullet'}"/><w:lvlText w:val="${ordered ? `%${level + 1}.` : '•'}"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="${left}"/></w:tabs><w:ind w:left="${left}" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>`);
      context.numbering.push(`<w:num w:numId="${numId}"><w:abstractNumId w:val="${numId}"/><w:lvlOverride w:ilvl="${level}"><w:startOverride w:val="${start}"/></w:lvlOverride></w:num>`);
      return node.content.map((item, index) => item.content.map((block, childIndex) => {
        if (block.type.name === 'bullet_list' || block.type.name === 'ordered_list') return blockXML(block, context, [...path, index, childIndex], Math.min(8, level + 1), quote, undefined, definition);
        return blockXML(block, context, [...path, index, childIndex], level, quote, { numId, level, continuation: childIndex > 0 }, definition);
      }).join('')).join('');
    }
    case 'table': return tableXML(node, context, path);
    case 'image_super': {
      const drawing = imageRun(node, context, path);
      if (!drawing) return `<w:p><w:r><w:t>${xmlEscape(node.textContent)}</w:t></w:r></w:p>`;
      const caption = node.content.map((inline) => inline.textContent).join('') || String(node.attrs.caption ?? '').trim();
      const align = ['left', 'center', 'right'].includes(String(node.attrs.align)) ? String(node.attrs.align) : 'center';
      const captionFont = !node.childCount ? paragraphFontProperties(isParagraphLayout(node.attrs.captionLayout) ? node.attrs.captionLayout : undefined, context.issues, path) : undefined;
      const captionRuns = node.childCount ? textRuns(node, context, [...path, 0], node.attrs.captionLayout)
        : `<w:r>${runProperties([], context.issues, path, false, captionFont).xml}<w:t>${xmlEscape(caption)}</w:t></w:r>`;
      const captionParagraph = { type: node.type, attrs: { align: node.attrs.captionAlign ?? 'center', layout: node.attrs.captionLayout } };
      const captionProperties = paragraphProperties(captionParagraph);
      const captionStyle = captionProperties ? captionProperties.replace('<w:pPr>', '<w:pPr><w:pStyle w:val="Caption"/>') : '<w:pPr><w:pStyle w:val="Caption"/></w:pPr>';
      return `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="120" w:after="80"/></w:pPr>${drawing}</w:p>${caption ? `<w:p>${captionStyle}${captionRuns}</w:p>` : ''}`;
    }
    case 'horizontal_rule': return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>';
    default:
      context.issues.push({ code: 'block-fallback', severity: 'warning', message: `${node.type.name} was exported as readable fallback text.`, path });
      return `<w:p>${paragraphProperties(node, list, quote, definition)}<w:r><w:t>${xmlEscape(node.textContent)}</w:t></w:r></w:p>`;
  }
}

function contentTypes(media: readonly ExportedMedia[]): string {
  const defaults = [...new Map(media.map((item) => [extensionFor(item.contentType), item.contentType])).entries()]
    .map(([extension, contentType]) => `<Default Extension="${extension}" ContentType="${contentType}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${defaults}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

const HEADING_SIZES = [64, 52, 44, 36, 30, 26] as const;
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:style>${HEADING_SIZES.map((size, index) => `<w:style w:type="paragraph" w:styleId="Heading${index + 1}"><w:name w:val="heading ${index + 1}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${index === 0 ? 360 : 240}" w:after="160"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="181426"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`).join('')}<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="left"/><w:ind w:left="360" w:right="360"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="12" w:color="7047FF"/></w:pBdr><w:spacing w:before="160" w:after="200"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="51476A"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:basedOn w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:fill="F2EFF8"/><w:spacing w:before="120" w:after="160"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="character" w:styleId="CodeChar"><w:name w:val="Code Char"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:shd w:val="clear" w:fill="F2EFF8"/></w:rPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style></w:styles>`;


export function exportDOCX(node: FountainNode, options: DOCXExportOptions = {}): DOCXExportResult {
  if (node.type.name !== 'doc') throw new TypeError('exportDOCX requires a document node.');
  node.type.schema.validate(node);
  const issues: DOCXIssue[] = [];
  const definitions = new Map<string, { node: FountainNode; path: readonly number[] }>();
  const templates = new Map<string, { node: FountainNode; path: readonly number[] }>();
  const references = new Map<string, number>();
  node.descendants((item, path) => {
    if (item.type.name === 'page_header' || item.type.name === 'page_footer') {
      const key = `${item.type.name}:${String(item.attrs.variant)}`;
      if (path.length !== 1 || templates.has(key)) throw new Error('DOCX requires unique top-level header/footer templates.');
      templates.set(key, { node: item, path });
      item.descendants(child => { if (child.type.name === 'footnote_reference' || child.type.name === 'footnote_definition') throw new Error('DOCX does not permit footnotes inside headers or footers.'); });
    }
    if (item.type.name === 'page_field' && !['page_header', 'page_footer'].includes(node.content[path[0]!]?.type.name ?? '')) throw new Error('DOCX page fields require a header/footer template.');
    if (item.type.name === 'footnote_definition') {
      const id = String(item.attrs.id);
      if (path.length !== 1 || definitions.has(id)) throw new Error('DOCX requires unique top-level footnote definitions.');
      definitions.set(id, { node: item, path });
      item.descendants(child => {
        if (child.type.name === 'footnote_reference') throw new Error('DOCX does not permit a footnote reference inside a footnote.');
      });
    }
    if (item.type.name === 'footnote_reference') {
      const id = String(item.attrs.id);
      references.set(id, (references.get(id) ?? 0) + 1);
    }
  });
  for (const id of references.keys()) if (!definitions.has(id)) throw new Error('DOCX footnote reference has no definition.');
  for (const id of definitions.keys()) if (!references.has(id)) throw new Error('DOCX footnote definition has no reference; reconnect or remove it before export.');
  const reserved = new Set([...definitions.keys()].filter(id => wordNoteId(id) === id && id !== '0'));
  let nextNote = 1;
  const footnotes = new Map<string, { id: string; node: FountainNode; path: readonly number[] }>();
  for (const [sourceId, definition] of definitions) {
    let id = sourceId;
    if (!reserved.has(id)) {
      while (reserved.has(String(nextNote))) nextNote++;
      id = String(nextNote++); reserved.add(id);
      issues.push({ code: 'footnote-id-normalized', severity: 'warning', message: 'A non-native footnote identifier was mapped to a Word integer ID. References remain linked, but the original identifier requires Fountain JSON for exact persistence.', path: definition.path });
    }
    if ((references.get(sourceId) ?? 0) > 1) issues.push({ code: 'repeated-footnote-reference', severity: 'warning', message: 'Multiple references share one footnote definition. Numbering of repeated native Word markers is not certified.', path: definition.path });
    footnotes.set(sourceId, { ...definition, id });
  }
  const lastBodyIndex = node.content.findLastIndex(item => item.type.name !== 'footnote_definition');
  if (definitions.size && node.content.some((item, index) => item.type.name === 'footnote_definition' && index < lastBodyIndex)) {
    issues.push({ code: 'footnote-definition-position-normalized', severity: 'info', message: 'DOCX stores notes separately from body blocks; reimport places definitions after the body rather than retaining their editor block positions.' });
  }
  const context: ExportContext = {
    footnotes, hyperlinks: new Map(), mediaBySource: new Map(), media: [], issues, options, numbering: [], numberingDefinitions: [],
    maxMediaBytes: exportLimit(options.maxMediaBytes, DEFAULT_LIMITS.maxMediaBytes, 'maxMediaBytes'),
    maxMediaFiles: exportLimit(options.maxMediaFiles, DEFAULT_LIMITS.maxMediaFiles, 'maxMediaFiles'),
    mediaBytes: 0, nextDrawingId: 1, nextControlId: 1, mathSources: [], mathCharacters: 0,
  };
  const body = node.content.map((block, index) => blockXML(block, context, [index])).join('');
  const noteXML = [...footnotes.values()].map(note => {
    let content = note.node.content.map((block, index) => blockXML(block, context, [...note.path, index])).join('');
    const marker = '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>';
    if (content.startsWith('<w:p>')) content = content.replace(/^(<w:p>(?:<w:pPr>[\s\S]*?<\/w:pPr>)?)/, `$1${marker}`);
    else content = `<w:p>${marker}</w:p>${content}`;
    return `<w:footnote w:id="${note.id}">${content}</w:footnote>`;
  }).join('');
  const firstPages = [...templates.keys()].some(key => key.endsWith(':first'));
  const evenPages = [...templates.keys()].some(key => key.endsWith(':even') || key.endsWith(':odd'));
  const templateParts: Array<{ kind: 'header' | 'footer'; variant: string; name: string; id: string; xml: string }> = [];
  for (const kind of ['header', 'footer'] as const) {
    const get = (variant: string) => templates.get(`page_${kind}:${variant}`);
    const defaultTemplate = get('default');
    const oddTemplate = get('odd') ?? defaultTemplate;
    if (![...templates.keys()].some(key => key.startsWith(`page_${kind}:`))) continue;
    const requested = [
      ['default', oddTemplate],
      ...(firstPages ? [['first', get('first') ?? oddTemplate]] : []),
      ...(evenPages ? [['even', get('even') ?? defaultTemplate]] : []),
    ] as Array<[string, { node: FountainNode; path: readonly number[] } | undefined]>;
    for (const [variant, template] of requested) {
      const name = `${kind}${templateParts.length + 1}.xml`;
      templateParts.push({ kind, variant, name, id: `rIdPageTemplate${templateParts.length + 1}`, xml: template ? template.node.content.map((block, index) => blockXML(block, context, [...template.path, index])).join('') : '<w:p/>' });
    }
    if (get('odd')) issues.push({ code: 'page-template-variant-normalized', severity: 'warning', message: 'Fountain odd/default fallbacks were mapped to Word default/even references. Page selection is represented, but template identity and duplication can change on reimport.', path: get('odd')!.path });
  }
  if (templates.size) issues.push({ code: 'page-template-projection', severity: 'info', message: 'Headers/footers are stored as separate native parts and reimported after body blocks. Original styles, section geometry and exact template block positions are not certified.' });
  if (templateParts.some(part => part.xml.includes('<w:fldSimple'))) issues.push({ code: 'page-field-recalculation-required', severity: 'warning', message: 'Dynamic PAGE/NUMPAGES fields need recalculation by the receiving layout engine. Cached values are placeholders, not verified page numbers.' });
  const section = `<w:sectPr>${templateParts.map(part => `<w:${part.kind}Reference w:type="${part.variant}" r:id="${part.id}"/>`).join('')}${wordPageSettingsXML(node, options, issues)}${firstPages ? '<w:titlePg/>' : ''}</w:sectPr>`;
  const documentXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}${section}</w:body></w:document>`;
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${[...context.hyperlinks].map(([id, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(target)}" TargetMode="External"/>`).join('')}${context.media.map((item) => `<Relationship Id="${item.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${xmlEscape(item.fileName)}"/>`).join('')}</Relationships>`;
  const now = new Date().toISOString();
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(options.title)}</dc:title><dc:creator>${xmlEscape(options.creator ?? 'FountainJS')}</dc:creator><dc:description>${xmlEscape(options.description)}</dc:description><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>FountainJS</Application></Properties>`;
  const parts: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypes(context.media)),
    '_rels/.rels': strToU8(ROOT_RELS),
    'word/document.xml': strToU8(documentXML),
    'word/styles.xml': strToU8(STYLES.replace('</w:styles>', '<w:style w:type="paragraph" w:styleId="FountainDefinitionTerm"><w:name w:val="Fountain Definition Term"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="FountainExplicitQuote"><w:name w:val="Fountain Explicit Quote"/><w:basedOn w:val="Normal"/></w:style></w:styles>')),
    'word/numbering.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${context.numberingDefinitions.join('')}${context.numbering.join('')}</w:numbering>`),
    'word/_rels/document.xml.rels': strToU8(documentRels),
    'docProps/core.xml': strToU8(core),
    'docProps/app.xml': strToU8(app),
  };
  if (context.mathSources.length) {
    // Bookmarks bind each source to one projection, independent of model path.
    // Import must validate both the binding and complete equation before reuse.
    parts[MATH_SOURCE_PART] = strToU8(`<f:mathSources xmlns:f="${MATH_SOURCE_NS}">${xmlEscape(JSON.stringify(context.mathSources))}</f:mathSources>`);
    parts['word/_rels/document.xml.rels'] = strToU8(documentRels.replace('</Relationships>', '<Relationship Id="rIdFountainMathSources" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/fountainMath.xml"/></Relationships>'));
  }
  if (footnotes.size) {
    parts['[Content_Types].xml'] = strToU8(strFromU8(parts['[Content_Types].xml']!).replace('</Types>', '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/></Types>'));
    parts['word/_rels/document.xml.rels'] = strToU8(strFromU8(parts['word/_rels/document.xml.rels']!).replace('</Relationships>', `<Relationship Id="rIdFootnotes" Type="${OFFICE_REL_NS}/footnotes" Target="footnotes.xml"/></Relationships>`));
    parts['word/footnotes.xml'] = strToU8(`<w:footnotes xmlns:w="${WORD_NS}" xmlns:r="${OFFICE_REL_NS}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${noteXML}</w:footnotes>`);
    parts['word/_rels/footnotes.xml.rels'] = strToU8(`<Relationships xmlns="${REL_NS}">${[...context.hyperlinks].map(([id, target]) => `<Relationship Id="${id}" Type="${OFFICE_REL_NS}/hyperlink" Target="${xmlEscape(target)}" TargetMode="External"/>`).join('')}${context.media.map(item => `<Relationship Id="${item.relationshipId}" Type="${OFFICE_REL_NS}/image" Target="media/${xmlEscape(item.fileName)}"/>`).join('')}</Relationships>`);
    parts['word/styles.xml'] = strToU8(strFromU8(parts['word/styles.xml']!).replace('</w:styles>', '<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style></w:styles>'));
  }
  for (const template of templateParts) {
    parts[`word/${template.name}`] = strToU8(`<w:${template.kind === 'header' ? 'hdr' : 'ftr'} xmlns:w="${WORD_NS}" xmlns:r="${OFFICE_REL_NS}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">${template.xml}</w:${template.kind === 'header' ? 'hdr' : 'ftr'}>`);
    parts[`word/_rels/${template.name}.rels`] = strToU8(`<Relationships xmlns="${REL_NS}">${[...context.hyperlinks].map(([id, target]) => `<Relationship Id="${id}" Type="${OFFICE_REL_NS}/hyperlink" Target="${xmlEscape(target)}" TargetMode="External"/>`).join('')}${context.media.map(item => `<Relationship Id="${item.relationshipId}" Type="${OFFICE_REL_NS}/image" Target="media/${xmlEscape(item.fileName)}"/>`).join('')}</Relationships>`);
    parts['[Content_Types].xml'] = strToU8(strFromU8(parts['[Content_Types].xml']!).replace('</Types>', `<Override PartName="/word/${template.name}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${template.kind}+xml"/></Types>`));
    parts['word/_rels/document.xml.rels'] = strToU8(strFromU8(parts['word/_rels/document.xml.rels']!).replace('</Relationships>', `<Relationship Id="${template.id}" Type="${OFFICE_REL_NS}/${template.kind}" Target="${template.name}"/></Relationships>`));
  }
  if (evenPages) {
    parts['word/settings.xml'] = strToU8(`<w:settings xmlns:w="${WORD_NS}"><w:evenAndOddHeaders/></w:settings>`);
    parts['[Content_Types].xml'] = strToU8(strFromU8(parts['[Content_Types].xml']!).replace('</Types>', '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>'));
    parts['word/_rels/document.xml.rels'] = strToU8(strFromU8(parts['word/_rels/document.xml.rels']!).replace('</Relationships>', `<Relationship Id="rIdSettings" Type="${OFFICE_REL_NS}/settings" Target="settings.xml"/></Relationships>`));
  }
  for (const item of context.media) parts[`word/media/${item.fileName}`] = item.bytes;
  const bytes = zipSync(parts, { level: 6 });
  return Object.freeze({ bytes, report: report(issues) });
}
