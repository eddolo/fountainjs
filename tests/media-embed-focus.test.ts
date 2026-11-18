// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createEditor, EditorView, StarterKit, insertEmbed } from '../src';

function mount(editable = true) {
  const editor = createEditor({ schema: StarterKit.schema });
  insertEmbed(editor, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', { title: 'Review player' });
  editor.setEditable(editable);
  const host = document.createElement('div'); document.body.append(host);
  const view = new EditorView(host, editor);
  return { editor, host, view };
}

it('re-arms embed protection after returning to prose and releases its focus listener on disposal', async () => {
  const { editor, host, view } = mount();
  const frame = host.querySelector('iframe')!;
  const activate = host.querySelector<HTMLButtonElement>('button.fountain-embed__activate')!;
  try {
    expect(frame.hasAttribute('srcdoc')).toBe(true);
    expect(activate.textContent).toBe('Interact with Review player');
    activate.click(); await Promise.resolve();
    expect(host.querySelector('iframe')).toBe(frame);
    expect(frame.hasAttribute('srcdoc')).toBe(false); expect(activate.hidden).toBe(true);
    view.dom.focus(); await Promise.resolve(); expect(frame.hasAttribute('srcdoc')).toBe(true); expect(activate.hidden).toBe(false);
    activate.click(); expect(frame.hasAttribute('srcdoc')).toBe(false);
    view.destroy();
    const control = document.createElement('button'); document.body.append(control);
    control.focus(); expect(frame.hasAttribute('srcdoc')).toBe(false); control.remove();
  } finally { view.destroy(); editor.destroy(); host.remove(); }
});

it('keeps reader embeds interactive without an authoring overlay or changed document data', () => {
  const { editor, host, view } = mount(false);
  try {
    expect(host.querySelector('iframe')?.hasAttribute('srcdoc')).toBe(false);
    expect(host.querySelector('button.fountain-embed__activate')).toBeNull();
    expect(host.querySelector('iframe')?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(editor.state.doc.toJSON().content?.some(node => node.type === 'embed')).toBe(true);
  } finally { view.destroy(); editor.destroy(); host.remove(); }
});
