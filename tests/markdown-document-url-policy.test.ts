// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Schema, MarkdownImporter, MarkdownExporter, HTMLExporter, HTMLContainerExtension,
  createEditor, EditorState, createHistoryPlugin, Selection, insertText, undo } from '../src/headless';
import { CoreSchemaSpec } from '../src/extensions';
import { ServerHTMLImporter, type ServerHTMLImportIssue } from '../src/html/server';
import { StarterKit, composeExtensions, createTrailingEditableBlockExtension } from '../src/extensions';

const spec = { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes, ...HTMLContainerExtension.nodes } };
const schema = new Schema(spec);

describe('cross-container Markdown HTML link policy and source recovery', () => {
  it.each(['attributes', 'nested', 'custom-type'] as const)('does not ignore a %s configured repair', kind => {
    const kit = composeExtensions([...StarterKit.extensions.filter(extension => extension.name !== 'trailing-editable-block'),
      createTrailingEditableBlockExtension(kind === 'attributes' ? { nodeAttributes: { align: 'center' } }
        : kind === 'nested' ? { rootTypes: ['blockquote'] } : { nodeType: 'heading' })]);
    const target = new Schema(kit.schema);
    const source = kind === 'nested' ? '> - Last item\n' : '- Last item\n';
    const captured = MarkdownImporter.parseWithSource(source, target);
    const editor = createEditor({ schema: kit.schema, state: EditorState.create({
      schema: target, doc: captured.document, plugins: kit.plugins,
    }) });
    try {
      expect(editor.state.doc.eq(captured.document)).toBe(false);
      expect(captured.source.matches(editor.state.doc)).toBe(false);
      expect(MarkdownExporter.exportWithSource(editor.state.doc, captured.source).preservation).not.toBe('exact');
    } finally { editor.destroy(); }
  });

  it('keeps untouched source after StarterKit adds its automatic trailing caret paragraph', () => {
    const target = new Schema(StarterKit.schema);
    const source = '<a href="\\*">First **part**.\n\n> Second part.\n\n- Last part.\n\n</a>\n';
    const captured = MarkdownImporter.parseWithSource(source, target, {
      parseHTMLDocument: ServerHTMLImporter.parseTextBlockFlow,
    });
    const editor = createEditor({ schema: StarterKit.schema, state: EditorState.create({
      schema: target, doc: captured.document, plugins: StarterKit.plugins,
    }) });
    try {
      expect(editor.state.doc.childCount).toBe(captured.document.childCount + 1);
      expect(editor.state.doc.content.at(-1)?.type.name).toBe('paragraph');
      expect(editor.state.doc.content.at(-1)?.textContent).toBe('');
      expect(MarkdownExporter.exportWithSource(editor.state.doc, captured.source).markdown).toBe(source);
      const live = editor.state.doc;
      const tail = live.content.at(-1)!;
      // Never silently discard authored, copied, serialized or modified data.
      for (const modified of [
        live.withAttrs({ ...live.attrs, privateMetadata: 'Keep me' }),
        live.copy([...live.content.slice(0, -1), tail.copy()]),
        target.nodeFromJSON(live.toJSON()),
        live.copy([...live.content.slice(0, -1), tail.withAttrs({ ...tail.attrs, align: 'center' })]),
        live.copy([...live.content, target.node('paragraph', {}, [target.text('')])]),
        live.copy([tail, ...live.content.slice(0, -1)]),
        live.copy([...live.content.slice(0, -1), tail.copy([target.text('Typed')])]),
      ]) expect(captured.source.matches(modified)).toBe(false);

      // A real edit disables whole-source reuse; exact undo restores it.
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
      expect(insertText(editor, 'Edited ')).toBe(true);
      expect(captured.source.matches(editor.state.doc)).toBe(false);
      expect(undo(editor)).toBe(true);
      expect(captured.source.matches(editor.state.doc)).toBe(true);
      expect(MarkdownExporter.exportWithSource(editor.state.doc, captured.source).markdown).toBe(source);
    } finally { editor.destroy(); }
  });
  for (const ending of ['\n', '\r\n']) {
    it.each(['\\*', 'javascript:privatePayload', 'data:text/html,privatePayload'])(
      `reports rejected navigation without exposing source values (${JSON.stringify(ending)}, %s)`, href => {
        expect(typeof document).toBe('undefined');
        const issues: ServerHTMLImportIssue[] = [];
        const importer = new ServerHTMLImporter();
        const options = { parseHTMLDocument: (...args: Parameters<typeof importer.parseTextBlockFlowWithReport>) => {
          const result = importer.parseTextBlockFlowWithReport(...args);
          issues.push(...result.issues);
          return result.nodes;
        } };
        const source = `<a href="${href}">First **part**.\n\n> Second part.\n\n- Last part.\n\n</a>\n`.replaceAll('\n', ending);
        const captured = MarkdownImporter.parseWithSource(source, schema, options);
        expect(issues.some(issue => issue.code === 'rejected-url')).toBe(true);
        expect(JSON.stringify(issues)).not.toContain(href);
        expect(captured.document.textContent).toContain('First part.');
        expect(captured.document.textContent).toContain('Second part.');
        expect(captured.document.textContent).toContain('Last part.');
        expect(captured.document.content.map(node => node.type.name)).toContain('blockquote');
        expect(captured.document.content.map(node => node.type.name)).toContain('bullet_list');
        captured.document.descendants(node => expect(node.marks.some(mark => mark.type.name === 'link')).toBe(false));
        expect(HTMLExporter.export(captured.document)).not.toContain('<a ');
        expect(JSON.stringify(captured.document.toJSON())).not.toContain(href);
        expect(MarkdownExporter.exportWithSource(captured.document, captured.source).markdown).toBe(source);
        expect(schema.nodeFromJSON(captured.document.toJSON()).toJSON()).toEqual(captured.document.toJSON());

        const editor = createEditor({ schema: spec, state: EditorState.create({ schema,
          doc: captured.document, plugins: [createHistoryPlugin()] }) });
        try {
          editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
          expect(insertText(editor, 'Edited ')).toBe(true);
          const saved = MarkdownExporter.exportWithSource(editor.state.doc, captured.source).markdown;
          expect(saved).not.toContain(href);
          expect(MarkdownImporter.parse(saved, schema, options).toJSON()).toEqual(editor.state.doc.toJSON());
          expect(undo(editor)).toBe(true);
          expect(editor.state.doc.toJSON()).toEqual(captured.document.toJSON());
          expect(MarkdownExporter.exportWithSource(editor.state.doc, captured.source).markdown).toBe(source);
        } finally { editor.destroy(); }
      });

    it.each(['/guide', '', '#reference'])(
      `retains allowed navigation across paragraphs, quotes and lists (${JSON.stringify(ending)}, %s)`, href => {
        const source = `<a href="${href}">First.\n\n> Second.\n\n- Last.\n\n</a>\n`.replaceAll('\n', ending);
        const captured = MarkdownImporter.parseWithSource(source, schema, {
          parseHTMLDocument: ServerHTMLImporter.parseTextBlockFlow,
        });
        const marks: string[] = [];
        captured.document.descendants(node => {
          if (node.isText && node.text?.trim()) {
            const mark = node.marks.find(mark => mark.type.name === 'link');
            expect(mark?.attrs.href).toBe(href);
            marks.push(String(mark?.attrs.href));
          }
        });
        expect(marks).toHaveLength(3);
        expect(MarkdownExporter.exportWithSource(captured.document, captured.source).markdown).toBe(source);
      });
  }
});
