import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { Node as FountainNode, type Mark, type Schema } from '../core/schema';
import { isSafeURL } from '../core/url';

export type DOCXIssueSeverity = 'info' | 'warning' | 'error';

export interface DOCXIssue {
  readonly code: string;
  readonly severity: DOCXIssueSeverity;
  readonly message: string;
  readonly path?: readonly number[];
}

export interface DOCXReport {
  readonly format: 'docx';
  readonly fidelity: 'bounded' | 'lossy';
  readonly issues: readonly DOCXIssue[];
}

export interface DOCXImportResult {
  readonly document: FountainNode;
  readonly report: DOCXReport;
}

export interface DOCXExportResult {
  readonly bytes: Uint8Array;
  readonly report: DOCXReport;
}

export interface DOCXLimits {
  readonly maxArchiveBytes?: number;
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
}

export interface DOCXExportOptions extends Pick<DOCXLimits, 'maxMediaBytes' | 'maxMediaFiles'> {
  readonly title?: string;
  readonly creator?: string;
  readonly description?: string;
  readonly page?: 'a4' | 'letter';
  /** Resolves non-data image sources without giving the converter network access. */
  readonly resolveImage?: (source: string, node: FountainNode, path: readonly number[]) => DOCXExportImage | undefined;
}

const DEFAULT_LIMITS: Required<DOCXLimits> = {
  maxArchiveBytes: 25 * 1024 * 1024,
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

type XMLChild = XMLElement | string;
interface XMLElement {
  readonly name: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: XMLChild[];
}

interface ParsedParagraph {
  readonly node: FountainNode;
  readonly list?: { readonly level: number; readonly ordered: boolean; readonly start: number };
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

function decodeXML(value: string): string {
  return value.replace(/&(?:#(x[\da-f]+|\d+)|amp|lt|gt|quot|apos);/gi, (entity, numeric: string | undefined) => {
    if (numeric) {
      const codePoint = Number.parseInt(numeric[0]?.toLowerCase() === 'x' ? numeric.slice(1) : numeric, numeric[0]?.toLowerCase() === 'x' ? 16 : 10);
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : '\ufffd';
    }
    return ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" } as Record<string, string>)[entity.toLowerCase()] ?? entity;
  });
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(pattern)) attrs[match[1]!] = decodeXML(match[2] ?? match[3] ?? '');
  return attrs;
}

function parseXML(source: string, limits: Required<DOCXLimits>): XMLElement {
  const root: XMLElement = { name: '#document', attrs: {}, children: [] };
  const stack: XMLElement[] = [root];
  let nodes = 1;
  const tokens = source.match(/<!--[\s\S]*?-->|<\?[^>]*\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<[^>]+>|[^<]+/g) ?? [];
  for (const token of tokens) {
    if (token.startsWith('<!--') || token.startsWith('<?') || (token.startsWith('<!') && !token.startsWith('<![CDATA['))) continue;
    if (token.startsWith('<![CDATA[')) {
      stack.at(-1)!.children.push(token.slice(9, -3));
      continue;
    }
    if (!token.startsWith('<')) {
      if (token) stack.at(-1)!.children.push(decodeXML(token));
      continue;
    }
    if (token.startsWith('</')) {
      const closing = token.slice(2, -1).trim();
      const current = stack.pop();
      if (!current || current.name !== closing || stack.length === 0) throw new Error(`Malformed DOCX XML near </${closing}>.`);
      continue;
    }
    const selfClosing = /\/\s*>$/.test(token);
    const body = token.slice(1, selfClosing ? token.lastIndexOf('/') : -1).trim();
    const split = body.search(/\s/);
    const name = split < 0 ? body : body.slice(0, split);
    if (!name) throw new Error('Malformed DOCX XML start tag.');
    nodes += 1;
    if (nodes > limits.maxXmlNodes) throw new Error(`DOCX XML exceeds ${limits.maxXmlNodes} nodes.`);
    if (!selfClosing && stack.length >= limits.maxXmlDepth) throw new Error(`DOCX XML exceeds depth ${limits.maxXmlDepth}.`);
    const element: XMLElement = { name, attrs: parseAttributes(split < 0 ? '' : body.slice(split + 1)), children: [] };
    stack.at(-1)!.children.push(element);
    if (!selfClosing) stack.push(element);
  }
  if (stack.length !== 1) throw new Error('DOCX XML contains unclosed elements.');
  return root;
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

function runMarks(run: XMLElement, schema: Schema, hyperlink?: string): Mark[] {
  const properties = child(run, 'rPr');
  const result: Mark[] = [];
  const enabled = (name: string) => {
    const value = attr(child(properties, name), 'val');
    return Boolean(child(properties, name)) && value !== '0' && value !== 'false' && value !== 'none';
  };
  const add = (value: Mark | undefined) => { if (value && !result.some((item) => item.type === value.type)) result.push(value); };
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
}

function wordPartPath(target: string): string | undefined {
  const normalized = target.replace(/\\/g, '/');
  if (!normalized || /^[A-Za-z][A-Za-z\d+.-]*:/.test(normalized) || normalized.startsWith('//')) return undefined;
  const source = normalized.startsWith('/') ? normalized.slice(1) : `word/${normalized}`;
  const parts: string[] = [];
  for (const part of source.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return undefined;
      parts.pop();
    } else parts.push(part);
  }
  const result = parts.join('/');
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
  const partPath = wordPartPath(relationship.target);
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
  return schema.node('inline_image', {
    src: source, alt, title, width, height, align: 'center', srcset: '', sizes: '', loading: 'lazy', decoding: 'async',
  });
}

function inlineContent(container: XMLElement, schema: Schema, media: ImportMediaContext, issues: DOCXIssue[], path: readonly number[]): FountainNode[] {
  const output: FountainNode[] = [];
  const appendText = (value: string, marks: readonly Mark[]) => {
    if (!value) return;
    const previous = output.at(-1);
    if (previous?.isText && previous.marks.length === marks.length && previous.marks.every((item, index) => item.eq(marks[index]!))) {
      output[output.length - 1] = previous.withText((previous.text ?? '') + value);
    } else output.push(schema.text(value, marks));
  };
  const visit = (element: XMLElement, hyperlink?: string) => {
    const name = localName(element.name);
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
      const marks = runMarks(element, schema, hyperlink);
      for (const item of elements(element)) {
        const itemName = localName(item.name);
        if (itemName === 't' || itemName === 'delText' || itemName === 'instrText') appendText(textContent(item), marks);
        else if (itemName === 'tab') appendText('\t', marks);
        else if (itemName === 'br' || itemName === 'cr') {
          if (schema.nodes.hard_break) output.push(schema.node('hard_break'));
          else appendText('\n', marks);
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
  }
  return levels;
}

function parseParagraph(element: XMLElement, schema: Schema, media: ImportMediaContext, numbering: ReadonlyMap<string, NumberingLevel>, issues: DOCXIssue[], path: readonly number[]): ParsedParagraph {
  const properties = child(element, 'pPr');
  const style = attr(child(properties, 'pStyle'), 'val') ?? '';
  const alignment = attr(child(properties, 'jc'), 'val');
  const align = alignment === 'both' ? 'justify' : ['left', 'center', 'right', 'justify'].includes(alignment ?? '') ? alignment : 'left';
  const content = inlineContent(element, schema, media, issues, path);
  let type = 'paragraph';
  let attrs: Record<string, unknown> = { align };
  const heading = /^heading([1-6])$/i.exec(style);
  if (heading && schema.nodes.heading) {
    type = 'heading';
    attrs = { level: Number(heading[1]), align };
  } else if (/^(?:intense)?quote$/i.test(style) && schema.nodes.blockquote) {
    const paragraph = schema.node('paragraph', { align }, content);
    return { node: schema.node('blockquote', {}, [paragraph]) };
  } else if (/code/i.test(style) && schema.nodes.code_block) {
    return { node: schema.node('code_block', { language: '' }, content) };
  }
  if (type === 'paragraph' && content.length === 1 && content[0]?.type.name === 'inline_image' && schema.nodes.image_super) {
    return { node: schema.node('image_super', { ...content[0].attrs, caption: '' }) };
  }
  const paragraph = schema.node(type, attrs, content);
  const numPr = child(properties, 'numPr');
  const numId = attr(child(numPr, 'numId'), 'val');
  const level = Number(attr(child(numPr, 'ilvl'), 'val') ?? 0);
  const definition = numId ? numbering.get(`${numId}:${level}`) ?? numbering.get(`${numId}:0`) : undefined;
  if (definition) return { node: paragraph, list: { level: Math.max(0, Math.min(8, level)), ...definition } };
  const listStyle = /^list(bullet|number)(\d+)?$/i.exec(style);
  if (listStyle) return {
    node: paragraph,
    list: {
      level: Math.max(0, Math.min(8, Number(listStyle[2] ?? 1) - 1)),
      ordered: listStyle[1]!.toLowerCase() === 'number',
      start: 1,
    },
  };
  return { node: paragraph, caption: /^caption$/i.test(style) };
}

function groupLists(items: readonly ParsedParagraph[], schema: Schema, issues: DOCXIssue[]): FountainNode[] {
  const output: FountainNode[] = [];
  let cursor = 0;
  const parseList = (level: number, ordered: boolean): FountainNode => {
    const listItems: FountainNode[] = [];
    const start = items[cursor]?.list?.start ?? 1;
    while (cursor < items.length) {
      const current = items[cursor]!;
      if (!current.list || current.list.level < level || (current.list.level === level && current.list.ordered !== ordered)) break;
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
      const children: FountainNode[] = [current.node];
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
    if (!current.list) { output.push(current.node); cursor += 1; continue; }
    output.push(parseList(current.list.level, current.list.ordered));
  }
  return output;
}

function parseTable(element: XMLElement, schema: Schema, media: ImportMediaContext, numbering: ReadonlyMap<string, NumberingLevel>, issues: DOCXIssue[], path: readonly number[]): FountainNode {
  interface MutableCell { content: FountainNode[]; colspan: number; rowspan: number; header: boolean; continuation: boolean }
  const rows: MutableCell[][] = [];
  const active = new Map<number, MutableCell>();
  for (const [rowIndex, row] of elements(element, 'tr').entries()) {
    const cells: MutableCell[] = [];
    let column = 0;
    const rowHeader = Boolean(child(child(row, 'trPr'), 'tblHeader'));
    for (const [cellIndex, cell] of elements(row, 'tc').entries()) {
      while (active.has(column) && !elements(cell, 'tcPr').length) column += 1;
      const properties = child(cell, 'tcPr');
      const colspan = Math.max(1, Number(attr(child(properties, 'gridSpan'), 'val') ?? 1) || 1);
      const merge = child(properties, 'vMerge');
      const mergeValue = attr(merge, 'val');
      const continuation = Boolean(merge) && mergeValue !== 'restart';
      if (continuation) {
        const origin = active.get(column);
        if (origin) origin.rowspan += 1;
        else issues.push({ code: 'orphan-table-vmerge', severity: 'warning', message: 'An orphaned vertical table merge was ignored.', path: [...path, rowIndex, cellIndex] });
        column += colspan;
        continue;
      }
      const paragraphs: FountainNode[] = [];
      const pendingParagraphs: ParsedParagraph[] = [];
      const flushParagraphs = () => {
        if (pendingParagraphs.length) paragraphs.push(...groupLists(pendingParagraphs.splice(0), schema, issues));
      };
      elements(cell).filter((item) => ['p', 'tbl'].includes(localName(item.name))).forEach((item, index) => {
        if (localName(item.name) === 'p') {
          const parsed = parseParagraph(item, schema, media, numbering, issues, [...path, rowIndex, cellIndex, index]);
          if (parsed.caption) {
            flushParagraphs();
            const image = paragraphs.at(-1);
            if (image?.type.name === 'image_super' && parsed.node.textContent.trim()) {
              paragraphs[paragraphs.length - 1] = schema.node('image_super', { ...image.attrs, caption: parsed.node.textContent });
            } else pendingParagraphs.push({ node: parsed.node });
          } else pendingParagraphs.push(parsed);
        } else {
          flushParagraphs();
          paragraphs.push(parseTable(item, schema, media, numbering, issues, [...path, rowIndex, cellIndex, index]));
        }
      });
      flushParagraphs();
      const content = paragraphs.length ? paragraphs : [schema.node('paragraph')];
      const mutable: MutableCell = { content, colspan, rowspan: 1, header: rowHeader, continuation: false };
      cells.push(mutable);
      if (mergeValue === 'restart') for (let offset = 0; offset < colspan; offset += 1) active.set(column + offset, mutable);
      else for (let offset = 0; offset < colspan; offset += 1) active.delete(column + offset);
      column += colspan;
    }
    rows.push(cells);
  }
  const rowNodes = rows.map((row) => schema.node('table_row', {}, row.map((cell) => schema.node(
    cell.header && schema.nodes.table_header ? 'table_header' : 'table_cell',
    cell.header && schema.nodes.table_header
      ? { colspan: cell.colspan, rowspan: cell.rowspan, colwidth: null, background: '', scope: 'col' }
      : { colspan: cell.colspan, rowspan: cell.rowspan, colwidth: null, background: '' },
    cell.content,
  ))));
  return schema.node('table', {}, rowNodes.length ? rowNodes : [schema.node('table_row', {}, [schema.node('table_cell', {}, [schema.node('paragraph')])])]);
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

export function importDOCX(input: Uint8Array | ArrayBuffer, schema: Schema, options: DOCXImportOptions = {}): DOCXImportResult {
  const limits = requiredLimits(options);
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > limits.maxArchiveBytes) throw new RangeError(`DOCX archive exceeds ${limits.maxArchiveBytes} bytes.`);
  let expanded = 0;
  let mediaBytes = 0;
  let mediaFiles = 0;
  const wanted = new Set(['word/document.xml', 'word/numbering.xml', 'word/_rels/document.xml.rels']);
  const archive = unzipSync(bytes, { filter: (file) => {
    const isMedia = /^word\/media\/[^/]+$/i.test(file.name);
    if (!wanted.has(file.name) && !isMedia) return false;
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
  const documentXML = parseXML(strFromU8(documentBytes), limits);
  const numbering = readNumbering(parse('word/numbering.xml'));
  const relationships = relationshipMap(parse('word/_rels/document.xml.rels'));
  const media: ImportMediaContext = { archive, relationships, options };
  const body = descendants(documentXML, 'body')[0];
  if (!body) throw new Error('Invalid DOCX: document body is missing.');
  const issues: DOCXIssue[] = [];
  const paragraphs: ParsedParagraph[] = [];
  const blocks: FountainNode[] = [];
  const flush = () => { if (paragraphs.length) blocks.push(...groupLists(paragraphs.splice(0), schema, issues)); };
  for (const [index, item] of elements(body).entries()) {
    const name = localName(item.name);
    if (name === 'p') {
      const parsed = parseParagraph(item, schema, media, numbering, issues, [index]);
      if (parsed.caption) {
        flush();
        const image = blocks.at(-1);
        if (image?.type.name === 'image_super' && parsed.node.textContent.trim()) {
          blocks[blocks.length - 1] = schema.node('image_super', { ...image.attrs, caption: parsed.node.textContent });
        } else paragraphs.push({ node: parsed.node });
      } else paragraphs.push(parsed);
    }
    else if (name === 'tbl') { flush(); blocks.push(parseTable(item, schema, media, numbering, issues, [index])); }
    else if (name !== 'sectPr') issues.push({ code: 'unsupported-block', severity: 'warning', message: `Unsupported Word block ${name} was omitted.`, path: [index] });
  }
  flush();
  const fallback = schema.nodes.paragraph ? schema.node('paragraph') : undefined;
  const document = schema.node('doc', {}, blocks.length ? blocks : fallback ? [fallback] : []);
  schema.validate(document);
  return Object.freeze({ document, report: report(issues) });
}

interface ExportedMedia {
  readonly relationshipId: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly contentType: DOCXImageContentType;
}

interface ExportContext {
  readonly hyperlinks: Map<string, string>;
  readonly mediaBySource: Map<string, ExportedMedia>;
  readonly media: ExportedMedia[];
  readonly issues: DOCXIssue[];
  readonly options: DOCXExportOptions;
  readonly maxMediaBytes: number;
  readonly maxMediaFiles: number;
  mediaBytes: number;
  nextDrawingId: number;
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

function runProperties(marks: readonly Mark[]): { xml: string; hyperlink?: string; unsupported: string[] } {
  const properties: string[] = [];
  let hyperlink: string | undefined;
  const unsupported: string[] = [];
  for (const item of marks) {
    switch (item.type.name) {
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

function textRuns(node: FountainNode, context: ExportContext, path: readonly number[]): string {
  return node.content.map((inline, index) => {
    if (inline.type.name === 'hard_break') return '<w:r><w:br/></w:r>';
    if (inline.type.name === 'inline_image') {
      const drawing = imageRun(inline, context, [...path, index]);
      if (drawing) return drawing;
    }
    if (!inline.isText) {
      context.issues.push({ code: 'inline-fallback', severity: 'warning', message: `${inline.type.name} was exported as readable fallback text.`, path: [...path, index] });
    }
    const value = inline.textContent;
    const { xml, hyperlink, unsupported } = runProperties(inline.marks);
    unsupported.forEach((name) => context.issues.push({ code: 'unsupported-mark', severity: 'warning', message: `Word export omitted the ${name} mark.`, path: [...path, index] }));
    const preserve = /^\s|\s$|\s{2,}|\t/.test(value) ? ' xml:space="preserve"' : '';
    const pieces = value.split('\t').map((part, pieceIndex) => `${pieceIndex ? '<w:tab/>' : ''}${part ? `<w:t${preserve}>${xmlEscape(part)}</w:t>` : ''}`).join('');
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

function paragraphXML(node: FountainNode, context: ExportContext, path: readonly number[], list?: { numId: number; level: number }): string {
  const properties: string[] = [];
  if (node.type.name === 'heading') properties.push(`<w:pStyle w:val="Heading${Math.max(1, Math.min(6, Number(node.attrs.level) || 1))}"/>`);
  if (node.type.name === 'code_block') properties.push('<w:pStyle w:val="Code"/>');
  const align = String(node.attrs.align ?? 'left');
  if (align !== 'left') properties.push(`<w:jc w:val="${align === 'justify' ? 'both' : xmlEscape(align)}"/>`);
  if (list) properties.push(`<w:numPr><w:ilvl w:val="${list.level}"/><w:numId w:val="${list.numId}"/></w:numPr>`);
  return `<w:p>${properties.length ? `<w:pPr>${properties.join('')}</w:pPr>` : ''}${textRuns(node, context, path)}</w:p>`;
}

function tableXML(node: FountainNode, context: ExportContext, path: readonly number[]): string {
  const continuations = new Map<number, Array<{ column: number; colspan: number }>>();
  const rows = node.content.map((row, rowIndex) => {
    const pending = [...(continuations.get(rowIndex) ?? [])].sort((left, right) => left.column - right.column);
    let continuationIndex = 0;
    let sourceIndex = 0;
    let column = 0;
    const cells: string[] = [];
    while (sourceIndex < row.content.length || continuationIndex < pending.length) {
      const continuation = pending[continuationIndex];
      if (continuation?.column === column) {
        cells.push(`<w:tc><w:tcPr>${continuation.colspan > 1 ? `<w:gridSpan w:val="${continuation.colspan}"/>` : ''}<w:vMerge/></w:tcPr><w:p/></w:tc>`);
        column += continuation.colspan;
        continuationIndex += 1;
        continue;
      }
      if (continuation && continuation.column < column) { continuationIndex += 1; continue; }
      const cell = row.content[sourceIndex++];
      if (!cell) break;
      const colspan = Math.max(1, Number(cell.attrs.colspan) || 1);
      const rowspan = Math.max(1, Number(cell.attrs.rowspan) || 1);
      const properties = [
        colspan > 1 ? `<w:gridSpan w:val="${colspan}"/>` : '',
        rowspan > 1 ? '<w:vMerge w:val="restart"/>' : '',
        cell.type.name === 'table_header' ? '<w:shd w:val="clear" w:color="auto" w:fill="EDE9FE"/>' : '',
      ].join('');
      cells.push(`<w:tc><w:tcPr>${properties}</w:tcPr>${cell.content.map((block, blockIndex) => blockXML(block, context, [...path, rowIndex, sourceIndex - 1, blockIndex])).join('') || '<w:p/>'}</w:tc>`);
      for (let offset = 1; offset < rowspan; offset += 1) {
        if (rowIndex + offset >= node.content.length) {
          context.issues.push({ code: 'table-rowspan-clipped', severity: 'warning', message: 'A table rowspan extending beyond the final row was clipped.', path: [...path, rowIndex, sourceIndex - 1] });
          break;
        }
        const target = continuations.get(rowIndex + offset) ?? [];
        target.push({ column, colspan });
        continuations.set(rowIndex + offset, target);
      }
      column += colspan;
      while (continuation && column > continuation.column && continuationIndex < pending.length) continuationIndex += 1;
    }
    const rowProperties = row.content.length > 0 && row.content.every((cell) => cell.type.name === 'table_header')
      ? '<w:trPr><w:tblHeader/></w:trPr>'
      : '';
    return `<w:tr>${rowProperties}${cells.join('')}</w:tr>`;
  }).join('');
  const columnCount = Math.max(1, ...node.content.map((row) => row.content.reduce((total, cell) => total + Math.max(1, Number(cell.attrs.colspan) || 1), 0)));
  const grid = `<w:tblGrid>${Array.from({ length: columnCount }, () => '<w:gridCol w:w="2400"/>').join('')}</w:tblGrid>`;
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="6" w:color="C9C2D8"/><w:left w:val="single" w:sz="6" w:color="C9C2D8"/><w:bottom w:val="single" w:sz="6" w:color="C9C2D8"/><w:right w:val="single" w:sz="6" w:color="C9C2D8"/><w:insideH w:val="single" w:sz="6" w:color="D9D3E5"/><w:insideV w:val="single" w:sz="6" w:color="D9D3E5"/></w:tblBorders><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr>${grid}${rows}</w:tbl>`;
}

function blockXML(node: FountainNode, context: ExportContext, path: readonly number[], level = 0): string {
  switch (node.type.name) {
    case 'paragraph': case 'heading': case 'code_block': return paragraphXML(node, context, path);
    case 'blockquote': return node.content.map((item, index) => {
      const base = paragraphXML(item.type.name === 'paragraph' ? item : item.type.schema.node('paragraph', {}, [item]), context, [...path, index]);
      return base.replace('<w:p>', '<w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr>');
    }).join('');
    case 'bullet_list': case 'ordered_list': {
      const numId = node.type.name === 'ordered_list' ? 2 : 1;
      if (node.type.name === 'ordered_list' && Number(node.attrs.start) !== 1) {
        context.issues.push({ code: 'ordered-list-start-normalized', severity: 'warning', message: 'DOCX export currently normalizes a custom ordered-list start to 1.', path });
      }
      return node.content.map((item, index) => item.content.map((block, childIndex) => {
        if (block.type.name === 'bullet_list' || block.type.name === 'ordered_list') return blockXML(block, context, [...path, index, childIndex], Math.min(8, level + 1));
        return paragraphXML(block, context, [...path, index, childIndex], { numId, level });
      }).join('')).join('');
    }
    case 'table': return tableXML(node, context, path);
    case 'image_super': {
      const drawing = imageRun(node, context, path);
      if (!drawing) return `<w:p><w:r><w:t>${xmlEscape(node.textContent)}</w:t></w:r></w:p>`;
      const caption = String(node.attrs.caption ?? '').trim();
      const align = ['left', 'center', 'right'].includes(String(node.attrs.align)) ? String(node.attrs.align) : 'center';
      return `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="120" w:after="80"/></w:pPr>${drawing}</w:p>${caption ? `<w:p><w:pPr><w:pStyle w:val="Caption"/></w:pPr><w:r><w:t>${xmlEscape(caption)}</w:t></w:r></w:p>` : ''}`;
    }
    case 'horizontal_rule': return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>';
    default:
      context.issues.push({ code: 'block-fallback', severity: 'warning', message: `${node.type.name} was exported as readable fallback text.`, path });
      return `<w:p><w:r><w:t>${xmlEscape(node.textContent)}</w:t></w:r></w:p>`;
  }
}

function contentTypes(media: readonly ExportedMedia[]): string {
  const defaults = [...new Map(media.map((item) => [extensionFor(item.contentType), item.contentType])).entries()]
    .map(([extension, contentType]) => `<Default Extension="${extension}" ContentType="${contentType}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${defaults}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

const HEADING_SIZES = [64, 52, 44, 36, 30, 26] as const;
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:style>${HEADING_SIZES.map((size, index) => `<w:style w:type="paragraph" w:styleId="Heading${index + 1}"><w:name w:val="heading ${index + 1}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${index === 0 ? 360 : 240}" w:after="160"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="181426"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`).join('')}<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="left"/><w:ind w:left="360" w:right="360"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="12" w:color="7047FF"/></w:pBdr><w:spacing w:before="160" w:after="200"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="51476A"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:i/><w:color w:val="6B6378"/><w:sz w:val="19"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:fill="F2EFF8"/><w:spacing w:before="120" w:after="160"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="character" w:styleId="CodeChar"><w:name w:val="Code Char"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:shd w:val="clear" w:fill="F2EFF8"/></w:rPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style></w:styles>`;

const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1">${Array.from({ length: 9 }, (_, level) => `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl>`).join('')}</w:abstractNum><w:abstractNum w:abstractNumId="2">${Array.from({ length: 9 }, (_, level) => `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${level + 1}."/></w:lvl>`).join('')}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num></w:numbering>`;

export function exportDOCX(node: FountainNode, options: DOCXExportOptions = {}): DOCXExportResult {
  if (node.type.name !== 'doc') throw new TypeError('exportDOCX requires a document node.');
  node.type.schema.validate(node);
  const issues: DOCXIssue[] = [];
  const context: ExportContext = {
    hyperlinks: new Map(), mediaBySource: new Map(), media: [], issues, options,
    maxMediaBytes: exportLimit(options.maxMediaBytes, DEFAULT_LIMITS.maxMediaBytes, 'maxMediaBytes'),
    maxMediaFiles: exportLimit(options.maxMediaFiles, DEFAULT_LIMITS.maxMediaFiles, 'maxMediaFiles'),
    mediaBytes: 0, nextDrawingId: 1,
  };
  const body = node.content.map((block, index) => blockXML(block, context, [index])).join('');
  const letter = options.page === 'letter';
  const section = `<w:sectPr><w:pgSz w:w="${letter ? 12240 : 11906}" w:h="${letter ? 15840 : 16838}"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
  const documentXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}${section}</w:body></w:document>`;
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${[...context.hyperlinks].map(([id, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(target)}" TargetMode="External"/>`).join('')}${context.media.map((item) => `<Relationship Id="${item.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${xmlEscape(item.fileName)}"/>`).join('')}</Relationships>`;
  const now = new Date().toISOString();
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(options.title)}</dc:title><dc:creator>${xmlEscape(options.creator ?? 'FountainJS')}</dc:creator><dc:description>${xmlEscape(options.description)}</dc:description><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>FountainJS</Application></Properties>`;
  const parts: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypes(context.media)),
    '_rels/.rels': strToU8(ROOT_RELS),
    'word/document.xml': strToU8(documentXML),
    'word/styles.xml': strToU8(STYLES),
    'word/numbering.xml': strToU8(NUMBERING),
    'word/_rels/document.xml.rels': strToU8(documentRels),
    'docProps/core.xml': strToU8(core),
    'docProps/app.xml': strToU8(app),
  };
  for (const item of context.media) parts[`word/media/${item.fileName}`] = item.bytes;
  const bytes = zipSync(parts, { level: 6 });
  return Object.freeze({ bytes, report: report(issues) });
}
