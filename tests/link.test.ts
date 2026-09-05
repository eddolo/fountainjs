/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import {
  CoreExtension,
  EditorView,
  Selection,
  StarterKit,
  composeExtensions,
  createEditor,
  createLinkBehaviorExtension,
  editLink,
  getActiveLink,
  normalizeLinkURL,
  removeLink,
  selectText,
} from '../src';

function type(view: EditorView, value: string): void {
  [...value].forEach((data) => view.dom.dispatchEvent(new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data,
  })));
}

function links(editor: ReturnType<typeof createEditor>) {
  const result: Array<{ text: string; href: string }> = [];
  editor.state.doc.descendants((node) => {
    const link = node.marks.find((mark) => mark.type.name === 'link');
    if (node.isText && link) result.push({ text: node.text ?? '', href: String(link.attrs.href) });
  });
  return result;
}

describe('link behavior extension', () => {
  it('autolinks typed web and email addresses without swallowing punctuation', () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins });
    const mount = document.createElement('div');
    const view = new EditorView(mount, editor);
    type(view, 'Visit https://example.com. ');
    expect(links(editor)).toEqual([{ text: 'https://example.com', href: 'https://example.com' }]);
    expect(editor.getText()).toBe('Visit https://example.com. ');
    type(view, 'Mail me@example.com ');
    expect(links(editor)).toContainEqual({ text: 'me@example.com', href: 'mailto:me@example.com' });
    view.destroy();
  });

  it('links a selection or inserts linked text when a URL is pasted', () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fountain website: ' }] }] },
    });
    const mount = document.createElement('div');
    const view = new EditorView(mount, editor);
    selectText(editor, [0, 0], 0, 8);
    const selectionPaste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(selectionPaste, 'clipboardData', { value: { files: [], getData: (type: string) => type === 'text/plain' ? 'www.example.com' : '' } });
    view.dom.dispatchEvent(selectionPaste);
    expect(selectionPaste.defaultPrevented).toBe(true);
    expect(editor.getText()).toBe('Fountain website: ');
    expect(links(editor)[0]).toEqual({ text: 'Fountain', href: 'https://www.example.com' });

    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 1], 9)));
    const cursorPaste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(cursorPaste, 'clipboardData', { value: { files: [], getData: (type: string) => type === 'text/plain' ? 'https://docs.example.com' : '' } });
    view.dom.dispatchEvent(cursorPaste);
    expect(cursorPaste.defaultPrevented).toBe(true);
    expect(links(editor)).toContainEqual({ text: 'https://docs.example.com', href: 'https://docs.example.com' });
    view.destroy();
  });

  it('recognizes explicit relative-path pastes without consuming ordinary text', () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins });
    const mount = document.createElement('div');
    const view = new EditorView(mount, editor);
    const relativePaste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(relativePaste, 'clipboardData', {
      value: { files: [], getData: (type: string) => type === 'text/plain' ? 'docs/guide.md' : '' },
    });
    view.dom.dispatchEvent(relativePaste);
    expect(relativePaste.defaultPrevented).toBe(true);
    expect(links(editor)).toContainEqual({ text: 'docs/guide.md', href: 'docs/guide.md' });
    view.destroy();
    editor.destroy();

    const ordinaryEditor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins });
    const ordinaryView = new EditorView(document.createElement('div'), ordinaryEditor);
    const ordinaryPaste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(ordinaryPaste, 'clipboardData', {
      value: { files: [], getData: (type: string) => type === 'text/plain' ? 'ordinary' : '' },
    });
    ordinaryView.dom.dispatchEvent(ordinaryPaste);
    expect(ordinaryPaste.defaultPrevented).toBe(true);
    expect(ordinaryEditor.getText()).toContain('ordinary');
    expect(links(ordinaryEditor)).toEqual([]);
    ordinaryView.destroy();
    ordinaryEditor.destroy();
  });

  it('edits or removes the complete link surrounding a collapsed caret', () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [
          { type: 'text', text: 'Read ' },
          { type: 'text', text: 'the docs', marks: [{ type: 'link', attrs: { href: 'https://old.example', title: '', target: '_blank' } }] },
          { type: 'text', text: ' today' },
        ] }],
      },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 1], 3)));
    expect(getActiveLink(editor)).toEqual(expect.objectContaining({ href: 'https://old.example', text: 'the docs' }));
    expect(editLink(editor, '/guide', { title: 'Guide', target: '_self' })).toBe(true);
    expect(getActiveLink(editor)).toEqual(expect.objectContaining({ href: '/guide', title: 'Guide', target: '_self' }));
    expect(removeLink(editor)).toBe(true);
    expect(getActiveLink(editor)).toBeNull();
    expect(editor.getText()).toBe('Read the docs today');
  });

  it('creates a titled link with custom text at an empty caret', () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      plugins: StarterKit.plugins,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See ' }] }] },
    });
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 0], 4)));
    expect(editLink(editor, '/guide', { text: 'the guide', title: 'User guide', target: '_self' })).toBe(true);
    expect(editor.getText()).toBe('See the guide');
    expect(getActiveLink(editor)).toEqual(expect.objectContaining({
      href: '/guide',
      text: 'the guide',
      title: 'User guide',
      target: '_self',
    }));
  });

  it('supports host normalization/validation and rejects unsafe URLs and attributes', () => {
    expect(normalizeLinkURL('javascript:alert(1)')).toBeNull();
    expect(normalizeLinkURL('data:text/html,bad')).toBeNull();
    expect(normalizeLinkURL('//untrusted.example/path')).toBeNull();
    expect(normalizeLinkURL('http:untrusted.example')).toBeNull();
    expect(normalizeLinkURL('guide/getting-started.md')).toBe('guide/getting-started.md');
    expect(normalizeLinkURL('?tab=examples')).toBe('?tab=examples');
    expect(normalizeLinkURL('\\untrusted.example/path')).toBeNull();
    expect(normalizeLinkURL('www.example.com')).toBe('https://www.example.com');
    expect(normalizeLinkURL('https://blocked.example', {
      validate: (href) => !href.includes('blocked'),
    })).toBeNull();
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins });
    expect(() => editor.state.schema.marks.link.create({ href: 'https://example.com', target: 'popup' })).toThrow();
  });

  it('emits a safe activation event instead of navigating the editing surface', () => {
    const onActivate = vi.fn();
    const kit = composeExtensions([CoreExtension, createLinkBehaviorExtension({ onActivate })]);
    const editor = createEditor({
      schema: kit.schema,
      plugins: kit.plugins,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{
          type: 'text',
          text: 'Example',
          marks: [{ type: 'link', attrs: { href: 'https://example.com', title: 'Example site', target: '_blank' } }],
        }] }],
      },
    });
    const mount = document.createElement('div');
    const activated = vi.fn();
    mount.addEventListener('fountain-link-activate', activated);
    const view = new EditorView(mount, editor);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    view.dom.querySelector('a')?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ href: 'https://example.com' }), event);
    expect(activated).toHaveBeenCalledOnce();
    view.destroy();
  });
});
