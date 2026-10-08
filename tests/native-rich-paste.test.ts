// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllSelection, CoreExtension, EditorView, Plugin, Selection, composeExtensions,
  createEditor, createHistoryPlugin, insertText, redo, undo, type ExternalPasteReport } from '../src';

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const rich = '<h2>Research note</h2><p><strong>bold</strong> and <em>emphasis</em></p>';
const plain = 'Research note\n\nbold and emphasis';
const resources: (() => void)[] = [];
function setup(plugins: Plugin[] = [], editable = true) {
  const editor = createEditor({ schema: composeExtensions([CoreExtension]).schema,
    content: { type: 'doc', content: [p('Before')] }, plugins: [createHistoryPlugin(), ...plugins], editable });
  const mount = document.createElement('div'); document.body.append(mount);
  const reports: ExternalPasteReport[] = [];
  const view = new EditorView(mount, editor, { paste: { onReport: report => reports.push(report) } });
  editor.dispatch(editor.createTransaction().setSelection(new AllSelection(editor.state.doc)));
  resources.push(() => { view.destroy(); editor.destroy(); mount.remove(); });
  const event = (type: 'paste' | 'beforeinput', html = '', text = plain, advertised = true) => {
    const data = { types: advertised ? ['text/plain', 'text/html'] : ['text/plain'], files: [],
      getData: (format: string) => format === 'text/html' ? html : format === 'text/plain' ? text : '' };
    const input = type === 'paste' ? new Event(type, { bubbles: true, cancelable: true })
      : new InputEvent(type, { bubbles: true, cancelable: true, inputType: 'insertFromPaste' });
    Object.defineProperty(input, type === 'paste' ? 'clipboardData' : 'dataTransfer', { value: data });
    view.dom.dispatchEvent(input); return input;
  };
  return { editor, view, reports, event };
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => { resources.splice(0).forEach(dispose => dispose()); vi.useRealTimers(); });

describe('native rich clipboard event handoff', () => {
  it('waits for announced HTML at beforeinput and imports it once with exact undo/redo', () => {
    const { editor, reports, event } = setup(); const before = editor.getJSON();
    const paste = event('paste');
    expect(paste.defaultPrevented).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    expect(event('beforeinput', rich).defaultPrevented).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe('heading');
    expect(editor.state.doc.child(1).child(0).marks[0]?.type.name).toBe('strong');
    const after = editor.getJSON();
    vi.runOnlyPendingTimers(); expect(editor.getJSON()).toEqual(after);
    expect(reports).toHaveLength(1); expect(reports[0].outcome).toBe('inserted-rich-html');
    expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
    expect(redo(editor)).toBe(true); expect(editor.getJSON()).toEqual(after);
  });
  it('falls back to the original line-separated plain payload when late HTML remains unavailable', () => {
    const { editor, reports, event } = setup(); event('paste');
    expect(event('beforeinput', '', 'Research notebold and emphasis').defaultPrevented).toBe(true);
    expect(editor.state.doc.content.map(node => node.textContent)).toEqual(['Research note', '', 'bold and emphasis']);
    expect(reports[0].issues).toContainEqual(expect.objectContaining({ code: 'rich-html-unavailable', lossy: true }));
    vi.runOnlyPendingTimers(); expect(reports).toHaveLength(1);
  });
  it('uses the bounded plain fallback if the browser never sends beforeinput', () => {
    const { editor, reports, event } = setup(); event('paste'); vi.runOnlyPendingTimers();
    expect(editor.state.doc.content.map(node => node.textContent)).toEqual(['Research note', '', 'bold and emphasis']);
    expect(reports).toHaveLength(1);
    expect(reports[0].issues).toContainEqual(expect.objectContaining({ code: 'rich-html-unavailable', lossy: true }));
  });
  it('keeps ordinary immediate HTML and ordinary plain paste synchronous', () => {
    const { editor, reports, event } = setup(); expect(event('paste', rich).defaultPrevented).toBe(true);
    expect(editor.state.doc.child(0).type.name).toBe('heading');
    vi.runOnlyPendingTimers(); expect(reports).toHaveLength(1);
    editor.dispatch(editor.createTransaction().setSelection(new AllSelection(editor.state.doc)));
    expect(event('paste', '', 'Just plain', false).defaultPrevented).toBe(true);
    expect(editor.getText()).toBe('Just plain');
  });
  it('does not apply a queued fallback after the selection changes', () => {
    const { editor, event } = setup(); const before = editor.getJSON(); event('paste');
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    vi.runOnlyPendingTimers(); expect(editor.getJSON()).toEqual(before);
  });
  it('lets an explicit paste plugin handle the original event without a later duplicate', () => {
    const handler = vi.fn(() => true);
    const { editor, event } = setup([new Plugin({ props: { handlePaste: handler } })]);
    const before = editor.getJSON(); expect(event('paste').defaultPrevented).toBe(true);
    vi.runOnlyPendingTimers(); expect(editor.getJSON()).toEqual(before); expect(handler).toHaveBeenCalledTimes(1);
  });
  it('respects beforeinput plugin ownership and cancels the queued fallback', () => {
    const handler = vi.fn(() => true);
    const { editor, reports, event } = setup([new Plugin({ props: { handleBeforeInput: handler } })]);
    const before = editor.getJSON(); event('paste'); event('beforeinput', rich);
    vi.runOnlyPendingTimers(); expect(editor.getJSON()).toEqual(before); expect(reports).toHaveLength(0);
    expect(handler).toHaveBeenCalledTimes(1);
  });
  it('uses the same sanitization policy for later HTML', () => {
    const { editor, reports, event } = setup(); event('paste');
    event('beforeinput', '<p><strong>Safe</strong><script>throw new Error("unsafe")</script></p>');
    expect(editor.getText()).toBe('Safe');
    expect(editor.state.doc.child(0).child(0).marks[0]?.type.name).toBe('strong');
    expect(reports[0].issues).toContainEqual(expect.objectContaining({ code: 'unsafe-content-removed' }));
  });
  it('cancels late insertion when host content changed after paste', () => {
    const { editor, event } = setup(); event('paste'); insertText(editor, 'Host replacement');
    const changed = editor.getJSON(); expect(event('beforeinput', rich).defaultPrevented).toBe(true);
    vi.runOnlyPendingTimers(); expect(editor.getJSON()).toEqual(changed);
  });
  it('does not dispatch after editor destruction, even if its view is still mounted', () => {
    const { editor, event } = setup(); event('paste'); editor.destroy();
    expect(() => vi.runOnlyPendingTimers()).not.toThrow();
  });
  it('clears the bounded fallback when its view is destroyed or loses focus', () => {
    const first = setup(); first.event('paste'); const original = first.editor.getJSON(); first.view.destroy();
    vi.runOnlyPendingTimers(); expect(first.editor.getJSON()).toEqual(original);
    const second = setup(); second.event('paste'); second.view.dom.dispatchEvent(new FocusEvent('blur'));
    vi.runOnlyPendingTimers(); expect(second.editor.getText()).toBe('Before');
  });
  it('does not schedule a paste in a read-only editor', () => {
    const { editor, event, reports } = setup([], false);
    expect(event('paste').defaultPrevented).toBe(false); event('beforeinput', rich);
    vi.runOnlyPendingTimers(); expect(editor.getText()).toBe('Before'); expect(reports).toHaveLength(0);
  });
  it('cancels an older deferred paste when another paste arrives', () => {
    const { editor, event, reports } = setup(); event('paste'); event('paste', '', 'Latest paste', false);
    vi.runOnlyPendingTimers(); expect(editor.getText()).toBe('Latest paste'); expect(reports).toHaveLength(1);
  });
  it('can use an exact Fountain payload released only at the later event', () => {
    const { editor, event, view, reports } = setup(); event('paste');
    const code = { type: 'code_block', attrs: { language: 'python', dir: 'rtl', lineNumbers: false }, content: [{ type: 'text', text: 'print(1)' }] };
    const payload = JSON.stringify({ version: 1, document: { type: 'doc', content: [code] } });
    const late = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertFromPaste' });
    Object.defineProperty(late, 'dataTransfer', { value: { getData: (format: string) => format === 'application/x-fountainjs+json' ? payload : '' } });
    view.dom.dispatchEvent(late); vi.runOnlyPendingTimers();
    expect(editor.state.doc.child(0).attrs).toMatchObject({ language: 'python', dir: 'rtl', lineNumbers: false });
    expect(reports[0].outcome).toBe('inserted-fountain-document'); expect(reports).toHaveLength(1);
  });
  it('does not duplicate a non-cancelable native insertion with a model write', () => {
    const { editor, event, view, reports } = setup(); const before = editor.getJSON(); event('paste');
    const late = new InputEvent('beforeinput', { bubbles: true, cancelable: false, inputType: 'insertFromPaste' });
    Object.defineProperty(late, 'dataTransfer', { value: { getData: () => rich } });
    view.dom.dispatchEvent(late); vi.runOnlyPendingTimers();
    expect(editor.getJSON()).toEqual(before); expect(reports).toHaveLength(0);
  });
});
