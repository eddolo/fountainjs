import { describe, expect, it } from 'vitest';
import { Schema, HTMLCommentExtension, HTMLContainerExtension, MarkdownImporter, MarkdownExporter,
  HTMLExporter, createEditor, EditorState, createHistoryPlugin, Selection, insertText, undo } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';
import { isHTMLCommentData, htmlCommentSource } from '../src/core/html-comment';

const spec = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...HTMLContainerExtension.nodes, ...HTMLCommentExtension.nodes } };
const schema = new Schema(spec);
const settings = { parseHTMLDocument: ServerHTMLImporter.parseTextBlockFlow };
function comments(doc: ReturnType<Schema['node']>) {
  const result: string[] = [];
  doc.descendants(node => { if (node.type.name === 'html_comment') result.push(String(node.attrs.data)); });
  return result;
}

describe('opt-in inert HTML comment retention', () => {
  it('runs without a DOM and preserves comment identity, order and inherited marks', () => {
    expect(typeof document).toBe('undefined');
    const result = ServerHTMLImporter.parseWithReport('<p>A<!-- first --><strong>B<!-- second --></strong><!-- first --></p>', schema);
    expect(comments(result.document)).toEqual([' first ', ' second ', ' first ']);
    expect(result.document.child(0).child(3).marks.map(mark => mark.type.name)).toEqual(['strong']);
    expect(result.issues.some(issue => issue.code === 'discarded-html-comment')).toBe(false);
    expect(ServerHTMLImporter.parse(HTMLExporter.export(result.document), schema).toJSON()).toEqual(result.document.toJSON());
  });
  it('keeps defaults unchanged and reports omission when the schema does not opt in', () => {
    const plain = new Schema(CoreSchemaSpec);
    const result = ServerHTMLImporter.parseFragmentWithReport('<p>A<!-- private -->B</p>', plain);
    expect(result.nodes[0].textContent).toBe('AB');
    expect(result.issues.find(issue => issue.code === 'discarded-html-comment')).toMatchObject({ line: 1, column: 5 });
    expect(MarkdownImporter.parse('A <!-- private --> B', schema).textContent).toContain('<!-- private -->');
  });
  it('reports comments omitted by a specialized preformatted projection even with the extension enabled', () => {
    const result = ServerHTMLImporter.parseFragmentWithReport('<pre>a<!-- retained only in original -->b</pre>', schema);
    expect(result.nodes[0].textContent).toBe('ab');
    expect(result.issues.some(issue => issue.code === 'discarded-html-comment')).toBe(true);
  });
  it('does not confuse a surviving duplicate with a comment lost inside a preformatted projection', () => {
    const result = ServerHTMLImporter.parseFragmentWithReport('<p><!-- same --></p><pre><!-- same -->x</pre>', schema);
    expect(result.issues.filter(issue => issue.code === 'discarded-html-comment')).toHaveLength(1);
    expect(result.issues.find(issue => issue.code === 'discarded-html-comment')?.column).toBe(26);
  });
  it.each(['\n', '\r\n'])('preserves original source, edited canonical data and undo with %j', ending => {
    const source = 'Before <!-- provenance --> **bold**.\n\nAfter.\n'.replaceAll('\n', ending);
    const captured = MarkdownImporter.parseWithSource(source, schema, settings);
    expect(comments(captured.document)).toEqual([' provenance ']);
    const editor = createEditor({ schema: spec, state: EditorState.create({ schema, doc: captured.document, plugins: [createHistoryPlugin()] }) });
    expect(MarkdownExporter.exportWithSource(editor.state.doc, captured.source).markdown).toBe(source);
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([1, 0], 6)));
    expect(insertText(editor, ' Reviewed.')).toBe(true);
    const saved = MarkdownExporter.exportWithSource(editor.state.doc, captured.source);
    expect(saved.markdown).toContain('<!-- provenance -->');
    expect(MarkdownImporter.parseWithSource(saved.markdown, schema, settings).document.toJSON()).toEqual(editor.state.doc.toJSON());
    expect(undo(editor)).toBe(true);
    expect(MarkdownExporter.exportWithSource(editor.state.doc, captured.source).markdown).toBe(source);
    editor.destroy();
  });
  it.each(['<!-- c --> **bold**', '# Title <!-- c --> *italic*', '> Quote <!-- c --> **strong**', '- Item <!-- c --> **strong**'])('does not turn neighboring Markdown formatting into literal text: %s', source => {
    const doc = MarkdownImporter.parse(source, schema, settings);
    const result = MarkdownExporter.exportWithReport(doc);
    expect(result.losses.some(loss => loss.type === 'html_comment')).toBe(false);
    expect(MarkdownImporter.parse(result.markdown, schema, settings).toJSON()).toEqual(doc.toJSON());
  });
  it.each(['', ' internal -- hyphens ', '?php echo $a; ?', 'ELEMENT br EMPTY', '<script>alert(1)</script>', '<strong>a</strong><strong>b</strong>', '<a href="/x">a</a><a href="/x">b</a>', ' trailing-'])('serializes inert data without interpreting it: %j', data => {
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.node('html_comment', { data })])]);
    const html = HTMLExporter.export(doc, { document: false });
    expect(html).toContain(htmlCommentSource(data));
    expect(ServerHTMLImporter.parseFragment(html, schema)[0].toJSON()).toEqual(doc.child(0).toJSON());
    expect(doc.textContent).toBe('');
  });
  it.each(['> breakout', '->breakout', 'x--> <script>bad()</script>', 'x--!>bad', '<!--nested', 'x<!-', '\u0000', '\r', 'x'.repeat(65_537)])('rejects unsafe or non-round-trippable data: case %#', data => {
    expect(isHTMLCommentData(data)).toBe(false);
    expect(() => schema.node('html_comment', { data })).toThrow();
    expect(() => htmlCommentSource(data)).toThrow();
  });
});
