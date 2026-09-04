// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  CoreExtension,
  EditorView,
  HTMLExporter,
  HTMLImporter,
  HistoryExtension,
  MarkdownExporter,
  MarkdownImporter,
  Schema,
  Selection,
  composeExtensions,
  createEditor,
  undo,
} from '../src';
import {
  DetailsExtension,
  getActiveDetails,
  insertDetails,
  setDetailsOpen,
  toggleDetails,
  toggleDetailsOpen,
  unwrapDetails,
  wrapInDetails,
} from '../src/details';
import { createYjsCollaborationExtension } from '../src/yjs';

function paragraph(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] } as const;
}

function docJSON(...values: string[]) {
  return { type: 'doc', content: values.map(paragraph) } as const;
}

function kit() { return composeExtensions([CoreExtension, DetailsExtension, HistoryExtension]); }

describe('collapsible details', () => {
  it('enforces a summary-first body structure and keeps the extension optional', () => {
    expect(() => new Schema(composeExtensions([CoreExtension]).schema).nodeFromJSON({
      type: 'doc',
      content: [{ type: 'details', content: [] }],
    })).toThrow('Unknown node type');

    const schema = new Schema(kit().schema);
    const valid = schema.node('details', { open: false }, [
      schema.node('details_summary', {}, [schema.text('Readable label')]),
      schema.node('paragraph', {}, [schema.text('Nested body')]),
    ]);
    schema.validate(valid);
    expect(() => schema.validate(schema.node('details', {}, [
      schema.node('paragraph', {}, [schema.text('No summary')]),
    ]))).toThrow('details_summary block+');
    expect(() => schema.nodeFromJSON({
      type: 'doc',
      content: [{ type: 'details_summary', content: [{ type: 'text', text: 'Escaped summary' }] }],
    })).toThrow('block+');
    expect(() => schema.nodeFromJSON({
      type: 'doc',
      content: [{
        type: 'details',
        attrs: { open: 'yes' },
        content: [
          { type: 'details_summary', content: [{ type: 'text', text: 'Label' }] },
          paragraph('Body'),
        ],
      }],
    })).toThrow('open');
  });

  it('inserts, wraps, opens, unwraps, and undoes through public commands', () => {
    const composed = kit();
    const editor = createEditor({ schema: composed.schema, plugins: composed.plugins, content: docJSON('Alpha', 'Beta', 'Gamma') });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0], 0, [1, 0], 4)));

    expect(wrapInDetails(editor, { summary: 'First two blocks', open: true })).toBe(true);
    expect(editor.state.doc.childCount).toBe(2);
    expect(editor.state.doc.child(0).toJSON()).toMatchObject({
      type: 'details',
      attrs: { open: true },
      content: [
        { type: 'details_summary', content: [{ text: 'First two blocks' }] },
        { type: 'paragraph', content: [{ text: 'Alpha' }] },
        { type: 'paragraph', content: [{ text: 'Beta' }] },
      ],
    });
    expect(getActiveDetails(editor)?.path).toEqual([0]);
    expect(toggleDetailsOpen(editor)).toBe(true);
    expect(editor.state.doc.child(0).attrs.open).toBe(false);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.child(0).attrs.open).toBe(true);
    expect(toggleDetails(editor)).toBe(true);
    expect(editor.state.doc.content.map((node) => node.textContent)).toEqual(['First two blocks', 'Alpha', 'Beta', 'Gamma']);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe('details');

    expect(unwrapDetails(editor)).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe('paragraph');
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([3, 0], 0)));
    expect(insertDetails(editor, { summary: 'New section' })).toBe(true);
    expect(editor.state.doc.child(4).type.name).toBe('details');
    expect(editor.state.selection.path).toEqual([4, 0, 0]);
  });

  it('moves Enter from the summary into an editable body and Backspace returns to the summary', () => {
    const composed = kit();
    const editor = createEditor({
      schema: composed.schema,
      plugins: composed.plugins,
      content: {
        type: 'doc',
        content: [{
          type: 'details',
          attrs: { open: true },
          content: [
            { type: 'details_summary', content: [{ type: 'text', text: 'Title tail' }] },
            paragraph('Existing body'),
          ],
        }],
      },
    });
    const keyboard = DetailsExtension.plugins?.[0]?.spec.props;
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0, 0], 5)));
    expect(keyboard?.handleBeforeInput?.(editor, { inputType: 'insertParagraph' } as InputEvent)).toBe(true);
    expect(editor.state.doc.child(0).content.map((node) => node.textContent)).toEqual(['Title', ' tail', 'Existing body']);
    expect(editor.state.selection.path).toEqual([0, 1, 0]);

    expect(keyboard?.handleKeyDown?.(editor, new KeyboardEvent('keydown', { key: 'Backspace' }))).toBe(true);
    expect(editor.state.selection.path).toEqual([0, 0, 0]);
    expect(editor.state.selection.from).toBe(5);
    expect(keyboard?.handleKeyDown?.(editor, new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }))).toBe(true);
    expect(editor.state.doc.child(0).attrs.open).toBe(false);
  });

  it('round-trips nested disclosures through safe HTML and Markdown', () => {
    const schema = new Schema(kit().schema);
    const strong = schema.mark('strong');
    const nested = schema.node('details', { open: false }, [
      schema.node('details_summary', {}, [schema.text('Nested')]),
      schema.node('paragraph', {}, [schema.text('Nested body')]),
    ]);
    const source = schema.node('doc', {}, [
      schema.node('details', { open: true }, [
        schema.node('details_summary', {}, [schema.text('More information', [strong])]),
        schema.node('paragraph', {}, [schema.text('First paragraph')]),
        nested,
      ]),
    ]);

    const html = HTMLExporter.export(source, { document: false });
    expect(html).toContain('<details class="fountain-details" open>');
    expect(html).toContain('<summary class="fountain-details__summary"><strong>More information</strong></summary>');
    expect(HTMLImporter.parse(html, schema).toJSON()).toEqual(source.toJSON());

    const markdown = MarkdownExporter.exportWithReport(source);
    expect(markdown.losses).toEqual([]);
    expect(markdown.markdown).toContain('<details open>');
    expect(markdown.markdown).toContain('<summary>**More information**</summary>');
    expect(MarkdownImporter.parse(markdown.markdown, schema).toJSON()).toEqual(source.toJSON());
  });

  it('persists native disclosure toggles while allowing read-only local inspection', () => {
    const composed = kit();
    const content = {
      type: 'doc',
      content: [{
        type: 'details', attrs: { open: false }, content: [
          { type: 'details_summary', content: [{ type: 'text', text: 'Toggle me' }] },
          paragraph('Body'),
        ],
      }],
    } as const;
    const editor = createEditor({ schema: composed.schema, plugins: composed.plugins, content });
    const mount = document.createElement('div');
    const view = new EditorView(mount, editor);
    const disclosure = mount.querySelector('details') as HTMLDetailsElement;
    disclosure.open = true;
    disclosure.dispatchEvent(new Event('toggle'));
    expect(editor.state.doc.child(0).attrs.open).toBe(true);
    expect(mount.querySelector('details')?.hasAttribute('open')).toBe(true);
    view.destroy();

    const reader = createEditor({ schema: composed.schema, plugins: composed.plugins, content, editable: false });
    const readerMount = document.createElement('div');
    const readerView = new EditorView(readerMount, reader);
    const readerDisclosure = readerMount.querySelector('details') as HTMLDetailsElement;
    readerDisclosure.open = true;
    readerDisclosure.dispatchEvent(new Event('toggle'));
    expect(reader.state.doc.child(0).attrs.open).toBe(false);
    expect(readerDisclosure.open).toBe(true);
    readerView.destroy();
  });

  it('synchronizes disclosure state and nested edits through the optional Yjs adapter', () => {
    const leftDocument = new Y.Doc();
    const leftCollaboration = createYjsCollaborationExtension({
      document: leftDocument,
      user: { id: 'left', name: 'Left', color: '#6d4aff' },
    });
    const leftKit = composeExtensions([CoreExtension, DetailsExtension, leftCollaboration]);
    const content = {
      type: 'doc', content: [{
        type: 'details', attrs: { open: false }, content: [
          { type: 'details_summary', content: [{ type: 'text', text: 'Shared details' }] },
          paragraph('Shared body'),
        ],
      }],
    } as const;
    const left = createEditor({ schema: leftKit.schema, plugins: leftKit.plugins, content });
    const rightDocument = new Y.Doc();
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'initial-details-sync');
    const rightCollaboration = createYjsCollaborationExtension({
      document: rightDocument,
      user: { id: 'right', name: 'Right', color: '#1f9d66' },
    });
    const rightKit = composeExtensions([CoreExtension, DetailsExtension, rightCollaboration]);
    const right = createEditor({ schema: rightKit.schema, plugins: rightKit.plugins, content });

    expect(setDetailsOpen(left, true, [0])).toBe(true);
    left.dispatch(left.state.createTransaction().replaceText([0, 1, 0], 7, 11, 'content'));
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'details-update');
    expect(right.getJSON()).toEqual(left.getJSON());
    expect(right.state.doc.child(0).attrs.open).toBe(true);
    expect(right.state.doc.child(0).child(1).textContent).toBe('Shared content');

    left.destroy();
    right.destroy();
    leftDocument.destroy();
    rightDocument.destroy();
  });
});
