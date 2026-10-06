import { describe, expect, it } from 'vitest';
import { Editor, EditorState, Schema, MarkdownImporter, MarkdownExporter, HTMLExporter,
  createHistoryPlugin, undo, redo, type MarkdownHTMLFlowFallback, type MarkdownImportOptions } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(CoreSchemaSpec);
const incomplete = ['<div id="foo"\n*hi*', '<div class\nfoo', '<div *???-&&&-<---\n*foo*'];

describe('unfinished raw HTML must not erase Markdown source', () => {
  for (const ending of ['\n', '\r\n']) for (const profile of ['flow', 'document'] as const) {
    it.each(incomplete)(`${profile} retains incomplete source with ${JSON.stringify(ending)}: %s`, value => {
      const source = value.replaceAll('\n', ending) + ending;
      const fallbacks: MarkdownHTMLFlowFallback[] = [];
      const importer = new ServerHTMLImporter({ maxParseErrors: 1 });
      const options: MarkdownImportOptions = {
        ...(profile === 'flow' ? { parseHTMLFlow: importer.parseFlow.bind(importer) }
          : { parseHTMLDocument: importer.parseTextBlockFlow.bind(importer) }),
        onHTMLFlowFallback: issue => fallbacks.push(issue),
      };
      const captured = MarkdownImporter.parseWithSource(source, schema, options);
      const expected = MarkdownImporter.parse(source, schema);
      expect(captured.document.toJSON()).toEqual(expected.toJSON());
      expect(captured.document.textContent).toContain(value.split('\n').at(-1)!);
      expect(fallbacks).toContainEqual(expect.objectContaining({ reason: 'error', message: expect.stringContaining('unfinished HTML tag') }));
      expect(JSON.stringify(fallbacks)).not.toContain('foo');
      expect(MarkdownExporter.exportWithSource(captured.document, captured.source).markdown).toBe(source);
      expect(schema.nodeFromJSON(captured.document.toJSON()).toJSON()).toEqual(expected.toJSON());
      const canonical = MarkdownExporter.export(captured.document);
      expect(MarkdownImporter.parse(canonical, schema, options).toJSON()).toEqual(expected.toJSON());
      expect(HTMLExporter.export(captured.document, { document: false })).toContain('&lt;div');
      const editor = new Editor(EditorState.create({ schema, doc: captured.document, plugins: [createHistoryPlugin()] }));
      editor.dispatch(editor.createTransaction().insertText([0, 0], 0, 'Safe: '));
      const edited = editor.getJSON();
      expect(editor.state.doc.textContent).toContain('Safe: <div');
      undo(editor);
      expect(editor.getJSON()).toEqual(expected.toJSON());
      expect(MarkdownExporter.exportWithSource(editor.state.doc, captured.source).markdown).toBe(source);
      redo(editor);
      expect(editor.getJSON()).toEqual(edited);
      editor.destroy();
    });
  }

  it('refuses erased raw source even when the diagnostic budget is already exhausted', () => {
    const source = '<div x=1 x=2\nprivate-token';
    const importer = new ServerHTMLImporter({ maxParseErrors: 1 });
    expect(() => importer.parseFlow([{ kind: 'html', html: source }], schema)).toThrow('unfinished HTML tag');
    const issues: MarkdownHTMLFlowFallback[] = [];
    const doc = MarkdownImporter.parse(source, schema, {
      parseHTMLDocument: importer.parseTextBlockFlow.bind(importer), onHTMLFlowFallback: issue => issues.push(issue),
    });
    expect(doc.textContent).toContain('private-token');
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('unfinished HTML tag');
    expect(JSON.stringify(issues)).not.toContain('private-token');
  });

  it.each(['<div>visible', '<p><strong>visible', '<div id="x">\n*literal*'])('still accepts an unclosed element with a complete opening tag: %s', source => {
    const issues: MarkdownHTMLFlowFallback[] = [];
    const parsed = MarkdownImporter.parse(source, schema, { parseHTMLDocument: ServerHTMLImporter.parseTextBlockFlow, onHTMLFlowFallback: issue => issues.push(issue) });
    expect(parsed.textContent).not.toContain('<');
    expect(parsed.textContent).toContain(source.includes('literal') ? '*literal*' : 'visible');
    expect(issues).toEqual([]);
  });

  it('leaves direct HTML browser-style repair unchanged, with its explicit parse-error report', () => {
    const result = ServerHTMLImporter.parseWithReport('<div id="foo"\n*hi*', schema);
    expect(result.document.textContent).toBe('');
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'html-parse-error', message: expect.stringContaining('eof-in-tag') }));
  });
});
