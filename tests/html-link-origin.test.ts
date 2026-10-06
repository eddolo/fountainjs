// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Schema, CoreSchemaSpec, HTMLImporter, HTMLExporter, MarkdownImporter, MarkdownExporter,
  EditorView, Editor, EditorState, Selection, createHistoryPlugin, insertText, undo, redo,
  editLink, CoreExtension, composeExtensions, createLinkBehaviorExtension, createEditor } from '../src';
import { ServerHTMLImporter } from '../src/html/server';
import { RubyExtension } from '../src/ruby';

const schema = new Schema(CoreSchemaSpec);
const cases = ['foo\\bar', '/bar\\/)', 'foo  \nbar', 'foo\\\nbar', 'folder/\tname', '#note\rpart',
  'https://example.test/path?q=a\nb', 'https://safe.test\\@evil.test/path', 'folder\\quote"and&<angle>'];
const escape = (value: string) => value.replace(/[&<>"\t\n\r]/gu, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? `&#${c.charCodeAt(0)};`));
const options = { parseHTMLDocument: ServerHTMLImporter.parseTextBlockFlow };

describe('source-bound HTML link navigation', () => {
  it.each(cases)('retains data and the actual browser navigation of %j', source => {
    const input = `<p>Before <a href="${escape(source)}" title="A &amp; B">label</a> after.</p>`;
    const doc = ServerHTMLImporter.parse(input, schema);
    expect(HTMLImporter.parse(input, schema).toJSON()).toEqual(doc.toJSON());
    const original = doc.toJSON();
    const editor = new Editor(EditorState.create({ schema, doc, plugins: [createHistoryPlugin()] }));
    const mount = document.createElement('div'); document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    try {
      const anchor = view.dom.querySelector('a')!;
      const navigation = source.replace(/[\t\n\r]/gu, '');
      expect(anchor.getAttribute('href')).toBe(navigation);
      expect(anchor.href).toBe(new URL(source, document.baseURI).href);
      editor.dispatch(editor.createTransaction().setSelection(new Selection([0, 1], 0, 5)));
      expect(insertText(editor, 'edited')).toBe(true);
      const edited = editor.getJSON();
      expect(editor.state.doc.textContent).toBe('Before edited after.');
      undo(editor); expect(editor.getJSON()).toEqual(original);
      redo(editor); expect(editor.getJSON()).toEqual(edited);
      const html = HTMLExporter.export(editor.state.doc, { document: false });
      expect(HTMLImporter.parse(html, schema).toJSON()).toEqual(edited);
      expect(ServerHTMLImporter.parse(html, schema).toJSON()).toEqual(edited);
      expect(schema.nodeFromJSON(JSON.parse(JSON.stringify(edited))).toJSON()).toEqual(edited);
      for (const linkStyle of ['inline', 'reference'] as const) {
        const result = MarkdownExporter.exportWithReport(editor.state.doc, { linkStyle });
        expect(MarkdownImporter.parse(result.markdown, schema, options).toJSON()).toEqual(edited);
        if (source.includes('\\') && !source.includes('@evil')) {
          expect(result.losses).toContainEqual(expect.objectContaining({ kind: 'attribute', type: 'link' }));
        }
      }
    } finally { view.destroy(); editor.destroy(); mount.remove(); }
  });

  it('leaves ordinary links byte-compatible and keeps absent metadata absent', () => {
    for (const href of ['/guide', 'https://example.test/path', '#note', '']) {
      const mark = schema.mark('link', { href });
      expect(mark.toJSON()).toEqual({ type: 'link', attrs: { href, title: '', target: '_blank' } });
      expect(Object.hasOwn(mark.attrs, 'htmlHref')).toBe(false);
      const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('label', [mark])])]);
      expect(ServerHTMLImporter.parse(HTMLExporter.export(doc, { document: false }), schema).toJSON()).toEqual(doc.toJSON());
    }
  });

  it('rejects forged, unsafe, oversized and conflicting HTML carriers without changing the visible href', () => {
    for (const source of ['java\nscript:alert(1)', '//evil.test/\npath', 'different\\path', 'safe', `a${'\t'.repeat(2048)}`]) {
      const input = `<p><a href="safe/path" data-fountain-html-href="${escape(source)}">label</a></p>`;
      const result = new ServerHTMLImporter().parseWithReport(input, schema);
      expect(result.document.content[0].content[0].marks[0].attrs).toEqual({ href: 'safe/path', title: '', target: '_blank' });
      expect(HTMLImporter.parse(input, schema).toJSON()).toEqual(result.document.toJSON());
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid-rule-result' }));
      expect(result.issues.every(issue => !issue.message.includes(source))).toBe(true);
    }
    const both = '<p><a href="foo%5Cbar" data-fountain-link-href="foo\\bar" data-fountain-html-href="foo%5Cbar&#10;">label</a></p>';
    const result = new ServerHTMLImporter().parseWithReport(both, schema);
    expect(result.document.content[0].content[0].marks[0].attrs.href).toBe('foo%5Cbar');
    expect(result.document.content[0].content[0].marks[0].attrs.htmlHref).toBeUndefined();
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid-rule-result' }));
    expect(HTMLImporter.parse(both, schema).toJSON()).toEqual(result.document.toJSON());
  });

  it('never lets stale source metadata override a newly changed URL', () => {
    const mark = schema.mark('link', { href: '/new', htmlHref: 'old\\path' });
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('label', [mark])])]);
    const html = HTMLExporter.export(doc, { document: false });
    expect(html).toContain('href="/new"');
    expect(html).not.toContain('data-fountain-html-href');
    for (const source of ['java\nscript:bad', '//evil.test/\n', `x${'\t'.repeat(2048)}`]) {
      expect(() => schema.mark('link', { href: '/new', htmlHref: source })).toThrow('htmlHref');
    }
  });

  it('keeps HTML-source navigation through mixed strong/code/style/ruby marks', () => {
    const link = ServerHTMLImporter.parse('<p><a href="folder\\&#13;&#10;file">label</a></p>', schema).content[0].content[0].marks[0];
    for (const name of ['strong', 'code', 'text_color']) {
      const mark = schema.mark(name, name === 'text_color' ? { color: '#123456' } : {});
      const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('label', [link, mark])])]);
      expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema, options).toJSON()).toEqual(doc.toJSON());
    }
    const rubySchema = new Schema(composeExtensions([CoreExtension, RubyExtension]).schema);
    const rubyLink = rubySchema.mark('link', link.attrs);
    const rubyDoc = rubySchema.node('doc', {}, [rubySchema.node('paragraph', {}, [
      rubySchema.node('ruby', { rt: 'reading' }, [rubySchema.text('label', [rubyLink, rubySchema.mark('strong')])]),
    ])]);
    expect(MarkdownImporter.parse(MarkdownExporter.export(rubyDoc), rubySchema, options).toJSON()).toEqual(rubyDoc.toJSON());
  });

  it('reports and keeps the inert fallback when an HTML-enabled Markdown reader is absent', () => {
    const doc = ServerHTMLImporter.parse('<p><a href="folder\\file">label</a></p>', schema);
    const result = MarkdownExporter.exportWithReport(doc);
    expect(result.losses).toContainEqual(expect.objectContaining({ kind: 'attribute', type: 'link' }));
    const inert = MarkdownImporter.parse(result.markdown, schema);
    expect(inert.textContent).toContain('data-fountain-html-href');
    expect(inert.content[0].content[0].marks).toEqual([]);
  });

  it('validates native carriers in generated ruby and styled text instead of trusting hidden attributes', () => {
    const rubySchema = new Schema(composeExtensions([CoreExtension, RubyExtension]).schema);
    for (const wrapper of [
      (value: string) => `<ruby data-fountain-ruby="true"><rb>${value}</rb><rt>reading</rt></ruby>`,
      (value: string) => `<span data-fountain-text-style="true" style="color:#123456">${value}</span>`,
    ]) {
      for (const [attrs, expected] of [
        ['href="foo%5Cbar" data-fountain-link-href="foo\\bar"', { href: 'foo\\bar', title: '', target: '_blank' }],
        ['href="safe/path" data-fountain-html-href="java&#10;script:bad"', { href: 'safe/path', title: '', target: '_blank' }],
        ['href="safe/path" data-fountain-html-href="wrong\\path"', { href: 'safe/path', title: '', target: '_blank' }],
        ['href="foo%5Cbar" data-fountain-link-href="foo\\bar" data-fountain-html-href="foo%5Cbar&#10;"', { href: 'foo%5Cbar', title: '', target: '_blank' }],
      ] as const) {
        const doc = MarkdownImporter.parse(wrapper(`<a ${attrs}>label</a>`), rubySchema);
        const links: unknown[] = [];
        doc.descendants(node => node.marks.forEach(mark => { if (mark.type.name === 'link') links.push(mark.attrs); }));
        expect(links).toEqual([expected]);
      }
    }
  });

  it('uses rendered navigation for activation and clears source intent after a manual link edit', () => {
    const activate = vi.fn();
    const kit = composeExtensions([CoreExtension, createLinkBehaviorExtension({ onActivate: activate })]);
    const doc = ServerHTMLImporter.parse('<p><a href="folder\\&#10;file">label</a></p>', schema);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: doc.toJSON() });
    const mount = document.createElement('div'); document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    try {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      view.dom.querySelector('a')!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(activate).toHaveBeenCalledWith(expect.objectContaining({ href: 'folder\\file' }), event);
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
      expect(editLink(editor, 'new\\destination')).toBe(true);
      const mark = editor.state.doc.content[0].content[0].marks[0];
      expect(mark.attrs.htmlHref).toBeUndefined();
      expect(view.dom.querySelector('a')!.getAttribute('href')).toBe('new%5Cdestination');
    } finally { view.destroy(); editor.destroy(); mount.remove(); }
  });
});
