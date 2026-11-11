// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { AllSelection, CoreExtension, EditorView, Plugin, composeExtensions,
  createEditor, createHistoryPlugin, undo, type ExternalPasteReport } from '../src';
import { createCharacterCountExtension } from '../src/document-utilities';

const resources: (() => void)[] = [];
afterEach(() => resources.splice(0).forEach(dispose => dispose()));

for (const representation of ['html', 'plain', 'fountain'] as const) {
  for (const allowed of [true, false]) it(`reports ${allowed ? 'accepted' : 'rejected'} ${representation} paste without bypassing the document limit`, () => {
    const kit = composeExtensions([CoreExtension, createCharacterCountExtension({ limit: 100 })]);
    const editor = createEditor({ schema: kit.schema, plugins: [...kit.plugins, createHistoryPlugin()],
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Original' }] }] } });
    const mount = document.createElement('div'); document.body.append(mount);
    const reports: ExternalPasteReport[] = [];
    const view = new EditorView(mount, editor, { paste: { onReport: report => reports.push(report) } });
    resources.push(() => { view.destroy(); editor.destroy(); mount.remove(); });
    const before = editor.getJSON();
    editor.dispatch(editor.createTransaction().setSelection(new AllSelection(editor.state.doc)));
    const text = allowed ? 'Accepted replacement' : 'x'.repeat(101);
    const values: Record<string, string> = { 'text/plain': text };
    if (representation !== 'plain') values['text/html'] = `<p><strong>${text}</strong></p>`;
    if (representation === 'fountain') values['application/x-fountainjs+json'] = JSON.stringify({ version: 1,
      document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'strong' }] }] }] } });
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { files: [], types: Object.keys(values), getData: (type: string) => values[type] ?? '' } });
    view.dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(reports).toHaveLength(1);
    if (allowed) {
      expect(editor.getText()).toBe(text);
      expect(reports[0].outcome).toBe(representation === 'fountain' ? 'inserted-fountain-document' : representation === 'html' ? 'inserted-rich-html' : 'inserted-plain-text');
      expect(undo(editor)).toBe(true);
      expect(editor.getJSON()).toEqual(before);
    } else {
      expect(editor.getJSON()).toEqual(before);
      expect(reports[0].outcome).toBe('rejected');
      expect(reports[0].outputBytes).toBe(0);
      expect(reports[0].issues.some(issue => issue.code === 'insertion-rejected')).toBe(true);
      expect(undo(editor)).toBe(false);
    }
  });
}

it('does not bypass a rich-content veto by silently retrying unformatted text', () => {
  const kit = composeExtensions([CoreExtension]);
  const editor = createEditor({ schema: kit.schema, plugins: [new Plugin({ filterTransaction: transaction => {
    let strong = false;
    transaction.doc.descendants(node => { strong ||= node.marks.some(mark => mark.type.name === 'strong'); });
    return !strong;
  } })], content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Original' }] }] } });
  const mount = document.createElement('div'); document.body.append(mount);
  const reports: ExternalPasteReport[] = [];
  const view = new EditorView(mount, editor, { paste: { onReport: report => reports.push(report) } });
  resources.push(() => { view.destroy(); editor.destroy(); mount.remove(); });
  const before = editor.getJSON();
  editor.dispatch(editor.createTransaction().setSelection(new AllSelection(editor.state.doc)));
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files: [], getData: (type: string) => (
    type === 'text/html' ? '<p><strong>Rejected rich content</strong></p>' : type === 'text/plain' ? 'Rejected rich content' : ''
  ) } });
  view.dom.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(editor.getJSON()).toEqual(before);
  expect(reports).toHaveLength(1);
  expect(reports[0].outcome).toBe('rejected');
});
