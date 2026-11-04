// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { CoreExtension, CoreSchemaSpec, EditorView, Selection, composeExtensions, createEditor,
  historyPlugin, moveNode, removeNode, splitBlock, undo } from '../src';
import { createYjsCollaborationExtension } from '../src/yjs';

const layout = { unit: 'pt', spacingGroup: 'body', spacingBefore: 0, spacingAfter: 10, contextualSpacing: true };
const paragraph = (text: string, attrs = layout) => ({ type: 'paragraph', attrs: { layout: attrs }, content: [{ type: 'text', text }] });
const content = { type: 'doc', content: [paragraph('Alpha'), paragraph('Beta', { ...layout, spacingBefore: 12, spacingAfter: 0, contextualSpacing: false })] };
afterEach(() => document.body.replaceChildren());
function setup(options: ConstructorParameters<typeof EditorView>[2] = {}) {
  const editor = createEditor({ schema: CoreSchemaSpec, plugins: [historyPlugin], content });
  const view = new EditorView(document.body.appendChild(document.createElement('div')), editor, options);
  return { editor, view };
}

describe('live paragraph spacing projection', () => {
  it('refreshes an unchanged neighbour DOM node after an identity edit and undo', () => {
    const { editor, view } = setup();
    try {
      const second = view.dom.querySelectorAll('p')[1]!;
      expect(second.style.marginBlockStart).toBe('2pt');
      const original = editor.getJSON();
      editor.dispatch(editor.createTransaction().setNodeAttrs([0], { ...editor.state.doc.child(0).attrs, layout: { ...layout, spacingGroup: 'other' } }));
      expect(view.dom.querySelectorAll('p')[1]).toBe(second);
      expect(second.style.marginBlockStart).toBe('12pt');
      expect(undo(editor)).toBe(true);
      expect(second.style.marginBlockStart).toBe('2pt');
      expect(editor.getJSON()).toEqual(original);
    } finally { view.destroy(); editor.destroy(); }
  });

  it('retains intent across Enter, undo, deletion and reordering instead of saving derived margins', () => {
    const { editor, view } = setup();
    try {
      const original = editor.getJSON();
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([0, 0], 2)));
      expect(splitBlock(editor)).toBe(true);
      expect(view.dom.querySelectorAll('p')[1]!.style.marginBlockStart).toBe('0pt');
      expect(view.dom.querySelectorAll('p')[2]!.style.marginBlockStart).toBe('2pt');
      expect(undo(editor)).toBe(true);
      expect(editor.getJSON()).toEqual(original);
      expect(removeNode(editor, [0])).toBe(true);
      expect(view.dom.querySelector('p')!.style.marginBlockStart).toBe('12pt');
      expect(undo(editor)).toBe(true);
      expect(moveNode(editor, { fromPath: [1], toParentPath: [], toIndex: 0 })).toBe(true);
      expect(view.dom.querySelectorAll('p')[0]!.textContent).toBe('Beta');
      expect(view.dom.querySelectorAll('p')[0]!.style.marginBlockStart).toBe('12pt');
    } finally { view.destroy(); editor.destroy(); }
  });

  it('updates the neighbour view after a remote Yjs change without writing projection data to the document', () => {
    const leftDoc = new Y.Doc(), rightDoc = new Y.Doc();
    const make = (document: Y.Doc, id: string) => {
      const kit = composeExtensions([CoreExtension, createYjsCollaborationExtension({ document, user: { id, name: id, color: '#6547ff' } })]);
      return createEditor({ schema: kit.schema, plugins: kit.plugins, content });
    };
    const left = make(leftDoc, 'left'); Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc));
    const right = make(rightDoc, 'right');
    const view = new EditorView(document.body.appendChild(document.createElement('div')), right);
    try {
      expect(view.dom.querySelectorAll('p')[1]!.style.marginBlockStart).toBe('2pt');
      left.dispatch(left.createTransaction().setNodeAttrs([0], { ...left.state.doc.child(0).attrs, layout: { ...layout, spacingGroup: 'other' } }));
      Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc));
      expect(view.dom.querySelectorAll('p')[1]!.style.marginBlockStart).toBe('12pt');
      expect(right.state.doc.child(1).attrs.layout).toEqual(content.content[1]!.attrs.layout);
    } finally { view.destroy(); left.destroy(); right.destroy(); leftDoc.destroy(); rightDoc.destroy(); }
  });

  it('keeps the same model-derived gap in a virtualized view', () => {
    const { editor, view } = setup({ virtualization: { minimumBlockCount: 0, estimatedBlockHeight: 40, overscanPx: 0, pinnedOverscanBlocks: 1 } });
    try {
      expect(view.virtualized).toBe(true);
      expect(view.dom.querySelectorAll('p')[1]!.style.marginBlockStart).toBe('2pt');
      editor.dispatch(editor.createTransaction().setNodeAttrs([0], { ...editor.state.doc.child(0).attrs, layout: { ...layout, contextualSpacing: false } }));
      expect(view.dom.querySelectorAll('p')[1]!.style.marginBlockStart).toBe('12pt');
    } finally { view.destroy(); editor.destroy(); }
  });

  it('refreshes a mounted paragraph when its actual predecessor is unmounted', async () => {
    const editor = createEditor({ schema: CoreSchemaSpec, content: { type: 'doc', content:
      Array.from({ length: 1000 }, (_, index) => paragraph(`Paragraph ${index}`, index === 500
        ? { ...layout, spacingBefore: 12, spacingAfter: 0, contextualSpacing: false } : layout)) } });
    const view = new EditorView(document.body.appendChild(document.createElement('div')), editor,
      { virtualization: { minimumBlockCount: 0, estimatedBlockHeight: 40, overscanPx: 0, pinnedOverscanBlocks: 0 } });
    try {
      editor.dispatch(editor.createTransaction().setSelection(Selection.cursor([500, 0], 0)));
      await Promise.resolve();
      const target = view.dom.querySelector<HTMLElement>('[data-fountain-path="500"]')!;
      expect(view.dom.querySelector('[data-fountain-path="499"]')).toBeNull();
      expect(target.style.marginBlockStart).toBe('2pt');
      editor.dispatch(editor.createTransaction().setNodeAttrs([499], { ...editor.state.doc.child(499).attrs, layout: { ...layout, spacingGroup: 'other' } }));
      expect(view.dom.querySelector('[data-fountain-path="500"]')).toBe(target);
      expect(target.style.marginBlockStart).toBe('12pt');
      expect(view.dom.querySelector('[data-fountain-path="499"]')).toBeNull();
    } finally { view.destroy(); editor.destroy(); }
  });
});
