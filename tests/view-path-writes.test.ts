// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { CoreSchemaSpec, createEditor, EditorView } from '../src';

it('keeps correct DOM paths untouched on typing while repairing and moving reused paths', () => {
  const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  const editor = createEditor({ schema: CoreSchemaSpec, content: { type: 'doc', content: [
    paragraph('Stable'),
    { type: 'blockquote', content: [paragraph('Nested')] },
    paragraph('Edit'),
  ] } });
  const view = new EditorView(document.createElement('div'), editor);
  const [stable, quote] = Array.from(view.dom.children);
  const observer = new MutationObserver(() => {});
  observer.observe(view.dom, { subtree: true, attributes: true,
    attributeFilter: ['data-fountain-path', 'data-fountain-text-path'] });
  try {
    const nestedText = quote.querySelector('[data-fountain-text-path]')!;
    nestedText.setAttribute('data-fountain-text-path', '19.0.0');
    observer.takeRecords();
    expect(editor.dispatch(editor.createTransaction().insertText([2, 0], 4, '!'))).toBe(true);
    expect(view.dom.children[0]).toBe(stable);
    expect(view.dom.children[1]).toBe(quote);
    expect(nestedText.getAttribute('data-fountain-text-path')).toBe('1.0.0');
    expect(observer.takeRecords().map(record => record.target)).toEqual([nestedText]);

    const leading = editor.state.schema.nodeFromJSON(paragraph('New first'));
    expect(editor.dispatch(editor.createTransaction().replace(0, 0, [leading]))).toBe(true);
    expect(view.dom.children[2]).toBe(quote);
    expect(quote.getAttribute('data-fountain-path')).toBe('2');
    expect(quote.querySelector('p')?.getAttribute('data-fountain-path')).toBe('2.0');
    expect(nestedText.getAttribute('data-fountain-text-path')).toBe('2.0.0');
    expect(stable.querySelector('[data-fountain-text-path]')?.getAttribute('data-fountain-text-path')).toBe('1.0');
  } finally {
    observer.disconnect();
    view.destroy();
    editor.destroy();
  }
});
