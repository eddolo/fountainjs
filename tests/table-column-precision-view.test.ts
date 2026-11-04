// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Schema, StarterKit, HTMLExporter, HTMLImporter, EditorView, createEditor, resizeTableColumn, undo } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(StarterKit.schema);
const p = () => schema.node('paragraph', {}, [schema.text('Measurement')]);
const source = (colwidth = [80.2, 120.6]) => schema.node('doc', {}, [schema.node('table', { layout: 'fixed' }, [
  schema.node('table_row', {}, [schema.node('table_cell', { colspan: 2, colwidth }, [p()])]),
])]);

describe('fractional table-column DOM', () => {
  it.each([[80.2, 120.6], [0, 120.6]])('retains complete typed widths %j in both HTML importers', (...colwidth) => {
    const doc = source(colwidth);
    const html = HTMLExporter.export(doc);
    for (const importer of [HTMLImporter, ServerHTMLImporter]) expect(importer.parse(html, schema).toJSON()).toEqual(doc.toJSON());
  });

  it.each([['220.8px', [220.8]], ['50%', null], ['3em', null], ['0px', null]])('interprets CSS width %s with its actual unit', (width, expected) => {
    const html = `<table><tr><td style="width:${width}">Measurement</td></tr></table>`;
    for (const importer of [HTMLImporter, ServerHTMLImporter]) expect(importer.parse(html, schema).child(0).child(0).child(0).attrs.colwidth).toEqual(expected);
  });

  it('keeps fractional live grid ratios and restores the complete model after resize/undo', () => {
    const editor = createEditor({ schema: StarterKit.schema, content: source().toJSON(), plugins: StarterKit.plugins });
    const mount = document.createElement('div');
    const view = new EditorView(mount, editor);
    try {
      const original = editor.state.doc.toJSON();
      expect(view.dom.querySelector('table')?.style.width).toBe('200.8px');
      expect(view.dom.querySelector('td')?.getAttribute('data-colwidth')).toBe('80.2,120.6');
      expect(resizeTableColumn(editor, 110.4, 0, [0])).toBe(true);
      expect(view.dom.querySelector('table')?.style.width).toBe('231px');
      expect(view.dom.querySelector('td')?.getAttribute('data-colwidth')).toBe('110.4,120.6');
      expect(undo(editor)).toBe(true);
      expect(editor.state.doc.toJSON()).toEqual(original);
      expect(view.dom.querySelector('table')?.style.width).toBe('200.8px');
    } finally { view.destroy(); editor.destroy(); }
  });

  it('does not change fractional widths on a stationary drag and preserves them during real movement', () => {
    const editor = createEditor({ schema: StarterKit.schema, content: source().toJSON(), plugins: StarterKit.plugins });
    const mount = document.createElement('div');
    document.body.append(mount);
    const view = new EditorView(mount, editor);
    try {
      const original = editor.state.doc.toJSON();
      const drag = (delta: number) => {
        const handle = view.dom.querySelector('[role="separator"]')!;
        handle.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100, bubbles: true, cancelable: true }));
        window.dispatchEvent(new MouseEvent('pointermove', { clientX: 100 + delta }));
        window.dispatchEvent(new MouseEvent('pointerup'));
      };
      drag(0);
      expect(editor.state.doc.toJSON()).toEqual(original);
      expect(undo(editor)).toBe(false);
      drag(7);
      expect(editor.state.doc.child(0).child(0).child(0).attrs.colwidth).toEqual([80.2, 127.6]);
      expect(undo(editor)).toBe(true);
      expect(editor.state.doc.toJSON()).toEqual(original);
    } finally { view.destroy(); editor.destroy(); mount.remove(); }
  });
});
