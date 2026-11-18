import { BarChartExtension } from 'fountainjs-editor/charts';
import katex from 'katex';
import { HTMLAnchorExtension, HTMLCommentExtension, HTMLContainerExtension, HTMLFlowExtension, HTMLExporter, MarkdownExporter, MarkdownImporter, Schema, StarterKit, composeExtensions, createKaTeXRenderer, createMathExtension, type Node, type MarkdownSourceSnapshot } from 'fountainjs-editor';
import { PagesExtension } from 'fountainjs-editor/pages';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';
import { createHTMLSourceEmptyBodyExtension, createHTMLSourceEOFExtension, createInertHTMLAnchorExtension, createInertHTMLRawTextExtension } from 'fountainjs-editor/html/inert';
import { createHTMLSourceMarkdownAdapter } from 'fountainjs-editor/html/source';
import { exportDOCX, importDOCX, type DOCXPackagePart } from 'fountainjs-editor/docx';
import { compileTeXForDOCX } from './mathjax-docx';
import { renderLabHTMLMath } from './conversion-html-math';

export type LabFormat = 'markdown' | 'html' | 'docx' | 'json';
export type LabIssue = { code: string; message: string; type?: string; path?: readonly number[]; sourcePart?: string };
/** Source package paths follow the same explicit opt-in for every report section.
 * Warning messages may still contain source fragments; this is not anonymization.
 */
export function labReportIssues(issues: readonly LabIssue[], includeSourcePaths: boolean): LabIssue[] {
  return issues.map(({ sourcePart, ...issue }) => includeSourcePaths && sourcePart !== undefined ? { ...issue, sourcePart } : issue);
}
export const labPolicy = 'starter-kit-pages-v2; markdown-inert-html; bounded-html-docx; json-depth64-nodes20000';
export type LabImportOptions = {
  readonly preserveHTMLStructure?: boolean;
  readonly commonMarkText?: boolean;
  readonly retainBlockedAutolinks?: boolean;
  readonly commonMarkSourceReview?: boolean;
};
/** Each imported file owns its schema/policy for editing, export and reopening.
 * Changing the next-import controls must never reinterpret an existing draft.
 */
export function createLabContext(options: LabImportOptions = {}) {
  const commonMarkSourceReview = options.commonMarkSourceReview === true;
  const preserveHTMLStructure = commonMarkSourceReview || options.preserveHTMLStructure === true;
  const settings = Object.freeze({
    preserveHTMLStructure,
    commonMarkText: commonMarkSourceReview || options.commonMarkText === true,
    retainBlockedAutolinks: commonMarkSourceReview || preserveHTMLStructure && options.retainBlockedAutolinks === true,
    commonMarkSourceReview,
  });
  const kit = composeExtensions([...StarterKit.extensions, PagesExtension, BarChartExtension, createMathExtension({
    renderer: createKaTeXRenderer(katex, { maxExpand: 1000, maxSize: 20 }),
  }), ...(settings.preserveHTMLStructure ? [HTMLContainerExtension, HTMLCommentExtension, HTMLFlowExtension, HTMLAnchorExtension] : []),
  ...(settings.retainBlockedAutolinks ? [createInertHTMLAnchorExtension()] : []),
  ...(commonMarkSourceReview ? [createHTMLSourceEmptyBodyExtension(), createHTMLSourceEOFExtension(),
    createInertHTMLRawTextExtension({ tags: ['script', 'style', 'textarea'] })] : [])]);
  const policy = (settings.preserveHTMLStructure ? 'starter-kit-pages-html-structure-v1; markdown-document-html; bounded-html-docx; json-depth64-nodes20000' : labPolicy)
    + '; table-backed-bar-charts-v1'
    + (settings.retainBlockedAutolinks ? '; blocked-autolinks-inert' : '')
    + (commonMarkSourceReview ? '; markdown-source-review-v1' : '');
  return Object.freeze({ options: settings, kit, schema: new Schema(kit.schema),
    policy: settings.commonMarkText ? policy + '; markdown-body-delimiters; bare-addresses-literal' : policy });
}
export type LabContext = ReturnType<typeof createLabContext>;
export const defaultLabContext = createLabContext();
export const labKit = defaultLabContext.kit;
export const labSchema = defaultLabContext.schema;
export function labImages(document: Node) {
  const images: { source: string; alt: string; embedded: boolean }[] = [];
  const visit = (node: Node) => {
    if (node.type.name === 'image' || node.type.name === 'image_super' || node.type.name === 'inline_image') {
      const source = String(node.attrs.src ?? '');
      images.push({ source, alt: String(node.attrs.alt ?? ''), embedded: /^data:image\/(png|jpeg|gif|webp);base64,/i.test(source) });
    }
    node.content.forEach(visit);
  };
  visit(document); return images;
}
export function sameLabDocument(left: Node, right: Node): boolean {
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(left.toJSON())) === JSON.stringify(canonical(right.toJSON()));
}
export function detectLabFormat(name: string): LabFormat {
  const extension = name.toLowerCase().split('.').pop();
  if (extension === 'md' || extension === 'markdown') return 'markdown';
  if (extension === 'html' || extension === 'htm') return 'html';
  if (extension === 'docx') return 'docx';
  if (extension === 'json') return 'json';
  throw new Error('Not supported in this lab yet. Choose Markdown, HTML, DOCX or Fountain document JSON.');
}
function boundedJSON(text: string) {
  const value = JSON.parse(text);
  let count = 0;
  const visit = (item: unknown, depth: number) => {
    if (++count > 20000 || depth > 64) throw new Error('JSON exceeds this lab’s depth or entry limit.');
    if (item && typeof item === 'object') Object.values(item).forEach(child => visit(child, depth + 1));
  };
  visit(value, 0);
  return value;
}
export function importLab(bytes: Uint8Array, format: LabFormat, context: LabContext = defaultLabContext): {
  document: Node; issues: LabIssue[]; source?: MarkdownSourceSnapshot; markdownBOM?: boolean; packageParts?: readonly DOCXPackagePart[];
} {
  const labSchema = context.schema;
  if (bytes.byteLength > (format === 'docx' ? 4 : 1) * 1024 * 1024) throw new Error('Lab limit: 1 MiB per text/JSON file; 4 MiB per DOCX.');
  if (format === 'docx') {
    const result = importDOCX(bytes, labSchema, { maxArchiveBytes: 4 * 1024 * 1024, maxExpandedBytes: 24 * 1024 * 1024 });
    return { document: result.document, issues: result.report.issues.map(issue => ({ code: issue.code, message: issue.message, path: issue.path, sourcePart: issue.sourcePart })), packageParts: result.packageParts };
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (format === 'html') {
    const result = ServerHTMLImporter.parseWithReport(text, labSchema);
    return { document: result.document, issues: [...result.issues] };
  }
  if (format === 'json') {
    const document = labSchema.nodeFromJSON(boundedJSON(text));
    if (document.type !== labSchema.topNodeType) throw new Error('Choose a complete Fountain document JSON object with type "doc", not a single node or a workspace bundle.');
    return { document, issues: [{ code: 'schema-boundary', message: `Validated against this file’s selected lab schema${context.options.preserveHTMLStructure ? ', including supported HTML structure' : ' (StarterKit + Pages)'}, not every extension schema. Extra data and visual fidelity are not certified; keep the original file.` }] };
  }
  let importIssues: LabIssue[] | undefined = [];
  const parseHTMLDocument: NonNullable<Parameters<typeof MarkdownImporter.parseWithSource>[2]>['parseHTMLDocument'] = context.options.commonMarkSourceReview
    ? createHTMLSourceMarkdownAdapter({ sourceTokens: true }, report => importIssues?.push(...report.issues))
    : context.options.preserveHTMLStructure
      ? (segments, schema, sourceContext) => {
        const parsed = new ServerHTMLImporter().parseTextBlockFlowWithReport(segments, schema, sourceContext);
        importIssues?.push(...parsed.issues);
        return parsed.nodes;
      }
      : undefined;
  const result = MarkdownImporter.parseWithSource(text, labSchema, {
    frontmatter: context.options.commonMarkText ? 'markdown' : 'metadata',
    autolinkLiterals: !context.options.commonMarkText,
    retainBlockedAutolinks: context.options.retainBlockedAutolinks,
    ...(parseHTMLDocument ? {
      parseHTMLDocument,
      onHTMLFlowFallback: issue => importIssues?.push({ code: 'html-source-fallback', message: issue.message }),
    } : {}),
  });
  const issues = importIssues;
  // The source snapshot may call the same adapter again to verify edits.
  importIssues = undefined;
  const textPolicy = (context.options.commonMarkText ? 'Leading delimiters are parsed as Markdown. Bare addresses stay as text. ' : '')
    + (context.options.retainBlockedAutolinks ? 'Blocked Markdown autolinks are retained as inactive data. ' : '');
  const htmlPolicy = context.options.commonMarkSourceReview
    ? 'Markdown source review retains supported HTML declarations, unfinished tags, and script, style, and textarea content as inert data. Other HTML can fall back to literal text or lose structure with a report.'
    : context.options.preserveHTMLStructure
    ? 'HTML conversion is enabled for this file. Unsupported HTML can remain literal or lose structure with a report.'
    : 'Raw HTML stays inert.';
  // TextDecoder consumes the UTF-8 marker before parsing. Retain it as file metadata.
  const markdownBOM = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  return { ...result, markdownBOM, issues: [{ code: 'markdown-coverage',
    message: textPolicy + htmlPolicy + ' Coverage is limited to supported syntax and structure.' }, ...issues] };
}
export function exportLab(
  document: Node,
  format: LabFormat,
  source?: MarkdownSourceSnapshot,
  context: LabContext = defaultLabContext,
  { omitMarkdownCaretHosts = false, markdownBOM = false, renderHTMLMath = true } = {},
): {
  bytes: Uint8Array; extension: string; mime: string; issues: LabIssue[];
} {
  // Keep live import/editing provenance when this file owns the schema. A JSON
  // copy would turn an automatic caret paragraph into an authored empty block.
  // Explicit foreign-schema callers still need normal portable reconstruction.
  if (document.type.schema !== context.schema) document = context.schema.nodeFromJSON(document.toJSON());
  if (format === 'docx') {
    const result = exportDOCX(document, {
      omitTrailingCaret: true,
      resolveMath: node => compileTeXForDOCX(String(node.attrs.latex), node.type.name === 'math_block'),
    });
    return { bytes: result.bytes, extension: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', issues: result.report.issues.map(issue => ({ code: issue.code, message: issue.message, path: issue.path, sourcePart: issue.sourcePart })) };
  }
  if (format === 'markdown') {
    const result = source ? MarkdownExporter.exportWithSource(document, source) : MarkdownExporter.exportWithReport(document);
    const issues: LabIssue[] = result.losses.map(loss => ({ code: loss.kind, type: loss.type, message: loss.detail, path: loss.path }));
    if (context.options.commonMarkSourceReview && 'preservation' in result
      && (result.preservation === 'canonical' || result.preservation === 'frontmatter')) {
      issues.unshift({ code: 'markdown-source-rewritten', message: 'The source-preserving export could not verify this edit. The download uses rewritten Markdown. Compare it with the original before replacing your source.' });
    }
    const text = markdownBOM ? '\uFEFF' + result.markdown : result.markdown;
    return { bytes: new TextEncoder().encode(text), extension: 'md', mime: 'text/markdown', issues };
  }
  let text = format === 'json' ? JSON.stringify(document.toJSON(), null, 2) : HTMLExporter.export(document, { omitMarkdownCaretHosts });
  const math = format === 'html' && renderHTMLMath ? renderLabHTMLMath(text, document) : undefined;
  if (math) text = math.html;
  if (format === 'html' && context.options.commonMarkSourceReview) {
    // Insert before authored body content so a standalone reader also stays offline.
    text = text.replace('<meta charset="utf-8">', `$&
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">`);
  }
  return { bytes: new TextEncoder().encode(text), extension: format, mime: format === 'json' ? 'application/json' : 'text/html', issues: format === 'html' ? [{ code: 'html-export-boundary', message: 'HTML export preserves supported physical page settings as inert Fountain body metadata. It does not reproduce native pagination; complete styling, other metadata and extension behaviour are not guaranteed.' }, ...(math?.issues ?? [])] : [] };
}
