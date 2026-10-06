import { describe, expect, it } from 'vitest';
import { Schema, HTMLFlowExtension, HTMLContainerExtension, MarkdownImporter, MarkdownExporter, HTMLExporter,
  EditorState, createEditor, createHistoryPlugin, Selection, NodeSelection, insertText, deleteSelection, splitBlock, joinBackward, insertDocument, undo } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';
import { exportDOCX, importDOCX } from '../src/docx';

const spec = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...HTMLContainerExtension.nodes, ...HTMLFlowExtension.nodes } };
const schema = new Schema(spec);
const options = { parseHTMLDocument: ServerHTMLImporter.parseTextBlockFlow };
const linked = '<a href="/guide">First paragraph.\n\nSecond **paragraph**.</a>\n';

describe('opt-in anonymous HTML flow', () => {
  it.each(['\n*bar*\n\n', '\r*bar*\r\r', '\r\n*bar*\r\n\r\n', ' \t\n\n'])(
    'retains literal flow line endings through canonical Markdown (%j)', text => {
      expect(typeof document).toBe('undefined');
      for (const marks of [[], [schema.mark('strong')]]) {
        const doc = schema.node('doc', {}, [schema.node('html_flow', {}, [schema.text(text, marks)])]);
        const result = MarkdownExporter.exportWithReport(doc);
        const reopened = MarkdownImporter.parse(result.markdown, schema, options);
        expect(reopened.toJSON()).toEqual(doc.toJSON());
        expect(result.losses).toEqual([]);
        expect(result.markdown).not.toMatch(/[\r\n]/u);
        expect(ServerHTMLImporter.parse(result.markdown, schema).toJSON()).toEqual(doc.toJSON());
      }
    },
  );
  it('retains both trailing newlines after the unsupported-wrapper projection in official example 163', () => {
    const source = '<Warning>\n*bar*\n</Warning>\n';
    const parsed = MarkdownImporter.parseWithSource(source, schema, options);
    expect(parsed.document.child(0).type.name).toBe('html_flow');
    expect(parsed.document.textContent).toBe('\n*bar*\n\n');
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
    const result = MarkdownExporter.exportWithReport(parsed.document);
    const reopened = MarkdownImporter.parse(result.markdown, schema, options);
    // Canonical HTML can coalesce adjacent text leaves. Preserve their exact
    // character stream, not an unsupported wrapper's original identity.
    expect(reopened.textContent).toBe(parsed.document.textContent);
    expect(reopened.child(0).type.name).toBe('html_flow');
    expect(result.losses).toEqual([]);
  });
  it('retains the cleared unmarked text leaf through canonical save/reopen and subsequent editing', () => {
    const doc = ServerHTMLImporter.parse('Before', schema);
    const editor = createEditor({ schema: spec, state: EditorState.create({ schema, doc, plugins: [createHistoryPlugin()] }) });
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0], 0, [0, 0], 6)));
    expect(deleteSelection(editor)).toBe(true);
    const cleared = editor.state.doc;
    expect(cleared.child(0).childCount).toBe(1);
    expect(cleared.child(0).child(0).text).toBe('');
    const saved = MarkdownExporter.export(cleared);
    const reopened = MarkdownImporter.parse(saved, schema, options);
    expect(reopened.toJSON()).toEqual(cleared.toJSON());
    editor.dispatch(editor.createTransaction().replace(0, editor.state.doc.childCount, reopened.content)
      .setSelection(Selection.cursor([0, 0], 0)));
    expect(insertText(editor, 'After')).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe('html_flow');
    expect(editor.state.doc.textContent).toBe('After');
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(cleared.toJSON());
    editor.destroy();
  });
  it('keeps a genuinely childless flow distinct from an empty text leaf', () => {
    const doc = schema.node('doc', {}, [schema.node('html_flow')]);
    const reopened = MarkdownImporter.parse(MarkdownExporter.export(doc), schema, options);
    expect(reopened.toJSON()).toEqual(doc.toJSON());
    const editor = createEditor({ schema: spec, state: EditorState.create({ schema, doc: reopened }) });
    editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(reopened, [0])));
    expect(insertText(editor, 'Filled')).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe('html_flow');
    expect(editor.state.doc.textContent).toBe('Filled');
    editor.destroy();
  });
  it.each(['strong', 'link'])('retains marks on cleared %s flow through canonical reopening', name => {
    const mark = schema.mark(name, name === 'link' ? { href: '/guide' } : {});
    const doc = schema.node('doc', {}, [schema.node('html_flow', {}, [schema.text('Before', [mark])])]);
    const editor = createEditor({ schema: spec, state: EditorState.create({ schema, doc, plugins: [createHistoryPlugin()] }) });
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0], 0, [0, 0], 6)));
    expect(deleteSelection(editor)).toBe(true);
    const reopened = MarkdownImporter.parse(MarkdownExporter.export(editor.state.doc), schema, options);
    expect(reopened.toJSON()).toEqual(editor.state.doc.toJSON());
    expect(reopened.child(0).child(0).marks).toEqual([mark]);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(doc.toJSON());
    editor.destroy();
  });
  it('does not restore the private caret marker in an ordinary paragraph or a default schema', () => {
    const html = '<p data-fountain-empty-text="true"></p>';
    expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(ServerHTMLImporter.parse('<p></p>', schema).toJSON());
    const plain = new Schema(CoreSchemaSpec);
    const fallback = ServerHTMLImporter.parse('<div data-fountain-html-flow="true" data-fountain-empty-text="true"></div>', plain);
    expect(fallback.child(0).type.name).toBe('paragraph');
    expect(fallback.child(0).textContent).toBe('');
  });
  it.each(['\n', '\r\n'])('retains marks and source without an extra native paragraph (%j)', ending => {
    expect(typeof document).toBe('undefined');
    const source = linked.replaceAll('\n', ending);
    const issues: string[] = [];
    const parsed = MarkdownImporter.parseWithSource(source, schema, { parseHTMLDocument: (segments, target, context) => {
      const result = new ServerHTMLImporter().parseTextBlockFlowWithReport(segments, target, context);
      issues.push(...result.issues.map(issue => issue.code));
      return result.nodes;
    } });
    expect(parsed.document.content.map(node => node.type.name)).toEqual(['paragraph', 'html_flow', 'paragraph']);
    expect(parsed.document.child(1).textContent).toBe('\n');
    expect(parsed.document.child(1).child(0).marks[0].attrs.href).toBe('/guide');
    expect(issues).not.toContain('formatted-whitespace-block');
    const html = HTMLExporter.export(parsed.document, { document: false });
    expect(html.match(/<p[ >]/g)).toHaveLength(2);
    expect(html).toContain('>\n</a>');
    expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(parsed.document.toJSON());
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
    expect(MarkdownImporter.parse(MarkdownExporter.export(parsed.document), schema, options).toJSON()).toEqual(parsed.document.toJSON());
  });
  it('keeps the default paragraph and its layout warning without opt-in', () => {
    const plain = new Schema(CoreSchemaSpec);
    let issues: string[] = [];
    const doc = MarkdownImporter.parse(linked, plain, { parseHTMLDocument: (segments, target, context) => {
      const result = new ServerHTMLImporter().parseTextBlockFlowWithReport(segments, target, context);
      issues = result.issues.map(issue => issue.code); return result.nodes;
    } });
    expect(doc.content.every(node => node.type.name === 'paragraph')).toBe(true);
    expect(issues).toContain('formatted-whitespace-block');
  });
  it('does not change authored paragraphs, and retains anonymous prose, NBSP and atoms as inline flow', () => {
    for (const html of ['<p><strong> </strong></p>', '<p></p>']) {
      expect(ServerHTMLImporter.parse(html, schema).child(0).type.name).toBe('paragraph');
    }
    for (const html of ['<strong>&nbsp;</strong>', '<strong>text</strong>', '<br>']) {
      expect(ServerHTMLImporter.parse(html, schema).child(0).type.name).toBe('html_flow');
    }
  });
  it('preserves neighboring edits, canonical reopen and exact source after undo', () => {
    const parsed = MarkdownImporter.parseWithSource(linked, schema, options);
    const editor = createEditor({ schema: spec, state: EditorState.create({ schema, doc: parsed.document, plugins: [createHistoryPlugin()] }) });
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([2, 0], 0)));
    expect(insertText(editor, 'Reviewed ')).toBe(true);
    const saved = MarkdownExporter.exportWithSource(editor.state.doc, parsed.source);
    expect(saved.preservation).toBe('canonical');
    expect(MarkdownImporter.parse(saved.markdown, schema, options).toJSON()).toEqual(editor.state.doc.toJSON());
    expect(undo(editor)).toBe(true);
    expect(MarkdownExporter.exportWithSource(editor.state.doc, parsed.source).markdown).toBe(linked);
    editor.destroy();
  });
  it('supports real text editing and splitting in the flow, rather than locking source data', () => {
    const parsed = MarkdownImporter.parse(linked, schema, options);
    const editor = createEditor({ schema: spec, state: EditorState.create({ schema, doc: parsed, plugins: [createHistoryPlugin()] }) });
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 0)));
    expect(insertText(editor, 'Between')).toBe(true);
    expect(editor.state.doc.child(1).textContent).toBe('Between\n');
    expect(ServerHTMLImporter.parse(HTMLExporter.export(editor.state.doc), schema).toJSON()).toEqual(editor.state.doc.toJSON());
    expect(splitBlock(editor)).toBe(true);
    expect(editor.state.doc.child(2).type.name).toBe('paragraph');
    schema.validate(editor.state.doc);
    expect(undo(editor)).toBe(true); expect(undo(editor)).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(parsed.toJSON());
    editor.destroy();
  });
  it('refuses extra attributes on a canonical flow carrier instead of accepting active markup', () => {
    const result = ServerHTMLImporter.parseWithReport('<div data-fountain-html-flow="true" onclick="bad()">Text</div>', schema);
    expect(result.issues.some(issue => issue.code === 'unmapped-block-wrapper')).toBe(true);
    expect(result.document.textContent).toBe('Text');
    expect(HTMLExporter.export(result.document)).not.toContain('onclick');
  });
  it('pastes an inline HTML fragment into a flow instead of introducing a second block', () => {
    const doc = ServerHTMLImporter.parse('<strong>Before</strong>', schema);
    const editor = createEditor({ schema: spec, state: EditorState.create({ schema, doc, plugins: [createHistoryPlugin()] }) });
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 6)));
    expect(insertDocument(editor, ServerHTMLImporter.parse('<em> pasted</em>', schema))).toBe(true);
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.textContent).toBe('Before pasted');
    expect(editor.state.doc.child(0).child(1).marks.some(mark => mark.type.name === 'em')).toBe(true);
    editor.destroy();
  });
  it('removes an explicit Enter break again without losing source or marks', () => {
    const doc = ServerHTMLImporter.parse('<strong>BeforeAfter</strong>', schema);
    const editor = createEditor({ schema: spec, state: EditorState.create({ schema, doc }) });
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 6)));
    expect(splitBlock(editor)).toBe(true);
    expect(editor.state.doc.child(1).type.name).toBe('paragraph');
    expect(joinBackward(editor)).toBe(true);
    expect(editor.state.doc.textContent).toBe(doc.textContent);
    expect(editor.state.doc.child(0).content.every(node => node.marks.some(mark => mark.type.name === 'strong'))).toBe(true);
    expect(HTMLExporter.export(editor.state.doc, { document: false })).toBe(HTMLExporter.export(doc, { document: false }));
    editor.destroy();
  });
  it('reports the Word fallback rather than claiming anonymous HTML flow is a native Word feature', () => {
    const doc = ServerHTMLImporter.parse('<strong>Inline content</strong>', schema);
    const exported = exportDOCX(doc);
    expect(exported.report.issues).toContainEqual(expect.objectContaining({ code: 'block-fallback', path: [0] }));
    expect(importDOCX(exported.bytes, schema).document.textContent).toBe('Inline content');
  });
});
