// Development diagnostic, not an importer, exporter or shipped package entry.
// Keep the semantic comparator and production fallbacks unchanged.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import commonmarkSpec from 'commonmark-spec';
import { parse, parseFragment } from 'parse5';
import { CoreSchemaSpec, Schema, MarkdownImporter, MarkdownExporter, HTMLExporter,
  HTMLContainerExtension, HTMLFlowExtension, HTMLCommentExtension, HTMLAnchorExtension } from '../dist/index.js';
import { ServerHTMLImporter } from '../dist/html-server.js';
import { createInertHTMLAnchorExtension, createInertHTMLInlineExtension, createInertHTMLRawTextExtension } from '../dist/html-inert.js';
import { exportHTMLSource } from '../dist/html-source.js';

const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
  ...HTMLContainerExtension.nodes, ...HTMLFlowExtension.nodes, ...HTMLCommentExtension.nodes, ...HTMLAnchorExtension.nodes,
  ...createInertHTMLAnchorExtension().nodes,
  ...createInertHTMLInlineExtension({ tags: ['foo', 'bar'] }).nodes,
  ...createInertHTMLRawTextExtension({ tags: ['script', 'style', 'textarea'] }).nodes } });
const prefix = '<!doctype html><html><head><meta charset="utf-8"></head><body>';
const suffix = '</body></html>';
function meaning(node) {
  if (node.nodeName === '#text') return node.value.trim() ? ['text', node.value] : null;
  if (node.nodeName === '#comment') return ['comment', node.data];
  return [node.tagName ?? node.nodeName,
    (node.attrs ?? []).map(attr => [attr.name, attr.value]).sort(),
    (node.childNodes ?? []).map(meaning).filter(Boolean)];
}
function body(html) {
  const document = parse(html, { scriptingEnabled: false });
  const root = document.childNodes.find(node => node.tagName === 'html');
  return meaning(root.childNodes.find(node => node.tagName === 'body'));
}
const results = [];
for (const number of [156, 157, 158, 181]) {
  const fixture = commonmarkSpec.tests.find(item => item.number === number);
  for (const ending of ['\n', '\r\n']) {
    const source = fixture.markdown.replaceAll('\n', ending);
    const fallbacks = [], diagnostics = [], parseErrors = [];
    const importer = new ServerHTMLImporter({ sourceTokens: true });
    const captured = MarkdownImporter.parseWithSource(source, schema, {
      parseHTMLDocument: (...args) => { const result = importer.parseTextBlockFlowWithReport(...args); diagnostics.push(...result.issues); return result.nodes; },
      onHTMLFlowFallback: issue => fallbacks.push(issue),
    });
    assert.equal(MarkdownExporter.exportWithSource(captured.document, captured.source).markdown, source);
    parseFragment(source, { onParseError: error => parseErrors.push(error.code) });
    const rawAtEOF = body(prefix + source);
    const rawWithEnvelopeSuffix = body(prefix + source + suffix);
    const sourceExport = exportHTMLSource(captured.document, { document: false });
    const reference = body(prefix + fixture.html);
    assert.equal(reference[2].length, 0, 'These cases have no visible reference body tree');
    if (number !== 181) {
      assert.ok(parseErrors.includes('eof-in-tag'));
      assert.ok(fallbacks.length, 'Current literal fallback must remain reported');
      assert.deepEqual(rawAtEOF, reference, 'Raw EOF context, not a synthesized closing envelope');
    }
    results.push({ number, ending, source, referenceHTML: fixture.html, reference,
      parseErrors, rawAtEOF, rawWithEnvelopeSuffix,
      envelopeChangesTree: JSON.stringify(rawAtEOF) !== JSON.stringify(rawWithEnvelopeSuffix),
      currentDocument: captured.document.toJSON(), currentSafeHTML: HTMLExporter.export(captured.document, { document: false }),
      currentSourceExport: sourceExport, exactUntouchedSource: true, fallbacks, diagnostics });
  }
}
assert.equal(results.filter(item => item.envelopeChangesTree).length, 6,
  'Examples 156–158 with LF/CRLF expose the synthesized closing-tag hazard');
// A declaration in body context is not the document's doctype/compatibility mode.
const declaration = '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">';
const originalDocument = parse(declaration);
const wrappedDocument = parse(prefix + declaration + suffix);
const doctype = document => {
  const node = document.childNodes.find(item => item.nodeName === '#documentType');
  return { mode: document.mode, name: node?.name, publicId: node?.publicId, systemId: node?.systemId };
};
const originalEnvelope = doctype(originalDocument), wrappedEnvelope = doctype(wrappedDocument);
assert.notDeepEqual(originalEnvelope, wrappedEnvelope, 'Moving a doctype into the body loses envelope semantics');
const report = { status: 'diagnostic only; production code and conformance scores unchanged',
  assertions: '8 LF/CRLF cases preserve exact untouched Markdown; 6 envelope-induced tree changes; doctype envelope/compatibility-mode mismatch',
  results, declarationBoundary: { source: declaration, originalEnvelope, wrappedEnvelope },
  nextRequirements: [
    'Schema-owned bounded lexical-source data with safe reader carriers and visible author inspection',
    'Parsed document envelope separate from body structure and from incidental editing caret hosts',
    'An EOF token must remain at actual EOF; refuse or explicitly reclassify edits that add following content',
    'Never hide/delete a source-bearing node to raise semantic conformance',
    'Validate source reconstruction in its real complete-document context and report native model loss',
    'Native editing, undo/redo, JSON and safe-HTML reopen, exact source and independent semantic guards before promotion',
  ] };
const destination = process.argv[2];
if (destination) writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
console.log(report.assertions);
