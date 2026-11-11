// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { CoreSchemaSpec, EditorView, createEditor, insertText } from '../src';

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(dispose => dispose()));

it.each([false, true].flatMap(following => ['container', 'atom-text-end'].map(point => ({ following, point }))))(
  'types after an inline atom at a native $point endpoint (following text: $following)', async ({ following, point }) => {
  const editor = createEditor({ schema: { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
    inline_atom: { inline: true, group: 'inline', atom: true, toDOM: () => ['span', {}, '🔬 Reference'] },
  } }, content: { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'Before ' }, { type: 'inline_atom' }, ...(following ? [{ type: 'text', text: 'After' }] : []),
  ] }] } });
  const mount = document.createElement('div'); document.body.append(mount);
  const view = new EditorView(mount, editor);
  cleanup.push(() => { view.destroy(); editor.destroy(); mount.remove(); });
  view.focus(); await new Promise<void>(resolve => queueMicrotask(resolve));
  const atom = view.dom.querySelector<HTMLElement>('[data-fountain-path="0.1"]')!;
  const parent = atom.parentNode!, offset = Array.from(parent.childNodes).indexOf(atom) + 1;
  if (point === 'container') document.getSelection()!.setBaseAndExtent(parent, offset, parent, offset);
  else document.getSelection()!.setBaseAndExtent(atom.firstChild!, atom.firstChild!.textContent!.length, atom.firstChild!, atom.firstChild!.textContent!.length);
  view.dom.dispatchEvent(new KeyboardEvent('keyup', { key: 'End', bubbles: true }));
  expect(insertText(editor, 'Added')).toBe(true);
  expect(editor.state.doc.child(0).child(0).text).toBe('Before ');
  expect(editor.state.doc.child(0).child(1).type.name).toBe('inline_atom');
  expect(editor.state.doc.child(0).child(2).text).toBe(following ? 'AddedAfter' : 'Added');
});

it('does not promote a native control selection inside an inline atom to a document caret', async () => {
  const editor = createEditor({ schema: { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
    inline_control: { inline: true, group: 'inline', atom: true, toDOM: () => ['button', { type: 'button' }, 'Control'] },
  } }, content: { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: 'Before ' }, { type: 'inline_control' },
  ] }] } });
  const mount = document.createElement('div'); document.body.append(mount);
  const view = new EditorView(mount, editor);
  cleanup.push(() => { view.destroy(); editor.destroy(); mount.remove(); });
  view.focus(); await new Promise<void>(resolve => queueMicrotask(resolve));
  const before = editor.state.selection, control = view.dom.querySelector<HTMLButtonElement>('button')!;
  control.focus();
  document.getSelection()!.setBaseAndExtent(control.firstChild!, 7, control.firstChild!, 7);
  control.dispatchEvent(new KeyboardEvent('keyup', { key: 'End', bubbles: true }));
  expect(editor.state.selection.eq(before)).toBe(true);
});
