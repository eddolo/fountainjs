import katex from 'katex';
import { HTMLAnchorExtension, HTMLCommentExtension, HTMLContainerExtension, HTMLFlowExtension, HTMLExporter, MarkdownExporter, MarkdownImporter, Schema, StarterKit, composeExtensions, createKaTeXRenderer, createMathExtension, type Node, type MarkdownSourceSnapshot } from 'fountainjs-editor';
import { PagesExtension } from 'fountainjs-editor/pages';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';
import { exportDOCX, importDOCX, type DOCXPackagePart } from 'fountainjs-editor/docx';
import { compileTeXForDOCX } from './mathjax-docx';

export type LabFormat = 'markdown' | 'html' | 'docx' | 'json';
export type LabIssue = { code: string; message: string; type?: string; path?: readonly number[]; sourcePart?: string };
/** Source package paths follow the same explicit opt-in for every report section.
 * Warning messages may still contain source fragments; this is not anonymization.
 */
export function labReportIssues(issues: readonly LabIssue[], includeSourcePaths: boolean): LabIssue[] {
  return issues.map(({ sourcePart, ...issue }) => includeSourcePaths && sourcePart !== undefined ? { ...issue, sourcePart } : issue);
}
export const labPolicy = 'starter-kit-pages-v2; markdown-inert-html; bounded-html-docx; json-depth64-nodes20000';
export type LabImportOptions = { readonly preserveHTMLStructure?: boolean };
/** Each imported file owns its schema/policy for editing, export and reopening.
 * Changing the next-import controls must never reinterpret an existing draft.
 */
export function createLabContext(options: LabImportOptions = {}) {
  const settings = Object.freeze({ preserveHTMLStructure: options.preserveHTMLStructure === true });
  const kit = composeExtensions([...StarterKit.extensions, PagesExtension, createMathExtension({
    renderer: createKaTeXRenderer(katex, { maxExpand: 1000, maxSize: 20 }),
  }), ...(settings.preserveHTMLStructure ? [HTMLContainerExtension, HTMLCommentExtension, HTMLFlowExtension, HTMLAnchorExtension] : [])]);
  return Object.freeze({ options: settings, kit, schema: new Schema(kit.schema),
    policy: settings.preserveHTMLStructure ? 'starter-kit-pages-html-structure-v1; markdown-document-html; bounded-html-docx; json-depth64-nodes20000' : labPolicy });
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
export function importLab(bytes: Uint8Array, format: LabFormat, context: LabContext = defaultLabContext): { document: Node; issues: LabIssue[]; source?: MarkdownSourceSnapshot; packageParts?: readonly DOCXPackagePart[] } {
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
  const issues: LabIssue[] = [];
  const result = MarkdownImporter.parseWithSource(text, labSchema, context.options.preserveHTMLStructure ? {
    parseHTMLDocument: (segments, schema, sourceContext) => {
      const parsed = new ServerHTMLImporter().parseTextBlockFlowWithReport(segments, schema, sourceContext);
      issues.push(...parsed.issues);
      return parsed.nodes;
    },
    onHTMLFlowFallback: issue => issues.push({ code: 'html-source-fallback', message: issue.message }),
  } : {});
  return { ...result, issues: [{ code: 'markdown-coverage', message: context.options.preserveHTMLStructure
    ? 'HTML conversion is enabled for this file. Supported structure is retained; unsupported HTML can remain literal or lose structure with a report. Full CommonMark/dialect conformance and original layout are not certified.'
    : 'Default Markdown parser: raw HTML stays inert; full CommonMark/dialect conformance and exhaustive import-loss reporting are not available.' }, ...issues] };
}
export function exportLab(document: Node, format: LabFormat, source?: MarkdownSourceSnapshot, context: LabContext = defaultLabContext): {
  bytes: Uint8Array; extension: string; mime: string; issues: LabIssue[];
} {
  // Keep live import/editing provenance when this file owns the schema. A JSON
  // copy would turn an automatic caret paragraph into an authored empty block.
  // Explicit foreign-schema callers still need normal portable reconstruction.
  if (document.type.schema !== context.schema) document = context.schema.nodeFromJSON(document.toJSON());
  if (format === 'docx') {
    const result = exportDOCX(document, {
      resolveMath: node => compileTeXForDOCX(String(node.attrs.latex), node.type.name === 'math_block'),
    });
    return { bytes: result.bytes, extension: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', issues: result.report.issues.map(issue => ({ code: issue.code, message: issue.message, path: issue.path, sourcePart: issue.sourcePart })) };
  }
  if (format === 'markdown') {
    const result = source ? MarkdownExporter.exportWithSource(document, source) : MarkdownExporter.exportWithReport(document);
    return { bytes: new TextEncoder().encode(result.markdown), extension: 'md', mime: 'text/markdown', issues: result.losses.map(loss => ({ code: loss.kind, type: loss.type, message: loss.detail, path: loss.path })) };
  }
  const text = format === 'json' ? JSON.stringify(document.toJSON(), null, 2) : HTMLExporter.export(document);
  return { bytes: new TextEncoder().encode(text), extension: format, mime: format === 'json' ? 'application/json' : 'text/html', issues: format === 'html' ? [{ code: 'html-export-boundary', message: 'HTML export preserves supported physical page settings as inert Fountain body metadata. It does not reproduce native pagination; complete styling, other metadata and extension behaviour are not guaranteed.' }] : [] };
}
