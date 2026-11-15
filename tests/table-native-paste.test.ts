// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CellSelection, EditorView, StarterKit, createEditor, undo, redo, type ExternalPasteReport } from '../src';

const resources: (() => void)[] = [];
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => { resources.splice(0).forEach(dispose => dispose()); vi.useRealTimers(); });
function setup() {
  const cell = (text: string) => ({ type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
  const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins, content: { type: 'doc', content: [
    { type: 'table', content: [{ type: 'table_row', content: [cell('A'), cell('B')] }, { type: 'table_row', content: [cell('C'), cell('D')] }] },
  ] } });
  const mount = document.createElement('div'); document.body.append(mount); const reports: ExternalPasteReport[] = [];
  const view = new EditorView(mount, editor, { paste: { onReport: report => reports.push(report) } });
  editor.dispatch(editor.createTransaction().setSelection(new CellSelection(editor.state.doc, [0, 0, 0], [0, 1, 1])));
  const event = (kind: 'paste' | 'beforeinput', html = '', text = '1\t2\n3\t4') => {
    const input = kind === 'paste' ? new Event('paste', { bubbles: true, cancelable: true })
      : new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertFromPaste' });
    Object.defineProperty(input, kind === 'paste' ? 'clipboardData' : 'dataTransfer', { value: {
      types: ['text/plain', 'text/html'], files: [], getData: (format: string) => format === 'text/html' ? html : format === 'text/plain' ? text : '',
    } });
    view.dom.dispatchEvent(input); return input;
  };
  resources.push(() => { view.destroy(); editor.destroy(); mount.remove(); });
  return { editor, reports, event };
}
it('waits for deferred rich table HTML instead of prematurely flattening its advertised TSV', () => {
  const { editor, reports, event } = setup(), before = editor.getJSON();
  expect(event('paste').defaultPrevented).toBe(false); expect(editor.getJSON()).toEqual(before);
  event('beforeinput', '<table><tr><td><strong>Rich A</strong></td><td><em>Rich B</em></td></tr></table>');
  expect(editor.state.doc.child(0).content.flatMap(row => row.content.map(cell => cell.textContent))).toEqual(['Rich A', 'Rich B', 'Rich A', 'Rich B']);
  expect(editor.state.doc.child(0).child(1).child(0).child(0).child(0).marks[0]?.type.name).toBe('strong');
  const after = editor.getJSON(); vi.runOnlyPendingTimers(); expect(reports).toHaveLength(1);
  expect(reports[0]?.outcome).toBe('inserted-rich-html');
  expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
  expect(redo(editor)).toBe(true); expect(editor.getJSON()).toEqual(after);
});
it.each(['beforeinput', 'timer'] as const)('retains grid distribution when advertised HTML is unavailable at %s', fallback => {
  const { editor, reports, event } = setup(), before = editor.getJSON(); event('paste');
  if (fallback === 'beforeinput') event('beforeinput', '', 'Different late text'); else vi.runOnlyPendingTimers();
  expect(editor.state.doc.child(0).content.flatMap(row => row.content.map(cell => cell.textContent))).toEqual(['1', '2', '3', '4']);
  expect(reports).toHaveLength(1); expect(reports[0]?.outcome).toBe('inserted-table-grid');
  expect(reports[0]?.issues).toContainEqual(expect.objectContaining({ code: 'rich-html-unavailable', lossy: true }));
  expect(undo(editor)).toBe(true); expect(editor.getJSON()).toEqual(before);
});
