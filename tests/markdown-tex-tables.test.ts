import { describe, expect, it, vi } from 'vitest';
import { Schema, StarterKit, MathExtension, composeExtensions, MarkdownImporter, MarkdownExporter } from '../src';
import { PagesExtension } from '../src/pages';
import { academicTableSource, academicTableValues } from '../examples/react-app/src/academic-table-sample';

const schema = new Schema(composeExtensions([...StarterKit.extensions, MathExtension, PagesExtension]).schema);
const options = { texTables: true };
const parse = (source: string) => MarkdownImporter.parse(source, schema, options);

describe('explicit, loss-reported TeX table projection', () => {
  it('imports every original paper value, inline math and alignment while reporting all layout losses once', () => {
    const onTeXTableIssue = vi.fn();
    const imported = MarkdownImporter.parseWithSource(academicTableSource, schema, { ...options, onTeXTableIssue });
    const table = imported.document.child(0);
    expect(table.type.name).toBe('table');
    expect(table.content.map(row => row.content.map(cell => cell.child(0).content.map(node => node.attrs.latex ?? node.textContent).join('')))).toEqual(academicTableValues);
    expect(table.content.every(row => row.content.every(cell => cell.type.name === 'table_cell' && cell.child(0).attrs.align === 'center'))).toBe(true);
    expect(onTeXTableIssue).toHaveBeenCalledTimes(3);
    expect(onTeXTableIssue.mock.calls.every(([issue]) => issue.code === 'layout-projection' && issue.source === academicTableSource)).toBe(true);
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(academicTableSource);
    expect(MarkdownImporter.parse(academicTableSource, schema).content.some(node => node.type.name === 'table')).toBe(false);
  });

  it('supports simple alignments, escaped text, literal Markdown punctuation and inline formulas without evaluating commands', () => {
    const table = parse(String.raw`\begin{tabular}{lr}A\&B *literal* \$5 & $x_1 + \frac{1}{2}$ \\ C\%D & E\_F\end{tabular}`).child(0);
    expect(table.child(0).child(0).textContent).toBe('A&B *literal* $5');
    expect(table.child(0).child(0).child(0).child(0).marks).toHaveLength(0);
    expect(table.child(0).child(1).child(0).attrs.align).toBe('right');
    expect(table.child(0).child(1).child(0).child(0).attrs.latex).toBe(String.raw`x_1 + \frac{1}{2}`);
    expect(table.child(1).content.map(cell => cell.textContent)).toEqual(['C%D', 'E_F']);
  });

  it('supports empty cells, comments, trailing row terminators and optional outer table wrappers', () => {
    const table = parse('\\begin{tabular}{cc}\n& x \\\\\n1% comment\n2 & y \\\\\n\\end{tabular}').child(0);
    expect(table.content.map(row => row.content.map(cell => cell.textContent))).toEqual([['', 'x'], ['12', 'y']]);
  });

  it('works after prose and inside explicit list/quote containers', () => {
    const source = String.raw`\begin{tabular}{c}x\end{tabular}`;
    expect(parse('Text\n' + source + '\nAfter').content.map(node => node.type.name)).toEqual(['paragraph', 'table', 'paragraph']);
    expect(parse('> ' + source + '\nOutside').content.map(node => node.type.name)).toEqual(['blockquote', 'paragraph']);
    expect(parse('- ' + source + '\nOutside').content.map(node => node.type.name)).toEqual(['bullet_list', 'paragraph']);
  });

  it.each([
    String.raw`\begin{tabular}{p{2cm}}x\end{tabular}`,
    String.raw`\begin{tabular}{cc}\multicolumn{2}{c}{x}\end{tabular}`,
    String.raw`\begin{tabular}{cc}x & y & z\end{tabular}`,
    String.raw`\begin{tabular}{cc}x\end{tabular}`,
    String.raw`\begin{table}\caption{Important}\begin{tabular}{c}x\end{tabular}\end{table}`,
    String.raw`\begin{tabular}{c}\input{private-file}\end{tabular}`,
    String.raw`\begin{tabular}{c}\textbf{Keep formatting}\end{tabular}`,
    String.raw`\begin{tabular}{c}$unclosed\end{tabular}`,
    String.raw`\begin{tabular}{c}x \\[2pt] y\end{tabular}`,
  ])('retains all source and reports unsupported syntax (%#)', source => {
    const issue = vi.fn();
    const doc = MarkdownImporter.parse(source, schema, { ...options, onTeXTableIssue: issue });
    expect(doc.child(0).type.name).toBe('paragraph');
    expect(doc.child(0).textContent).toBe(source);
    expect(issue).toHaveBeenCalledOnce();
    expect(issue.mock.calls[0][0].code).toBe('unsupported-syntax');
  });

  it('keeps definitions inside declined tables opaque and still finds definitions outside', () => {
    const source = '\\begin{tabular}{c}\n[ref]: /hidden\n[^secret]: keep\n\\unknown\n\\end{tabular}';
    const doc = parse(source + '\n\n[ref]: /visible\n\n[ref]');
    expect(doc.child(0).textContent).toBe(source);
    expect(doc.child(1).child(0).marks[0].attrs.href).toBe('/visible');
    expect(doc.content.some(node => node.type.name === 'footnote_definition')).toBe(false);
  });

  it('does not interpret tables in fenced/indented code or HTML', () => {
    const source = String.raw`\begin{tabular}{c}x\end{tabular}`;
    for (const wrapper of ['```\n' + source + '\n```', '    ' + source, '<pre>\n' + source + '\n</pre>']) {
      expect(parse(wrapper).content.some(node => node.type.name === 'table')).toBe(false);
    }
  });

  it('falls back without loss when a required math/table schema node is absent', () => {
    const plain = new Schema(composeExtensions(StarterKit.extensions).schema);
    const doc = MarkdownImporter.parse(academicTableSource, plain, options);
    expect(doc.child(0).textContent).toBe(academicTableSource);
  });
});
