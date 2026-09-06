import { describe, expect, it, vi } from 'vitest';
import {
  CoreSchemaSpec,
  addTableColumn,
  addTableRow,
  deleteTableColumn,
  deleteTableRow,
  HTMLExporter,
  findText,
  JSONExporter,
  MarkdownExporter,
  MarkdownImporter,
  Node,
  NodeSelection,
  Plugin,
  Schema,
  Selection,
  Decoration,
  DecorationSet,
  Mapping,
  SelectionBookmark,
  StepMap,
  createEditor,
  createHistoryPlugin,
  historyPlugin,
  indentListItem,
  insertImage,
  insertHardBreak,
  insertDocument,
  insertList,
  insertQuote,
  insertTable,
  insertText,
  insertPlainText,
  deleteBackward,
  deleteForward,
  redo,
  replaceAllText,
  moveBlock,
  moveTableCell,
  outdentListItem,
  removeNode,
  setBlockType,
  setNodeAttributes,
  setLink,
  setMark,
  setTextAlignment,
  selectNode,
  selectNextMatch,
  splitBlock,
  toggleMark,
  toggleQuote,
  undo,
  unsetLink,
  unsetMark,
  toggleTaskItem,
} from '../src';

describe('document model and transactions', () => {
  it('rejects filtered transactions and atomically rolls back filtered command batches', () => {
    const update = vi.fn();
    const editor = createEditor({
      schema: CoreSchemaSpec,
      plugins: [new Plugin({
        filterTransaction: (transaction) => transaction.doc.textContent.length <= 3,
      })],
      onUpdate: update,
    });

    expect(editor.dispatch(editor.state.createTransaction())).toBe(false);
    expect(insertText(editor, 'abc')).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(insertText(editor, 'd')).toBe(false);
    expect(editor.getText()).toBe('abc');
    expect(update).toHaveBeenCalledTimes(1);

    expect(editor.runCommandBatch(() => {
      editor.dispatch(editor.state.createTransaction().replaceText([0, 0], 0, 3, 'ab'));
      editor.dispatch(editor.state.createTransaction().insertText([0, 0], 2, 'cd'));
      return true;
    })).toBe(false);
    expect(editor.getText()).toBe('abc');
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('composes nested commands into one atomic outer batch', () => {
    const update = vi.fn();
    const editor = createEditor({ schema: CoreSchemaSpec, onUpdate: update });
    expect(editor.runCommandBatch(() => editor.runCommandBatch(() => insertText(editor, '!')))).toBe(true);
    expect(editor.getText()).toBe('!');
    expect(update).toHaveBeenCalledTimes(1);
    expect(editor.runCommandBatch(() => {
      editor.runCommandBatch(() => insertText(editor, '?'));
      return false;
    })).toBe(false);
    expect(editor.getText()).toBe('!');
    expect(update).toHaveBeenCalledTimes(1);
  });

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

  it('allows immutable marks on inline nodes while rejecting them on block nodes', () => {
    const schema = new Schema(CoreSchemaSpec);
    const link = schema.mark('link', { href: '/details', title: 'Details', target: '_self' });
    const image = schema.node('inline_image', { src: '/status.png', alt: 'Status' }, [], undefined, [link]);
    const document = schema.node('doc', {}, [schema.node('paragraph', {}, [image])]);
    schema.validate(document);

    expect(schema.nodeFromJSON(document.toJSON()).toJSON()).toEqual(document.toJSON());
    expect(image.withMarks([]).marks).toEqual([]);
    const invalid = schema.node('paragraph', {}, [], undefined, [schema.mark('strong')]);
    expect(() => schema.validate(invalid)).toThrow('Only inline nodes may carry marks');
    expect(() => invalid.withMarks([])).toThrow('Marks can only be applied to inline nodes');
  });

  it('enforces schema content expressions at the editor boundary', () => {
    expect(() => createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Invalid nesting' }] }] }],
      },
    })).toThrow('does not match "inline*"');
    const schema = new Schema(CoreSchemaSpec);
    expect(() => schema.nodeFromJSON({ type: 'doc', content: [{ type: 'table', content: [{ type: 'paragraph' }] }] })).toThrow('table_row+');
    expect(() => schema.nodeFromJSON({ type: 'doc', content: [{ type: 'image_super', attrs: { src: 'javascript:alert(1)' } }] })).toThrow('Invalid value for attribute: src');
  });

  it('validates only newly-created paths when immutable subtrees are shared', () => {
    let validations = 0;
    const schema = {
      nodes: {
        doc: { content: 'block+', validate: () => { validations += 1; return true; } },
        paragraph: { group: 'block', content: 'text*', validate: () => { validations += 1; return true; } },
        text: { group: 'inline', inline: true },
      },
    } as const;
    const content = {
      type: 'doc',
      content: Array.from({ length: 1_000 }, (_, index) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: `Line ${index}` }],
      })),
    } as const;
    const editor = createEditor({ schema, content });
    validations = 0;

    expect(editor.dispatch(editor.state.createTransaction().insertText([999, 0], 8, '!'))).toBe(true);
    expect(editor.state.doc.child(999).textContent).toBe('Line 999!');
    expect(validations).toBe(2);
  });

  it('does not cache mutable non-portable attribute objects', () => {
    class MutableFlag { valid = true; }
    const schema = new Schema({
      nodes: {
        doc: { content: 'widget' },
        widget: {
          attrs: { state: { validate: (value) => value instanceof MutableFlag } },
          validate: (node) => (node.attrs.state as MutableFlag).valid,
        },
        text: { inline: true },
      },
    });
    const state = new MutableFlag();
    const node = schema.node('doc', {}, [schema.node('widget', { state })]);
    schema.validate(node);
    state.valid = false;

    expect(() => schema.validate(node)).toThrow('Invalid node invariant: widget');
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

  it('validates configurable history limits and enforces the retained depth', () => {
    expect(() => createHistoryPlugin({ depth: 0 })).toThrow('positive integer');
    expect(() => createHistoryPlugin({ newGroupDelay: -1 })).toThrow('zero or greater');
    const editor = createEditor({ schema: CoreSchemaSpec, plugins: [createHistoryPlugin({ depth: 2 })] });
    insertText(editor, 'a');
    insertText(editor, 'b');
    insertText(editor, 'c');
    expect(undo(editor)).toBe(true);
    expect(editor.getText()).toBe('ab');
    expect(undo(editor)).toBe(true);
    expect(editor.getText()).toBe('a');
    expect(undo(editor)).toBe(false);
  });

  it('maps selections through repeated-character edits and structural insertions', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'aaaa' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
        ],
      },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
    editor.dispatch(editor.state.createTransaction().insertText([0, 0], 0, 'a'));
    expect(editor.state.selection.eq(Selection.cursor([0, 0], 3))).toBe(true);

    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([1, 0], 3)));
    const paragraph = editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Inserted')]);
    editor.dispatch(editor.state.createTransaction().replace(0, 0, [paragraph]));
    expect(editor.state.selection.eq(Selection.cursor([2, 0], 3))).toBe(true);
  });

  it('starts atom-only documents with a valid semantic selection', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{ type: 'image_super', attrs: { src: '/cover.jpg', alt: 'Cover' } }],
      },
    });
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((editor.state.selection as NodeSelection).nodePath).toEqual([0]);
    expect(setNodeAttributes(editor, [0], { title: 'Updated cover' })).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
  });

  it('maps selections through mark-created text fragments without changing offsets', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    insertText(editor, 'abcd');
    editor.dispatch(editor.state.createTransaction().setSelection(new Selection([0, 0], 1, 3)));
    const transaction = editor.state.createTransaction().addMark(
      [0, 0],
      1,
      3,
      editor.state.schema.mark('strong'),
    );
    editor.dispatch(transaction);
    expect(editor.state.selection.eq(Selection.range([0, 1], 0, [0, 1], 2))).toBe(true);
  });

  it('composes and inverts public step maps', () => {
    const insertion = new StepMap([2, 0, 3]);
    const deletion = new StepMap([7, 2, 0]);
    const mapping = new Mapping([insertion, deletion]);
    expect(insertion.map(2, -1)).toBe(2);
    expect(insertion.map(2, 1)).toBe(5);
    expect(mapping.map(6)).toBe(7);
    expect(deletion.mapResult(8).deleted).toBe(true);
    expect(insertion.invert().map(5, -1)).toBe(2);
  });

  it('maps selection bookmarks through composed document changes', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Beta' }] },
        ],
      },
    });
    const bookmark = SelectionBookmark.fromSelection(
      editor.state.doc,
      Selection.range([1, 0], 1, [1, 0], 3),
    );
    const first = editor.state.createTransaction().insertText([0, 0], 0, '!');
    editor.dispatch(first);
    const second = editor.state.createTransaction().insertText([1, 0], 0, '?');
    editor.dispatch(second);
    const mapped = bookmark.map(new Mapping([...first.mapping.maps, ...second.mapping.maps]));

    expect(mapped.resolve(editor.state.doc).eq(Selection.range([1, 0], 2, [1, 0], 4))).toBe(true);
  });

  it('recovers a bookmark as a nearby cursor when its range is deleted', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    insertText(editor, 'abcdef');
    const bookmark = SelectionBookmark.fromSelection(editor.state.doc, new Selection([0, 0], 1, 5));
    const deletion = editor.state.createTransaction().replaceText([0, 0], 1, 5, '');
    editor.dispatch(deletion);

    const recovered = bookmark.map(deletion.mapping).resolve(editor.state.doc);
    expect(recovered.eq(Selection.cursor([0, 0], 1))).toBe(true);
    expect(editor.getText()).toBe('af');
  });

  it('recovers a cursor bookmark when its original block is removed', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Removed' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Survives' }] },
        ],
      },
    });
    const bookmark = SelectionBookmark.fromSelection(editor.state.doc, Selection.cursor([0, 0], 4));
    const deletion = editor.state.createTransaction().replace(0, 1, []);
    editor.dispatch(deletion);

    expect(bookmark.map(deletion.mapping).resolve(editor.state.doc).eq(Selection.cursor([0, 0], 0))).toBe(true);
  });

  it('maps immutable inline, node, and widget decorations through transactions', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    insertText(editor, 'abcd');
    const widget = () => document.createElement('span');
    const decorations = DecorationSet.create(editor.state.doc, [
      Decoration.node(0, 6, { class: 'paragraph' }, { key: 'block' }),
      Decoration.inline(2, 4, { class: 'match' }, { key: 'match' }),
      Decoration.widget(4, widget, { key: 'caret' }),
    ]);
    const transaction = editor.state.createTransaction().insertText([0, 0], 0, '!');
    const mapped = decorations.map(transaction.mapping, transaction.doc);
    expect(mapped.decorations.map(({ type, from, to }) => ({ type, from, to }))).toEqual([
      { type: 'node', from: 0, to: 7 },
      { type: 'inline', from: 3, to: 5 },
      { type: 'widget', from: 5, to: 5 },
    ]);
    expect(mapped.find(3, 5, (decoration) => decoration.type === 'inline')).toHaveLength(1);
    expect(mapped.remove([mapped.decorations[1] as Decoration]).decorations).toHaveLength(2);
  });

  it('stores formatting at a caret and applies it to text typed next', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    expect(toggleMark(editor, 'strong')).toBe(true);
    expect(editor.state.storedMarks.map((mark) => mark.type.name)).toEqual(['strong']);
    expect(insertText(editor, 'Bold')).toBe(true);
    expect(MarkdownExporter.export(editor.state)).toBe('**Bold**');
    expect(toggleMark(editor, 'strong')).toBe(true);
    expect(insertText(editor, ' plain')).toBe(true);
    expect(MarkdownExporter.export(editor.state)).toBe('**Bold** plain');
  });

  it('splits a block at the current selection', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    insertText(editor, 'Hello world');
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 5)));
    expect(splitBlock(editor)).toBe(true);
    expect(editor.state.doc.content.map((node) => node.textContent)).toEqual(['Hello', ' world']);
    expect(editor.state.selection.path).toEqual([1, 0]);
  });

  it('replaces selected marked fragments and top-level blocks with a real block boundary', () => {
    const fragments = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [
          { type: 'text', text: 'Left ' },
          { type: 'text', text: 'marked', marks: [{ type: 'strong' }] },
          { type: 'text', text: ' right' },
        ] }],
      },
    });
    fragments.dispatch(fragments.state.createTransaction().setSelection(
      Selection.range([0, 0], 2, [0, 2], 3),
    ));
    expect(splitBlock(fragments)).toBe(true);
    expect(fragments.state.doc.content.map((node) => node.textContent)).toEqual(['Le', 'ght']);
    expect(fragments.state.selection.eq(Selection.cursor([1, 0], 0))).toBe(true);

    const blocks = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'One' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Two' }] },
        ],
      },
    });
    blocks.dispatch(blocks.state.createTransaction().setSelection(
      Selection.range([0, 0], 1, [1, 0], 2),
    ));
    expect(splitBlock(blocks)).toBe(true);
    expect(blocks.state.doc.content.map((node) => node.textContent)).toEqual(['O', 'o']);
    expect(blocks.state.selection.eq(Selection.cursor([1, 0], 0))).toBe(true);
  });

  it('deletes an adjacent inline atom instead of text on its far side', () => {
    const createInlineBreakEditor = () => createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [
          { type: 'text', text: 'Before' },
          { type: 'hard_break' },
          { type: 'text', text: 'After' },
        ] }],
      },
    });
    const backward = createInlineBreakEditor();
    backward.dispatch(backward.state.createTransaction().setSelection(Selection.cursor([0, 2], 0)));
    expect(deleteBackward(backward)).toBe(true);
    expect(backward.state.doc.child(0).content.map((node) => node.type.name)).toEqual(['text', 'text']);
    expect(backward.getText()).toBe('BeforeAfter');

    const forward = createInlineBreakEditor();
    forward.dispatch(forward.state.createTransaction().setSelection(Selection.cursor([0, 0], 6)));
    expect(deleteForward(forward)).toBe(true);
    expect(forward.state.doc.child(0).content.map((node) => node.type.name)).toEqual(['text', 'text']);
    expect(forward.getText()).toBe('BeforeAfter');
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

  it('replaces a selection across paragraphs and joins the surrounding text', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Hello brave' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'new world' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
        ],
      },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0], 5, [1, 0], 3)));
    expect(insertText(editor, '—')).toBe(true);
    expect(editor.state.doc.content.map((node) => node.textContent)).toEqual(['Hello— world', 'After']);
    expect(editor.state.selection.eq(Selection.cursor([0, 0], 6))).toBe(true);
  });

  it('formats and preserves a selection across multiple blocks', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Beta' }] },
        ],
      },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0], 2, [1, 0], 2)));
    expect(toggleMark(editor, 'strong')).toBe(true);
    expect(MarkdownExporter.export(editor.state)).toBe('Al**pha**\n\n**Be**ta');
    expect(editor.state.selection.path).toEqual([0, 1]);
    expect(editor.state.selection.endPath).toEqual([1, 0]);
    expect(toggleMark(editor, 'strong')).toBe(true);
    expect(MarkdownExporter.export(editor.state)).toBe('Alpha\n\nBeta');
  });

  it('joins text blocks with Backspace and Delete at their boundaries', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'One' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Two' }] },
      ],
    } as const;
    const backward = createEditor({ schema: CoreSchemaSpec, content });
    backward.dispatch(backward.state.createTransaction().setSelection(Selection.cursor([1, 0], 0)));
    expect(deleteBackward(backward)).toBe(true);
    expect(backward.state.doc.childCount).toBe(1);
    expect(backward.getText()).toBe('OneTwo');
    expect(backward.state.selection.eq(Selection.cursor([0, 0], 3))).toBe(true);

    const forward = createEditor({ schema: CoreSchemaSpec, content });
    forward.dispatch(forward.state.createTransaction().setSelection(Selection.cursor([0, 0], 3)));
    expect(deleteForward(forward)).toBe(true);
    expect(forward.state.doc.childCount).toBe(1);
    expect(forward.getText()).toBe('OneTwo');
    expect(forward.state.selection.eq(Selection.cursor([0, 0], 3))).toBe(true);
  });

  it('removes empty caret sentinels when visible blank paragraphs are joined', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }],
      },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    expect(splitBlock(editor)).toBe(true);
    expect(splitBlock(editor)).toBe(true);
    expect(editor.state.doc.content.map((node) => node.textContent)).toEqual(['', '', 'One']);
    expect(deleteBackward(editor)).toBe(true);
    expect(deleteBackward(editor)).toBe(true);
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.child(0).content.map((node) => node.text)).toEqual(['One']);
    expect(editor.state.selection.eq(Selection.cursor([0, 0], 0))).toBe(true);
  });

  it('keeps the caret at an exact hard-break boundary while joining paragraphs', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'One' },
          { type: 'hard_break' },
          { type: 'text', text: '' },
        ] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Two' }] },
      ],
    } as const;
    const backward = createEditor({ schema: CoreSchemaSpec, content });
    backward.dispatch(backward.state.createTransaction().setSelection(Selection.cursor([1, 0], 0)));
    expect(deleteBackward(backward)).toBe(true);
    expect(backward.state.doc.child(0).content.map((node) => node.type.name)).toEqual(['text', 'hard_break', 'text']);
    expect(backward.state.selection.eq(Selection.cursor([0, 2], 0))).toBe(true);

    const forward = createEditor({ schema: CoreSchemaSpec, content });
    forward.dispatch(forward.state.createTransaction().setSelection(Selection.cursor([0, 2], 0)));
    expect(deleteForward(forward)).toBe(true);
    expect(forward.state.doc.child(0).content.map((node) => node.type.name)).toEqual(['text', 'hard_break', 'text']);
    expect(forward.state.selection.eq(Selection.cursor([0, 2], 0))).toBe(true);
  });

  it('unwraps a quote with Backspace and exits its empty final line with Enter', () => {
    const unwrapped = createEditor({ schema: CoreSchemaSpec });
    expect(insertQuote(unwrapped, 'Quoted')).toBe(true);
    expect(unwrapped.state.selection.eq(Selection.cursor([1, 0, 0], 0))).toBe(true);
    expect(deleteBackward(unwrapped)).toBe(true);
    expect(unwrapped.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph', 'paragraph']);
    expect(unwrapped.state.doc.child(1).textContent).toBe('Quoted');
    expect(unwrapped.state.selection.eq(Selection.cursor([1, 0], 0))).toBe(true);

    const exited = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Quoted' }] },
            { type: 'paragraph', content: [{ type: 'text', text: '' }] },
          ],
        }],
      },
    });
    exited.dispatch(exited.state.createTransaction().setSelection(Selection.cursor([0, 1, 0], 0)));
    expect(splitBlock(exited)).toBe(true);
    expect(exited.state.doc.content.map((node) => node.type.name)).toEqual(['blockquote', 'paragraph']);
    expect(exited.state.doc.child(0).textContent).toBe('Quoted');
    expect(exited.state.selection.eq(Selection.cursor([1, 0], 0))).toBe(true);
  });

  it('toggles one or several selected blocks into an editable quote and back out', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Tail' }] },
        ],
      },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0], 1, [1, 0], 4)));
    expect(toggleQuote(editor)).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['blockquote', 'paragraph']);
    expect(editor.state.doc.child(0).content.map((node) => node.textContent)).toEqual(['First', 'Second']);
    expect(editor.state.selection.eq(Selection.range([0, 0, 0], 1, [0, 1, 0], 4))).toBe(true);

    expect(toggleQuote(editor)).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    expect(editor.state.selection.eq(Selection.range([0, 0], 1, [1, 0], 4))).toBe(true);
  });

  it('splits and rejoins list items without flattening their container', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{
          type: 'bullet_list',
          content: [{ type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Inside' }] }] }],
        }],
      },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0], 2)));
    expect(splitBlock(editor)).toBe(true);
    expect(editor.state.doc.child(0).content.map((node) => node.textContent)).toEqual(['In', 'side']);
    expect(editor.state.selection.path).toEqual([0, 1, 0, 0]);
    expect(deleteBackward(editor)).toBe(true);
    expect(editor.state.doc.child(0).childCount).toBe(1);
    expect(editor.state.doc.child(0).child(0).textContent).toBe('Inside');
    expect(editor.state.selection.eq(Selection.cursor([0, 0, 0, 0], 2))).toBe(true);
  });

  it('joins forward across list items and exits an empty list item on Enter', () => {
    const forward = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{
          type: 'bullet_list',
          content: ['One', 'Two'].map((text) => ({
            type: 'list_item',
            content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
          })),
        }],
      },
    });
    forward.dispatch(forward.state.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0], 3)));
    expect(deleteForward(forward)).toBe(true);
    expect(forward.state.doc.child(0).childCount).toBe(1);
    expect(forward.state.doc.child(0).child(0).textContent).toBe('OneTwo');
    expect(forward.state.selection.eq(Selection.cursor([0, 0, 0, 0], 3))).toBe(true);

    const exit = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{
          type: 'bullet_list',
          content: ['First', '', 'Last'].map((text) => ({
            type: 'list_item',
            content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
          })),
        }],
      },
    });
    exit.dispatch(exit.state.createTransaction().setSelection(Selection.cursor([0, 1, 0, 0], 0)));
    expect(splitBlock(exit)).toBe(true);
    expect(exit.state.doc.content.map((node) => node.type.name)).toEqual(['bullet_list', 'paragraph', 'bullet_list']);
    expect(exit.state.selection.eq(Selection.cursor([1, 0], 0))).toBe(true);
  });

  it('allows valid list headings while rejecting invalid block conversions and attributes', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{
          type: 'bullet_list',
          content: [{ type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep valid' }] }] }],
        }],
      },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0], 2)));
    const before = editor.getJSON();
    expect(setBlockType(editor, 'blockquote')).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    expect(setBlockType(editor, 'heading', { level: 2 })).toBe(true);
    expect(editor.state.doc.child(0).child(0).child(0).type.name).toBe('heading');

    const image = createEditor({ schema: CoreSchemaSpec });
    expect(insertImage(image, { src: 'https://example.com/safe.png' })).toBe(true);
    expect(setNodeAttributes(image, [1], { width: '100%;position:fixed' })).toBe(false);
    expect(image.state.doc.child(1).attrs.width).toBe('100%');
  });

  it('changes every selected text block instead of only the forward selection anchor', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'One' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Two' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Three' }] },
        ],
      },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0], 1, [2, 0], 3)));
    expect(setBlockType(editor, 'heading', { level: 2 })).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['heading', 'heading', 'heading']);
    expect(editor.state.selection.eq(Selection.range([0, 0], 1, [2, 0], 3))).toBe(true);
  });

  it('inserts images, lists, and tables with editable cursor landing points', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    expect(insertImage(editor, { src: 'javascript:alert(1)' })).toBe(false);
    expect(insertImage(editor, { src: 'https://example.com/shot.jpg', alt: 'A screenshot', caption: 'Launch' })).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph', 'image_super', 'paragraph']);
    expect(editor.state.selection.path).toEqual([2, 0]);
    expect(insertList(editor, 'task', ['Write', 'Review'])).toBe(true);
    expect(editor.state.doc.content[3]?.type.name).toBe('task_list');
    expect(editor.state.selection.path).toEqual([3, 0, 0, 0]);
    expect(insertTable(editor, { rows: 2, columns: 2 })).toBe(true);
    expect(editor.state.doc.content[4]?.childCount).toBe(2);
    expect(editor.state.doc.content[4]?.child(0).childCount).toBe(2);
    expect(editor.state.selection.path).toEqual([4, 0, 0, 0, 0]);
  });

  it('applies and removes safe links across a selected range', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    insertText(editor, 'Read this');
    editor.dispatch(editor.state.createTransaction().setSelection(new Selection([0, 0], 0, 9)));
    expect(setLink(editor, 'javascript:alert(1)')).toBe(false);
    expect(setLink(editor, 'https://example.com')).toBe(true);
    expect(HTMLExporter.export(editor.state, { document: false })).toContain('href="https://example.com"');
    expect(unsetLink(editor)).toBe(true);
    expect(HTMLExporter.export(editor.state, { document: false })).not.toContain('<a ');
  });

  it('supports attributed text color, subscript, alignment, and semantic line breaks', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    insertText(editor, 'Water H2O');
    editor.dispatch(editor.state.createTransaction().setSelection(new Selection([0, 0], 7, 8)));
    expect(toggleMark(editor, 'subscript')).toBe(true);
    expect(setMark(editor, 'text_color', { color: '#ff0000' })).toBe(true);
    expect(setMark(editor, 'text_color', { color: 'red;position:fixed' })).toBe(false);
    expect(setTextAlignment(editor, 'center')).toBe(true);
    let html = HTMLExporter.export(editor.state, { document: false });
    expect(html).toContain('<p style="text-align:center">');
    expect(html).toContain('<span style="color:#ff0000"><sub>2</sub></span>');
    expect(unsetMark(editor, 'text_color')).toBe(true);

    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 5)));
    expect(insertHardBreak(editor)).toBe(true);
    html = HTMLExporter.export(editor.state, { document: false });
    expect(html).toContain('<br>');
    expect(MarkdownExporter.export(editor.state)).toContain('  \n');
  });

  it('finds across marked fragments and replaces every match as one undo step', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      plugins: [historyPlugin],
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [
            { type: 'text', text: 'Hel' },
            { type: 'text', text: 'lo', marks: [{ type: 'strong' }] },
            { type: 'text', text: ' world' },
          ] },
          { type: 'paragraph', content: [{ type: 'text', text: 'HELLO again' }] },
        ],
      },
    });
    const matches = findText(editor.state.doc, 'hello');
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ path: [0, 0], from: 0, endPath: [0, 1], to: 2 });
    expect(selectNextMatch(editor, 'hello')).toBe(true);
    expect(editor.state.selection.path).toEqual([0, 0]);
    expect(selectNextMatch(editor, 'hello')).toBe(true);
    expect(editor.state.selection.path).toEqual([1, 0]);
    expect(replaceAllText(editor, 'hello', 'Welcome')).toBe(2);
    expect(editor.getText()).toBe('Welcome world\nWelcome again');
    expect(undo(editor)).toBe(true);
    expect(editor.getText()).toBe('Hello world\nHELLO again');
  });

  it('edits table structure, task state, and block order through public commands', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    expect(insertTable(editor, { rows: 2, columns: 2 })).toBe(true);
    expect(addTableRow(editor)).toBe(true);
    expect(editor.state.doc.child(1).childCount).toBe(3);
    expect(addTableColumn(editor)).toBe(true);
    expect(editor.state.doc.child(1).content.every((row) => row.childCount === 3)).toBe(true);
    expect(deleteTableColumn(editor)).toBe(true);
    expect(editor.state.doc.child(1).content.every((row) => row.childCount === 2)).toBe(true);
    expect(deleteTableRow(editor)).toBe(true);
    expect(editor.state.doc.child(1).childCount).toBe(2);

    expect(insertList(editor, 'task', ['Ship it'])).toBe(true);
    expect(toggleTaskItem(editor, true)).toBe(true);
    expect(editor.state.doc.child(2).child(0).attrs.checked).toBe(true);
    expect(moveBlock(editor, 2, 0)).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe('task_list');
    expect(removeNode(editor, [0])).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe('paragraph');
  });

  it('navigates table cells and creates a row when Tab advances past the final cell', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    expect(insertTable(editor, { rows: 2, columns: 2 })).toBe(true);
    expect(moveTableCell(editor)).toBe(true);
    expect(editor.state.selection.path).toEqual([1, 0, 1, 0, 0]);
    expect(moveTableCell(editor)).toBe(true);
    expect(editor.state.selection.path).toEqual([1, 1, 0, 0, 0]);
    expect(moveTableCell(editor, 'previous')).toBe(true);
    expect(editor.state.selection.path).toEqual([1, 0, 1, 0, 0]);
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([1, 1, 1, 0, 0], 0)));
    expect(moveTableCell(editor)).toBe(true);
    expect(editor.state.doc.child(1).childCount).toBe(3);
    expect(editor.state.selection.path).toEqual([1, 2, 0, 0, 0]);
  });

  it('indents, outdents, and exits lists while preserving the caret', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    expect(insertList(editor, 'bullet', ['First', 'Second'])).toBe(true);
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([1, 1, 0, 0], 3)));
    expect(indentListItem(editor)).toBe(true);
    expect(editor.state.doc.child(1).childCount).toBe(1);
    expect(editor.state.doc.child(1).child(0).child(1).type.name).toBe('bullet_list');
    expect(editor.state.selection.path).toEqual([1, 0, 1, 0, 0, 0]);
    expect(outdentListItem(editor)).toBe(true);
    expect(editor.state.doc.child(1).childCount).toBe(2);
    expect(editor.state.selection.path).toEqual([1, 1, 0, 0]);
    expect(outdentListItem(editor)).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph', 'bullet_list', 'paragraph']);
    expect(editor.state.doc.child(2).textContent).toBe('Second');
    expect(editor.state.selection.path).toEqual([2, 0]);
  });

  it('inserts parsed rich content without flattening inline marks or blocks', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    insertText(editor, 'Before after');
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 6)));
    const schema = editor.state.schema;
    const inline = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('bold', [schema.mark('strong')])])]);
    expect(insertDocument(editor, inline)).toBe(true);
    expect(MarkdownExporter.export(editor.state)).toBe('Before**bold** after');

    const blocks = schema.node('doc', {}, [
      schema.node('heading', { level: 2 }, [schema.text('Two')]),
      schema.node('paragraph', {}, [schema.text('Paragraphs')]),
    ]);
    expect(insertDocument(editor, blocks)).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph', 'heading', 'paragraph', 'paragraph']);
    expect(MarkdownExporter.export(editor.state)).toContain('## Two\n\nParagraphs');
  });

  it('turns multiline plain text into visible blocks when replacing a selected node', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    expect(insertImage(editor, { src: '/selected.png', alt: 'selected' })).toBe(true);
    expect(selectNode(editor, [1])).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(insertPlainText(editor, 'First line\n\nThird line')).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual([
      'paragraph', 'paragraph', 'paragraph', 'paragraph', 'paragraph',
    ]);
    expect(editor.state.doc.content.slice(1, 4).map((node) => node.textContent)).toEqual([
      'First line', '', 'Third line',
    ]);
    expect(editor.state.selection.eq(Selection.cursor([3, 0], 10))).toBe(true);
  });

  it('keeps multi-block rich paste inside the nearest block container', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    expect(insertTable(editor, { rows: 1, columns: 1 })).toBe(true);
    insertText(editor, 'Cell suffix');
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([1, 0, 0, 0, 0], 5)));
    const schema = editor.state.schema;
    const fragment = schema.node('doc', {}, [
      schema.node('paragraph', {}, [schema.text('Pasted one')]),
      schema.node('paragraph', {}, [schema.text('Pasted two', [schema.mark('strong')])]),
    ]);
    expect(insertDocument(editor, fragment)).toBe(true);
    const cell = editor.state.doc.child(1).child(0).child(0);
    expect(cell.content.map((node) => node.textContent)).toEqual([
      'Cell ', 'Pasted one', 'Pasted two', 'suffix',
    ]);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph', 'table']);
    expect(editor.state.selection.eq(Selection.cursor([1, 0, 0, 2, 0], 10))).toBe(true);
  });

  it('inserts a single leaf block instead of mistaking its empty content for inline content', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Destination' }] }] },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 'Destination'.length)));
    const divider = editor.state.schema.node('doc', {}, [editor.state.schema.node('horizontal_rule')]);

    expect(insertDocument(editor, divider)).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual([
      'paragraph', 'horizontal_rule', 'paragraph',
    ]);
    expect(editor.state.doc.content.map((node) => node.textContent)).toEqual(['Destination', '', '']);
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
    const unsafeImage = new Node(schema.nodes.image_super, { src: 'javascript:alert(1)', alt: 'bad' });
    const doc = new Node(schema.topNodeType, {}, [unsafeImage]);
    expect(HTMLExporter.export(doc, { document: false })).toBe('');
  });

  it('imports exported JSON back into the configured schema', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    insertText(editor, 'Portable');
    const json = JSONExporter.export(editor.state);
    const restored = JSONExporter.import(json, editor.state.schema);
    expect(restored.eq(editor.state.doc)).toBe(true);
  });

  it('round-trips tasks, tables, highlights, and images through Markdown', () => {
    const schema = new Schema(CoreSchemaSpec);
    const source = '- [x] Finished\n- [ ] Review\n\n| Name | State |\n| --- | --- |\n| FountainJS | ==Ready== |\n\n![Editor](https://example.com/editor.png "Preview")';
    const doc = MarkdownImporter.parse(source, schema);
    expect(doc.content.map((node) => node.type.name)).toEqual(['task_list', 'table', 'image_super']);
    expect(doc.child(0).child(0).attrs.checked).toBe(true);
    expect(doc.child(1).childCount).toBe(2);
    expect(doc.child(2).attrs.alt).toBe('Editor');
    const output = MarkdownExporter.export(doc);
    expect(output).toContain('- [x] Finished');
    expect(output).toContain('| FountainJS | ==Ready== |');
    expect(output).toContain('![Editor](https://example.com/editor.png "Preview")');
  });
});
