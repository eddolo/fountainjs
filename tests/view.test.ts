// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, EditorView, createEditor, registerFountainElement } from '../src';

describe('EditorView', () => {
  it('renders an accessible editor and handles beforeinput', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor, { ariaLabel: 'Story editor', placeholder: 'Begin…' });
    expect(view.dom.getAttribute('role')).toBe('textbox');
    expect(view.dom.getAttribute('aria-label')).toBe('Story editor');
    expect(view.dom.dataset.placeholder).toBe('Begin…');

    view.dom.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'Hello' }));
    expect(editor.getText()).toBe('Hello');
    expect(view.dom.textContent).toBe('Hello');
    view.destroy();
    expect(mount.childElementCount).toBe(0);
  });

  it('captures and replaces a selection across differently marked text fragments', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'text', text: 'A ' },
            { type: 'text', text: 'rough', marks: [{ type: 'strong' }] },
            { type: 'text', text: ' draft' },
          ],
        }],
      },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const wrappers = view.dom.querySelectorAll<HTMLElement>('[data-fountain-text-path]');
    const start = wrappers[0]?.firstChild;
    const end = wrappers[2]?.firstChild;
    expect(start).toBeTruthy();
    expect(end).toBeTruthy();
    const range = document.createRange();
    range.setStart(start as Node, 2);
    range.setEnd(end as Node, 6);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    view.dom.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'clean' }));

    expect(editor.getText()).toBe('A clean');
    expect(editor.state.selection.path).toEqual([0, 0]);
    expect(editor.state.selection.from).toBe(7);
    view.destroy();
  });

  it('exposes the editor as a framework-neutral custom element', () => {
    registerFountainElement({ tagName: 'test-fountain-editor' });
    const element = document.createElement('test-fountain-editor') as HTMLElement & {
      value: { type: string; content?: unknown[] };
      editor?: ReturnType<typeof createEditor>;
    };
    element.value = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Portable' }] }] };
    let changed = false;
    element.addEventListener('fountain-change', () => { changed = true; });
    document.body.appendChild(element);
    const textbox = element.querySelector<HTMLElement>('[role="textbox"]');
    expect(textbox?.textContent).toBe('Portable');
    textbox?.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: '!' }));
    expect(changed).toBe(true);
    expect(element.editor?.getText()).toContain('!');
    element.remove();
  });
});
