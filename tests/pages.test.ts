import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  CoreExtension,
  HistoryExtension,
  Schema,
  Selection,
  composeExtensions,
  createEditor,
  undo,
} from '../src';
import {
  PagesExtension,
  assertFootnotes,
  createPagesExtension,
  insertFootnote,
  insertPageField,
  insertPageBreak,
  inspectFootnotes,
  inspectPageTemplates,
  removePageTemplate,
  removeFootnote,
  resolvePageField,
  selectPageTemplate,
  selectFootnoteDefinition,
  setPageTemplate,
} from '../src/pages';
import { createYjsCollaborationExtension } from '../src/yjs';

function paragraph(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] } as const;
}

function pagesKit(...extensions: Parameters<typeof composeExtensions>[0]) {
  return composeExtensions([CoreExtension, PagesExtension, ...extensions]);
}

describe('portable page intent', () => {
  it('keeps the optional schema absent from the core and validates portable identities', () => {
    expect(() => new Schema(composeExtensions([CoreExtension]).schema).node('page_break')).toThrow(/Unknown/);
    const schema = new Schema(pagesKit().schema);
    expect(schema.node('page_break').toJSON()).toEqual({ type: 'page_break' });
    expect(() => schema.node('footnote_reference', { id: 'spaces are not portable' })).toThrow(/id/);
    expect(() => schema.node('footnote_definition', { id: 'valid-id' }, [])).not.toThrow();
    expect(() => schema.validate(schema.node('footnote_definition', { id: 'valid-id' }, []))).toThrow(/block\+/);
  });

  it('inserts page breaks and complete footnotes as undoable transactions in pure Node', () => {
    const composed = pagesKit(HistoryExtension);
    const editor = createEditor({
      schema: composed.schema,
      plugins: composed.plugins,
      content: { type: 'doc', content: [paragraph('Before after')] },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 6)));
    expect(insertPageBreak(editor)).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['paragraph', 'page_break', 'paragraph']);
    expect(undo(editor)).toBe(true);

    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 6)));
    expect(insertFootnote(editor, { id: 'source-1', content: 'Citation text' })).toBe(true);
    expect(editor.state.doc.toJSON()).toMatchObject({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ text: 'Before' }, { type: 'footnote_reference', attrs: { id: 'source-1' } }, { text: ' after' }] },
        { type: 'footnote_definition', attrs: { id: 'source-1' }, content: [paragraph('Citation text')] },
      ],
    });
    expect(inspectFootnotes(editor.state.doc)).toMatchObject({ valid: true, issues: [] });
    expect(Object.isFrozen(inspectFootnotes(editor.state.doc).references)).toBe(true);
    expect(selectFootnoteDefinition(editor, 'source-1')).toBe(true);
    expect(editor.state.selection.path).toEqual([1, 0, 0]);
    expect(removeFootnote(editor, 'source-1')).toBe(true);
    expect(editor.state.doc.textContent).toBe('Before after');
    expect(inspectFootnotes(editor.state.doc)).toMatchObject({ references: [], definitions: [], valid: true });
  });

  it('reports missing, duplicate, nested, and unreferenced definitions without mutating data', () => {
    const schema = new Schema(pagesKit().schema);
    const document = schema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }, { type: 'footnote_reference', attrs: { id: 'missing' } }] },
        { type: 'footnote_definition', attrs: { id: 'duplicate' }, content: [paragraph('One')] },
        { type: 'footnote_definition', attrs: { id: 'duplicate' }, content: [paragraph('Two')] },
        {
          type: 'blockquote',
          content: [{ type: 'footnote_definition', attrs: { id: 'nested' }, content: [paragraph('Nested')] }],
        },
      ],
    });
    const report = inspectFootnotes(document);
    expect(new Set(report.issues.map((issue) => issue.code))).toEqual(new Set([
      'missing-definition', 'duplicate-definition', 'nested-definition', 'unreferenced-definition',
    ]));
    expect(() => assertFootnotes(document)).toThrow(/no definition/);
  });

  it('uses an injected ID source and refuses collisions', () => {
    const pages = createPagesExtension({ footnoteIdFactory: () => 'generated-id' });
    const composed = composeExtensions([CoreExtension, pages]);
    const editor = createEditor({ schema: composed.schema, content: { type: 'doc', content: [paragraph('Text')] } });
    expect(composed.commands.insertFootnote(editor, { content: 'First' })).toBe(true);
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 2], 0)));
    expect(() => composed.commands.insertFootnote(editor, { content: 'Second' })).toThrow(/occupied id/);
  });

  it('round-trips page intent through JSON and converges through Yjs without a DOM', () => {
    const leftDocument = new Y.Doc();
    const leftCollaboration = createYjsCollaborationExtension({
      document: leftDocument,
      user: { id: 'left', name: 'Left', color: '#5b43df' },
    });
    const leftKit = composeExtensions([CoreExtension, PagesExtension, leftCollaboration]);
    const left = createEditor({ schema: leftKit.schema, plugins: leftKit.plugins, content: { type: 'doc', content: [paragraph('Shared')] } });
    left.dispatch(left.state.createTransaction().setSelection(Selection.cursor([0, 0], 6)));
    expect(insertFootnote(left, { id: 'shared-note', content: 'Shared definition' })).toBe(true);
    expect(setPageTemplate(left, { kind: 'header', content: 'Shared report' })).toBe(true);
    expect(selectPageTemplate(left, 'header')).toBe(true);
    left.dispatch(left.state.createTransaction().setSelection(Selection.cursor([0, 0, 0], 13)));
    expect(insertPageField(left, 'page-number')).toBe(true);

    const json = left.getJSON();
    const schema = new Schema(pagesKit().schema);
    expect(schema.nodeFromJSON(json).toJSON()).toEqual(json);

    const rightDocument = new Y.Doc();
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'pages-sync');
    const rightCollaboration = createYjsCollaborationExtension({
      document: rightDocument,
      user: { id: 'right', name: 'Right', color: '#16835f' },
    });
    const rightKit = composeExtensions([CoreExtension, PagesExtension, rightCollaboration]);
    const right = createEditor({ schema: rightKit.schema, plugins: rightKit.plugins, content: { type: 'doc', content: [paragraph('Fallback')] } });
    expect(right.getJSON()).toEqual(left.getJSON());
    expect(inspectFootnotes(right.state.doc).valid).toBe(true);

    left.destroy();
    right.destroy();
    leftDocument.destroy();
    rightDocument.destroy();
  });

  it('owns one canonical editable template per kind/variant with portable dynamic fields', () => {
    const composed = pagesKit(HistoryExtension);
    const editor = createEditor({
      schema: composed.schema,
      plugins: composed.plugins,
      content: { type: 'doc', content: [paragraph('Body')] },
    });

    expect(setPageTemplate(editor, { kind: 'header', content: 'Report · ' })).toBe(true);
    expect(setPageTemplate(editor, { kind: 'footer', variant: 'odd', content: 'Page ' })).toBe(true);
    expect(editor.state.doc.content.map((node) => node.type.name)).toEqual(['page_header', 'paragraph', 'page_footer']);
    expect(selectPageTemplate(editor, 'footer', 'odd')).toBe(true);
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([2, 0, 0], 5)));
    expect(insertPageField(editor, 'page-number')).toBe(true);
    expect(inspectPageTemplates(editor.state.doc)).toMatchObject({
      valid: true,
      templates: [
        { kind: 'header', variant: 'default', path: [0] },
        { kind: 'footer', variant: 'odd', path: [2] },
      ],
      fields: [{ kind: 'page-number', path: [2, 0, 1] }],
    });
    expect(resolvePageField('page-number', 3, 8)).toBe('3');
    expect(resolvePageField('page-count', 3, 8)).toBe('8');
    expect(() => resolvePageField('page-number', 0, 8)).toThrow(/pageNumber/);
    expect(undo(editor)).toBe(true);
    expect(inspectPageTemplates(editor.state.doc).fields).toEqual([]);

    expect(setPageTemplate(editor, { kind: 'header', content: 'Updated' })).toBe(true);
    expect(editor.state.doc.content.filter((node) => node.type.name === 'page_header')).toHaveLength(1);
    expect(editor.state.doc.content[0].textContent).toBe('Updated');
    expect(removePageTemplate(editor, 'footer', 'odd')).toBe(true);
    expect(inspectPageTemplates(editor.state.doc)).toMatchObject({ valid: true, templates: [{ kind: 'header' }] });
  });

  it('reports duplicate/nested templates and page fields outside a template', () => {
    const schema = new Schema(pagesKit().schema);
    const document = schema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'page_header', attrs: { variant: 'default' }, content: [paragraph('One')] },
        { type: 'page_header', attrs: { variant: 'default' }, content: [paragraph('Two')] },
        { type: 'paragraph', content: [{ type: 'page_field', attrs: { kind: 'page-count' } }] },
        {
          type: 'blockquote',
          content: [{ type: 'page_footer', attrs: { variant: 'first' }, content: [paragraph('Nested')] }],
        },
      ],
    });
    const report = inspectPageTemplates(document);
    expect(new Set(report.issues.map((issue) => issue.code))).toEqual(new Set([
      'duplicate-template', 'nested-template', 'orphan-page-field',
    ]));
    expect(report.valid).toBe(false);
  });
});
