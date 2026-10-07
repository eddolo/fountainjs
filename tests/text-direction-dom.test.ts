// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { CoreSchemaSpec, EditorView, HTMLExporter, HTMLImporter, Schema, createEditor } from '../src';
import { ServerHTMLImporter } from '../src/html/server';

const schema = new Schema(CoreSchemaSpec);
it('uses the same direction/alignment projection in browser and server HTML importers', () => {
  const html = '<section dir="rtl"><h2>عنوان</h2><blockquote><p>שלום</p></blockquote><p dir="LTR" style="text-align:left">Latin</p><p dir="auto" style="text-align:end">مرحبا</p><ul><li>قائمة</li></ul><table><tr><td>خلية</td></tr></table></section>';
  const browser = HTMLImporter.parse(html, schema);
  expect(browser.toJSON()).toEqual(ServerHTMLImporter.parse(html, schema).toJSON());
  expect(browser.child(0).attrs).toMatchObject({ dir: 'rtl', align: 'start' });
  expect(browser.child(4).child(0).child(0).attrs).toMatchObject({ dir: 'rtl', align: 'start' });
  expect(browser.child(5).child(0).child(0).child(0).attrs).toMatchObject({ dir: 'rtl', align: 'start' });
  expect(HTMLImporter.parse(HTMLExporter.export(browser, { document: false }), schema).toJSON()).toEqual(browser.toJSON());
});

it('renders direction and physical alignment in the DOM view, not by rewriting Unicode text', () => {
  const editor = createEditor({ schema: CoreSchemaSpec, content: schema.node('doc', {}, [
    schema.node('paragraph', { dir: 'rtl', align: 'left' }, [schema.text('שלום world')]),
    schema.node('heading', { dir: 'auto', align: 'start' }, [schema.text('عنوان')]),
  ]).toJSON() });
  const mount = document.createElement('div'); document.body.append(mount);
  const view = new EditorView(mount, editor);
  try {
    expect(view.dom.querySelector('p')?.getAttribute('dir')).toBe('rtl');
    expect(view.dom.querySelector('p')?.style.textAlign).toBe('left');
    expect(view.dom.querySelector('h1')?.getAttribute('dir')).toBe('auto');
    expect(view.dom.textContent).toBe('שלום worldعنوان');
  } finally { view.destroy(); editor.destroy(); mount.remove(); }
});
