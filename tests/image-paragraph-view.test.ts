// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createEditor, Schema } from '../src/core';
import { HTMLExporter, HTMLImporter, createHistoryPlugin, undo } from '../src';
import { StarterKit } from '../src/extensions';
import { ImageNodeView } from '../src/extensions/nodes/image-node-view';

const schema = new Schema(StarterKit.schema);
const imageLayout = { unit: 'pt', fontFamily: 'Georgia', fontSize: 13, spacingBefore: 2, spacingAfter: 9 };
const captionLayout = { unit: 'pt', fontFamily: 'Arial', fontSize: 10, spacingBefore: 3, spacingAfter: 14 };
const source = () => schema.node('doc', {}, [schema.node('image_super', {
  src: '/scientific-figure.png', width: '320px', height: '180px', caption: 'Scientific figure', imageLayout, captionLayout,
})]);

describe('live image paragraph appearance', () => {
  it('retains both contexts through the browser HTML importer', () => {
    const document = source();
    expect(HTMLImporter.parse(HTMLExporter.export(document, { document: false }), schema).toJSON()).toEqual(document.toJSON());
  });

  it('updates image styles separately, removes stale values and restores them on undo', () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: [createHistoryPlugin()], content: source().toJSON() });
    const view = new ImageNodeView(editor.state.doc.child(0), { editor }, () => [0]);
    document.body.append(view.dom);
    try {
      const image = view.dom.querySelector('img')!;
      const caption = view.dom.querySelector('figcaption')!;
      expect(image.style.marginBlockStart).toBe('2pt');
      expect(image.style.marginBlockEnd).toBe('9pt');
      expect(image.style.fontFamily).toBe('Georgia');
      expect(caption.style.marginBlockStart).toBe('3pt');
      expect(caption.style.marginBlockEnd).toBe('14pt');
      const snapshot = editor.state.doc.toJSON();
      editor.dispatch(editor.createTransaction().setNodeAttrs([0], { ...editor.state.doc.child(0).attrs, imageLayout: undefined }));
      expect(view.update(editor.state.doc.child(0))).toBe(true);
      expect(image.hasAttribute('data-fountain-paragraph-layout')).toBe(false);
      expect(image.style.marginBlockStart).toBe('');
      expect(image.style.marginBlockEnd).toBe('');
      expect(image.style.fontFamily).toBe('');
      expect(image.style.width).toBe('100%');
      expect(image.style.height).toBe('180px');
      expect(caption.style.marginBlockEnd).toBe('14pt');
      expect(undo(editor)).toBe(true);
      view.update(editor.state.doc.child(0));
      expect(editor.state.doc.toJSON()).toEqual(snapshot);
      expect(image.style.marginBlockEnd).toBe('9pt');
      expect(image.hasAttribute('data-fountain-paragraph-layout')).toBe(true);
    } finally { view.destroy(); view.dom.remove(); editor.destroy(); }
  });
});
