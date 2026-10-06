import { describe, expect, it } from 'vitest';
import { Schema, Editor, EditorState, Selection, NodeSelection, createHistoryPlugin, undo, redo, insertText, setMark, MarkdownImporter, MarkdownExporter, HTMLExporter } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';
import { createInertHTMLRawTextExtension } from '../src/html/inert';
import { parseFragment } from 'parse5';

const extension = createInertHTMLRawTextExtension({ tags: ['script', 'style', 'textarea'] });
const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...extension.nodes } });
const importer = new ServerHTMLImporter({ sourceTokens: true });
const options = { parseHTMLDocument: importer.parseTextBlockFlow.bind(importer) };
const examples = [
  ['script', '<ScRiPt type="text/javascript" onclick="evil()">\n// 😀 <strong>literal</strong>\n\nglobalThis.rawPwned=1;\n</SCRIPT>\nokay\n', '\n// 😀 <strong>literal</strong>\n\nglobalThis.rawPwned=1;\n'],
  ['style', '<style\n type="text/css">\nh1 {color:red;}\n\np {background:url(https://invalid.test/x);}\n</style>\nokay\n', '\nh1 {color:red;}\n\np {background:url(https://invalid.test/x);}\n'],
  ['textarea', '<textarea name="secret">\n\n*foo*\n\n_bar_ &amp; 😀\n\n</textarea>\n', '\n*foo*\n\n_bar_ & 😀\n\n'],
  ['style', '<style type="text/css">\n\nfoo\n', '\n\nfoo\n'],
  ['script', '<script>\nfoo\n</script>1. *bar*\n', '\nfoo\n'],
  ['script', '<script></script>\n', ''],
] as const;

describe('opt-in inert raw-text HTML', () => {
  for (const ending of ['\n', '\r\n']) it.each(examples)('retains literal %s source with ' + JSON.stringify(ending), (tag, value, text) => {
    const source = value.replaceAll('\n', ending);
    const fallbacks: unknown[] = [];
    const captured = MarkdownImporter.parseWithSource(source, schema, { ...options, onHTMLFlowFallback: issue => fallbacks.push(issue) });
    const nodes: Array<{ path: readonly number[]; node: typeof captured.document }> = [];
    captured.document.descendants((node, path) => { if (node.type.name === 'html_inert_raw_text') nodes.push({ path, node }); });
    expect(nodes).toHaveLength(1);
    const raw = nodes[0].node;
    expect(raw.attrs.tag).toBe(tag);
    expect(raw.textContent).toBe(text);
    expect(raw.content.every(child => child.isText && !child.marks.length)).toBe(true);
    expect(raw.attrs.tokens).toEqual(expect.objectContaining({ origin: 'markdown-projection' }));
    expect(fallbacks).toEqual([]);
    expect(MarkdownExporter.exportWithSource(captured.document, captured.source).markdown).toBe(source);
    const native = captured.document.toJSON();
    expect(schema.nodeFromJSON(native).toJSON()).toEqual(native);
    const html = HTMLExporter.export(captured.document, { document: false });
    expect(importer.parse(html, schema).toJSON()).toEqual(native);
    expect(MarkdownImporter.parse(MarkdownExporter.export(captured.document), schema, options).toJSON()).toEqual(native);
    const tree = parseFragment(html);
    const inspect = (node: any) => {
      expect(['script', 'style', 'textarea']).not.toContain(node.tagName);
      expect((node.attrs ?? []).some((attr: any) => /^on/iu.test(attr.name) || ['src', 'href', 'style'].includes(attr.name))).toBe(false);
      (node.childNodes ?? []).forEach(inspect);
    };
    inspect(tree);
    if (raw.childCount) {
      const editor = new Editor(EditorState.create({ schema, doc: captured.document, plugins: [createHistoryPlugin()] }));
      editor.dispatch(editor.createTransaction().insertText([...nodes[0].path, 0], 0, 'EDIT '));
      const edited = editor.getJSON();
      expect(editor.state.doc.textContent).toContain('EDIT ');
      undo(editor); expect(editor.getJSON()).toEqual(native);
      expect(MarkdownExporter.exportWithSource(editor.state.doc, captured.source).markdown).toBe(source);
      redo(editor); expect(editor.getJSON()).toEqual(edited);
      editor.destroy();
    }
  });

  it('keeps source literal in direct HTML too, without emoji conversion', () => {
    const result = importer.parse('<p>Before <textarea>😀 &lt;em&gt;literal&lt;/em&gt;</textarea> after.</p>', schema);
    expect(result.child(0).child(1).content.map(node => node.type.name)).toEqual(['text']);
    expect(result.child(0).child(1).textContent).toBe('😀 <em>literal</em>');
    expect(result.child(0).child(1).attrs.tokens).toEqual(expect.objectContaining({ origin: 'html-input' }));
  });

  it('preserves user-applied display formatting without changing the raw source text', () => {
    const doc = MarkdownImporter.parse('<script>😀 literal</script>\n', schema, options);
    const editor = new Editor(EditorState.create({ schema, doc, plugins: [createHistoryPlugin()] }));
    editor.dispatch(editor.createTransaction().setSelection(Selection.range([0, 0, 0], 0, [0, 0, 0], 2)));
    expect(setMark(editor, 'strong')).toBe(true);
    expect(editor.state.doc.child(0).child(0).textContent).toBe('😀 literal');
    const html = HTMLExporter.export(editor.state.doc, { document: false });
    expect(importer.parse(html, schema).toJSON()).toEqual(editor.getJSON());
    expect(MarkdownImporter.parse(MarkdownExporter.export(editor.state.doc), schema, options).toJSON()).toEqual(editor.getJSON());
    editor.destroy();
  });

  it('fills an empty inline code source without replacing its identity or attributes', () => {
    const captured = MarkdownImporter.parseWithSource('<script></script>\n', schema, options);
    const original = captured.document.toJSON();
    const editor = new Editor(EditorState.create({ schema, doc: captured.document,
      selection: new NodeSelection(captured.document, [0, 0]), plugins: [createHistoryPlugin()] }));
    expect(insertText(editor, '😀 literal')).toBe(true);
    expect(editor.state.doc.child(0).child(0).type.name).toBe('html_inert_raw_text');
    expect(editor.state.doc.child(0).child(0).attrs).toEqual(captured.document.child(0).child(0).attrs);
    expect(editor.state.selection.path).toEqual([0, 0, 0]);
    expect(editor.state.doc.child(0).child(0).textContent).toBe('😀 literal');
    const filled = editor.getJSON();
    undo(editor); expect(editor.getJSON()).toEqual(original);
    redo(editor); expect(editor.getJSON()).toEqual(filled);
    editor.destroy();
  });

  it.each([[], ['script', 'script'], ['iframe'], ['svg'], ['SCRIPT'], ['plaintext']].map(tags => ({ tags })))('refuses unsupported raw-text registration: $tags', ({ tags }) => {
    expect(() => createInertHTMLRawTextExtension({ tags: tags as any })).toThrow(TypeError);
  });

  it.each([{ empty: false, code: true }, { empty: true, code: false }])(
    'still replaces a selected inline node when empty=$empty and code=$code', ({ empty, code }) => {
      const localSchema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
        html_inert_raw_text: { ...extension.nodes!.html_inert_raw_text, code } } });
      const imported = MarkdownImporter.parse('<script>old</script>\n', schema, options);
      const node = localSchema.node('html_inert_raw_text', imported.child(0).child(0).attrs,
        empty ? [] : [localSchema.text('old')]);
      const doc = localSchema.node('doc', {}, [localSchema.node('paragraph', {}, [node])]);
      const editor = new Editor(EditorState.create({ schema: localSchema, doc,
        selection: new NodeSelection(doc, [0, 0]), plugins: [createHistoryPlugin()] }));
      expect(insertText(editor, 'replacement')).toBe(true);
      expect(editor.state.doc.child(0).child(0).type.name).toBe('text');
      expect(editor.state.doc.textContent).toBe('replacement');
      expect(editor.state.selection.path).toEqual([0, 0]);
      undo(editor); expect(editor.getJSON()).toEqual(doc.toJSON());
      editor.destroy();
    });

  it('still refuses unsupported special scopes and raw-text consumption of protected Markdown nodes', () => {
    const fallbacks: unknown[] = [];
    const input = '<script>\n\nparagraph\n\n</script>\n';
    expect(MarkdownImporter.parse(input, new Schema(CoreSchemaSpec), { ...options, onHTMLFlowFallback: issue => fallbacks.push(issue) }).textContent).toContain('<script>');
    expect(fallbacks.length).toBeGreaterThan(0);
    const partial = '<textarea>literal\n\n**protected**';
    const recovered = MarkdownImporter.parse(partial, schema, { ...options, onHTMLFlowFallback: issue => fallbacks.push(issue) });
    // CommonMark keeps the entire textarea raw block, so no protected rich-text
    // nodes are fabricated inside it. HTML literal content is one text value.
    expect(recovered.child(0).child(0).textContent).toBe('literal\n\n**protected**\n');
    const inline = 'Before <script>**protected**</script> after.';
    const losses: unknown[] = [];
    const guarded = MarkdownImporter.parse(inline, schema, { ...options, onHTMLFlowFallback: issue => losses.push(issue) });
    expect(guarded.toJSON()).toEqual(MarkdownImporter.parse(inline, schema).toJSON());
    expect(losses).toContainEqual(expect.objectContaining({ reason: 'error', message: expect.stringContaining('every Markdown node') }));
  });
});
