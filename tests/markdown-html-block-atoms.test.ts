import { describe, expect, it } from 'vitest';
import { HTMLContainerExtension, HTMLFlowExtension, Schema, MarkdownImporter, MarkdownExporter,
  HTMLExporter, EditorState, createEditor, createHistoryPlugin, Selection, insertText, undo, redo,
  type MarkdownHTMLFlowFallback, type SchemaSpec } from '../src/headless';
import { ServerHTMLImporter } from '../src/html/server';
import { CoreSchemaSpec } from '../src/extensions';

const spec: SchemaSpec = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...HTMLContainerExtension.nodes, ...HTMLFlowExtension.nodes } };
const schema = new Schema(spec);
const source = '<section id="report">\n\nBefore.\n\n---\n\n![A & B](/demo-media.svg "Diagram")\n\nAfter **review**.\n\n</section>\n';
const options = { parseHTMLDocument: ServerHTMLImporter.parseTextBlockFlow };

describe('Markdown source projection with protected block atoms', () => {
  it.each(['\n', '\r\n'])('retains the section, rule and complete image through %j source and canonical reopening', ending => {
    const fallbacks: MarkdownHTMLFlowFallback[] = [];
    const input = source.replaceAll('\n', ending);
    const parsed = MarkdownImporter.parseWithSource(input, schema, { ...options, onHTMLFlowFallback: issue => fallbacks.push(issue) });
    expect(fallbacks).toEqual([]);
    expect(parsed.document.child(0).type.name).toBe('html_container');
    const section = parsed.document.child(0);
    expect(section.attrs.id).toBe('report');
    expect(section.content.map(node => node.type.name)).toEqual(['paragraph', 'horizontal_rule', 'image_super', 'paragraph']);
    expect(section.child(2).attrs).toEqual(MarkdownImporter.parse('![A & B](/demo-media.svg "Diagram")', schema).child(0).attrs);
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(input);
    expect(MarkdownImporter.parse(MarkdownExporter.export(parsed.document), schema, options).toJSON()).toEqual(parsed.document.toJSON());
    expect(ServerHTMLImporter.parse(HTMLExporter.export(parsed.document, { document: false }), schema).toJSON()).toEqual(parsed.document.toJSON());
  });
  it('preserves atom identity while actually editing, undoing and redoing the surrounding paragraph', () => {
    const parsed = MarkdownImporter.parseWithSource(source, schema, options);
    expect(parsed.document.child(0).type.name).toBe('html_container');
    const editor = createEditor({ schema: spec, state: EditorState.create({ schema, doc: parsed.document, plugins: [createHistoryPlugin()] }) });
    const rule = parsed.document.child(0).child(1);
    const image = parsed.document.child(0).child(2);
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 3, 0], 0)));
    expect(insertText(editor, 'Updated: ')).toBe(true);
    expect(editor.state.doc.child(0).child(1)).toBe(rule);
    expect(editor.state.doc.child(0).child(2)).toBe(image);
    const saved = MarkdownExporter.exportWithSource(editor.state.doc, parsed.source);
    expect(saved.preservation).not.toBe('exact');
    expect(MarkdownImporter.parse(saved.markdown, schema, options).toJSON()).toEqual(editor.state.doc.toJSON());
    expect(undo(editor)).toBe(true);
    expect(MarkdownExporter.exportWithSource(editor.state.doc, parsed.source).markdown).toBe(source);
    expect(redo(editor)).toBe(true);
    expect(editor.state.doc.textContent).toContain('Updated: After');
    editor.destroy();
  });
  it.each(['- Before\n\n  ---\n\n  ![Diagram](/demo-media.svg)\n\n  After',
    '> Before\n>\n> ---\n>\n> ![Diagram](/demo-media.svg)\n>\n> After'])('preserves atoms in nested Markdown containers: %s', body => {
    const fallbacks: MarkdownHTMLFlowFallback[] = [];
    const doc = MarkdownImporter.parse(`<section>\n\n${body}\n\n</section>`, schema, { ...options, onHTMLFlowFallback: issue => fallbacks.push(issue) });
    expect(fallbacks).toEqual([]);
    expect(doc.child(0).type.name).toBe('html_container');
    const html = HTMLExporter.export(doc, { document: false });
    expect(html).toContain('<hr');
    expect(html).toContain('src="/demo-media.svg"');
    expect(MarkdownImporter.parse(MarkdownExporter.export(doc), schema, options).toJSON()).toEqual(doc.toJSON());
  });
  it('cannot mistake authored raw image/rule HTML for generated protected atoms', () => {
    const fallbacks: MarkdownHTMLFlowFallback[] = [];
    const doc = MarkdownImporter.parse('<section>\n<img src="/raw.svg" alt="Raw"><hr>\n\n![Generated](/demo-media.svg)\n\n---\n\n</section>', schema,
      { ...options, onHTMLFlowFallback: issue => fallbacks.push(issue) });
    expect(fallbacks).toEqual([]);
    expect(doc.child(0).content.filter(node => node.type.name === 'image_super').map(node => node.attrs.src)).toEqual(['/raw.svg', '/demo-media.svg']);
    expect(doc.child(0).content.filter(node => node.type.name === 'horizontal_rule')).toHaveLength(2);
  });
  it.each(['---', '![Diagram](/demo-media.svg)'])('refuses flattening a protected %s inside pre and retains the entire source', atom => {
    const input = `<div><pre>\n\n${atom}\n\n</pre></div>\n`;
    const fallbacks: MarkdownHTMLFlowFallback[] = [];
    const parsed = MarkdownImporter.parseWithSource(input, schema, { ...options, onHTMLFlowFallback: issue => fallbacks.push(issue) });
    expect(fallbacks.length).toBeGreaterThan(0);
    expect(parsed.document.toJSON()).toEqual(MarkdownImporter.parse(input, schema).toJSON());
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(input);
  });
  it('does not silently discard an HTML link applied to a promoted block image', () => {
    const input = '<a href="/details">\n\n![Diagram](/demo-media.svg)\n\n</a>\n';
    const fallbacks: MarkdownHTMLFlowFallback[] = [];
    const doc = MarkdownImporter.parse(input, schema, { ...options, onHTMLFlowFallback: issue => fallbacks.push(issue) });
    expect(fallbacks.length).toBeGreaterThan(0);
    expect(doc.toJSON()).toEqual(MarkdownImporter.parse(input, schema).toJSON());
  });
  it('leaves the inert default dialect unchanged while tables no longer refuse mixed source flow', () => {
    expect(MarkdownImporter.parse(source, schema).child(0).textContent).toBe('<section id="report">');
    const input = '<section>\n\n| A | B |\n| --- | --- |\n| x | y |\n\n---\n\n</section>';
    const fallbacks: MarkdownHTMLFlowFallback[] = [];
    const doc = MarkdownImporter.parse(input, schema, { ...options, onHTMLFlowFallback: issue => fallbacks.push(issue) });
    expect(fallbacks).toEqual([]);
    expect(doc.child(0).content.map(node => node.type.name)).toEqual(['table', 'horizontal_rule']);
  });
  it('refuses a host-modified image rather than accepting a syntax-only replacement', () => {
    const fallbacks: MarkdownHTMLFlowFallback[] = [];
    const doc = MarkdownImporter.parse(source, schema, {
      parseHTMLDocument(segments, target, context) {
        const changed = context!.readBlockSources!().map(part => part.kind === 'image'
          ? { ...part, src: '/different.svg' } : part);
        return new ServerHTMLImporter().parseTextBlockFlow(segments, target, {
          ...context!, readBlockSources: () => changed,
        });
      }, onHTMLFlowFallback: issue => fallbacks.push(issue),
    });
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0].message).toContain('modified Markdown block atoms');
    expect(doc.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
  });
  it('uses complete schema defaults and ignores speculative custom parse rules for protected atoms', () => {
    const target = new Schema({ ...spec, nodes: { ...spec.nodes,
      image_super: { ...spec.nodes.image_super, attrs: { ...spec.nodes.image_super.attrs, applicationId: { default: 'kept' } },
        parseHTML: [{ tag: 'img', getAttrs: () => ({ src: '/wrong.svg' }) }] },
      horizontal_rule: { ...spec.nodes.horizontal_rule, attrs: { applicationId: { default: 'rule-kept' } } },
    } });
    const fallbacks: MarkdownHTMLFlowFallback[] = [];
    const doc = MarkdownImporter.parse(source, target, { ...options, onHTMLFlowFallback: issue => fallbacks.push(issue) });
    expect(fallbacks).toEqual([]);
    expect(doc.child(0).child(1).attrs.applicationId).toBe('rule-kept');
    expect(doc.child(0).child(2).attrs).toMatchObject({ applicationId: 'kept', src: '/demo-media.svg' });
  });
  it.each(['<script>', '<style>', '<textarea>'])('refuses active/raw-text scopes containing block atoms: %s', tag => {
    const input = `<div>${tag}\n\n---\n\n![Diagram](/demo-media.svg)\n\n</${tag.slice(1)}\n</div>\n`;
    const fallbacks: MarkdownHTMLFlowFallback[] = [];
    const doc = MarkdownImporter.parse(input, schema, { ...options, onHTMLFlowFallback: issue => fallbacks.push(issue) });
    expect(fallbacks.length).toBeGreaterThan(0);
    expect(doc.toJSON()).toEqual(MarkdownImporter.parse(input, schema).toJSON());
  });
});
