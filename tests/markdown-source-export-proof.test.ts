import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoreSchemaSpec, EditorState, HTMLContainerExtension, MarkdownExporter, MarkdownImporter, Schema, StarterKit, composeExtensions, createEditor, type Node } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const replace = (node: Node, path: readonly number[], value: Node): Node => !path.length ? value
  : node.copy(node.content.map((child, index) => index === path[0] ? replace(child, path.slice(1), value) : child));
const original = '# Keep [link][ref] ###\n\n> [ref]: /target "Keep"\n>\n> First __source__.\n>\n> Edit.\n';
afterEach(() => vi.restoreAllMocks());

describe('complete-document proof before accepting source drafts', () => {
  it('parses each distinct edited result with the original whole-document policy', () => {
    const schema = new Schema(CoreSchemaSpec), imported = MarkdownImporter.parseWithSource(original, schema);
    const spy = vi.spyOn(MarkdownImporter.prototype, 'parse');
    const outputs: { markdown: string; document: Node }[] = [];
    for (const value of ['First edit.', 'Second edit.', 'Third edit.', 'Fourth edit.']) {
      const document = replace(imported.document, [1, 1], schema.node('paragraph', {}, [schema.text(value)]));
      const result = MarkdownExporter.exportWithSource(document, imported.source);
      const expected = original.replace('Edit.', value);
      expect(result.markdown).toBe(expected);
      expect(spy.mock.calls.some(([source]) => source === expected)).toBe(true);
      outputs.push({ markdown: result.markdown, document });
    }
    spy.mockRestore();
    for (const output of outputs) expect(MarkdownImporter.parse(output.markdown, schema).toJSON()).toEqual(output.document.toJSON());
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(original);
  });

  it('refuses partial source when the complete parser disagrees with the intended model', () => {
    const schema = new Schema(CoreSchemaSpec), imported = MarkdownImporter.parseWithSource(original, schema);
    const document = replace(imported.document, [1, 1], schema.node('paragraph', {}, [schema.text('Changed.')]));
    const spy = vi.spyOn(MarkdownImporter.prototype, 'parse').mockReturnValue(schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Wrong result.')])]));
    const result = MarkdownExporter.exportWithSource(document, imported.source);
    expect(spy).toHaveBeenCalled();
    expect(result.preservation).toBe('canonical');
    spy.mockRestore();
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(document.toJSON());
  });

  it('retains separator repair after a draft merges two quoted paragraphs', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '# Keep [link][ref] ###\n\n> [ref]: /target\n>\n> # Title ###\n> Following __source__ [ref].\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const document = replace(imported.document, [1, 0], schema.node('paragraph', {}, [schema.text('Changed.')]));
    const result = MarkdownExporter.exportWithSource(document, imported.source);
    expect(result.markdown).toBe(source.replace('> # Title ###\n', '> Changed.\n> \n'));
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(document.toJSON());
  });

  it('does not leak generated reference definitions from discarded drafts', () => {
    const schema = new Schema(CoreSchemaSpec);
    const imported = MarkdownImporter.parseWithSource(original.replaceAll('[ref]', '[ref-1]'), schema);
    const document = replace(imported.document, [1, 1], schema.node('paragraph', {}, [schema.text('New link', [schema.mark('link', { href: '/new' })])]));
    const result = MarkdownExporter.exportWithSource(document, imported.source, { linkStyle: 'reference' });
    expect(result.preservation).toBe('canonical');
    expect(result.markdown.match(/\[ref-1\]:/gu)).toHaveLength(1);
    expect(result.markdown.match(/\[ref-2\]:/gu)).toHaveLength(1);
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(document.toJSON());
  });

  it('reports unsupported attributes once after rejecting a draft and using canonical fallback', () => {
    const schema = new Schema(CoreSchemaSpec), imported = MarkdownImporter.parseWithSource(original, schema);
    const paragraph = imported.document.child(1).child(1);
    const document = replace(imported.document, [1, 1], paragraph.withAttrs({ ...paragraph.attrs, align: 'center' }));
    const onLoss = vi.fn();
    const result = MarkdownExporter.exportWithSource(document, imported.source, { onLoss });
    expect(result.preservation).toBe('canonical');
    expect(onLoss.mock.calls.map(([loss]) => loss)).toEqual(result.losses);
    expect(result.losses.filter(loss => loss.type === 'paragraph' && loss.detail.includes('alignment'))).toHaveLength(1);
  });

  it('retains the real editor caret paragraph after editing a terminal defining quote', () => {
    const kit = composeExtensions(StarterKit.extensions), schema = new Schema(kit.schema);
    const source = '# Keep [ref] ###\n\n> [ref]: /target\n>\n> Edit.\n';
    const imported = MarkdownImporter.parseWithSource(source, schema);
    const editor = createEditor({ schema: kit.schema, state: EditorState.create({ schema, doc: imported.document, plugins: kit.plugins }) });
    try {
      expect(editor.state.doc.childCount).toBe(3);
      editor.dispatch(editor.state.createTransaction().insertText([1, 0, 0], 0, 'Reviewed '));
      const result = MarkdownExporter.exportWithSource(editor.state.doc, imported.source);
      expect(result.markdown).toContain('> Reviewed Edit.');
      expect(result.markdown).toContain('<p data-fountain-empty="text"></p>');
      expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(editor.getJSON());
    } finally { editor.destroy(); }
  });

  it.each(['aligned', 'structural'] as const)('contains each loss observer failure on the native %s path', mode => {
    const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
      doc: { ...CoreSchemaSpec.nodes.doc, attrs: { dir: { default: 'ltr' } } },
    } });
    const captured = MarkdownImporter.parseWithSource('# Keep ###\n\nEdit.\n', schema);
    const changed = schema.node('paragraph', {}, [schema.text('Changed.')]);
    const document = captured.document.copy(mode === 'aligned'
      ? [captured.document.child(0), changed] : [changed, ...captured.document.content]);
    const onLoss = vi.fn(() => { throw new Error('Observer failed'); });
    const result = MarkdownExporter.exportWithSource(document, captured.source, { onLoss });
    expect(result.preservation).toBe(mode === 'aligned' ? 'blocks' : 'mapped-blocks');
    expect(result.losses).toHaveLength(1);
    expect(onLoss.mock.calls).toHaveLength(1);
    expect(MarkdownImporter.parse(result.markdown, schema).toJSON()).toEqual(document.toJSON());
  });

  it('contains observational loss-callback errors after accepting a fully proven HTML projection', () => {
    const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...HTMLContainerExtension.nodes } });
    const options = { parseHTMLBlock: (html: string, target: Schema) => ServerHTMLImporter.parse(html, target) };
    const captured = MarkdownImporter.parseWithSource('<section><p>Edit.</p></section>\n\nKeep.\n', schema, options);
    const document = replace(captured.document, [0, 0], schema.node('paragraph', {}, [schema.text('Changed.')]));
    const result = MarkdownExporter.exportWithSource(document, captured.source, { onLoss: () => { throw new Error('Observer failed'); } });
    expect(result.preservation).toBe('blocks');
    expect(result.losses.length).toBeGreaterThan(0);
    expect(MarkdownImporter.parse(result.markdown, schema, options).toJSON()).toEqual(document.toJSON());
  });
});
