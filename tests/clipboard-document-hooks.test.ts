// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { AllSelection, CoreExtension, EditorView, Plugin, composeExtensions, createEditor, defineExtension, type Editor, type Node } from '../src';

const mime = 'application/x-fountainjs+json';
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
function clipboard(type: 'copy' | 'cut' | 'paste', values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values)), event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: (key: string) => data.get(key) ?? '',
    setData: (key: string, value: string) => data.set(key, value) } });
  return { event, data };
}
function mount(plugins: Plugin[] = [], options: ConstructorParameters<typeof EditorView>[2] = {}) {
  const editor = createEditor({ schema: composeExtensions([CoreExtension]).schema, plugins,
    content: { type: 'doc', content: [p('Original')] } });
  const target = document.createElement('div'); document.body.append(target);
  const view = new EditorView(target, editor, options);
  editor.dispatch(editor.createTransaction().setSelection(new AllSelection(editor.state.doc)));
  return { editor, view, cleanup: () => { view.destroy(); editor.destroy(); target.remove(); } };
}

it('copies model dependencies without editing the original document', () => {
  const { editor, view, cleanup } = mount([new Plugin({ props: { transformCopiedDocument: (editor, fragment) =>
    fragment.copy([...fragment.content, editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Owned dependency')])]) } })]);
  try {
    const before = editor.state.doc, copied = clipboard('copy'); view.dom.dispatchEvent(copied.event);
    expect(editor.state.doc).toBe(before);
    expect(copied.data.get('text/plain')).toBe('Original\nOwned dependency');
    expect(JSON.parse(copied.data.get(mime)!).document.content).toHaveLength(2);
  } finally { cleanup(); }
});

it('refuses a cut when dependency projection fails, leaving the selected document intact', () => {
  const onError = vi.fn();
  const { editor, view, cleanup } = mount([new Plugin({ props: { transformCopiedDocument: () => { throw new Error('Missing dependency'); } } })], { onError });
  try {
    const before = editor.state.doc, cut = clipboard('cut'); view.dom.dispatchEvent(cut.event);
    expect(cut.event.defaultPrevented).toBe(true); expect(editor.state.doc).toBe(before);
    expect(cut.data.size).toBe(0); expect(onError).toHaveBeenCalledOnce();
  } finally { cleanup(); }
});

it.each(['fountain', 'html'] as const)('atomically refuses a %s document without a lossy second paste', source => {
  const onError = vi.fn(), reports: unknown[] = [];
  const handler = vi.fn((editor: Editor, _document: Node, _context: { readonly source: 'fountain' | 'html' }) => {
    editor.dispatch(editor.createTransaction().replaceDocument(editor.state.schema.node('doc', {},
      [editor.state.schema.node('paragraph', {}, [editor.state.schema.text('Must be rolled back')])])));
    if (source === 'html') throw new Error('Host validation refused');
    return false;
  });
  const { editor, view, cleanup } = mount([new Plugin({ props: { handlePasteDocument: handler } })],
    { onError, paste: { onReport: report => reports.push(report) } });
  try {
    const before = editor.state.doc;
    const pasted = clipboard('paste', { 'text/plain': 'Lossy fallback', 'text/html': '<p>Rich source</p>',
      ...(source === 'fountain' ? { [mime]: JSON.stringify({ version: 1, document: { type: 'doc', content: [p('Native source')] } }) } : {}) });
    view.dom.dispatchEvent(pasted.event);
    expect(editor.state.doc).toBe(before); expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]![2]).toEqual({ source });
    expect(reports).toEqual([expect.objectContaining({ outcome: 'rejected' })]);
    expect(onError).toHaveBeenCalledTimes(source === 'html' ? 1 : 0);
  } finally { cleanup(); }
});

it('delegates undefined to later model handlers without running legacy text paste rules on native content', () => {
  const legacy = vi.fn(() => true), model = vi.fn(() => undefined);
  const { editor, view, cleanup } = mount([new Plugin({ props: { handlePaste: legacy, handlePasteDocument: model } })]);
  try {
    const pasted = clipboard('paste', { [mime]: JSON.stringify({ version: 1, document: { type: 'doc', content: [p('Native source')] } }) });
    view.dom.dispatchEvent(pasted.event);
    expect(model).toHaveBeenCalledOnce(); expect(legacy).not.toHaveBeenCalled();
    expect(editor.getText()).toBe('Native source');
  } finally { cleanup(); }
});

it('uses the declared plain-text representation of custom atoms', () => {
  const kit = composeExtensions([CoreExtension, defineExtension({ name: 'copy-atom', nodes: {
    copy_atom: { inline: true, group: 'inline', atom: true, toDOM: () => ['span', {}, 'Visual'], toText: () => 'Verbatim source' },
  } })]);
  const editor = createEditor({ schema: kit.schema, content: { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'Before ' }, { type: 'copy_atom' }, { type: 'text', text: ' after' },
  ] }] } });
  const target = document.createElement('div'); document.body.append(target); const view = new EditorView(target, editor);
  try {
    editor.dispatch(editor.createTransaction().setSelection(new AllSelection(editor.state.doc)));
    const copied = clipboard('copy'); view.dom.dispatchEvent(copied.event);
    expect(copied.data.get('text/plain')).toBe('Before Verbatim source after');
  } finally { view.destroy(); editor.destroy(); target.remove(); }
});
