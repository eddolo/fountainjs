// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parse } from 'parse5';
import { Schema, Selection, splitBlock, deleteBackward, deleteForward, MarkdownImporter, MarkdownExporter, HTMLExporter, Editor, EditorState, createHistoryPlugin, undo, redo } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { createHTMLSourceEmptyBodyExtension } from '../src/html/inert';
import { createHTMLSourceMarkdownAdapter, importHTMLSourceDocument, exportHTMLSource } from '../src/html/source';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...createHTMLSourceEmptyBodyExtension().nodes } });
const options = { parseHTMLDocument: createHTMLSourceMarkdownAdapter() };
const source = '<!DOCTYPE html>\n';
const imported = () => MarkdownImporter.parseWithSource(source, schema, options);
const sourceHTML = (doc: import('../src/headless').Node) => {
  const result = exportHTMLSource(doc); expect(result.ok, JSON.stringify(result.issues)).toBe(true);
  if (!result.ok) throw Error('Source export refused');
  return result;
};
describe('explicit source-empty body editing block', () => {
  it.each(['\n', '\r\n'])('distinguishes source-only declaration from authored empty paragraph: %j', ending => {
    const raw = source.replaceAll('\n', ending);
    const captured = MarkdownImporter.parseWithSource(raw, schema, options);
    expect(captured.document.child(0).type.name).toBe('html_source_empty_body');
    expect(MarkdownExporter.exportWithSource(captured.document, captured.source).markdown).toBe(raw);
    const output = sourceHTML(captured.document);
    expect(output.sourceHTML).not.toContain('<p');
    const tree = parse(output.sourceHTML);
    const html = tree.childNodes.find(node => 'tagName' in node && node.tagName === 'html') as any;
    expect(html.childNodes.find((node: any) => node.tagName === 'body').childNodes).toEqual([]);
    expect(output.modelRoundTrip).toBe('equal-except-source-tokens');
    expect(importHTMLSourceDocument(output.sourceHTML, schema).document.toJSON()).toEqual(captured.document.toJSON());
    const authored = importHTMLSourceDocument('<!doctype html><p></p>', schema).document;
    expect(authored.child(0).type.name).toBe('paragraph');
    expect(sourceHTML(authored).sourceHTML).toContain('<p');
  });

  it('survives native JSON and safe complete HTML without inferring provenance', () => {
    const doc = imported().document;
    expect(schema.nodeFromJSON(doc.toJSON()).toJSON()).toEqual(doc.toJSON());
    expect(new ServerHTMLImporter().parse(HTMLExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
    const authored = schema.node('doc', doc.attrs, [schema.node('paragraph', {}, [schema.text('')])]);
    expect(sourceHTML(authored).sourceHTML).toContain('<p');
  });

  it('retains typing, history and multiple blocks instead of hiding user-created lines', () => {
    const doc = imported().document;
    const editor = new Editor(EditorState.create({ schema, doc, plugins: [createHistoryPlugin()] }));
    try {
      const initial = editor.getJSON();
      editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'Evidence'));
      expect(sourceHTML(editor.state.doc).sourceHTML).toContain('<p>Evidence</p>');
      expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(initial);
      expect(sourceHTML(editor.state.doc).sourceHTML).not.toContain('<p');
      expect(redo(editor)).toBe(true); expect(editor.state.doc.textContent).toBe('Evidence');
      const empty = schema.node('html_source_empty_body', {}, [schema.text('')]);
      const two = doc.copy([empty, empty]);
      expect(sourceHTML(two).sourceHTML.match(/<p>/g)).toHaveLength(2);
      const withParagraph = doc.copy([doc.child(0), schema.node('paragraph', {}, [schema.text('After')])]);
      expect(sourceHTML(withParagraph).sourceHTML).toContain('<p></p>\n<p>After</p>');
    } finally { editor.destroy(); }
  });

  it('does not suppress marked empty text or unsupported source-block metadata', () => {
    const doc = imported().document;
    const marked = doc.copy([schema.node('html_source_empty_body', {}, [schema.text('', [schema.mark('strong')])])]);
    expect(sourceHTML(marked).sourceHTML).toContain('<p>');
    const data = doc.copy([doc.child(0).withAttrs({ author: 'Ada' })]);
    expect(exportHTMLSource(data).ok).toBe(false);
  });

  it('uses native editing commands to create an authored paragraph and join in both directions', () => {
    const editor = new Editor(EditorState.create({ schema, doc: imported().document, plugins: [createHistoryPlugin()] }));
    try {
      editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'FirstSecond').setSelection(Selection.cursor([0, 0], 5)));
      expect(splitBlock(editor)).toBe(true);
      expect(editor.state.doc.content.map(node => node.type.name)).toEqual(['html_source_empty_body', 'paragraph']);
      expect(deleteBackward(editor)).toBe(true);
      expect(editor.state.doc.childCount).toBe(1); expect(editor.state.doc.textContent).toBe('FirstSecond');
      expect(undo(editor)).toBe(true);
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 5)));
      expect(deleteForward(editor)).toBe(true);
      expect(editor.state.doc.childCount).toBe(1); expect(editor.state.doc.textContent).toBe('FirstSecond');
    } finally { editor.destroy(); }
  });

  it('declines altered carrier attributes and retains visible content', () => {
    const html = HTMLExporter.export(imported().document);
    const changed = html.replace('data-fountain-source-empty-body="v1"', 'data-fountain-source-empty-body="v1" data-extra="changed"')
      .replace('data-fountain-empty-text="true"></p>', 'data-fountain-empty-text="true">Visible</p>');
    const doc = new ServerHTMLImporter().parse(changed, schema);
    expect(doc.child(0).type.name).toBe('paragraph'); expect(doc.textContent).toContain('Visible');
  });

  it('refuses a forged nonempty canonical carrier during empty-body source validation', () => {
    const spec = createHTMLSourceEmptyBodyExtension().nodes!.html_source_empty_body;
    const local = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      html_source_empty_body: { ...spec, toDOM: () => ['p', { 'data-fountain-source-empty-body': 'v1' }, 'Unexpected'] } } });
    const doc = MarkdownImporter.parse(source, local, options);
    expect(exportHTMLSource(doc).ok).toBe(false);
  });

  it('keeps the existing default schema and explicit whitespace/paragraph imports', () => {
    const standard = new Schema(CoreSchemaSpec);
    expect(MarkdownImporter.parse(source, standard, options).child(0).type.name).toBe('paragraph');
    for (const html of ['<!doctype html><p> </p>', '<!doctype html><body> </body>']) {
      expect(importHTMLSourceDocument(html, schema).document.child(0).type.name).not.toBe('html_source_empty_body');
    }
  });

  it('refuses source-empty replacement when the host root permits only paragraphs', () => {
    const local = new Schema({ ...CoreSchemaSpec, nodes: { ...schema.spec.nodes,
      doc: { ...CoreSchemaSpec.nodes.doc, content: 'paragraph+' } } });
    expect(() => importHTMLSourceDocument('<!DOCTYPE html>', local)).toThrow();
    const issues: unknown[] = [];
    const doc = MarkdownImporter.parse(source, local, { ...options, onHTMLFlowFallback: issue => issues.push(issue) });
    expect(doc.child(0).type.name).toBe('paragraph'); expect(issues).toHaveLength(1);
  });
});
