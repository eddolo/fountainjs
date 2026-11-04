// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Schema, createEditor } from '../src/core';
import { HTMLExporter, HTMLImporter } from '../src';
import { StarterKit, composeExtensions, createMathExtension, createHistoryPlugin, setMathSource, undo } from '../src/extensions';

const kit = composeExtensions([...StarterKit.extensions, createMathExtension()]);
const schema = new Schema(kit.schema);
const layout = { unit: 'pt', spacingBefore: 3, spacingAfter: 17, fontFamily: 'Georgia', fontSize: 13 };
const doc = () => schema.node('doc', {}, [schema.node('math_block', { latex: 'x', layout })]);

describe('display-equation paragraph DOM', () => {
  it('reopens complete paragraph context through browser HTML and keeps inline math unchanged', () => {
    const original = doc();
    expect(HTMLImporter.parse(HTMLExporter.export(original), schema).toJSON()).toEqual(original.toJSON());
    const inline = schema.node('inline_math', { latex: 'x' });
    expect(JSON.stringify(inline.type.spec.toDOM!(inline))).not.toContain('paragraph-layout');
  });

  it('updates and clears owned styles without erasing unrelated host styles; undo restores all data', () => {
    const editor = createEditor({ schema: kit.schema, content: doc().toJSON(), plugins: [createHistoryPlugin()] });
    const NodeView = editor.state.schema.nodes.math_block!.spec.nodeView!;
    const view = new NodeView(editor.state.doc.child(0), { editor }, () => [0]);
    document.body.append(view.dom);
    try {
      const original = editor.state.doc.toJSON();
      expect(view.dom.style.marginBlockStart).toBe('3pt');
      expect(view.dom.style.marginBlockEnd).toBe('17pt');
      view.dom.style.setProperty('--host-math-accent', 'blue');
      editor.dispatch(editor.createTransaction().setNodeAttrs([0], { ...editor.state.doc.child(0).attrs, layout: undefined }));
      expect(view.update!(editor.state.doc.child(0))).toBe(true);
      expect(view.dom.style.marginBlockEnd).toBe('');
      expect(view.dom.style.fontFamily).toBe('');
      expect(view.dom.hasAttribute('data-fountain-paragraph-layout')).toBe(false);
      expect(view.dom.style.getPropertyValue('--host-math-accent')).toBe('blue');
      expect(undo(editor)).toBe(true);
      view.update!(editor.state.doc.child(0));
      expect(editor.state.doc.toJSON()).toEqual(original);
      expect(view.dom.style.marginBlockEnd).toBe('17pt');
      expect(JSON.parse(view.dom.getAttribute('data-fountain-paragraph-layout')!)).toEqual(layout);
    } finally { view.destroy?.(); view.dom.remove(); editor.destroy(); }
  });
});
