// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, Decoration, DecorationSet, EditorView, HTMLExporter,
  Selection, createEditor, createHistoryPlugin, insertText, redo, undo, type NodeJSON } from '../src';
import { renderNode } from '../src/view/dom-renderer';

function setup(content: NodeJSON[], editable = true) {
  const editor = createEditor({ schema: CoreSchemaSpec, editable, plugins: [createHistoryPlugin()],
    content: { type: 'doc', content } });
  const exported = HTMLExporter.export(editor.state.doc, { document: false });
  const mount = document.createElement('div'); document.body.append(mount);
  const view = new EditorView(mount, editor);
  return { editor, view, exported, destroy() { view.destroy(); editor.destroy(); mount.remove(); document.getSelection()?.removeAllRanges(); } };
}
const link = (href = '/guide', title = '') => ({ type: 'link', attrs: { href, title } });

describe('inline link view projection', () => {
  it.each([true, false])('keeps one link across mixed text marks without changing paths or export (editable=%s)', editable => {
    const { editor, view, exported, destroy } = setup([{ type: 'paragraph', content: [
      { type: 'text', text: 'Second ', marks: [link()] },
      { type: 'text', text: 'paragraph', marks: [{ type: 'strong' }, link()] },
      { type: 'text', text: '.', marks: [link()] },
    ] }], editable);
    const original = editor.getJSON();
    const anchors = view.dom.querySelectorAll('a[href]');
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.textContent).toBe('Second paragraph.');
    expect(anchors[0]?.querySelector('strong')?.textContent).toBe('paragraph');
    expect([...anchors[0]!.querySelectorAll('[data-fountain-text-path]')].map(node => node.getAttribute('data-fountain-text-path')))
      .toEqual(['0.0', '0.1', '0.2']);
    expect(view.dom.querySelector('a a')).toBeNull();
    expect(editor.getJSON()).toEqual(original);
    expect(HTMLExporter.export(editor.state.doc, { document: false })).toBe(exported);
    destroy();
  });

  it('retains whitespace link metadata and restores its action when text is inserted, with exact undo', () => {
    const { editor, view, destroy } = setup([{ type: 'paragraph', content: [
      { type: 'text', text: '\n', marks: [link()] },
    ] }]);
    const original = editor.getJSON();
    expect(view.dom.querySelector('a')?.textContent).toBe('\n');
    expect(view.dom.querySelector('a[href]')).toBeNull();
    expect(HTMLExporter.export(editor.state.doc, { document: false })).toMatch(/<a[^>]*href="\/guide"[^>]*>\n<\/a>/);
    editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 0)));
    expect(insertText(editor, 'Guide')).toBe(true);
    expect(view.dom.querySelector('a[href]')?.textContent).toBe('Guide\n');
    const changed = editor.getJSON();
    expect(undo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(original);
    expect(view.dom.querySelector('a[href]')).toBeNull();
    expect(redo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(changed);
    expect(view.dom.querySelector('a[href]')?.textContent).toBe('Guide\n');
    destroy();
  });

  it('never merges different link attributes and suppresses an adjacent whitespace-only target', () => {
    const { view, destroy } = setup([{ type: 'paragraph', content: [
      { type: 'text', text: ' ', marks: [link('/blank')] },
      { type: 'text', text: 'A', marks: [link('/one', 'One')] },
      { type: 'text', text: 'B', marks: [link('/one', 'Two')] },
      { type: 'text', text: 'C', marks: [link('/two')] },
      { type: 'text', text: ' plain' },
      { type: 'text', text: 'D', marks: [link('/two')] },
    ] }]);
    expect(view.dom.querySelectorAll('a[href]')).toHaveLength(4);
    expect([...view.dom.querySelectorAll('a[href]')].map(node => node.textContent)).toEqual(['A', 'B', 'C', 'D']);
    expect(view.dom.textContent).toBe(' ABC plainD');
    destroy();
  });

  it('keeps native range mapping and cross-run replacement after a link is grouped', () => {
    const { editor, view, destroy } = setup([{ type: 'paragraph', content: [
      { type: 'text', text: 'Before ', marks: [link()] },
      { type: 'text', text: 'middle', marks: [{ type: 'strong' }, link()] },
      { type: 'text', text: ' after', marks: [link()] },
    ] }]);
    const original = editor.getJSON();
    const range = document.createRange();
    const start = view.dom.querySelector('[data-fountain-text-path="0.0"]')!;
    const end = view.dom.querySelector('[data-fountain-text-path="0.2"]')!;
    range.setStart(start.firstChild!, 3); range.setEnd(end.firstChild!, 3);
    document.getSelection()?.removeAllRanges(); document.getSelection()?.addRange(range);
    view.dom.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ' changed ' }));
    expect(editor.state.doc.textContent).toBe('Bef changed ter');
    expect(view.dom.querySelectorAll('a[href]')).toHaveLength(1);
    expect(undo(editor)).toBe(true);
    expect(editor.getJSON()).toEqual(original);
    destroy();
  });

  it('keeps inline decorations inside a continuous link and interactive widgets outside it', () => {
    const { editor, destroy } = setup([{ type: 'paragraph', content: [
      { type: 'text', text: 'First', marks: [link()] },
      { type: 'text', text: 'last', marks: [{ type: 'strong' }, link()] },
    ] }]);
    const decorated = renderNode(editor.state.doc.child(0), [0], { document: editor.state.doc,
      decorations: DecorationSet.create(editor.state.doc, [Decoration.inline(2, 5, { class: 'test-highlight' })]) }, 0) as HTMLElement;
    expect(decorated.querySelectorAll('a[href]')).toHaveLength(1);
    expect(decorated.querySelector('a .test-highlight')?.textContent).toBe('irs');
    const widget = Decoration.widget(3, () => {
      const button = document.createElement('button'); button.textContent = 'Comment'; return button;
    });
    const withWidget = renderNode(editor.state.doc.child(0), [0], { document: editor.state.doc,
      decorations: DecorationSet.create(editor.state.doc, [widget]) }, 0) as HTMLElement;
    expect(withWidget.querySelector('button')?.textContent).toBe('Comment');
    expect(withWidget.querySelector('a button')).toBeNull();
    expect(withWidget.querySelector('[data-fountain-text-path="0.1"]')?.textContent).toBe('last');
    destroy();
  });
});
