// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Schema, Editor, EditorState, NodeSelection, insertText } from '../src/core';
import { EditorView } from '../src/view';
import { HTMLImporter } from '../src/core/importers/html-importer';
import { HTMLExporter } from '../src/core/exporters/html-exporter';
import { CoreExtension, composeExtensions } from '../src/extensions';
import { createInertHTMLBlockExtension, createInertHTMLInlineExtension, createInertHTMLRawTextExtension } from '../src/html/inert';
import { ServerHTMLImporter } from '../src/html/server';
const schema = new Schema(composeExtensions([CoreExtension, createInertHTMLInlineExtension({ tags: ['foo', 'bar', 'lab.measurement'] })]).schema);
describe('inert source browser/parser boundaries', () => {
  it('retains childless paragraphs and never hides source children behind empty markers', () => {
    const doc = schema.node('doc', {}, [schema.node('paragraph', { align: 'center' }, []),
      schema.node('blockquote', {}, [schema.node('paragraph', {}, []), schema.node('paragraph', {}, [schema.text('')])])]);
    expect(HTMLImporter.parse(HTMLExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
    for (const content of ['Visible', ' ', '<strong>Visible</strong>', '<!--source-->', '<span></span>', '<img src="/plot.png" alt="Plot">']) {
      const marked = `<p data-fountain-empty="block">${content}</p>`;
      const ordinary = `<p>${content}</p>`;
      expect(HTMLImporter.parse(marked, schema).toJSON()).toEqual(HTMLImporter.parse(ordinary, schema).toJSON());
      expect(HTMLImporter.parse(marked, schema).toJSON()).toEqual(ServerHTMLImporter.parse(marked, schema).toJSON());
    }
  });
  it('matches structured server block import and reopens its safe carrier in the browser', () => {
    const blocks = new Schema(composeExtensions([CoreExtension, createInertHTMLBlockExtension({ tags: ['lab-section', 'warning'] })]).schema);
    const source = '<lab-section onclick="bad()"><h2>Results</h2><p>First</p><ul><li>Check</li></ul><table><tr><td>12</td></tr></table><warning></warning></lab-section>';
    expect(HTMLImporter.parse(source, blocks).toJSON()).toEqual(ServerHTMLImporter.parse(source, blocks).toJSON());
    const doc = ServerHTMLImporter.parse(source, blocks, { sourceTokens: true });
    const html = HTMLExporter.export(doc, { document: false });
    expect(HTMLImporter.parse(html, blocks).toJSON()).toEqual(doc.toJSON());
    const live = new DOMParser().parseFromString(html, 'text/html');
    expect(live.querySelectorAll('lab-section,warning,[onclick]')).toHaveLength(0);
    expect(live.querySelectorAll('[data-fountain-inert-block]')).toHaveLength(2);
    for (const changed of [
      html.replace('<div data-fountain-inert-content', 'Unexpected<div data-fountain-inert-content'),
      html.replace(' ⟦lab-section: retained HTML⟧</span>', ' ⟦lab-section: retained HTML⟧<img src="/added.png" alt="Added"></span>'),
    ]) {
      const parsed = HTMLImporter.parse(changed, blocks);
      expect(parsed.textContent).toContain('Results');
      expect(parsed.textContent).toContain('lab-section: retained HTML');
      if (changed.includes('Unexpected')) expect(parsed.textContent).toContain('Unexpected');
      else {
        const images: string[] = [];
        parsed.descendants(node => { if (['image_super', 'inline_image'].includes(node.type.name)) images.push(String(node.attrs.src)); });
        expect(images).toEqual(['/added.png']);
      }
    }
  });
  it('selects an empty inline code content region by pointer without adding model placeholders', () => {
    const localSchema = new Schema(composeExtensions([CoreExtension,
      createInertHTMLRawTextExtension({ tags: ['script'] })]).schema);
    const doc = ServerHTMLImporter.parse('<p><script></script> neighbour</p>', localSchema);
    const editor = new Editor(EditorState.create({ schema: localSchema, doc }));
    const mount = document.createElement('div'); document.body.append(mount);
    const view = new EditorView(mount, editor);
    try {
      const original = editor.getJSON();
      const index = doc.child(0).content.findIndex(node => node.type.name === 'html_inert_raw_text');
      const source = view.dom.querySelector('code[data-fountain-inert-content]')!;
      expect(source.querySelector('br')).not.toBeNull();
      expect(editor.state.doc.child(0).child(index).childCount).toBe(0);
      source.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      expect(editor.state.selection).toBeInstanceOf(NodeSelection);
      expect((editor.state.selection as NodeSelection).nodePath).toEqual([0, index]);
      expect(editor.getJSON()).toEqual(original);
      expect(insertText(editor, 'literal')).toBe(true);
      expect(editor.state.doc.child(0).child(index).textContent).toBe('literal');
      expect(editor.state.doc.child(0).child(index + 1).textContent).toBe(' neighbour');
      expect(view.dom.querySelector('[data-fountain-empty-text-block]')).toBeNull();
      expect(HTMLExporter.export(doc, { document: false })).not.toContain('<br');
    } finally {
      view.destroy(); editor.destroy(); mount.remove(); document.getSelection()?.removeAllRanges();
    }
  });
  it('uses ordinary DOM elements without claiming lexical source tokens', () => {
    const doc = HTMLImporter.parse('<p><FoO data-v="a">Text</FOO></p>', schema);
    expect(doc.child(0).child(0).attrs.tokens).toBeNull();
    expect(doc.child(0).child(0).attrs.attributes).toEqual({ 'data-v': 'a' });
  });
  it('retains server-collected tokens through safe browser carriers', () => {
    const doc = ServerHTMLImporter.parse("<p><FoO data-v='a'>outer <bar></bar></FOO> <lab.measurement>x</lab.measurement></p>", schema, { sourceTokens: true });
    const html = HTMLExporter.export(doc, { document: false });
    expect(HTMLImporter.parse(html, schema).toJSON()).toEqual(doc.toJSON());
    expect(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('foo,bar,lab\\.measurement')).toHaveLength(0);
  });
  it('keeps extra carrier siblings visible instead of swallowing them', () => {
    const doc = ServerHTMLImporter.parse('<p><foo>Text</foo></p>', schema);
    const html = HTMLExporter.export(doc, { document: false }).replace('<span data-fountain-inert-content', 'Extra<span data-fountain-inert-content');
    expect(HTMLImporter.parse(html, schema).textContent).toContain('Extra');
  });
  it('retains raw-text literal values and server provenance through browser-safe carriers', () => {
    const raw = new Schema(composeExtensions([CoreExtension, createInertHTMLRawTextExtension({ tags: ['script', 'style', 'textarea'] })]).schema);
    const source = '<p>Before</p><script data-x="a">\n😀 <strong>literal</strong>\n</script><textarea>\n&amp; 😀</textarea><p>After</p>';
    const doc = ServerHTMLImporter.parse(source, raw, { sourceTokens: true });
    const html = HTMLExporter.export(doc, { document: false });
    expect(HTMLImporter.parse(html, raw).toJSON()).toEqual(doc.toJSON());
    expect(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('script,style,textarea')).toHaveLength(0);
    const direct = HTMLImporter.parse(source, raw);
    const values: string[] = [];
    direct.descendants(node => { if (node.type.name === 'html_inert_raw_text') {
      expect(node.content.every(child => child.isText && !child.marks.length)).toBe(true);
      expect(node.attrs.tokens).toBeNull(); values.push(node.textContent);
    } });
    expect(values).toEqual(['\n😀 <strong>literal</strong>\n', '& 😀']);
  });
  it('does not hide added media in a modified carrier badge', () => {
    const doc = ServerHTMLImporter.parse('<p><foo>Text</foo></p>', schema);
    const html = HTMLExporter.export(doc, { document: false }).replace(' ⟦foo: retained HTML⟧</span>', ' ⟦foo: retained HTML⟧<img src="/image.png" alt="Added figure"></span>');
    for (const parsed of [HTMLImporter.parse(html, schema), ServerHTMLImporter.parse(html, schema)]) {
      const images: unknown[] = [];
      parsed.descendants(node => { if (node.type.name === 'inline_image') images.push(node.attrs.src); });
      expect(images).toEqual(['/image.png']);
      expect(parsed.textContent).toContain('retained HTML');
    }
  });
});
