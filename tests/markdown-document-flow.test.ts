import { describe, expect, it, vi } from 'vitest';
import { MarkdownImporter, MarkdownExporter, HTMLExporter, Schema, HTMLContainerExtension,
  createEditor, EditorState, createHistoryPlugin, insertText, Selection, undo, type SchemaSpec } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter } from '../src/html/server';

const spec: SchemaSpec = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...HTMLContainerExtension.nodes } };
const schema = new Schema(spec);
const options = { parseHTMLDocument: ServerHTMLImporter.parseTextBlockFlow };
const linked = '<a href="/guide">First paragraph.\n\nSecond **paragraph**.</a>\n';

describe('explicit whole-document HTML source conversion', () => {
  it.each(['\n', '\r\n'])('keeps a link across paragraphs and exact untouched source (%j)', ending => {
    expect(typeof document).toBe('undefined');
    const source = linked.replaceAll('\n', ending);
    const parsed = MarkdownImporter.parseWithSource(source, schema, options);
    // HTML reconstruction creates a whitespace-only link between the source
    // paragraphs. Keep it explicit, not a hidden normalization in the oracle.
    expect(parsed.document.childCount).toBe(3);
    expect(parsed.document.child(1).textContent.trim()).toBe('');
    for (const paragraph of parsed.document.content) for (const text of paragraph.content) {
      expect(text.marks.some(mark => mark.type.name === 'link' && mark.attrs.href === '/guide')).toBe(true);
    }
    expect(parsed.document.child(2).content.some(text => text.marks.some(mark => mark.type.name === 'strong'))).toBe(true);
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(source);
    const canonical = MarkdownExporter.export(parsed.document);
    expect(MarkdownImporter.parse(canonical, schema).toJSON()).toEqual(parsed.document.toJSON());
  });

  it('owns one root conversion and does not run competing or nested HTML adapters', () => {
    const other = vi.fn(() => { throw new Error('Must not run'); });
    const adapter = vi.fn(ServerHTMLImporter.parseTextBlockFlow);
    const source = '<b>Lead\n\n> Quote\n\n- Item\n\nEnd</b>';
    const doc = MarkdownImporter.parse(source, schema, { parseHTMLDocument: adapter,
      parseHTMLFlow: other, parseHTMLBlock: other, parseHTMLInline: other, parseHTMLParagraph: other });
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect(doc.child(1).type.name).toBe('blockquote');
    expect(doc.child(2).type.name).toBe('bullet_list');
    doc.descendants(node => {
      if (node.isText && node.text?.trim()) expect(node.marks.some(mark => mark.type.name === 'strong')).toBe(true);
    });
  });

  it('reports formatted whitespace blocks rather than claiming matching layout', () => {
    const issues: string[] = [];
    MarkdownImporter.parse(linked, schema, { parseHTMLDocument: (segments, target, context) => {
      const result = new ServerHTMLImporter().parseTextBlockFlowWithReport(segments, target, context);
      issues.push(...result.issues.map(issue => issue.code));
      return result.nodes;
    } });
    expect(issues).toContain('formatted-whitespace-block');
  });

  it('does not activate for literal code or documents without HTML syntax', () => {
    const adapter = vi.fn(ServerHTMLImporter.parseTextBlockFlow);
    for (const source of ['Normal **Markdown**', '```html\n<b>literal</b>\n```', '`<a href="/x">`']) {
      expect(MarkdownImporter.parse(source, schema, { parseHTMLDocument: adapter }).toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
    }
    expect(adapter).not.toHaveBeenCalled();
  });

  it('keeps undo exact but uses canonical export after a cross-scope edit', () => {
    const source = '---\ntitle: Research\n---\n\n' + linked;
    const parsed = MarkdownImporter.parseWithSource(source, schema, options);
    const editor = createEditor({ schema: spec, state: EditorState.create({ schema, plugins: [createHistoryPlugin()], doc: parsed.document }) });
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([2, 0], 0)));
    insertText(editor, 'Updated ');
    const changed = MarkdownExporter.exportWithSource(editor.state.doc, parsed.source);
    expect(changed.markdown).toContain('Updated');
    expect(changed.markdown).not.toContain('<a href=');
    const reopened = MarkdownImporter.parseWithSource(changed.markdown, schema, options);
    expect(reopened.document.toJSON()).toEqual(editor.state.doc.toJSON());
    undo(editor);
    expect(MarkdownExporter.exportWithSource(editor.state.doc, parsed.source).markdown).toBe(source);
    editor.destroy();
  });

  it.each(['\n', '\r\n'])('retains unrelated Markdown source when the configured document adapter is unused (%j)', ending => {
    const source = 'Heading\n=======\n\nKeep __this__ spelling.\n\n~~~~html\n<b>literal</b>\n~~~~\n\nEdit here.\n'.replaceAll('\n', ending);
    const adapter = vi.fn(ServerHTMLImporter.parseTextBlockFlow);
    const local = vi.fn(() => { throw new Error('Local adapters must remain suppressed'); });
    const settings = { parseHTMLDocument: adapter, parseHTMLFlow: local, parseHTMLBlock: local, parseHTMLInline: local, parseHTMLParagraph: local };
    const parsed = MarkdownImporter.parseWithSource(source, schema, settings);
    expect(parsed.source.blocks).toHaveLength(4);
    const editor = createEditor({ schema: spec, state: EditorState.create({ schema, plugins: [createHistoryPlugin()], doc: parsed.document }) });
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([3, 0], 0)));
    expect(insertText(editor, 'Updated ')).toBe(true);
    const saved = MarkdownExporter.exportWithSource(editor.state.doc, parsed.source);
    expect(saved.preservation).toBe('blocks');
    expect(saved.markdown).toBe(source.replace('Edit here.', 'Updated Edit here.'));
    expect(MarkdownImporter.parseWithSource(saved.markdown, schema, settings).document.toJSON()).toEqual(editor.state.doc.toJSON());
    expect(adapter).not.toHaveBeenCalled();
    expect(local).not.toHaveBeenCalled();
    expect(undo(editor)).toBe(true);
    expect(MarkdownExporter.exportWithSource(editor.state.doc, parsed.source).markdown).toBe(source);
    editor.destroy();
  });

  it.each(['decline', 'throw'] as const)('does not splice independent source after a document adapter %s', mode => {
    const fallback = vi.fn();
    const adapter = vi.fn(() => { if (mode === 'throw') throw new Error('Cannot project'); return null; });
    const parsed = MarkdownImporter.parseWithSource(linked, schema, { parseHTMLDocument: adapter, onHTMLFlowFallback: fallback });
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(parsed.source.blocks).toHaveLength(0);
    expect(MarkdownExporter.exportWithSource(parsed.document, parsed.source).markdown).toBe(linked);
  });

  it('retains reference definitions when HTML-free blocks are moved with the document policy enabled', () => {
    const source = '[ref]: ./guide.md "Original"\n\nHeading\n=======\n\nKeep __this__ [reference][ref].\n\nEdit.\n';
    const adapter = vi.fn(ServerHTMLImporter.parseTextBlockFlow);
    const parsed = MarkdownImporter.parseWithSource(source, schema, { parseHTMLDocument: adapter });
    expect(parsed.source.blocks).toHaveLength(3);
    const moved = schema.node('doc', {}, [parsed.document.child(1), parsed.document.child(0)]);
    const saved = MarkdownExporter.exportWithSource(moved, parsed.source);
    expect(saved.preservation).toBe('mapped-blocks');
    expect(saved.markdown).toContain('Keep __this__ [reference][ref].');
    expect(saved.markdown).toContain('Heading\n=======');
    expect(saved.markdown.match(/\[ref\]:/g)).toHaveLength(1);
    expect(MarkdownImporter.parse(saved.markdown, schema).toJSON()).toEqual(moved.toJSON());
    expect(adapter).not.toHaveBeenCalled();
  });

  it.each(['decline', 'throw', 'inline', 'foreign', 'not-array'] as const)('keeps the entire inert tree on adapter %s', mode => {
    const fallback = vi.fn();
    const foreign = new Schema(spec);
    const source = '<section>\n\nBefore <b>bold\n\n> Nested</b>\n\n</section>';
    const result = MarkdownImporter.parse(source, schema, {
      parseHTMLDocument: () => {
        if (mode === 'decline') return null;
        if (mode === 'throw') throw new Error('Rejected');
        if (mode === 'inline') return [schema.text('bad')];
        if (mode === 'foreign') return [foreign.node('paragraph', {}, [foreign.text('bad')])];
        return {} as any;
      }, onHTMLFlowFallback: fallback,
    });
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(result.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
  });

  it.each(['<script>bad()</script>', '<iframe src="https://example.invalid"></iframe>', '<style>p{display:none}</style>'])('refuses active HTML with no partial conversion: %s', active => {
    const source = '<b>Before\n\n' + active + '\n\nAfter</b>';
    const fallback = vi.fn();
    const result = MarkdownImporter.parse(source, schema, { ...options, onHTMLFlowFallback: fallback });
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(result.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
    expect(HTMLExporter.export(result, { document: false })).not.toMatch(/<(?:script|style|iframe)[ >]/);
  });

  it('refuses a mixed unsupported table instead of silently converting only the easy paragraphs', () => {
    const source = '<b>Before\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nAfter</b>';
    const fallback = vi.fn();
    const result = MarkdownImporter.parse(source, schema, { ...options, onHTMLFlowFallback: fallback });
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(result.toJSON()).toEqual(MarkdownImporter.parse(source, schema).toJSON());
  });

  it('refuses custom metadata and propagates reporting callback errors', () => {
    const custom = new Schema({ ...spec, nodes: { ...spec.nodes,
      paragraph: { ...spec.nodes.paragraph, attrs: { ...spec.nodes.paragraph.attrs, owner: { default: 'Ada' } } },
    } });
    const fallback = vi.fn();
    expect(MarkdownImporter.parse(linked, custom, { ...options, onHTMLFlowFallback: fallback }).toJSON())
      .toEqual(MarkdownImporter.parse(linked, custom).toJSON());
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(() => MarkdownImporter.parse(linked, schema, { parseHTMLDocument: () => null,
      onHTMLFlowFallback: () => { throw new Error('Host report failed'); },
    })).toThrow('Host report failed');
  });
});
