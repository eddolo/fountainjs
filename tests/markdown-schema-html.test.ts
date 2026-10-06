import { describe, expect, it } from 'vitest';
import { Schema, MarkdownImporter, MarkdownExporter, Editor, EditorState, createHistoryPlugin, undo, redo } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import type { NodeSpec } from '../src/core/schema';
import { ServerHTMLImporter } from '../src/html/server';

const carrier: NodeSpec = {
  inline: true, group: 'inline', content: 'inline*', markdown: 'html',
  attrs: { data: { default: '' } },
  parseHTML: [{ tag: 'span[data-test-carrier]', getAttrs: element => ({ data: element.getAttribute('data-test-carrier') }) }],
  toDOM: node => ['span', { 'data-test-carrier': node.attrs.data }, 0],
};
const schema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, carrier } });
const options = { parseHTMLDocument: ServerHTMLImporter.parseTextBlockFlow };
const native = (source: string) => MarkdownImporter.parse(source, schema, options);

describe('schema-owned sanitized HTML projection in Markdown', () => {
  it.each([
    '<p><span data-test-carrier="empty"></span></p>',
    '<p>Before <span data-test-carrier="outer">outside <span data-test-carrier="inner">inside</span> end</span> after <strong>bold</strong>.</p>',
    '<h2><span data-test-carrier="heading">Title</span> <em>italic</em></h2>',
    '<blockquote><p><span data-test-carrier="quote">quoted</span> <strong>bold</strong></p></blockquote>',
    '<ul><li><p><span data-test-carrier="item">item</span> <em>italic</em></p></li></ul>',
    '<table><tr><th><p><span data-test-carrier="table">cell</span></p></th></tr></table>',
    '<p><strong><span data-test-carrier="marked">marked</span></strong></p>',
  ])('retains complete native JSON through its matching adapter: %s', source => {
    expect(typeof document).toBe('undefined');
    const doc = native(source);
    const result = MarkdownExporter.exportWithReport(doc, { tableFormat: 'html' });
    expect(result.markdown).toContain('data-test-carrier');
    expect(native(result.markdown).toJSON()).toEqual(doc.toJSON());
  });

  it.each(['\n', '\r', '\r\n'])('encodes literal source newlines rather than creating Markdown blocks: %j', ending => {
    const data = `attribute${ending}data`;
    const doc = schema.node('doc', {}, [schema.node('paragraph', {}, [
      schema.node('carrier', { data }, [schema.text(`*literal*${ending}**source**`, [schema.mark('strong')])]),
      schema.text(' neighboring *text*'),
    ])]);
    const result = MarkdownExporter.exportWithReport(doc);
    expect(result.markdown).not.toMatch(/[\r\n]/u);
    expect(native(result.markdown).toJSON()).toEqual(doc.toJSON());
  });

  it('retains edited data, exact untouched source and undo/redo without a fake DOM', () => {
    const source = 'Before <span data-test-carrier="provenance">inside</span> **after**.\n';
    const captured = MarkdownImporter.parseWithSource(source, schema, options);
    const editor = new Editor(EditorState.create({ schema, doc: captured.document, plugins: [createHistoryPlugin()] }));
    try {
      expect(MarkdownExporter.exportWithSource(editor.state.doc, captured.source).markdown).toBe(source);
      editor.dispatch(editor.createTransaction().insertText([0, 1, 0], 6, ' revised'));
      const after = editor.getJSON();
      const result = MarkdownExporter.exportWithSource(editor.state.doc, captured.source);
      expect(native(result.markdown).toJSON()).toEqual(after);
      expect(undo(editor)).toBe(true);
      expect(MarkdownExporter.exportWithSource(editor.state.doc, captured.source).markdown).toBe(source);
      expect(redo(editor)).toBe(true);
      expect(editor.getJSON()).toEqual(after);
    } finally { editor.destroy(); }
  });

  it('reports each nested opt-in at its real path and isolates failing diagnostics', () => {
    const doc = native('<p><span data-test-carrier="outer"><span data-test-carrier="inner">text</span></span></p>');
    const result = MarkdownExporter.exportWithReport(doc, { onLoss() { throw new Error('observer'); } });
    expect(result.losses.map(loss => loss.path)).toEqual([[0, 0], [0, 0, 0]]);
    expect(result.losses.every(loss => loss.detail.includes('matching parse rules'))).toBe(true);
    expect(native(result.markdown).toJSON()).toEqual(doc.toJSON());
  });

  it('keeps the default custom-node flattening policy unchanged', () => {
    const plain = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, carrier: { ...carrier, markdown: undefined } } });
    const doc = plain.node('doc', {}, [plain.node('paragraph', {}, [plain.node('carrier', { data: 'id' }, [plain.text('readable')])])]);
    const result = MarkdownExporter.exportWithReport(doc);
    expect(result.markdown).toBe('readable');
    expect(result.losses[0]?.detail).toContain('flattened');
  });

  it('does not introduce a raw-string HTML hook or bypass existing URL/event filters', () => {
    const hostile: NodeSpec = { ...carrier, toDOM: () => ['span', {
      onclick: 'alert(1)', href: 'javascript:alert(1)', style: 'background:url(https://invalid.test/x)',
      'data-test-carrier': '\"><script>bad()</script>',
    }, '<script>literal text</script>'] };
    const safeSchema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, carrier: hostile } });
    const doc = safeSchema.node('doc', {}, [safeSchema.node('paragraph', {}, [safeSchema.node('carrier')])]);
    const result = MarkdownExporter.exportWithReport(doc);
    expect(result.markdown).not.toMatch(/<script|\sonclick=|\shref=|\sstyle=/i);
    expect(result.markdown).toContain('&lt;script&gt;literal text&lt;/script&gt;');
    expect(result.losses).toHaveLength(1);
  });

  it('supports schema-owned block carriers without promoting unsafe tag names', () => {
    const block: NodeSpec = { ...carrier, inline: false, group: 'block', content: 'block+',
      toDOM: node => ['section', { 'data-test-block': node.attrs.data }, 0],
      parseHTML: [{ tag: 'section[data-test-block]', getAttrs: element => ({ data: element.getAttribute('data-test-block') }) }],
    };
    const blockSchema = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, block } });
    const doc = blockSchema.node('doc', {}, [blockSchema.node('block', { data: 'id' }, [blockSchema.node('paragraph', {}, [blockSchema.text('content')])])]);
    const result = MarkdownExporter.exportWithReport(doc);
    expect(MarkdownImporter.parse(result.markdown, blockSchema, options).toJSON()).toEqual(doc.toJSON());
    const unsafe = new Schema({ ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, block: { ...block, toDOM: () => ['script', {}, 0] } } });
    const rejected = unsafe.nodeFromJSON(doc.toJSON());
    expect(MarkdownExporter.export(rejected)).not.toContain('<script');
  });
});
