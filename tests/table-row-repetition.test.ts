// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Schema, StarterKit, HTMLExporter, HTMLImporter, MarkdownExporter, createEditor, EditorView, undo, redo, resizeTableColumn } from '../src';
import { ServerHTMLImporter } from '../src/html/server';
import { repeatedDOMTableRows } from '../src/core/table-layout';
const schema = new Schema(StarterKit.schema);
const p = (text: string) => schema.node('paragraph', {}, [schema.text(text)]);
function doc() {
  return schema.node('doc', {}, [schema.node('table', {}, [
    schema.node('table_row', { repeatHeader: true }, [schema.node('table_cell', { colwidth: [120] }, [p('Plain repeating row')])]),
    schema.node('table_row', { repeatHeader: false }, [schema.node('table_header', { colwidth: [120] }, [p('Semantic but not repeated')])]),
  ])]);
}
describe('portable row repetition and safe page bands', () => {
  it('retains row choice and distinct cell roles through browser and no-DOM HTML', () => {
    const original = doc();
    const html = HTMLExporter.export(original, { document: false });
    expect(html).toContain('<tr data-fountain-repeat-header="true"><td');
    expect(html).toContain('<tr data-fountain-repeat-header="false"><th');
    for (const parser of [HTMLImporter, ServerHTMLImporter]) expect(parser.parse(html, schema).toJSON()).toEqual(original.toJSON());
  });
  it('retains the same live DOM and row choice through resize and history', () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins, content: doc().toJSON() });
    const mount = document.createElement('div');
    const view = new EditorView(mount, editor);
    expect(view.dom.querySelector('tr')?.dataset.fountainRepeatHeader).toBe('true');
    expect(resizeTableColumn(editor, 160, 0, [0])).toBe(true);
    expect(editor.state.doc.child(0).content.map(row => row.attrs.repeatHeader)).toEqual([true, false]);
    expect(undo(editor)).toBe(true); expect(redo(editor)).toBe(true);
    expect(editor.state.doc.child(0).content.map(row => row.attrs.repeatHeader)).toEqual([true, false]);
    view.destroy(); editor.destroy();
  });
  it('reports the exact pipe-Markdown loss and retains the flag in HTML tables', () => {
    const pipe = MarkdownExporter.exportWithReport(doc());
    expect(pipe.losses.filter(loss => loss.detail.includes('explicit row repetition')).map(loss => loss.path)).toEqual([[0, 0], [0, 1]]);
    const html = MarkdownExporter.exportWithReport(doc(), { tableFormat: 'html' });
    expect(html.losses.some(loss => loss.detail.includes('explicit row repetition'))).toBe(false);
    expect(ServerHTMLImporter.parse(html.markdown, schema).toJSON()).toEqual(doc().toJSON());
  });
  it.each(['yes', '1', 'true\" onclick=\"alert(1)'])('does not turn invalid HTML metadata %s into page intent', value => {
    for (const parser of [HTMLImporter, ServerHTMLImporter]) {
      expect(parser.parse(`<table><tr data-fountain-repeat-header='${value}'><td>A</td></tr></table>`, schema).child(0).child(0).attrs.repeatHeader).toBeUndefined();
    }
  });
  it('rejects non-boolean model choices', () => {
    expect(() => schema.node('table_row', { repeatHeader: 'yes' }, doc().child(0).child(0).content)).toThrow();
  });
  it.each([
    ['<tr data-fountain-repeat-header="true"><td>A</td></tr><tr data-fountain-repeat-header="true"><td>B</td></tr><tr><td>C</td></tr>', 2],
    ['<tr data-fountain-repeat-header="false"><th>A</th></tr><tr data-fountain-repeat-header="true"><td>B</td></tr>', 0],
    ['<tr><th>A</th></tr><tr><td>B</td></tr><tr><th>C</th></tr>', 1],
    ['<tr data-fountain-repeat-header="true"><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr>', 0],
    ['<tr data-fountain-repeat-header="true"><td rowspan="2">A</td><td>B</td></tr><tr data-fountain-repeat-header="true"><td>C</td></tr><tr><td>D</td><td>E</td></tr>', 2],
    ['<tr data-fountain-repeat-header="true"><td rowspan="0">A</td></tr><tr><td>B</td></tr>', 0],
  ])('uses a contiguous rowspan-safe leading band %s', (html, count) => {
    const root = document.createElement('div'); root.innerHTML = `<table>${html}</table>`;
    expect(repeatedDOMTableRows([...root.querySelectorAll('tr')])).toHaveLength(count);
  });
});
