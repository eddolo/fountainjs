// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Schema, HTMLFlowExtension, HTMLContainerExtension, HTMLImporter, HTMLExporter, MarkdownExporter, EditorView, EditorState, createEditor } from '../src';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...HTMLContainerExtension.nodes, ...HTMLFlowExtension.nodes } });
describe('browser/server anonymous flow agreement', () => {
  it.each(['\n*bar*\n\n', '\r*bar*\r\r', '\r\n*bar*\r\n\r\n', ' \t\n\n'])(
    'retains literal canonical-flow line endings with both HTML parsers (%j)', text => {
      for (const marks of [[], [schema.mark('strong')]]) {
        const doc = schema.node('doc', {}, [schema.node('html_flow', {}, [schema.text(text, marks)])]);
        const saved = MarkdownExporter.export(doc);
        expect(HTMLImporter.parse(saved, schema).toJSON()).toEqual(doc.toJSON());
        expect(ServerHTMLImporter.parse(saved, schema).toJSON()).toEqual(doc.toJSON());
      }
    },
  );
  it.each([
    '<div data-fountain-html-flow="true"></div>',
    '<div data-fountain-html-flow="true" data-fountain-empty-text="true"></div>',
  ])('allows pointer focus and typing after reopening empty inline flow: %s', html => {
    const doc = HTMLImporter.parse(html, schema);
    const editor = createEditor({ schema: schema.spec, state: EditorState.create({ schema, doc }) });
    const mount = document.createElement('div'); document.body.append(mount);
    const view = new EditorView(mount, editor);
    const block = view.dom.querySelector<HTMLElement>('[data-fountain-node="html_flow"]')!;
    block.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    view.dom.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'Filled' }));
    expect(editor.state.doc.child(0).type.name).toBe('html_flow');
    expect(editor.state.doc.textContent).toBe('Filled');
    view.destroy(); editor.destroy(); mount.remove();
  });
  it.each([
    '<p>A</p><a href="/guide">\n</a><p>B</p>',
    '<strong>Before</strong><p>Paragraph</p><em>after</em>',
    '<div data-fountain-html-flow="true"><a href="/guide">text</a></div>',
    '<section><p>A</p><a href="/guide">\n</a><p>B</p></section>',
    '<p><strong> </strong></p>',
  ])('preserves the same complete model for %s', html => {
    const doc = HTMLImporter.parse(html, schema);
    expect(doc.toJSON()).toEqual(ServerHTMLImporter.parse(html, schema).toJSON());
    expect(HTMLImporter.parse(HTMLExporter.export(doc), schema).toJSON()).toEqual(doc.toJSON());
  });
  it.each([
    '<div data-fountain-html-flow="true" data-fountain-empty-text="true"></div>',
    '<div data-fountain-html-flow="true"></div>',
  ])('retains canonical empty-flow shape in browser and server: %s', html => {
    const browser = HTMLImporter.parse(html, schema);
    expect(browser.toJSON()).toEqual(ServerHTMLImporter.parse(html, schema).toJSON());
    expect(browser.child(0).type.name).toBe('html_flow');
    expect(browser.child(0).childCount).toBe(html.includes('data-fountain-empty-text') ? 1 : 0);
  });
  it.each(['false', 'true" onclick="bad()', 'true" style="display:none'])('declines invalid or active empty-caret attributes (%s)', value => {
    const html = `<div data-fountain-html-flow="true" data-fountain-empty-text="${value}"></div>`;
    expect(HTMLImporter.parse(html, schema).child(0).type.name).not.toBe('html_flow');
    const result = ServerHTMLImporter.parseWithReport(html, schema);
    expect(result.document.child(0).type.name).not.toBe('html_flow');
    expect(result.issues.some(issue => issue.code === 'unmapped-block-wrapper')).toBe(true);
  });
});
