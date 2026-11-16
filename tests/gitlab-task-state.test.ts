/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { createEditor, createHistoryPlugin, EditorView, Selection, AllSelection, splitBlock, joinBackward,
  toggleTaskItem, undo, redo, HTMLExporter, HTMLImporter, MarkdownExporter } from 'fountainjs-editor';
import { ServerHTMLImporter } from 'fountainjs-editor/html/server';
import { createGitLabSchemaSpec } from '../integrations/gitlab/services/markdown_codec';
import { createGitLabTaskStatePlugin } from '../integrations/gitlab/services/task_state';

const content = { type: 'doc', content: [{ type: 'task_list', content: [
  { type: 'task_item', attrs: { checked: 'inapplicable' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Not needed' }] }] },
  { type: 'task_item', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Done' }] }] },
] }] };
const make = () => createEditor({ schema: createGitLabSchemaSpec(), plugins: [createGitLabTaskStatePlugin(), createHistoryPlugin()], content });
it('retains third-state semantics through HTML, Markdown, split/join and history', () => {
  const editor = make();
  try {
    const before = editor.state.doc;
    const html = HTMLExporter.export(before, { document: false });
    expect(html).toContain('data-checked="inapplicable"');
    expect(HTMLImporter.parse(html, editor.state.schema).toJSON()).toEqual(before.toJSON());
    expect(ServerHTMLImporter.parse(html, editor.state.schema).toJSON()).toEqual(before.toJSON());
    expect(MarkdownExporter.export(before)).toContain('- [~] Not needed');
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0, 0, 0], 3)));
    expect(splitBlock(editor)).toBe(true);
    expect(editor.state.doc.child(0).child(0).attrs.checked).toBe('inapplicable');
    expect(editor.state.doc.child(0).child(1).attrs.checked).toBe(false);
    expect(joinBackward(editor)).toBe(true);
    expect(editor.state.doc.child(0).child(0).attrs.checked).toBe('inapplicable');
    expect(toggleTaskItem(editor, true)).toBe(true);
    expect(editor.state.doc.child(0).child(0).attrs.checked).toBe(true);
    expect(undo(editor)).toBe(true);
    expect(redo(editor)).toBe(true);
  } finally { editor.destroy(); }
});
it('uses real native button and checkbox events for state changes and undo', () => {
  const editor = make(), mount = document.createElement('div'); document.body.append(mount);
  const view = new EditorView(mount, editor);
  try {
    const button = () => mount.querySelector<HTMLButtonElement>('[data-fountain-gitlab-task-state-toggle]')!;
    expect(button().getAttribute('aria-pressed')).toBe('true');
    const keyboard = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    button().dispatchEvent(keyboard);
    expect(keyboard.defaultPrevented).toBe(true);
    expect(editor.state.doc.child(0).child(0).attrs.checked).toBe(false);
    button().click();
    expect(editor.state.doc.child(0).child(0).attrs.checked).toBe('inapplicable');
    const checkbox = mount.querySelector<HTMLInputElement>('input[data-fountain-task-toggle]')!;
    expect(checkbox.checked).toBe(false);
    checkbox.click();
    expect(editor.state.doc.child(0).child(0).attrs.checked).toBe(true);
    expect(editor.state.doc.child(0).child(1).attrs.checked).toBe(true);
    expect(undo(editor)).toBe(true);
    editor.setEditable(false);
    const saved = editor.state.doc;
    button().click();
    expect(editor.state.doc).toBe(saved);
  } finally { view.destroy(); editor.destroy(); mount.remove(); }
});

it.each(['native', 'html'])('retains not-applicable state on %s clipboard paste and readable external text', format => {
  const editor = make(), mount = document.createElement('div'); document.body.append(mount);
  const view = new EditorView(mount, editor);
  const values = new Map<string, string>();
  const event = (type: string) => {
    const value = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(value, 'clipboardData', { value: { files: [], getData: (key: string) => values.get(key) ?? '',
      setData: (key: string, text: string) => values.set(key, text) } });
    return value;
  };
  try {
    editor.dispatch(editor.createTransaction().setSelection(new AllSelection(editor.state.doc)));
    view.dom.dispatchEvent(event('copy'));
    expect(values.get('text/plain')).toContain('[~] Not needed');
    expect(values.get('text/html')).toContain('data-checked="inapplicable"');
    if (format === 'html') values.delete('application/x-fountainjs+json');
    editor.dispatch(editor.createTransaction().setSelection(new AllSelection(editor.state.doc)));
    view.dom.dispatchEvent(event('paste'));
    const states: unknown[] = [];
    editor.state.doc.descendants(node => { if (node.type.name === 'task_item') states.push(node.attrs.checked); });
    expect(states).toEqual(['inapplicable', true]);
  } finally { view.destroy(); editor.destroy(); mount.remove(); }
});
