import { describe, expect, it } from 'vitest';
import { CoreSchemaSpec, MarkdownExporter, MarkdownImporter, Schema } from '../src';

const schema = new Schema(CoreSchemaSpec);
const parse = (source: string) => MarkdownImporter.parse(source, schema);

describe('GFM table structure (spec examples 198–205)', () => {
  it.each(['---', ':---', '---:', ':---:'])('round-trips a one-column table with %s alignment', delimiter => {
    const doc = parse(`| Header |\n| ${delimiter} |\n| Value |`);
    expect(doc.child(0).type.name).toBe('table');
    expect(doc.child(0).content.map(row => row.childCount)).toEqual([1, 1]);
    expect(doc.child(0).child(1).textContent).toBe('Value');
    expect(parse(MarkdownExporter.export(doc)).toJSON()).toEqual(doc.toJSON());
  });

  it('accepts short delimiter cells and inconsistent outer pipes (199)', () => {
    const table = parse('| abc | defghi |\n:-: | -----------:\nbar | baz').child(0);
    expect(table.type.name).toBe('table');
    expect(table.child(0).content.map(cell => cell.child(0).attrs.align)).toEqual(['center', 'right']);
    expect(table.child(1).content.map(cell => cell.textContent)).toEqual(['bar', 'baz']);
  });

  it('unescapes cell pipes in ordinary text, code, and emphasis (200)', () => {
    const doc = parse('| f\\|oo |\n| ------ |\n| b `\\|` az |\n| b **\\|** im |');
    const table = doc.child(0);
    expect(table.content.map(row => row.textContent)).toEqual(['f|oo', 'b | az', 'b | im']);
    expect(table.child(1).child(0).child(0).child(1).marks[0].type.name).toBe('code');
    expect(table.child(2).child(0).child(0).child(1).marks[0].type.name).toBe('strong');
    expect(parse(MarkdownExporter.export(doc)).toJSON()).toEqual(doc.toJSON());
  });

  it('ends at another block even when that block contains pipes (201)', () => {
    const doc = parse('| A | B |\n| --- | --- |\n| one | two |\n> Quote | not a row');
    expect(doc.content.map(node => node.type.name)).toEqual(['table', 'blockquote']);
    expect(doc.child(0).childCount).toBe(2);
  });

  it('accepts unpiped short body rows and ends at a blank line (202)', () => {
    const doc = parse('| A | B |\n| --- | --- |\n| one | two |\nshort\n\nAfter');
    expect(doc.content.map(node => node.type.name)).toEqual(['table', 'paragraph']);
    expect(doc.child(0).child(2).content.map(cell => cell.textContent)).toEqual(['short', '']);
  });

  it('rejects header/delimiter width mismatches and pads/truncates only body rows (203–204)', () => {
    expect(parse('| A | B |\n| --- |\n| one |').child(0).type.name).toBe('paragraph');
    const table = parse('| A | B |\n| --- | --- |\n| one |\n| two | three | excess |').child(0);
    expect(table.child(1).content.map(cell => cell.textContent)).toEqual(['one', '']);
    expect(table.child(2).content.map(cell => cell.textContent)).toEqual(['two', 'three']);
  });

  it('retains a header-only table (205) without confusing escaped pipes or invalid separators', () => {
    expect(parse('| A |\n| --- |').child(0).childCount).toBe(1);
    expect(parse('escaped\\|pipe\n---').child(0).type.name).toBe('heading');
    expect(parse('| A |\n| - - - |').child(0).type.name).toBe('paragraph');
  });

  it('reports role changes in pipe export instead of claiming data cells stay data cells', () => {
    const doc = schema.node('doc', {}, [schema.node('table', {}, [schema.node('table_row', {}, [schema.node('table_cell', {}, [schema.node('paragraph', {}, [schema.text('Evidence')])])])])]);
    const exported = MarkdownExporter.exportWithReport(doc);
    expect(exported.losses).toEqual([expect.objectContaining({ type: 'table_row', path: [0, 0], detail: expect.stringContaining('first row column headers') })]);
    expect(parse(exported.markdown).child(0).child(0).child(0).type.name).toBe('table_header');
  });
});
