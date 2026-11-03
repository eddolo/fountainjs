// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { Schema, Editor, EditorState, createHistoryPlugin, undo, redo, HTMLExporter, MarkdownImporter, MarkdownExporter } from '../src/headless';
import { CoreExtension, HTMLAnchorExtension, composeExtensions } from '../src/extensions';
import { createInertHTMLAnchorExtension } from '../src/html/inert';
import { exportHTMLSource } from '../src/html/source';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(composeExtensions([CoreExtension, HTMLAnchorExtension, createInertHTMLAnchorExtension()]).schema);
const importer = new ServerHTMLImporter({ sourceTokens: true });
const options = { parseHTMLDocument: importer.parseTextBlockFlow.bind(importer) };
const retained = (doc: import('../src/headless').Node) => {
  const nodes: import('../src/headless').Node[] = [];
  doc.descendants(node => { if (node.type.name === 'html_inert_anchor') nodes.push(node); });
  return nodes;
};

describe('explicit inert anchor fallback', () => {
  it.each([
    '<a foo="bar" bam="baz &lt;em&gt;" _boolean zoop:33="zoop:33">label</a>',
    '<a href="\\*">label</a>',
    '<a href="javascript:globalThis.anchorPwned=1" onclick="bad()">label</a>',
    '<a href="java&#10;script:bad()" style="background:url(https://invalid.test/x)">label</a>',
    '<a href="/safe" id="bookmark" class="host-class" target="custom-frame">label</a>',
    '<a href="/safe" data-extra="a&#13;&#10;b" download="file.txt">label</a>',
    '<a title="empty" data-empty="true"></a>',
  ])('preserves source attributes and current content without navigation: %s', html => {
    expect(typeof document).toBe('undefined');
    const doc = importer.parse(`<p>Before ${html} after</p>`, schema);
    expect(retained(doc)).toHaveLength(1);
    const anchor = retained(doc)[0];
    const safe = HTMLExporter.export(doc, { document: false });
    const inspect = (node: DefaultTreeAdapterMap['node']) => {
      if ('tagName' in node) {
        expect(node.tagName).not.toBe('a');
        expect(node.attrs.some(attr => /^on/iu.test(attr.name) || ['style', 'href', 'src', 'id', 'name'].includes(attr.name))).toBe(false);
      }
      if ('childNodes' in node) node.childNodes.forEach(inspect);
    };
    inspect(parseFragment(safe));
    expect(importer.parse(safe, schema).toJSON()).toEqual(doc.toJSON());
    const result = exportHTMLSource(doc);
    expect(result.ok, JSON.stringify(result.issues)).toBe(true);
    if (result.ok) {
      expect(result.sanitized).toBe(false);
      const reopened = importer.parse(result.sourceHTML, schema);
      expect(retained(reopened)[0].attrs.attributes).toEqual(anchor.attrs.attributes);
      expect(retained(reopened)[0].textContent).toBe(anchor.textContent);
    }
  });

  it('preserves native data through edits, history, JSON and canonical Markdown', () => {
    const source = 'Before <a data-owner="Ada" href="\\*">original **strong**</a> after.\n';
    const captured = MarkdownImporter.parseWithSource(source, schema, options);
    expect(MarkdownExporter.exportWithSource(captured.document, captured.source).markdown).toBe(source);
    const editor = new Editor(EditorState.create({ schema, doc: captured.document, plugins: [createHistoryPlugin()] }));
    const before = editor.getJSON();
    try {
      editor.dispatch(editor.createTransaction().insertText([0, 1, 0], 0, 'Edited '));
      const edited = editor.getJSON();
      const output = exportHTMLSource(editor.state.doc);
      expect(output.ok).toBe(true);
      if (output.ok) expect(output.sourceHTML).toContain('Edited original');
      expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
      expect(redo(editor)).toBe(true); expect(editor.getJSON()).toEqual(edited);
      expect(schema.nodeFromJSON(edited).toJSON()).toEqual(edited);
      const saved = MarkdownExporter.export(editor.state.doc);
      expect(MarkdownImporter.parse(saved, schema, options).toJSON()).toEqual(edited);
      expect(retained(editor.state.doc)[0].attrs.attributes).toEqual({ 'data-owner': 'Ada', href: '\\*' });
    } finally { editor.destroy(); }
  });

  it('keeps supported hyperlinks and higher-priority bookmarks native', () => {
    const doc = importer.parse('<p><a href="/safe" title="Title" target="_self">Link</a> <a id="note">Bookmark</a></p>', schema);
    expect(retained(doc)).toHaveLength(0);
    expect(doc.child(0).child(0).marks[0].attrs.href).toBe('/safe');
    expect(doc.child(0).child(2).type.name).toBe('html_anchor');
    const encoded = importer.parse('<p><a href="folder/&#9;name">Link</a></p>', schema);
    expect(retained(encoded)).toHaveLength(0);
    expect(importer.parse(HTMLExporter.export(encoded, { document: false }), schema).toJSON()).toEqual(encoded.toJSON());
  });

  it('retains bookmarks when the optional native bookmark extension is absent', () => {
    const local = new Schema(composeExtensions([CoreExtension, createInertHTMLAnchorExtension()]).schema);
    expect(retained(importer.parse('<p><a id="note">Bookmark</a></p>', local))[0].attrs.attributes).toEqual({ id: 'note' });
  });

  it('does not change the default URL policy or schema', () => {
    const local = new Schema(composeExtensions([CoreExtension]).schema);
    expect(local.nodes.html_inert_anchor).toBeUndefined();
    const result = importer.parseWithReport('<p><a href="javascript:bad()">Visible</a></p>', local);
    expect(result.document.textContent).toBe('Visible');
    expect(result.document.child(0).child(0).marks).toEqual([]);
    expect(result.issues.some(issue => issue.code === 'rejected-url')).toBe(true);
  });

  it('reports limits without dropping the visible descendants', () => {
    const result = importer.parseWithReport(`<p><a data-big="${'a'.repeat(8193)}">Visible</a></p>`, schema);
    expect(result.document.textContent).toBe('Visible');
    expect(retained(result.document)).toHaveLength(0);
    expect(result.issues.some(issue => issue.code === 'invalid-rule-result')).toBe(true);
  });

  it('declines damaged carriers and keeps newly inserted visible content', () => {
    const original = importer.parse('<p><a data-owner="Ada">Visible</a></p>', schema);
    const html = HTMLExporter.export(original, { document: false });
    for (const damaged of [
      html.replace('<span data-fountain-inert-content', 'Extra<span data-fountain-inert-content'),
      html.replace('a: retained HTML', 'changed badge'),
      html.replace('&quot;tag&quot;:&quot;a&quot;', '&quot;tag&quot;:&quot;script&quot;'),
    ]) {
      const reopened = importer.parse(damaged, schema);
      expect(retained(reopened)).toHaveLength(0);
      expect(reopened.textContent).toContain('Visible');
    }
  });

  it('refuses nested anchor reconstruction instead of changing HTML ownership', () => {
    const inner = schema.node('html_inert_anchor', { tag: 'a', attributes: { href: '/inner', 'data-owner': 'inner' } }, [schema.text('inside')]);
    const outer = schema.node('html_inert_anchor', { tag: 'a', attributes: { href: '/outer', 'data-owner': 'outer' } }, [inner]);
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [outer])]);
    const result = exportHTMLSource(doc);
    expect(result.ok).toBe(false);
    expect(result.issues.some(issue => issue.code === 'source-reopen-mismatch')).toBe(true);
    expect(retained(importer.parse(HTMLExporter.export(doc, { document: false }), schema))).toHaveLength(2);
  });
});
