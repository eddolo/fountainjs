// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  CoreExtension,
  CoreSchemaSpec,
  EditorView,
  HTMLExporter,
  Selection as EditorSelection,
  Plugin,
  composeExtensions,
  createEditor,
  defineExtension,
  insertImageFile,
  insertText,
  registerFountainElement,
} from '../src';

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

  it('captures and replaces a DOM selection across paragraphs', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph' }] },
        ],
      },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const wrappers = view.dom.querySelectorAll<HTMLElement>('[data-fountain-text-path]');
    const range = document.createRange();
    range.setStart(wrappers[0]?.firstChild as Node, 6);
    range.setEnd(wrappers[1]?.firstChild as Node, 7);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    view.dom.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'joined ' }));

    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.getText()).toBe('First joined paragraph');
    expect(editor.state.selection.eq(EditorSelection.cursor([0, 0], 13))).toBe(true);
    view.destroy();
  });

  it('preserves rich HTML from the clipboard', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: {
      files: [],
      getData: (type: string) => type === 'text/html' ? '<p><strong>Rich</strong> paste</p>' : 'Rich paste',
    } });
    view.dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(HTMLExporter.export(editor.state, { document: false })).toBe('<p><strong>Rich</strong> paste</p>');
    view.destroy();
  });

  it('embeds local images or delegates them to an upload adapter', async () => {
    const embedded = createEditor({ schema: CoreSchemaSpec });
    const file = new File(['image bytes'], 'launch.png', { type: 'image/png' });
    expect(await insertImageFile(embedded, file)).toBe(true);
    expect(embedded.state.doc.child(1).attrs.src).toMatch(/^data:image\/png;base64,/);
    expect(embedded.state.doc.child(1).attrs.alt).toBe('launch');

    const uploaded = createEditor({ schema: CoreSchemaSpec });
    expect(await insertImageFile(uploaded, file, { upload: async () => ({
      src: 'https://cdn.example.com/launch.png',
      alt: 'Uploaded launch',
      caption: 'A real storage adapter response',
    }) })).toBe(true);
    expect(uploaded.state.doc.child(1).attrs).toMatchObject({
      src: 'https://cdn.example.com/launch.png',
      alt: 'Uploaded launch',
      caption: 'A real storage adapter response',
    });
  });

  it('renders task controls that update the document model', () => {
    const editor = createEditor({
      schema: CoreSchemaSpec,
      content: {
        type: 'doc',
        content: [{
          type: 'task_list',
          content: [{
            type: 'task_item',
            attrs: { checked: false },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test the editor' }] }],
          }],
        }],
      },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const checkbox = view.dom.querySelector<HTMLInputElement>('[data-fountain-task-toggle]');
    expect(checkbox?.checked).toBe(false);
    if (checkbox) checkbox.checked = true;
    checkbox?.dispatchEvent(new Event('change', { bubbles: true }));
    expect(editor.state.doc.child(0).child(0).attrs.checked).toBe(true);
    expect(view.dom.querySelector<HTMLInputElement>('[data-fountain-task-toggle]')?.checked).toBe(true);
    view.destroy();
  });

  it('mounts and cleans up interactive node views supplied by extensions', () => {
    let destroyed = false;
    class PollNodeView {
      dom = document.createElement('section');
      constructor() {
        const button = document.createElement('button');
        button.textContent = 'Vote';
        button.dataset.pollVote = '';
        this.dom.appendChild(button);
      }
      destroy() { destroyed = true; }
    }
    const kit = composeExtensions([CoreExtension, defineExtension({
      name: 'poll',
      nodes: { poll: { group: 'block', atom: true, nodeView: PollNodeView } },
    })]);
    const editor = createEditor({
      schema: kit.schema,
      content: { type: 'doc', content: [{ type: 'poll' }] },
    });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    expect(view.dom.querySelector('[data-poll-vote]')?.textContent).toBe('Vote');
    expect((view.dom.querySelector('[data-fountain-node="poll"]') as HTMLElement | null)?.contentEditable).toBe('false');
    view.destroy();
    expect(destroyed).toBe(true);
  });

  it('lets plugins intercept browser input, paste, drop, and click events', () => {
    const calls: string[] = [];
    const plugin = new Plugin({
      props: {
        handleBeforeInput: (editor, event) => {
          calls.push(`beforeinput:${event.inputType}`);
          insertText(editor, 'extension');
          return true;
        },
        handlePaste: () => { calls.push('paste'); return true; },
        handleDrop: () => { calls.push('drop'); return true; },
        handleClick: () => { calls.push('click'); return true; },
      },
    });
    const editor = createEditor({ schema: CoreSchemaSpec, plugins: [plugin] });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const beforeInput = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'ignored' });
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    view.dom.dispatchEvent(beforeInput);
    view.dom.dispatchEvent(paste);
    view.dom.dispatchEvent(drop);
    view.dom.dispatchEvent(click);
    expect(editor.getText()).toBe('extension');
    expect(calls).toEqual(['beforeinput:insertText', 'paste', 'drop', 'click']);
    expect([beforeInput, paste, drop, click].every((event) => event.defaultPrevented)).toBe(true);
    view.destroy();
  });

  it('commits IME composition as one model update', () => {
    const update = vi.fn();
    const editor = createEditor({ schema: CoreSchemaSpec, onUpdate: update });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    const text = view.dom.querySelector<HTMLElement>('[data-fountain-text-path]')?.firstChild;
    const range = document.createRange();
    range.setStart(text as Node, 0);
    range.collapse(true);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    view.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '東京' }));
    expect(editor.getText()).toBe('東京');
    expect(update).toHaveBeenCalledTimes(1);
    expect(editor.state.selection.eq(EditorSelection.cursor([0, 0], 2))).toBe(true);
    view.destroy();
  });

  it('uses stored formatting for IME composition', () => {
    const editor = createEditor({ schema: CoreSchemaSpec });
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const view = new EditorView(mount, editor);
    editor.dispatch(editor.state.createTransaction().setStoredMarks([editor.state.schema.mark('strong')]));
    view.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '東京' }));
    expect(editor.state.doc.child(0).child(0).marks[0]?.type.name).toBe('strong');
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
