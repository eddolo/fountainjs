export type ExternalPasteSource =
  | 'fountain'
  | 'microsoft-word'
  | 'microsoft-excel'
  | 'google-docs'
  | 'mathml'
  | 'generic-html'
  | 'plain-text';

export type ExternalPasteIssueCode =
  | 'fountain-document-fallback'
  | 'unsafe-content-removed'
  | 'source-metadata-removed'
  | 'word-list-normalized'
  | 'word-footnote-normalized'
  | 'spreadsheet-table-preserved'
  | 'mathml-latex-preserved'
  | 'mathml-readable-fallback'
  | 'tracked-change-accepted'
  | 'tracked-change-rejected'
  | 'tracked-change-metadata-dropped'
  | 'external-comments-not-imported'
  | 'rich-html-import-failed';

export interface ExternalPasteIssue {
  readonly code: ExternalPasteIssueCode;
  readonly count: number;
  readonly message: string;
  readonly lossy: boolean;
}

export type ExternalPasteOutcome =
  | 'inserted-fountain-document'
  | 'inserted-rich-html'
  | 'inserted-plain-text'
  | 'inserted-table-grid';

export interface ExternalPasteReport {
  readonly source: ExternalPasteSource;
  readonly outcome: ExternalPasteOutcome;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly issues: readonly ExternalPasteIssue[];
}

export interface ExternalPasteOptions {
  /** Runs source-aware cleanup before schema import. Defaults to true. */
  readonly normalize?: boolean;
  /** Converts Word's visual list paragraphs into semantic lists. Defaults to true. */
  readonly wordLists?: boolean;
  /** How externally tracked insertions/deletions are resolved. Defaults to `accept`. */
  readonly trackedChanges?: 'accept' | 'reject' | 'preserve-visible';
  /** Removes application-only classes, ids, and CSS declarations. Defaults to true. */
  readonly stripSourceMetadata?: boolean;
  /** Receives an immutable report after Fountain inserts clipboard content. */
  readonly onReport?: (report: ExternalPasteReport) => void;
}

export interface ExternalPasteNormalizationResult {
  readonly html: string;
  readonly source: Exclude<ExternalPasteSource, 'plain-text'>;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly issues: readonly ExternalPasteIssue[];
}

interface MutableIssue {
  code: ExternalPasteIssueCode;
  count: number;
  message: string;
  lossy: boolean;
}

const WORD_MARKER = /^\s*(?:(\d+|[A-Za-z]+|[ivxlcdm]+)[.)]|[\u2022\u00b7\u25aa\u25e6\uf0b7o])(?:\s|\u00a0)+/iu;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function record(
  issues: Map<ExternalPasteIssueCode, MutableIssue>,
  code: ExternalPasteIssueCode,
  message: string,
  lossy: boolean,
  count = 1,
): void {
  if (count < 1) return;
  const existing = issues.get(code);
  if (existing) existing.count += count;
  else issues.set(code, { code, count, message, lossy });
}

export function detectExternalPasteSource(html: string): Exclude<ExternalPasteSource, 'plain-text'> {
  const lower = html.toLowerCase();
  if (lower.includes('data-fountain-')) return 'fountain';
  if (lower.includes('schemas-microsoft-com:office:excel')
    || lower.includes('excel.sheet')
    || lower.includes('x:excelworkbook')
    || (lower.includes('<table') && lower.includes('mso-number-format'))) return 'microsoft-excel';
  if (lower.includes('schemas-microsoft-com:office:word')
    || lower.includes('mso-list:')
    || lower.includes('class="mso')
    || lower.includes("class='mso")
    || lower.includes('<!--[if gte mso')) return 'microsoft-word';
  if (lower.includes('docs-internal-guid-') || lower.includes('data-docs-')) return 'google-docs';
  if (/<math(?:\s|>)/iu.test(html)) return 'mathml';
  return 'generic-html';
}

function unwrap(element: Element): void {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  element.remove();
}

function removeTextPrefix(element: Element, length: number): void {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = length;
  let node = walker.nextNode() as Text | null;
  while (node && remaining > 0) {
    const consumed = Math.min(remaining, node.data.length);
    node.data = node.data.slice(consumed);
    remaining -= consumed;
    node = walker.nextNode() as Text | null;
  }
}

interface WordListInfo {
  readonly level: number;
  readonly ordered: boolean;
  readonly markerLength: number;
  readonly listKey: string;
  readonly start: number;
}

function wordListInfo(element: Element): WordListInfo | null {
  if (element.tagName.toLowerCase() !== 'p') return null;
  const style = element.getAttribute('style') ?? '';
  const className = element.getAttribute('class') ?? '';
  if (!/mso-list\s*:/i.test(style) && !/\bMsoListParagraph\b/i.test(className)) return null;
  const ignored = Array.from(element.querySelectorAll<HTMLElement>('[style]'))
    .find((candidate) => /mso-list\s*:\s*ignore/i.test(candidate.getAttribute('style') ?? ''));
  const visible = ignored?.textContent ?? element.textContent ?? '';
  const marker = WORD_MARKER.exec(visible);
  const level = Math.max(1, Number(/\blevel(\d+)\b/i.exec(style)?.[1] ?? 1));
  const listId = /\bmso-list\s*:\s*([^\s;]+)/i.exec(style)?.[1] ?? 'anonymous';
  const override = /\blfo\d+\b/i.exec(style)?.[0] ?? 'default';
  const numericMarker = marker?.[1] && /^\d+$/u.test(marker[1]) ? Number(marker[1]) : 1;
  return {
    level,
    ordered: Boolean(marker?.[1]),
    markerLength: ignored ? 0 : marker?.[0].length ?? 0,
    listKey: `${listId.toLowerCase()}:${override.toLowerCase()}`,
    start: Number.isSafeInteger(numericMarker) && numericMarker >= 0 ? numericMarker : 1,
  };
}

function normalizeWordListGroup(
  paragraphs: readonly Element[],
  issues: Map<ExternalPasteIssueCode, MutableIssue>,
): void {
  const first = paragraphs[0];
  const parent = first?.parentNode;
  if (!first || !parent) return;
  const document = first.ownerDocument;
  const fragment = document.createDocumentFragment();
  const stack: Array<{ level: number; list: HTMLElement; lastItem?: HTMLLIElement }> = [];

  paragraphs.forEach((paragraph) => {
    const info = wordListInfo(paragraph);
    if (!info) return;
    const ignored = Array.from(paragraph.querySelectorAll<HTMLElement>('[style]'))
      .filter((candidate) => /mso-list\s*:\s*ignore/i.test(candidate.getAttribute('style') ?? ''));
    ignored.forEach((candidate) => candidate.remove());
    if (info.markerLength) removeTextPrefix(paragraph, info.markerLength);
    const firstContent = paragraph.firstChild;
    if (firstContent?.nodeType === Node.TEXT_NODE) {
      const text = firstContent as Text;
      text.data = text.data.replace(/^\u00a0+/u, '');
    }

    while (stack.length && info.level < (stack.at(-1)?.level ?? 1)) stack.pop();
    const tagName = info.ordered ? 'ol' : 'ul';
    let current = stack.at(-1);
    if (!current || info.level > current.level) {
      const list = document.createElement(tagName);
      if (tagName === 'ol' && info.start !== 1) list.setAttribute('start', String(info.start));
      if (current?.lastItem) current.lastItem.appendChild(list);
      else fragment.appendChild(list);
      current = { level: info.level, list };
      stack.push(current);
    } else if (current.list.tagName.toLowerCase() !== tagName) {
      stack.pop();
      const list = document.createElement(tagName);
      if (tagName === 'ol' && info.start !== 1) list.setAttribute('start', String(info.start));
      const parentItem = stack.at(-1)?.lastItem;
      if (parentItem) parentItem.appendChild(list);
      else fragment.appendChild(list);
      current = { level: info.level, list };
      stack.push(current);
    }
    const item = document.createElement('li');
    while (paragraph.firstChild) item.appendChild(paragraph.firstChild);
    current.list.appendChild(item);
    current.lastItem = item;
  });

  parent.insertBefore(fragment, first);
  paragraphs.forEach((paragraph) => paragraph.remove());
  record(issues, 'word-list-normalized', 'Word list paragraphs were converted to semantic lists.', false, paragraphs.length);
}

function normalizeWordLists(root: HTMLElement, issues: Map<ExternalPasteIssueCode, MutableIssue>): void {
  const parents = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))].reverse();
  parents.forEach((parent) => {
    const children = Array.from(parent.children);
    let index = 0;
    while (index < children.length) {
      const firstInfo = wordListInfo(children[index] as Element);
      if (!firstInfo) { index += 1; continue; }
      const group: Element[] = [];
      while (index < children.length) {
        const info = wordListInfo(children[index] as Element);
        if (!info || info.listKey !== firstInfo.listKey) break;
        group.push(children[index] as Element);
        index += 1;
      }
      normalizeWordListGroup(group, issues);
    }
  });
}

function safeFootnoteId(value: string): string {
  const normalized = value.replace(/^#/, '').replace(/^_+/, '').replace(/[^A-Za-z0-9._:-]+/g, '-');
  return /^[A-Za-z0-9]/.test(normalized) ? `word-${normalized}`.slice(0, 128) : 'word-footnote';
}

function replaceElementTag(element: HTMLElement, tagName: string): HTMLElement {
  const replacement = element.ownerDocument.createElement(tagName);
  Array.from(element.attributes).forEach((attribute) => replacement.setAttribute(attribute.name, attribute.value));
  while (element.firstChild) replacement.appendChild(element.firstChild);
  element.replaceWith(replacement);
  return replacement;
}

function normalizeWordFootnotes(root: HTMLElement, issues: Map<ExternalPasteIssueCode, MutableIssue>): void {
  let count = 0;
  root.querySelectorAll<HTMLAnchorElement>('a[href^="#_ftn"], a[href^="#_edn"]').forEach((reference) => {
    const target = reference.getAttribute('href') ?? '';
    reference.setAttribute('href', `#${safeFootnoteId(target)}`);
    reference.setAttribute('role', 'doc-noteref');
    count += 1;
  });
  Array.from(root.querySelectorAll<HTMLElement>('[id][style]')).forEach((candidate) => {
    const style = candidate.getAttribute('style') ?? '';
    if (!/mso-element\s*:\s*(?:footnote|endnote)(?:\s|;|$)/i.test(style)
      || /mso-element\s*:\s*(?:footnote|endnote)-list/i.test(style)) return;
    const section = replaceElementTag(candidate, 'section');
    section.id = safeFootnoteId(candidate.id);
    section.setAttribute('role', 'doc-footnote');
    count += 1;
  });
  record(issues, 'word-footnote-normalized', 'Word footnote references and definitions were converted to portable semantic HTML.', false, count);
}

function convertMathML(root: HTMLElement, issues: Map<ExternalPasteIssueCode, MutableIssue>): void {
  Array.from(root.querySelectorAll<HTMLElement>('math')).forEach((math) => {
    const annotation = Array.from(math.querySelectorAll<HTMLElement>('annotation'))
      .find((candidate) => /(?:x-tex|latex)/i.test(candidate.getAttribute('encoding') ?? ''));
    const latex = annotation?.textContent?.trim() ?? '';
    const block = math.getAttribute('display') === 'block';
    const replacement = math.ownerDocument.createElement(block ? 'div' : 'span');
    if (latex) {
      replacement.dataset.fountainMath = block ? 'block' : 'inline';
      replacement.dataset.latex = latex;
      const label = math.getAttribute('aria-label') ?? '';
      if (label) replacement.dataset.mathAriaLabel = label;
      replacement.textContent = latex;
      record(issues, 'mathml-latex-preserved', 'MathML TeX annotations were converted to Fountain math nodes.', false);
    } else {
      replacement.textContent = math.getAttribute('aria-label')?.trim() || math.textContent?.trim() || 'Math expression';
      record(issues, 'mathml-readable-fallback', 'MathML without an embedded TeX annotation was preserved as readable text.', true);
    }
    math.replaceWith(replacement);
  });
}

function preserveSpreadsheetCellFormatting(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('td[style], th[style]').forEach((cell) => {
    const declarations = (cell.getAttribute('style') ?? '').split(';').flatMap((declaration) => {
      const separator = declaration.indexOf(':');
      if (separator < 0) return [];
      const name = declaration.slice(0, separator).trim().toLowerCase();
      if (!['background-color', 'color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'font-family', 'font-size'].includes(name)) return [];
      return [`${name}:${declaration.slice(separator + 1).trim()}`];
    });
    if (!declarations.length) return;
    const structural = Array.from(cell.children).some((child) => /^(?:p|div|ul|ol|table|blockquote|pre)$/i.test(child.tagName));
    if (structural) {
      cell.querySelectorAll<HTMLElement>('p, div, li').forEach((container) => {
        const span = cell.ownerDocument.createElement('span');
        span.setAttribute('style', declarations.join(';'));
        while (container.firstChild) span.appendChild(container.firstChild);
        container.appendChild(span);
      });
      return;
    }
    const span = cell.ownerDocument.createElement('span');
    span.setAttribute('style', declarations.join(';'));
    while (cell.firstChild) span.appendChild(cell.firstChild);
    cell.appendChild(span);
  });
}

function resolveTrackedChanges(
  root: HTMLElement,
  source: Exclude<ExternalPasteSource, 'plain-text'>,
  policy: NonNullable<ExternalPasteOptions['trackedChanges']>,
  issues: Map<ExternalPasteIssueCode, MutableIssue>,
): void {
  if (!['microsoft-word', 'google-docs'].includes(source)) return;
  const inserted = Array.from(root.querySelectorAll<HTMLElement>('ins, .MsoInsertedText'));
  const deleted = Array.from(root.querySelectorAll<HTMLElement>('del, .MsoDeletedText'));
  if (!inserted.length && !deleted.length) return;
  if (policy === 'accept') {
    inserted.forEach(unwrap);
    deleted.forEach((element) => element.remove());
    record(issues, 'tracked-change-accepted', 'External tracked changes were resolved to their accepted text.', true, inserted.length + deleted.length);
  } else if (policy === 'reject') {
    inserted.forEach((element) => element.remove());
    deleted.forEach(unwrap);
    record(issues, 'tracked-change-rejected', 'External tracked changes were resolved to their rejected text.', true, inserted.length + deleted.length);
  } else {
    record(issues, 'tracked-change-metadata-dropped', 'Tracked text remains visible, but proprietary authorship and revision metadata was not imported.', true, inserted.length + deleted.length);
  }
}

function stripUnsafeContent(root: HTMLElement, issues: Map<ExternalPasteIssueCode, MutableIssue>): void {
  const unsafe = Array.from(root.querySelectorAll('script, style, link, meta, base, object, template, noscript, iframe:not([data-fountain-embed])'));
  unsafe.forEach((element) => element.remove());
  let eventAttributes = 0;
  root.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      if (/^on/i.test(attribute.name)) { element.removeAttribute(attribute.name); eventAttributes += 1; }
    });
  });
  record(issues, 'unsafe-content-removed', 'Executable or embedding-only clipboard content was removed.', true, unsafe.length + eventAttributes);
}

function stripMetadata(
  root: HTMLElement,
  source: Exclude<ExternalPasteSource, 'plain-text'>,
  issues: Map<ExternalPasteIssueCode, MutableIssue>,
): void {
  if (source === 'fountain') return;
  let count = 0;
  const comments: Comment[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  let comment = walker.nextNode() as Comment | null;
  while (comment) { comments.push(comment); comment = walker.nextNode() as Comment | null; }
  comments.forEach((candidate) => candidate.remove());
  count += comments.length;

  root.querySelectorAll<HTMLElement>('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name === 'id' && /^docs-internal-guid-/i.test(attribute.value)) {
        element.removeAttribute(attribute.name); count += 1;
      } else if (name === 'class') {
        const retained = attribute.value.split(/\s+/).filter((value) => value && !/^(?:mso|docs-|apple-|gmail_)/i.test(value));
        if (retained.join(' ') !== attribute.value.trim()) {
          if (retained.length) element.setAttribute('class', retained.join(' '));
          else element.removeAttribute('class');
          count += 1;
        }
      } else if (/^(?:xmlns(?::|$)|data-(?:docs|mce|cke)-|data-(?:comment|annotation)(?:-|$))/i.test(name)) {
        element.removeAttribute(attribute.name); count += 1;
      }
    });
    const style = element.getAttribute('style');
    if (style) {
      const retained = style.split(';').filter((declaration) => declaration.trim() && !/^\s*mso-/i.test(declaration));
      if (retained.length !== style.split(';').filter((declaration) => declaration.trim()).length) {
        if (retained.length) element.setAttribute('style', retained.join(';'));
        else element.removeAttribute('style');
        count += 1;
      }
    }
  });
  record(issues, 'source-metadata-removed', 'Application-only clipboard metadata was removed while supported formatting stayed intact.', false, count);
}

function detectExternalComments(html: string, issues: Map<ExternalPasteIssueCode, MutableIssue>): void {
  const matches = html.match(/(?:mso-comment|commentReference|data-(?:comment|annotation)|docs-comment)/gi)?.length ?? 0;
  record(issues, 'external-comments-not-imported', 'External comment threads are not portable clipboard data; visible document text was kept.', true, matches);
}

export function normalizeExternalPasteHTML(
  html: string,
  options: ExternalPasteOptions = {},
): ExternalPasteNormalizationResult {
  if (typeof DOMParser === 'undefined') throw new Error('External paste normalization requires a browser DOMParser.');
  const source = detectExternalPasteSource(html);
  const issues = new Map<ExternalPasteIssueCode, MutableIssue>();
  const body = new DOMParser().parseFromString(html, 'text/html').body;

  stripUnsafeContent(body, issues);
  if (source === 'microsoft-word') {
    normalizeWordFootnotes(body, issues);
    if (options.wordLists !== false) normalizeWordLists(body, issues);
  }
  if (source === 'microsoft-excel') preserveSpreadsheetCellFormatting(body);
  convertMathML(body, issues);
  resolveTrackedChanges(body, source, options.trackedChanges ?? 'accept', issues);
  detectExternalComments(html, issues);
  if (source === 'microsoft-excel' && body.querySelector('table')) {
    record(issues, 'spreadsheet-table-preserved', 'Spreadsheet rows, cells, and spans were preserved as a semantic table.', false);
  }
  if (options.stripSourceMetadata !== false) stripMetadata(body, source, issues);

  const normalized = body.innerHTML;
  return Object.freeze({
    html: normalized,
    source,
    inputBytes: byteLength(html),
    outputBytes: byteLength(normalized),
    issues: Object.freeze([...issues.values()].map((issue) => Object.freeze({ ...issue }))),
  });
}

export function createExternalPasteReport(
  source: ExternalPasteSource,
  outcome: ExternalPasteOutcome,
  input: string,
  output: string,
  issues: readonly ExternalPasteIssue[] = [],
): ExternalPasteReport {
  return Object.freeze({
    source,
    outcome,
    inputBytes: byteLength(input),
    outputBytes: byteLength(output),
    issues: Object.freeze([...issues]),
  });
}
