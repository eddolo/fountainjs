// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { AllSelection, CoreExtension, EditorView, NodeSelection, Plugin, Selection, composeExtensions, createEditor, createHistoryPlugin, undo, redo } from '../src';
import { PagesExtension, createFootnoteClipboardPlugin, inspectFootnotes } from '../src/pages';

const mime = 'application/x-fountainjs+json';
function transfer(type: 'copy' | 'cut' | 'paste', values = new Map<string, string>()) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files: [], types: [...values.keys()],
    getData: (key: string) => values.get(key) ?? '', setData: (key: string, value: string) => values.set(key, value) } });
  return { event, values };
}
function setup(extra: Plugin[] = []) {
  const editor = createEditor({ schema: composeExtensions([CoreExtension, PagesExtension]).schema,
    plugins: [createHistoryPlugin(), createFootnoteClipboardPlugin({ idFactory: () => 'copy' }), ...extra] });
  const { schema } = editor.state;
  const ref = (id: string) => schema.node('footnote_reference', { id });
  const p = (text: string, id?: string) => schema.node('paragraph', {}, [schema.text(text), ...(id ? [ref(id)] : [])]);
  const note = (id: string, text: string, other?: string) => schema.node('footnote_definition', { id }, [p(text, other)]);
  editor.dispatch(editor.createTransaction().replaceDocument(schema.node('doc', {}, [
    p('Move', 'a'), p('Remaining', 'a'), p('Target'), note('a', 'First', 'b'), note('b', 'Second', 'a'),
  ])));
  const mount = document.createElement('div'); document.body.append(mount); const onError = vi.fn();
  const view = new EditorView(mount, editor, { onError });
  const copy = (kind: 'copy' | 'cut' = 'cut') => {
    editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [0])));
    const result = transfer(kind); view.dom.dispatchEvent(result.event); return result.values;
  };
  const paste = (values: Map<string, string>, format: 'fountain' | 'html' = 'fountain') => {
    const index = editor.state.doc.content.findIndex(node => node.textContent.includes('Target'));
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([index, 0], 0)));
    const data = new Map(values); if (format === 'html') data.delete(mime);
    view.dom.dispatchEvent(transfer('paste', data).event);
  };
  return { editor, view, copy, paste, note, onError, cleanup: () => { view.destroy(); editor.destroy(); mount.remove(); } };
}
it.each(['fountain', 'html'] as const)('moves a shared cyclic footnote graph through %s once, with independent cut/paste undo', format => {
  const s = setup();
  try {
    const original = s.editor.getJSON(), values = s.copy(), cut = s.editor.getJSON();
    expect(s.editor.getText()).not.toContain('Move');
    s.paste(values, format);
    const report = inspectFootnotes(s.editor.state.doc), moved = s.editor.getJSON();
    expect(report.valid).toBe(true); expect(report.definitions.map(note => note.id)).toEqual(['a', 'b']);
    expect(report.references.filter(ref => ref.id === 'a')).toHaveLength(3);
    expect(undo(s.editor)).toBe(true); expect(s.editor.getJSON()).toEqual(cut);
    expect(undo(s.editor)).toBe(true); expect(s.editor.getJSON()).toEqual(original);
    expect(redo(s.editor)).toBe(true); expect(redo(s.editor)).toBe(true); expect(s.editor.getJSON()).toEqual(moved);
    s.paste(values, format);
    expect(inspectFootnotes(s.editor.state.doc).definitions).toHaveLength(4);
    expect(s.onError).not.toHaveBeenCalled();
  } finally { s.cleanup(); }
});
it.each(['fountain', 'html'] as const)('keeps ordinary %s copies independent', format => {
  const s = setup(); try { s.paste(s.copy('copy'), format); expect(inspectFootnotes(s.editor.state.doc).definitions).toHaveLength(4); }
  finally { s.cleanup(); }
});
it.each(['fountain', 'html'] as const)('does not reuse %s cut identities in another editor', format => {
  const source = setup(), target = setup(); try {
    target.paste(source.copy(), format); expect(inspectFootnotes(target.editor.state.doc).definitions).toHaveLength(4);
  } finally { source.cleanup(); target.cleanup(); }
});
it('preserves the copied graph separately if a dependency was changed after cutting', () => {
  const s = setup(); try {
    const values = s.copy();
    s.editor.dispatch(s.editor.createTransaction().replaceNode([3], [s.note('b', 'Changed remotely', 'a')]));
    s.paste(values); const notes = inspectFootnotes(s.editor.state.doc);
    expect(notes.valid).toBe(true); expect(notes.definitions).toHaveLength(4);
    expect(s.editor.getText()).toContain('Changed remotely'); expect(s.editor.getText()).toContain('Second');
  } finally { s.cleanup(); }
});
it('does not reuse a cut that was undone before paste', () => {
  const s = setup(); try {
    const values = s.copy(); expect(undo(s.editor)).toBe(true); s.paste(values);
    expect(inspectFootnotes(s.editor.state.doc).definitions).toHaveLength(4);
  } finally { s.cleanup(); }
});
it('keeps a refused cut as a copy and reports the refusal', () => {
  let refuse = false; const s = setup([new Plugin({ filterTransaction: tr => !refuse || !tr.docChanged })]); refuse = true; try {
    const original = s.editor.getJSON(), values = s.copy(); expect(s.editor.getJSON()).toEqual(original);
    expect(s.onError).toHaveBeenCalledOnce(); expect(values.get('text/plain')).toContain('Move');
  } finally { s.cleanup(); }
});

it.each(['fountain', 'html'] as const)('consumes a %s move only after an accepted paste', format => {
  let refuse = false;
  const s = setup([new Plugin({ filterTransaction: tr => !refuse || !tr.docChanged })]);
  try {
    const values = s.copy(); refuse = true;
    const cut = s.editor.getJSON(); s.paste(values, format); expect(s.editor.getJSON()).toEqual(cut);
    refuse = false; s.paste(values, format); expect(inspectFootnotes(s.editor.state.doc).definitions).toHaveLength(2);
    s.paste(values, format); expect(inspectFootnotes(s.editor.state.doc).definitions).toHaveLength(4);
  } finally { s.cleanup(); }
});
it.each(['fountain', 'html'] as const)('rejects a forged %s move marker when content changes', format => {
  const s = setup(); try {
    const values = s.copy();
    if (format === 'fountain') {
      const payload = JSON.parse(values.get(mime)!); payload.document.content[0].content[0].text = 'Forged';
      values.set(mime, JSON.stringify(payload));
    } else values.set('text/html', values.get('text/html')!.replace('Move', 'Forged'));
    s.paste(values, format); expect(inspectFootnotes(s.editor.state.doc).definitions).toHaveLength(4);
  } finally { s.cleanup(); }
});
it('invalidates a pending move when another copy is made', () => {
  const s = setup(); try { const values = s.copy(); s.copy('copy'); s.paste(values);
    expect(inspectFootnotes(s.editor.state.doc).definitions).toHaveLength(4);
  } finally { s.cleanup(); }
});
it('restores a cut definition to its existing references without renaming its identity', () => {
  const s = setup(); try {
    s.editor.dispatch(s.editor.createTransaction().setSelection(new NodeSelection(s.editor.state.doc, [3])));
    const cut = transfer('cut'); s.view.dom.dispatchEvent(cut.event); s.paste(cut.values);
    const report = inspectFootnotes(s.editor.state.doc);
    expect(report.valid).toBe(true); expect(report.definitions.map(n => n.id).sort()).toEqual(['a', 'b']);
  } finally { s.cleanup(); }
});
it('does not delete a different selection after a copy observer changes it', async () => {
  const { clipboardTextObservers } = await import('../src/core/clipboard-write');
  const s = setup(); try {
    const original = s.editor.getJSON();
    clipboardTextObservers.set(s.editor, () => s.editor.dispatch(s.editor.createTransaction().setSelection(new NodeSelection(s.editor.state.doc, [1]))));
    s.copy(); expect(s.editor.getJSON()).toEqual(original); expect(s.onError).toHaveBeenCalledOnce();
  } finally { clipboardTextObservers.delete(s.editor); s.cleanup(); }
});

it('restores owned definitions removed by the paste destination selection', () => {
  const s = setup(); try {
    const values = s.copy();
    s.editor.dispatch(s.editor.createTransaction().setSelection(new AllSelection(s.editor.state.doc)));
    s.view.dom.dispatchEvent(transfer('paste', values).event);
    const report = inspectFootnotes(s.editor.state.doc);
    expect(report.valid).toBe(true); expect(report.definitions.map(n => n.id)).toEqual(['a', 'b']);
    expect(s.editor.getText()).toContain('Move'); expect(s.editor.getText()).toContain('Second');
  } finally { s.cleanup(); }
});
