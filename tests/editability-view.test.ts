// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { CoreExtension, EditorView, Selection, composeExtensions, createEditor, defineExtension } from '../src';

const resources: (() => void)[] = [];
afterEach(() => resources.splice(0).forEach(dispose => dispose()));

it('updates task and custom controls while retaining the editor view and document', () => {
  let destroyed = 0;
  class Control {
    dom = document.createElement('button');
    constructor(_node: unknown, view: unknown) {
      if (!(view instanceof EditorView)) throw new Error('Expected editor view.');
      this.dom.textContent = 'Custom document control';
      this.dom.disabled = !view.editor.editable;
    }
    destroy() { destroyed++; }
  }
  const kit = composeExtensions([CoreExtension, defineExtension({ name: 'mode-view', nodes: {
    mode_control: { group: 'block', atom: true, nodeView: Control, toDOM: () => ['div', 'Control'] },
  } })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
    { type: 'task_list', content: [{ type: 'task_item', attrs: { checked: false }, content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'A task' }] },
    ] }] }, { type: 'mode_control' },
  ] } });
  const mount = document.createElement('div'); document.body.append(mount);
  const view = new EditorView(mount, editor);
  resources.push(() => { view.destroy(); editor.destroy(); mount.remove(); });
  const surface = view.dom, doc = editor.state.doc;
  expect(surface.querySelector<HTMLInputElement>('input')?.disabled).toBe(false);
  editor.setEditable(false);
  expect(view.dom).toBe(surface);
  expect(editor.state.doc).toBe(doc);
  expect(surface.contentEditable).toBe('false');
  expect(surface.getAttribute('aria-readonly')).toBe('true');
  expect(surface.querySelector<HTMLInputElement>('input')?.disabled).toBe(true);
  expect(surface.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true);
  expect(destroyed).toBe(1);
  editor.setEditable(true);
  expect(surface.contentEditable).toBe('true');
  expect(surface.hasAttribute('aria-readonly')).toBe(false);
  expect(surface.querySelector<HTMLInputElement>('input')?.disabled).toBe(false);
  expect(surface.querySelector<HTMLButtonElement>('button')?.disabled).toBe(false);
});

it('cancels an unfinished composition and ignores its late completion after a mode change', () => {
  const kit = composeExtensions([CoreExtension]);
  const editor = createEditor({ schema: kit.schema, content: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
  ] } });
  const mount = document.createElement('div'); document.body.append(mount);
  const view = new EditorView(mount, editor);
  resources.push(() => { view.destroy(); editor.destroy(); mount.remove(); });
  editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 5)));
  view.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  view.dom.querySelector('p')!.textContent = 'Alpha未確定';
  editor.setEditable(false);
  expect(view.dom.textContent).toBe('Alpha');
  editor.setEditable(true);
  view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '漢' }));
  expect(editor.getText()).toBe('Alpha');
  expect(view.dom.textContent).toBe('Alpha');
});
