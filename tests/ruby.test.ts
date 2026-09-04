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
  TextExporter,
  composeExtensions,
  createEditor,
  undo,
} from '../src';
import {
  RubyExtension,
  createRubyExtension,
  getActiveRuby,
  setRuby,
  toggleRuby,
  unsetRuby,
  updateRuby,
} from '../src/ruby';
import { createYjsCollaborationExtension } from '../src/yjs';

function kit(ruby = RubyExtension) { return composeExtensions([CoreExtension, ruby, HistoryExtension]); }

function rubyDocument(annotation = 'とうきょう') {
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Visit ' },
        {
          type: 'ruby',
          attrs: { rt: annotation },
          content: [{ type: 'text', text: '東京', marks: [{ type: 'strong' }] }],
        },
        { type: 'text', text: ' today.' },
      ],
    }],
  } as const;
}

describe('ruby annotations', () => {
  it('is optional and enforces a non-empty, single-line annotation over text content', () => {
    expect(() => new Schema(composeExtensions([CoreExtension]).schema).nodeFromJSON(rubyDocument())).toThrow('Unknown node type');
    const schema = new Schema(kit().schema);
    expect(() => schema.node('ruby', { rt: '' }, [schema.text('base')])).toThrow('rt');
    expect(() => schema.node('ruby', { rt: 'line\nbreak' }, [schema.text('base')])).toThrow('rt');
    expect(() => schema.validate(schema.node('ruby', { rt: 'reading' }, [schema.node('paragraph')]))).toThrow('text+');
    const valid = schema.node('ruby', { rt: 'reading' }, [schema.text('base')]);
    expect(valid.textContent).toBe('base (reading)');
  });

  it('sets, updates, toggles, unsets, and undoes ruby without losing base marks', () => {
    const composed = kit();
    const editor = createEditor({
      schema: composed.schema,
      plugins: composed.plugins,
      content: {
        type: 'doc', content: [{ type: 'paragraph', content: [
          { type: 'text', text: '東', marks: [{ type: 'strong' }] },
          { type: 'text', text: '京', marks: [{ type: 'em' }] },
          { type: 'text', text: ' city' },
        ] }],
      },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0], 0, [0, 1], 1)));

    expect(setRuby(editor, { annotation: 'とうきょう' })).toBe(true);
    const ruby = editor.state.doc.child(0).child(0);
    expect(ruby.toJSON()).toEqual({
      type: 'ruby', attrs: { rt: 'とうきょう' }, content: [
        { type: 'text', text: '東', marks: [{ type: 'strong' }] },
        { type: 'text', text: '京', marks: [{ type: 'em' }] },
      ],
    });
    expect(getActiveRuby(editor)?.path).toEqual([0, 0]);
    expect(updateRuby(editor, { rt: 'トウキョウ' })).toBe(true);
    expect(editor.state.doc.child(0).child(0).attrs.rt).toBe('トウキョウ');
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.child(0).child(0).attrs.rt).toBe('とうきょう');
    expect(toggleRuby(editor, 'ignored while active')).toBe(true);
    expect(editor.state.doc.child(0).content.map((node) => node.type.name)).toEqual(['text', 'text', 'text']);
    expect(editor.state.doc.child(0).content.slice(0, 2).map((node) => node.marks[0]?.type.name)).toEqual(['strong', 'em']);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.child(0).child(0).type.name).toBe('ruby');
    expect(unsetRuby(editor, [0, 0])).toBe(true);
    expect(editor.state.doc.child(0).textContent).toBe('東京 city');
  });

  it('rejects ambiguous, empty, invalid, nested, and read-only command targets', () => {
    const composed = kit();
    const content = { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Beta' }] },
    ] } as const;
    const editor = createEditor({ schema: composed.schema, plugins: composed.plugins, content });
    expect(setRuby(editor, 'reading')).toBe(false);
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0], 0, [1, 0], 4)));
    expect(setRuby(editor, 'reading')).toBe(false);
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.range([0, 0], 0, [0, 0], 5)));
    expect(setRuby(editor, '  ')).toBe(false);
    expect(setRuby(editor, 'line\nbreak')).toBe(false);
    expect(setRuby(editor, 'reading')).toBe(true);
    expect(setRuby(editor, 'nested')).toBe(false);

    const reader = createEditor({ schema: composed.schema, plugins: composed.plugins, content, editable: false });
    reader.dispatch(reader.state.createTransaction().setSelection(Selection.range([0, 0], 0, [0, 0], 5)));
    expect(setRuby(reader, 'reading')).toBe(false);
    expect(updateRuby(reader, 'other', [0, 0])).toBe(false);
    expect(unsetRuby(reader, [0, 0])).toBe(false);
  });

  it('round-trips semantic HTML and Markdown while providing a readable text fallback', () => {
    const schema = new Schema(kit().schema);
    const source = schema.nodeFromJSON(rubyDocument());
    const html = HTMLExporter.export(source, { document: false });
    expect(html).toContain('<ruby class="fountain-ruby" data-fountain-ruby="true"><rb class="fountain-ruby__base"><strong>東京</strong></rb><rp>(</rp><rt class="fountain-ruby__annotation">とうきょう</rt><rp>)</rp></ruby>');
    expect(HTMLImporter.parse(html, schema).toJSON()).toEqual(source.toJSON());

    const direct = HTMLImporter.parse('<p><ruby><strong>東</strong>京<rp>(</rp><rt>とうきょう</rt><rp>)</rp></ruby></p>', schema);
    expect(direct.child(0).child(0).toJSON()).toEqual({
      type: 'ruby', attrs: { rt: 'とうきょう' }, content: [
        { type: 'text', text: '東', marks: [{ type: 'strong' }] },
        { type: 'text', text: '京' },
      ],
    });
    expect(HTMLImporter.parse('<p>Before <ruby>東京<rp>(</rp></ruby> after</p>', schema).child(0).textContent)
      .toBe('Before 東京 after');

    const markdown = MarkdownExporter.exportWithReport(source);
    expect(markdown.losses).toEqual([]);
    expect(markdown.markdown).toContain('<ruby data-fountain-ruby="true">');
    expect(MarkdownImporter.parse(markdown.markdown, schema).toJSON()).toEqual(source.toJSON());
    expect(TextExporter.export(source)).toContain('Visit 東京 (とうきょう) today.');
  });

  it('edits through an accessible, IME-safe annotation form and remains inert when read-only', () => {
    const composed = kit();
    const editor = createEditor({ schema: composed.schema, plugins: composed.plugins, content: rubyDocument() });
    const mount = document.createElement('div');
    const view = new EditorView(mount, editor);
    const annotation = mount.querySelector('rt') as HTMLElement;
    expect(annotation.getAttribute('role')).toBe('button');
    expect(annotation.getAttribute('aria-label')).toContain('とうきょう');
    annotation.click();
    let input = document.body.querySelector<HTMLInputElement>('[data-fountain-ruby-editor] input');
    expect(input?.getAttribute('aria-label')).toBe('Ruby annotation');
    if (!input) throw new Error('Ruby annotation input did not open.');
    input.value = 'トウキョウ';
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.form?.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    expect(editor.state.doc.child(0).child(1).attrs.rt).toBe('とうきょう');
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    input.form?.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    expect(editor.state.doc.child(0).child(1).attrs.rt).toBe('トウキョウ');
    expect(document.body.querySelector('[data-fountain-ruby-editor]')).toBeNull();

    (mount.querySelector('rt') as HTMLElement).click();
    document.body.querySelector<HTMLButtonElement>('[data-fountain-ruby-editor] button:nth-of-type(3)')?.click();
    expect(document.body.querySelector('[data-fountain-ruby-editor]')).toBeNull();
    view.destroy();

    const reader = createEditor({ schema: composed.schema, plugins: composed.plugins, content: rubyDocument(), editable: false });
    const readerMount = document.createElement('div');
    const readerView = new EditorView(readerMount, reader);
    const readOnlyAnnotation = readerMount.querySelector('rt') as HTMLElement;
    expect(readOnlyAnnotation.hasAttribute('role')).toBe(false);
    readOnlyAnnotation.click();
    expect(document.body.querySelector('[data-fountain-ruby-editor]')).toBeNull();
    readerView.destroy();
  });

  it('allows a host-rendered annotation editor without changing the portable document API', () => {
    const ruby = createRubyExtension({
      renderAnnotationEditor: ({ document: owner, annotation, submit }) => {
        const button = owner.createElement('button');
        button.textContent = `Custom ${annotation}`;
        button.addEventListener('click', () => submit('custom-reading'));
        return button;
      },
    });
    const composed = kit(ruby);
    const editor = createEditor({ schema: composed.schema, plugins: composed.plugins, content: rubyDocument() });
    const mount = document.createElement('div');
    const view = new EditorView(mount, editor);
    (mount.querySelector('rt') as HTMLElement).click();
    const custom = document.body.querySelector<HTMLButtonElement>('[data-fountain-ruby-editor]');
    expect(custom?.textContent).toBe('Custom とうきょう');
    custom?.click();
    expect(editor.state.doc.child(0).child(1).attrs.rt).toBe('custom-reading');
    view.destroy();
  });

  it('synchronizes ruby metadata and base edits through the generic Yjs adapter', () => {
    const leftDocument = new Y.Doc();
    const leftCollaboration = createYjsCollaborationExtension({
      document: leftDocument,
      user: { id: 'left', name: 'Left', color: '#6547ff' },
    });
    const leftKit = composeExtensions([CoreExtension, RubyExtension, leftCollaboration]);
    const left = createEditor({ schema: leftKit.schema, plugins: leftKit.plugins, content: rubyDocument() });
    const rightDocument = new Y.Doc();
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'initial-ruby-sync');
    const rightCollaboration = createYjsCollaborationExtension({
      document: rightDocument,
      user: { id: 'right', name: 'Right', color: '#1f9d66' },
    });
    const rightKit = composeExtensions([CoreExtension, RubyExtension, rightCollaboration]);
    const right = createEditor({ schema: rightKit.schema, plugins: rightKit.plugins, content: rubyDocument() });

    expect(updateRuby(left, 'Tokyo', [0, 1])).toBe(true);
    left.dispatch(left.state.createTransaction().replaceText([0, 1, 0], 0, 2, '東京駅'));
    Y.applyUpdate(rightDocument, Y.encodeStateAsUpdate(leftDocument), 'ruby-update');
    expect(right.getJSON()).toEqual(left.getJSON());
    expect(right.state.doc.child(0).child(1).toJSON()).toMatchObject({ attrs: { rt: 'Tokyo' } });
    expect(right.state.doc.child(0).child(1).child(0).text).toBe('東京駅');

    left.destroy();
    right.destroy();
    leftDocument.destroy();
    rightDocument.destroy();
  });
});
