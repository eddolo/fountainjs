import { describe, expect, it } from 'vitest';
import { Schema, StarterKit, MathExtension, composeExtensions, MarkdownImporter, MarkdownExporter } from '../src';
import { mathReferenceSamples } from '../examples/react-app/src/math-reference-samples';
import { PagesExtension } from '../src/pages';

const schema = new Schema(composeExtensions([...StarterKit.extensions, MathExtension, PagesExtension]).schema);
const options = { texMathEnvironments: true };
function parse(source: string) { return MarkdownImporter.parse(source, schema, options); }
function mathSources(source: string) {
  const values: unknown[] = [];
  parse(source).descendants(node => { if (node.type.name === 'math_block') values.push(node.attrs.latex); });
  return values;
}

describe('explicit TeX math environment import', () => {
  it.each(mathReferenceSamples.slice(1))('imports exact published source: $label', ({ source }) => {
    expect(mathSources(source)).toEqual([source]);
    const canonical = MarkdownExporter.export(parse(source));
    expect(canonical).toContain(source);
    expect(MarkdownImporter.parse(canonical, schema).child(0).attrs.latex).toBe(source);
    expect(MarkdownImporter.parse(source, schema).child(0).type.name).not.toBe('math_block');
  });

  it.each(['equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*', 'displaymath'])('keeps complete %s environments opaque', environment => {
    const source = `\\begin{${environment}}\n\t\\label{eq:x}\n\n[link]: /not-a-definition\n[^note]: not a footnote\n\\begin{matrix}a & b \\\\ c & d\\end{matrix}\n% \\end{${environment}}\n\\end{${environment}} % retained`;
    const doc = parse(source + '\n\n[link]\n\n[^note]');
    expect(doc.child(0).attrs.latex).toBe(source);
    expect(doc.content.some(node => node.type.name === 'footnote_definition')).toBe(false);
    expect(doc.child(1).textContent).toBe('[link]');
    expect(doc.child(1).child(0).marks).toHaveLength(0);
  });

  it('preserves exact source snapshots while normalizing model line endings', () => {
    const raw = '\\begin{equation}\r\n\tx = 1\r\n\\end{equation}';
    const imported = MarkdownImporter.parseWithSource(raw, schema, options);
    expect(imported.document.child(0).attrs.latex).toBe(raw.replaceAll('\r\n', '\n'));
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(raw);
  });

  it('still discovers real references and footnotes outside opaque math', () => {
    const source = '\\begin{equation}\n[ref]: /hidden\n[^hidden]: not a definition\n\\end{equation}\n\n[ref]: /visible\n\n[^real]: Actual note\n\n[ref] and [^real]';
    const doc = parse(source);
    expect(doc.content.filter(node => node.type.name === 'footnote_definition').map(node => node.attrs.id)).toEqual(['real']);
    expect(doc.child(1).child(0).marks[0].attrs.href).toBe('/visible');
  });

  it('respects fenced code, indented code, and HTML blocks', () => {
    const source = '\\begin{equation}\nx=1\n\\end{equation}';
    for (const wrapped of [
      '```tex\n' + source + '\n```', source.split('\n').map(line => '    ' + line).join('\n'),
      '<pre>\n' + source + '\n</pre>',
    ]) expect(mathSources(wrapped)).toEqual([]);
  });

  it('allows a complete environment immediately after prose only with explicit opt-in', () => {
    const equation = '\\begin{equation}\\label{one}\nx=1\n\\end{equation}';
    const source = 'This leads to the equation,\n' + equation + '\nFollowing prose.';
    const doc = parse(source);
    expect(doc.content.map(node => node.type.name)).toEqual(['paragraph', 'math_block', 'paragraph']);
    expect(doc.child(1).attrs.latex).toBe(equation);
    expect(MarkdownImporter.parse(source, schema).content.every(node => node.type.name !== 'math_block')).toBe(true);
  });

  it('supports explicit quote/list containers without swallowing unmarked prose', () => {
    const source = '\\begin{equation}\nx=1\n\\end{equation}';
    const quote = parse(source.split('\n').map(line => '> ' + line).join('\n') + '\nOutside');
    expect(quote.child(0).type.name).toBe('blockquote');
    expect(quote.child(0).child(0).attrs.latex).toBe(source);
    expect(quote.child(1).textContent).toBe('Outside');
    const list = parse('- ' + source.replaceAll('\n', '\n  ') + '\nOutside');
    expect(list.child(0).child(0).child(0).attrs.latex).toBe(source);
    expect(list.child(1).textContent).toBe('Outside');
  });

  it.each([
    '\\begin{unknown}x\\end{unknown}', '\\begin{equation}x',
    '\\begin{equation}x\\end{align}', '\\begin{equation}x\\end{equation} trailing prose',
    '\\\\begin{equation}x\\end{equation}', '\\begin{equation}\n% \\end{equation}',
    '\\begin{equation}' + 'x'.repeat(20_000) + '\\end{equation}',
  ])('does not claim unsupported, incomplete, escaped, or oversized input (%#)', source => {
    expect(mathSources(source)).toEqual([]);
    const imported = MarkdownImporter.parseWithSource(source, schema, options);
    expect(MarkdownExporter.exportWithSource(imported.document, imported.source).markdown).toBe(source);
  });

  it('does not require a math schema when the option is set', () => {
    const plain = new Schema(composeExtensions(StarterKit.extensions).schema);
    expect(() => MarkdownImporter.parse('\\begin{equation}x\\end{equation}', plain, options)).not.toThrow();
  });
});
