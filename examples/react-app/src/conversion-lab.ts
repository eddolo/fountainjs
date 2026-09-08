import { HTMLExporter, MarkdownExporter, MarkdownImporter, Schema, StarterKit, type Node, type MarkdownSourceSnapshot } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';
import { exportDOCX, importDOCX } from 'fountainjs-editor/docx';

export type LabFormat = 'markdown' | 'html' | 'docx' | 'json';
export type LabIssue = { code: string; message: string };
export const labSchema = new Schema(StarterKit.schema);
export const labPolicy = 'starter-kit-v1; markdown-inert-html; bounded-html-docx; json-depth64-nodes20000';
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
export function importLab(bytes: Uint8Array, format: LabFormat): { document: Node; issues: LabIssue[]; source?: MarkdownSourceSnapshot } {
  if (bytes.byteLength > (format === 'docx' ? 4 : 1) * 1024 * 1024) throw new Error('Lab limit: 1 MiB per text/JSON file; 4 MiB per DOCX.');
  if (format === 'docx') {
    const result = importDOCX(bytes, labSchema, { maxArchiveBytes: 4 * 1024 * 1024, maxExpandedBytes: 24 * 1024 * 1024 });
    return { document: result.document, issues: result.report.issues.map(issue => ({ code: issue.code, message: issue.message })) };
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (format === 'html') {
    const result = ServerHTMLImporter.parseWithReport(text, labSchema);
    return { document: result.document, issues: [...result.issues] };
  }
  if (format === 'json') {
    const document = labSchema.nodeFromJSON(boundedJSON(text));
    if (document.type !== labSchema.topNodeType) throw new Error('Choose a complete Fountain document JSON object with type "doc", not a single node or a workspace bundle.');
    return { document, issues: [{ code: 'schema-boundary', message: 'Validated against the supplied StarterKit schema, not every extension schema. Extra data and visual fidelity are not certified; keep the original file.' }] };
  }
  const result = MarkdownImporter.parseWithSource(text, labSchema);
  return { ...result, issues: [{ code: 'markdown-coverage', message: 'Default Markdown parser: raw HTML stays inert; full CommonMark/dialect conformance and exhaustive import-loss reporting are not available.' }] };
}
export function exportLab(document: Node, format: LabFormat, source?: MarkdownSourceSnapshot) {
  // Each mounted editor has its own Schema instances. Source snapshots belong to
  // the import schema; recreate the same portable document there before matching.
  document = labSchema.nodeFromJSON(document.toJSON());
  if (format === 'docx') {
    const result = exportDOCX(document);
    return { bytes: result.bytes, extension: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', issues: result.report.issues.map(issue => ({ code: issue.code, message: issue.message })) };
  }
  if (format === 'markdown') {
    const result = source ? MarkdownExporter.exportWithSource(document, source) : MarkdownExporter.exportWithReport(document);
    return { bytes: new TextEncoder().encode(result.markdown), extension: 'md', mime: 'text/markdown', issues: result.losses.map(loss => ({ code: loss.kind, message: loss.detail })) };
  }
  const text = format === 'json' ? JSON.stringify(document.toJSON(), null, 2) : HTMLExporter.export(document);
  return { bytes: new TextEncoder().encode(text), extension: format, mime: format === 'json' ? 'application/json' : 'text/html', issues: format === 'html' ? [{ code: 'html-export-boundary', message: 'HTML export is a projection. Complete styling, metadata and extension behaviour are not guaranteed.' }] : [] };
}
