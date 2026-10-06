import { describe, expect, it } from 'vitest';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { Schema, Editor, EditorState, createHistoryPlugin, undo, redo, HTMLExporter, MarkdownImporter, MarkdownExporter } from '../src/headless';
import { CoreExtension, composeExtensions } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';
import { createInertHTMLInlineExtension } from '../src/html/inert';

const schema = new Schema(composeExtensions([CoreExtension, createInertHTMLInlineExtension({ tags: ['foo', 'bar', 'fountain-unsafe', 'lab.measurement'] })]).schema);
const importer = new ServerHTMLImporter({ sourceTokens: true });
const options = { parseHTMLDocument: importer.parseTextBlockFlow.bind(importer) };
const source = "Before <FoO onclick='bad()' data-v=original>outside <bar>**inside**</bar> end</FOO> after.\n";

describe('registered inert inline HTML extension', () => {
  it('edits nested source, history, JSON, HTML and canonical Markdown without a fake DOM', () => {
    expect(typeof document).toBe('undefined');
    const captured = MarkdownImporter.parseWithSource(source, schema, options);
    const editor = new Editor(EditorState.create({ schema, doc: captured.document, plugins: [createHistoryPlugin()] }));
    try {
      const original = editor.getJSON();
      expect(editor.state.doc.child(0).child(1).type.name).toBe('html_inert_inline');
      expect(editor.state.doc.child(0).child(1).attrs.attributes).toEqual({ onclick: 'bad()', 'data-v': 'original' });
      let path: number[] = [];
      editor.state.doc.descendants((node, candidate) => { if (node.isText && node.text === 'inside') path = [...candidate]; });
      expect(path.length).toBeGreaterThan(0);
      editor.dispatch(editor.createTransaction().insertText(path, 6, ' revised'));
      const current = editor.getJSON();
      expect(schema.nodeFromJSON(JSON.parse(JSON.stringify(current))).toJSON()).toEqual(current);
      expect(importer.parse(HTMLExporter.export(editor.state.doc, { document: false }), schema).toJSON()).toEqual(current);
      const exported = MarkdownExporter.exportWithSource(editor.state.doc, captured.source);
      expect(MarkdownImporter.parse(exported.markdown, schema, options).toJSON()).toEqual(current);
      expect(exported.losses.some(loss => loss.type === 'html_inert_inline' && loss.detail.includes('matching parse rules'))).toBe(true);
      expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(original);
      expect(MarkdownExporter.exportWithSource(editor.state.doc, captured.source).markdown).toBe(source);
      expect(redo(editor)).toBe(true); expect(editor.getJSON()).toEqual(current);
    } finally { editor.destroy(); }
  });

  it('keeps hostile values as data, never as live tag names or attributes', () => {
    const html = '<p><fountain-unsafe onclick="evil()" style="background:url(https://invalid.test/x)" href="javascript:evil()">Editable</fountain-unsafe></p>';
    const doc = importer.parse(html, schema);
    const exported = HTMLExporter.export(doc, { document: false });
    const inspect = (node: DefaultTreeAdapterMap['node']): void => {
      if ('attrs' in node) {
        expect(node.tagName === 'p' || node.tagName === 'span').toBe(true);
        expect(node.attrs.some(attr => /^on/iu.test(attr.name) || ['style', 'href', 'src'].includes(attr.name))).toBe(false);
      }
      if ('childNodes' in node) node.childNodes.forEach(inspect);
    };
    inspect(parseFragment(exported));
    expect(importer.parse(exported, schema).toJSON()).toEqual(doc.toJSON());
    expect(doc.child(0).child(0).attrs.attributes).toEqual({ onclick: 'evil()', style: 'background:url(https://invalid.test/x)', href: 'javascript:evil()' });
  });

  it('preserves empty, literal-newline and arbitrary registered tag data', () => {
    const doc = importer.parse('<p><foo></foo> <lab.measurement units="m">value</lab.measurement></p>', schema);
    expect(doc.child(0).content.filter(node => node.type.name === 'html_inert_inline')).toHaveLength(2);
    expect(HTMLExporter.export(doc, { document: false })).toContain('foo: retained HTML');
    const node = schema.node('html_inert_inline', { tag: 'foo', attributes: { 'data-lines': 'a\r\nb' } }, [schema.text('a\r\nb', [schema.mark('strong')])]);
    const document = schema.node('doc', {}, [schema.node('paragraph', {}, [node])]);
    const markdown = MarkdownExporter.export(document);
    expect(MarkdownImporter.parse(markdown, schema, options).toJSON()).toEqual(document.toJSON());
  });

  it.each([[], ['foo', 'foo'], ['FOO'], ['foo,script'], ['script'], ['svg'], ['math'], ['p'], ['img'], ['strong'], ['span'], ['a'], ['w:p'], ['foo'.repeat(30)]].map(tags => ({ tags })))('refuses unsafe or ambiguous registration $tags', ({ tags }) => {
    expect(() => createInertHTMLInlineExtension({ tags })).toThrow(/unknown inline tags/u);
  });

  it('copies the registration and declines excessive source attributes with a report', () => {
    const tags = ['foo'];
    const extension = createInertHTMLInlineExtension({ tags });
    tags.push('unregistered');
    const target = new Schema(composeExtensions([CoreExtension, extension]).schema);
    const result = importer.parseWithReport(`<p><foo data-large="${'x'.repeat(8_193)}">Visible</foo></p>`, target);
    expect(result.document.textContent).toBe('Visible');
    expect(result.issues.some(issue => issue.code === 'invalid-rule-result')).toBe(true);
    expect(() => target.node('html_inert_inline', { tag: 'unregistered' })).toThrow();
  });

  it.each([
    { tag: 'script', attributes: {}, tokens: null },
    { tag: 'foo', attributes: { a: 2 }, tokens: null },
    { tag: 'foo', attributes: {}, tokens: { startTag: '<foo>', endTag: '</foo>', origin: 'trusted' } },
    { tag: 'foo', attributes: {}, tokens: null, extra: true },
  ])('declines invalid data carriers rather than claiming retention: %j', data => {
    const encoded = JSON.stringify(data).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    const result = importer.parseWithReport(`<p><span data-fountain-inert-inline="v1" data-fountain-inert-data="${encoded}"><span data-fountain-inert-content="true">Visible</span></span></p>`, schema);
    expect(result.document.textContent).toBe('Visible');
    expect(result.document.child(0).content.some(node => node.type.name === 'html_inert_inline')).toBe(false);
  });

  it('does not swallow an incomplete or attribute-spoofed carrier', () => {
    const data = JSON.stringify({ tag: 'foo', attributes: {}, tokens: null }).replaceAll('"', '&quot;');
    for (const body of [
      `<span data-fountain-inert-inline="v1" data-fountain-inert-data="${data}">Visible</span>`,
      `<span data-fountain-inert-inline="v1" data-fountain-inert-data="${data}" onclick="evil()"><span data-fountain-inert-content="true">Visible</span></span>`,
    ]) {
      const result = importer.parseWithReport(`<p>${body}</p>`, schema);
      expect(result.document.textContent).toBe('Visible');
      expect(result.document.child(0).content.some(node => node.type.name === 'html_inert_inline')).toBe(false);
    }
  });

  it('keeps ordinary HTML semantics and the default schema unchanged', () => {
    const ordinary = importer.parse('<p><strong>bold</strong> <a href="/safe">link</a></p>', schema);
    expect(ordinary.child(0).child(0).marks[0]?.type.name).toBe('strong');
    expect(ordinary.child(0).child(2).marks[0]?.type.name).toBe('link');
    const standard = new Schema(composeExtensions([CoreExtension]).schema);
    expect(standard.nodes.html_inert_inline).toBeUndefined();
    expect(importer.parseWithReport('<p><foo>content</foo></p>', standard).issues.some(issue => issue.code === 'unmapped-inline-element')).toBe(true);
  });

  it('declines modified carrier shells rather than silently discarding visible siblings', () => {
    const document = importer.parse('<p><foo>Visible</foo></p>', schema);
    const exported = HTMLExporter.export(document, { document: false });
    for (const extra of ['Unexpected text', '<em>Unexpected text</em>']) {
      const modified = exported.replace('<span data-fountain-inert-content', `${extra}<span data-fountain-inert-content`);
      const result = importer.parseWithReport(modified, schema);
      expect(result.document.textContent).toContain('Unexpected text');
      expect(result.document.child(0).content.some(node => node.type.name === 'html_inert_inline')).toBe(false);
    }
  });
});
