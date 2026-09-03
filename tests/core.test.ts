import { describe, expect, it, vi } from 'vitest';
import {
  CoreSchemaSpec,
  HTMLExporter,
  JSONExporter,
  MarkdownExporter,
  MarkdownImporter,
  Schema,
  Selection,
  createEditor,
  historyPlugin,
  insertText,
  redo,
  splitBlock,
  toggleMark,
  undo,
} from '../src';

describe('document model and transactions', () => {
  it('creates immutable, JSON-round-trippable documents', () => {
    const schema = new Schema(CoreSchemaSpec);
    const doc = schema.node('doc', {}, [
      schema.node('heading', { level: 2 }, [schema.text('Hello', [schema.mark('strong')])]),
      schema.node('paragraph', {}, [schema.text('World')]),
    ]);
    const restored = schema.nodeFromJSON(doc.toJSON());
    expect(restored.eq(doc)).toBe(true);
    expect(restored.textContent).toBe('HelloWorld');
    expect(() => (doc.content as unknown[]).push(doc)).toThrow();
  });

  it('edits, formats, splits, undoes, and redoes without mutating old states', () => {
    const update = vi.fn();
    const editor = createEditor({ schema: CoreSchemaSpec, plugins: [historyPlugin], onUpdate: update });
    const original = editor.state.doc;
    expect(insertText(editor, 'Make it flow')).toBe(true);
    expect(editor.getText()).toBe('Make it flow');
    expect(original.textContent).toBe('');

    editor.dispatch(editor.state.createTransaction().setSelection(new Selection([0, 0], 8, 12)));
    expect(toggleMark(editor, 'strong')).toBe(true);
    expect(MarkdownExporter.export(editor.state)).toBe('Make it **flow**');

    expect(undo(editor)).toBe(true);
    expect(MarkdownExporter.export(editor.state)).toBe('Make it flow');
    expect(redo(editor)).toBe(true);
    expect(MarkdownExporter.export(editor.state)).toBe('Make it **flow**');
    expect(update).toHaveBeenCalled();
  });

  it('splits a block at the current selection', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    insertText(editor, 'Hello world');
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 5)));
    expect(splitBlock(editor)).toBe(true);
    expect(editor.state.doc.content.map((node) => node.textContent)).toEqual(['Hello', ' world']);
    expect(editor.state.selection.path).toEqual([1, 0]);
  });

  it('formats a selection across existing mark boundaries', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [
          { type: 'text', text: 'A ' },
          { type: 'text', text: 'rough', marks: [{ type: 'strong' }] },
          { type: 'text', text: ' draft.' },
        ] }],
      },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0], 2, [0, 2], 7)));
    expect(toggleMark(editor, 'strong')).toBe(true);
    expect(editor.state.doc.content[0]?.content.slice(1).every((node) => node.marks.some((mark) => mark.type.name === 'strong'))).toBe(true);
    expect(toggleMark(editor, 'strong')).toBe(true);
    expect(editor.state.doc.content[0]?.content.every((node) => node.marks.length === 0)).toBe(true);
  });
});

describe('formats', () => {
  it('imports Markdown and safely exports semantic HTML', () => {
    const schema = new Schema(CoreSchemaSpec);
    const doc = MarkdownImporter.parse('# Launch\n\nA **bold** move.\n\n```ts\nconst x = 1;\n```', schema);
    const markdown = MarkdownExporter.export(doc);
    const html = HTMLExporter.export(doc, { document: false });
    expect(markdown).toContain('**bold**');
    expect(markdown).toContain('```ts');
    expect(html).toContain('<h1>Launch</h1>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('blocks unsafe URLs during HTML export', () => {
    const schema = new Schema(CoreSchemaSpec);
    const doc = schema.node('doc', {}, [schema.node('image_super', { src: 'javascript:alert(1)', alt: 'bad' })]);
    expect(HTMLExporter.export(doc, { document: false })).toBe('');
  });

  it('imports exported JSON back into the configured schema', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    insertText(editor, 'Portable');
    const json = JSONExporter.export(editor.state);
    const restored = JSONExporter.import(json, editor.state.schema);
    expect(restored.eq(editor.state.doc)).toBe(true);
  });
});
