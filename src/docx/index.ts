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
  readonly maxXmlNodes?: number;
  readonly maxXmlDepth?: number;
}

export interface DOCXImportOptions extends DOCXLimits {}

export interface DOCXExportOptions {
  readonly title?: string;
  readonly creator?: string;
  readonly description?: string;
  readonly page?: 'a4' | 'letter';
}

const DEFAULT_LIMITS: Required<DOCXLimits> = {
  maxArchiveBytes: 25 * 1024 * 1024,
  maxExpandedBytes: 80 * 1024 * 1024,
  maxDocumentXmlBytes: 25 * 1024 * 1024,
  maxXmlNodes: 500_000,
  maxXmlDepth: 128,
};

type XMLChild = XMLElement | string;
interface XMLElement {
  readonly name: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: XMLChild[];
}

interface ParsedParagraph {
  readonly node: FountainNode;
  readonly list?: { readonly level: number; readonly ordered: boolean; readonly start: number };
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

function inlineContent(container: XMLElement, schema: Schema, relationships: ReadonlyMap<string, string>, issues: DOCXIssue[], path: readonly number[]): FountainNode[] {
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
      const target = id ? relationships.get(id) : undefined;
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
          appendText(`[${alt}]`, marks);
          issues.push({ code: 'embedded-object-fallback', severity: 'warning', message: 'An embedded Word object was imported as readable fallback text.', path });
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

function parseParagraph(element: XMLElement, schema: Schema, relationships: ReadonlyMap<string, string>, numbering: ReadonlyMap<string, NumberingLevel>, issues: DOCXIssue[], path: readonly number[]): ParsedParagraph {
  const properties = child(element, 'pPr');
  const style = attr(child(properties, 'pStyle'), 'val') ?? '';
  const alignment = attr(child(properties, 'jc'), 'val');
  const align = alignment === 'both' ? 'justify' : ['left', 'center', 'right', 'justify'].includes(alignment ?? '') ? alignment : 'left';
  const content = inlineContent(element, schema, relationships, issues, path);
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
  return { node: paragraph };
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

function parseTable(element: XMLElement, schema: Schema, relationships: ReadonlyMap<string, string>, numbering: ReadonlyMap<string, NumberingLevel>, issues: DOCXIssue[], path: readonly number[]): FountainNode {
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
          pendingParagraphs.push(parseParagraph(item, schema, relationships, numbering, issues, [...path, rowIndex, cellIndex, index]));
        } else {
          flushParagraphs();
          paragraphs.push(parseTable(item, schema, relationships, numbering, issues, [...path, rowIndex, cellIndex, index]));
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

function relationshipMap(root: XMLElement | undefined): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  if (!root) return map;
  for (const relationship of descendants(root, 'Relationship')) {
    const id = attr(relationship, 'Id');
    const target = attr(relationship, 'Target');
    const mode = attr(relationship, 'TargetMode');
    if (id && target && mode === 'External' && /\/hyperlink$/i.test(attr(relationship, 'Type') ?? '')) map.set(id, target);
  }
  return map;
}

function requiredLimits(options: DOCXLimits): Required<DOCXLimits> {
  const value = { ...DEFAULT_LIMITS, ...options };
  for (const [name, limit] of Object.entries(value)) if (!Number.isSafeInteger(limit) || limit <= 0) throw new RangeError(`${name} must be a positive safe integer.`);
  return value;
}

export function importDOCX(input: Uint8Array | ArrayBuffer, schema: Schema, options: DOCXImportOptions = {}): DOCXImportResult {
  const limits = requiredLimits(options);
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > limits.maxArchiveBytes) throw new RangeError(`DOCX archive exceeds ${limits.maxArchiveBytes} bytes.`);
  let expanded = 0;
  const wanted = new Set(['word/document.xml', 'word/numbering.xml', 'word/_rels/document.xml.rels']);
  const archive = unzipSync(bytes, { filter: (file) => {
    if (!wanted.has(file.name)) return false;
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
  const body = descendants(documentXML, 'body')[0];
  if (!body) throw new Error('Invalid DOCX: document body is missing.');
  const issues: DOCXIssue[] = [];
  const paragraphs: ParsedParagraph[] = [];
  const blocks: FountainNode[] = [];
  const flush = () => { if (paragraphs.length) blocks.push(...groupLists(paragraphs.splice(0), schema, issues)); };
  for (const [index, item] of elements(body).entries()) {
    const name = localName(item.name);
    if (name === 'p') paragraphs.push(parseParagraph(item, schema, relationships, numbering, issues, [index]));
    else if (name === 'tbl') { flush(); blocks.push(parseTable(item, schema, relationships, numbering, issues, [index])); }
    else if (name !== 'sectPr') issues.push({ code: 'unsupported-block', severity: 'warning', message: `Unsupported Word block ${name} was omitted.`, path: [index] });
  }
  flush();
  const fallback = schema.nodes.paragraph ? schema.node('paragraph') : undefined;
  const document = schema.node('doc', {}, blocks.length ? blocks : fallback ? [fallback] : []);
  schema.validate(document);
  return Object.freeze({ document, report: report(issues) });
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

function textRuns(node: FountainNode, relationships: Map<string, string>, issues: DOCXIssue[], path: readonly number[]): string {
  return node.content.map((inline, index) => {
    if (inline.type.name === 'hard_break') return '<w:r><w:br/></w:r>';
    if (!inline.isText) {
      issues.push({ code: 'inline-fallback', severity: 'warning', message: `${inline.type.name} was exported as readable fallback text.`, path: [...path, index] });
    }
    const value = inline.textContent;
    const { xml, hyperlink, unsupported } = runProperties(inline.marks);
    unsupported.forEach((name) => issues.push({ code: 'unsupported-mark', severity: 'warning', message: `Word export omitted the ${name} mark.`, path: [...path, index] }));
    const preserve = /^\s|\s$|\s{2,}|\t/.test(value) ? ' xml:space="preserve"' : '';
    const pieces = value.split('\t').map((part, pieceIndex) => `${pieceIndex ? '<w:tab/>' : ''}${part ? `<w:t${preserve}>${xmlEscape(part)}</w:t>` : ''}`).join('');
    const run = `<w:r>${xml}${pieces}</w:r>`;
    if (!hyperlink) return run;
    if (!isSafeURL(hyperlink, { allowEmpty: false })) {
      issues.push({ code: 'unsafe-hyperlink-omitted', severity: 'warning', message: 'An unsafe hyperlink target was omitted from Word output while its text was preserved.', path: [...path, index] });
      return run;
    }
    let id = [...relationships.entries()].find(([, target]) => target === hyperlink)?.[0];
    if (!id) { id = `rId${relationships.size + 1}`; relationships.set(id, hyperlink); }
    return `<w:hyperlink r:id="${id}" w:history="1">${run}</w:hyperlink>`;
  }).join('');
}

function paragraphXML(node: FountainNode, relationships: Map<string, string>, issues: DOCXIssue[], path: readonly number[], list?: { numId: number; level: number }): string {
  const properties: string[] = [];
  if (node.type.name === 'heading') properties.push(`<w:pStyle w:val="Heading${Math.max(1, Math.min(6, Number(node.attrs.level) || 1))}"/>`);
  if (node.type.name === 'code_block') properties.push('<w:pStyle w:val="Code"/>');
  const align = String(node.attrs.align ?? 'left');
  if (align !== 'left') properties.push(`<w:jc w:val="${align === 'justify' ? 'both' : xmlEscape(align)}"/>`);
  if (list) properties.push(`<w:numPr><w:ilvl w:val="${list.level}"/><w:numId w:val="${list.numId}"/></w:numPr>`);
  return `<w:p>${properties.length ? `<w:pPr>${properties.join('')}</w:pPr>` : ''}${textRuns(node, relationships, issues, path)}</w:p>`;
}

function tableXML(node: FountainNode, relationships: Map<string, string>, issues: DOCXIssue[], path: readonly number[]): string {
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
      cells.push(`<w:tc><w:tcPr>${properties}</w:tcPr>${cell.content.map((block, blockIndex) => blockXML(block, relationships, issues, [...path, rowIndex, sourceIndex - 1, blockIndex])).join('') || '<w:p/>'}</w:tc>`);
      for (let offset = 1; offset < rowspan; offset += 1) {
        if (rowIndex + offset >= node.content.length) {
          issues.push({ code: 'table-rowspan-clipped', severity: 'warning', message: 'A table rowspan extending beyond the final row was clipped.', path: [...path, rowIndex, sourceIndex - 1] });
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
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr>${grid}${rows}</w:tbl>`;
}

function blockXML(node: FountainNode, relationships: Map<string, string>, issues: DOCXIssue[], path: readonly number[], level = 0): string {
  switch (node.type.name) {
    case 'paragraph': case 'heading': case 'code_block': return paragraphXML(node, relationships, issues, path);
    case 'blockquote': return node.content.map((item, index) => {
      const base = paragraphXML(item.type.name === 'paragraph' ? item : item.type.schema.node('paragraph', {}, [item]), relationships, issues, [...path, index]);
      return base.replace('<w:p>', '<w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr>');
    }).join('');
    case 'bullet_list': case 'ordered_list': {
      const numId = node.type.name === 'ordered_list' ? 2 : 1;
      if (node.type.name === 'ordered_list' && Number(node.attrs.start) !== 1) {
        issues.push({ code: 'ordered-list-start-normalized', severity: 'warning', message: 'DOCX export currently normalizes a custom ordered-list start to 1.', path });
      }
      return node.content.map((item, index) => item.content.map((block, childIndex) => {
        if (block.type.name === 'bullet_list' || block.type.name === 'ordered_list') return blockXML(block, relationships, issues, [...path, index, childIndex], Math.min(8, level + 1));
        return paragraphXML(block, relationships, issues, [...path, index, childIndex], { numId: block.type.name === 'paragraph' ? numId : numId, level });
      }).join('')).join('');
    }
    case 'table': return tableXML(node, relationships, issues, path);
    case 'horizontal_rule': return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>';
    default:
      issues.push({ code: 'block-fallback', severity: 'warning', message: `${node.type.name} was exported as readable fallback text.`, path });
      return `<w:p><w:r><w:t>${xmlEscape(node.textContent)}</w:t></w:r></w:p>`;
  }
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults/><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${[1, 2, 3, 4, 5, 6].map((level) => `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>`).join('')}<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/></w:style><w:style w:type="character" w:styleId="CodeChar"><w:name w:val="Code Char"/></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style></w:styles>`;

const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1">${Array.from({ length: 9 }, (_, level) => `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl>`).join('')}</w:abstractNum><w:abstractNum w:abstractNumId="2">${Array.from({ length: 9 }, (_, level) => `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${level + 1}."/></w:lvl>`).join('')}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num></w:numbering>`;

export function exportDOCX(node: FountainNode, options: DOCXExportOptions = {}): DOCXExportResult {
  if (node.type.name !== 'doc') throw new TypeError('exportDOCX requires a document node.');
  node.type.schema.validate(node);
  const issues: DOCXIssue[] = [];
  const relationships = new Map<string, string>();
  const body = node.content.map((block, index) => blockXML(block, relationships, issues, [index])).join('');
  const letter = options.page === 'letter';
  const section = `<w:sectPr><w:pgSz w:w="${letter ? 12240 : 11906}" w:h="${letter ? 15840 : 16838}"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
  const documentXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}${section}</w:body></w:document>`;
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${[...relationships].map(([id, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(target)}" TargetMode="External"/>`).join('')}</Relationships>`;
  const now = new Date().toISOString();
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(options.title)}</dc:title><dc:creator>${xmlEscape(options.creator ?? 'FountainJS')}</dc:creator><dc:description>${xmlEscape(options.description)}</dc:description><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>FountainJS</Application></Properties>`;
  const bytes = zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(ROOT_RELS),
    'word/document.xml': strToU8(documentXML),
    'word/styles.xml': strToU8(STYLES),
    'word/numbering.xml': strToU8(NUMBERING),
    'word/_rels/document.xml.rels': strToU8(documentRels),
    'docProps/core.xml': strToU8(core),
    'docProps/app.xml': strToU8(app),
  }, { level: 6 });
  return Object.freeze({ bytes, report: report(issues) });
}
