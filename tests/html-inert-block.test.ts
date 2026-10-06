import { describe, expect, it } from 'vitest';
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { Schema, Editor, EditorState, createHistoryPlugin, undo, redo, HTMLExporter, MarkdownImporter, MarkdownExporter } from '../src/headless';
import { CoreExtension, composeExtensions } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';
import { appendInertHTMLBlockParagraph, createInertHTMLBlockExtension, createInertHTMLInlineExtension } from '../src/html/inert';

const schema = new Schema(composeExtensions([CoreExtension,
  createInertHTMLBlockExtension({ tags: ['warning', 'lab-section', 'lab.section'] }),
  createInertHTMLInlineExtension({ tags: ['lab-value'] }),
]).schema);
const importer = new ServerHTMLImporter({ sourceTokens: true });
const options = { parseHTMLDocument: importer.parseTextBlockFlow.bind(importer) };
const source = '<LaB-Section onclick="evil()" style="display:none" data-id=outer>\n<h2>Results</h2>\n<p>First <strong>finding</strong> and <lab-value units="m">12</lab-value>.</p>\n<ul><li>One</li><li>Two</li></ul>\n<table><tr><th>Measure</th><th>Value</th></tr><tr><td>A</td><td>12</td></tr></table>\n<p><img src="/figure.png" alt="Local figure"></p>\n<warning><p>Review me</p></warning>\n</LAB-SECTION>\n';

describe('opt-in inert block wrappers', () => {
  it('retains structured children, attributes and source tokens without a DOM', () => {
    expect(typeof document).toBe('undefined');
    const doc = importer.parse(source, schema);
    const wrapper = doc.child(0);
    expect(wrapper.type.name).toBe('html_inert_block');
    expect(wrapper.content.map(node => node.type.name)).toEqual(['heading', 'paragraph', 'bullet_list', 'table', 'paragraph', 'html_inert_block']);
    expect(wrapper.attrs.attributes).toEqual({ onclick: 'evil()', style: 'display:none', 'data-id': 'outer' });
    expect(wrapper.attrs.tokens).toEqual({ startTag: '<LaB-Section onclick="evil()" style="display:none" data-id=outer>', endTag: '</LAB-SECTION>', origin: 'html-input' });
    expect(wrapper.child(3).child(1).child(1).textContent).toBe('12');
    expect(wrapper.child(4).child(0).type.name).toBe('inline_image');
    expect(wrapper.child(5).child(0).textContent).toBe('Review me');
    schema.validate(doc);
  });

  it('edits a nested table cell through history and complete JSON/HTML/Markdown reopening', () => {
    const captured = MarkdownImporter.parseWithSource(source, schema, options);
    const editor = new Editor(EditorState.create({ schema, doc: captured.document, plugins: [createHistoryPlugin()] }));
    try {
      const original = editor.getJSON();
      let path: number[] = [];
      editor.state.doc.descendants((node, candidate) => { if (node.isText && node.text === 'A') path = [...candidate]; });
      expect(path.length).toBeGreaterThan(4);
      expect(editor.dispatch(editor.createTransaction().insertText(path, 1, ' revised'))).toBe(true);
      const edited = editor.getJSON();
      expect(schema.nodeFromJSON(JSON.parse(JSON.stringify(edited))).toJSON()).toEqual(edited);
      const html = HTMLExporter.export(editor.state.doc, { document: false });
      expect(importer.parse(html, schema).toJSON()).toEqual(edited);
      const exported = MarkdownExporter.exportWithSource(editor.state.doc, captured.source);
      expect(MarkdownImporter.parse(exported.markdown, schema, options).toJSON()).toEqual(edited);
      expect(exported.losses.some(loss => loss.type === 'html_inert_block' && loss.detail.includes('matching parse rules'))).toBe(true);
      expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(original);
      expect(MarkdownExporter.exportWithSource(editor.state.doc, captured.source).markdown).toBe(source);
      expect(redo(editor)).toBe(true); expect(editor.getJSON()).toEqual(edited);
    } finally { editor.destroy(); }
  });

  it('reopens a wrapper alongside the editor trailing empty paragraph', () => {
    const wrapped = importer.parse(source, schema);
    const doc = schema.node('doc', {}, [...wrapped.content, schema.node('paragraph', {}, [schema.text('')])]);
    const failures: unknown[] = [];
    const markdown = MarkdownExporter.export(doc);
    const parsed = MarkdownImporter.parse(markdown, schema, { ...options, onHTMLFlowFallback: issue => failures.push(issue) });
    expect(failures).toEqual([]);
    expect(parsed.toJSON()).toEqual(doc.toJSON());
  });

  it.each(['text', 'block'] as const)('retains explicit %s empty paragraphs before, inside and after HTML scopes', shape => {
    const failures: unknown[] = [];
    const marker = `<p data-fountain-empty="${shape}"></p>`;
    const input = `${marker}\n\n<lab-section>\n\n${marker}\n\n</lab-section>\n\n${marker}\n`;
    const parsed = MarkdownImporter.parse(input, schema, { ...options, onHTMLFlowFallback: issue => failures.push(issue) });
    expect(failures).toEqual([]);
    expect(parsed.content.map(node => node.type.name)).toEqual(['paragraph', 'html_inert_block', 'paragraph']);
    for (const node of [parsed.child(0), parsed.child(1).child(0), parsed.child(2)]) {
      expect(node.type.name).toBe('paragraph');
      expect(node.childCount).toBe(shape === 'text' ? 1 : 0);
      expect(node.textContent).toBe('');
    }
    expect(MarkdownImporter.parse(MarkdownExporter.export(parsed), schema, options).toJSON()).toEqual(parsed.toJSON());
    expect(importer.parse(HTMLExporter.export(parsed), schema).toJSON()).toEqual(parsed.toJSON());
  });

  it('discloses the scope of canonical preservation: adjacent unmarked leaves can coalesce', () => {
    const doc = schema.node('doc', {}, [schema.node('html_inert_block', { tag: 'warning' }, [
      schema.node('paragraph', {}, [schema.text('Plan.'), schema.text('Review.')]),
    ]), schema.node('paragraph', {}, [schema.text('')])]);
    const failures: unknown[] = [];
    const parsed = MarkdownImporter.parse(MarkdownExporter.export(doc), schema, { ...options, onHTMLFlowFallback: issue => failures.push(issue) });
    expect(failures).toEqual([]);
    const expected = doc.toJSON();
    expected.content![0].content![0].content = [{ type: 'text', text: 'Plan.Review.' }];
    expect(parsed.toJSON()).toEqual(expected);
    expect(schema.nodeFromJSON(JSON.parse(JSON.stringify(doc.toJSON()))).toJSON()).toEqual(doc.toJSON());
  });

  it('never emits original tags, event handlers, styles or custom-element upgrades', () => {
    const html = HTMLExporter.export(importer.parse(source, schema), { document: false });
    const inspect = (node: DefaultTreeAdapterMap['node']): void => {
      if ('attrs' in node) {
        expect(['lab-section', 'warning', 'lab-value'].includes(node.tagName)).toBe(false);
        expect(node.attrs.some(attr => /^on/iu.test(attr.name))).toBe(false);
        if (node.attrs.some(attr => attr.name.startsWith('data-fountain-inert-'))) {
          expect(node.attrs.some(attr => attr.name === 'style')).toBe(false);
        }
      }
      if ('childNodes' in node) node.childNodes.forEach(inspect);
    };
    inspect(parseFragment(html));
  });

  it('preserves empty wrappers and makes adding editable content an explicit undoable action', () => {
    const doc = importer.parse('<lab.section data-empty="true"></lab.section>', schema);
    expect(doc.child(0).childCount).toBe(0);
    expect(importer.parse(HTMLExporter.export(doc, { document: false }), schema).toJSON()).toEqual(doc.toJSON());
    expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema, options).toJSON()).toEqual(doc.toJSON());
    const editor = new Editor(EditorState.create({ schema, doc, plugins: [createHistoryPlugin()] }));
    try {
      const before = editor.getJSON();
      expect(appendInertHTMLBlockParagraph(editor, [0])).toBe(true);
      expect(editor.state.selection.path).toEqual([0, 0, 0]);
      expect(editor.dispatch(editor.createTransaction().insertText([0, 0, 0], 0, 'Added'))).toBe(true);
      expect(editor.state.doc.child(0).attrs).toEqual(doc.child(0).attrs);
      expect(undo(editor)).toBe(true); expect(undo(editor)).toBe(true);
      expect(editor.getJSON()).toEqual(before);
      expect(appendInertHTMLBlockParagraph(editor, [])).toBe(false);
      expect(appendInertHTMLBlockParagraph(editor, [-1])).toBe(false);
      const reader = new Editor(EditorState.create({ schema, doc }), undefined, false);
      try { expect(appendInertHTMLBlockParagraph(reader, [0])).toBe(false); }
      finally { reader.destroy(); }
    } finally { editor.destroy(); }
  });

  it.each([[], ['warning', 'warning'], ['Warning'], ['div'], ['script'], ['svg'], ['math'], ['w:p'], ['x'.repeat(65)]].map(tags => ({ tags })))('refuses ambiguous or reserved block registrations $tags', ({ tags }) => {
    expect(() => createInertHTMLBlockExtension({ tags })).toThrow(/unknown block tags/u);
  });

  it('does not alter the default schema or silently claim unsupported wrapper retention', () => {
    const ordinary = new Schema(composeExtensions([CoreExtension]).schema);
    expect(ordinary.nodes.html_inert_block).toBeUndefined();
    const result = importer.parseWithReport(source, ordinary);
    expect(result.document.textContent).toContain('Results');
    expect(result.document.child(0).type.name).not.toBe('html_inert_block');
    expect(result.issues.some(issue => issue.code === 'unmapped-inline-element')).toBe(true);
  });

  it('keeps visible siblings and badge contents when a safe carrier is tampered with', () => {
    const html = HTMLExporter.export(importer.parse('<warning><p>Body</p></warning>', schema), { document: false });
    for (const changed of [
      html.replace('<div data-fountain-inert-content', 'Unexpected<div data-fountain-inert-content'),
      html.replace(' ⟦warning: retained HTML⟧</span>', ' ⟦warning: retained HTML⟧<img src="/added.png" alt="Added"></span>'),
    ]) {
      const parsed = importer.parse(changed, schema);
      const wrappers: unknown[] = []; const images: unknown[] = [];
      parsed.descendants(node => {
        if (node.type.name === 'html_inert_block') wrappers.push(node);
        if (['image_super', 'inline_image'].includes(node.type.name)) images.push(node.attrs.src);
      });
      expect(wrappers).toHaveLength(0);
      expect(parsed.textContent).toContain('Body');
      expect(parsed.textContent).toContain('retained HTML');
      if (changed.includes('Unexpected')) expect(parsed.textContent).toContain('Unexpected');
      else expect(images).toEqual(['/added.png']);
    }
  });

  it('declines excessive source metadata with a diagnostic and visible children', () => {
    const result = importer.parseWithReport(`<warning data-x="${'x'.repeat(8_193)}"><h2>Visible</h2></warning>`, schema);
    expect(result.document.child(0).type.name).toBe('heading');
    expect(result.document.textContent).toBe('Visible');
    expect(result.issues.some(issue => issue.code === 'invalid-rule-result')).toBe(true);
  });
});
