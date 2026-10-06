import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { Schema, StarterKit, composeExtensions, createMathExtension } from '../src';
import { exportDOCX, importDOCX } from '../src/docx';
import { serializeDOCXMath, type DOCXMathExpression } from '../src/docx/math';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MATH_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const schema = new Schema(composeExtensions([...StarterKit.extensions, createMathExtension()]).schema);
const plainSchema = new Schema(StarterKit.schema);

function document(body: string): Uint8Array {
  return zipSync({
    'word/document.xml': strToU8(`<w:document xmlns:w="${WORD_NS}" xmlns:m="${MATH_NS}"><w:body>${body}</w:body></w:document>`),
  });
}

const text = (value: string): DOCXMathExpression => ({ type: 'text', value });

describe('bounded native Word equation import', () => {
  it('imports supported inline and display OMML as editable Fountain math', () => {
    const inline = serializeDOCXMath({ type: 'script', base: text('x'), sub: text('i'), sup: text('2') }, false);
    const display = serializeDOCXMath({ type: 'fraction', numerator: text('ln 2'), denominator: text('k') }, true);
    const imported = importDOCX(document(`<w:p><w:r><w:t>Inline </w:t></w:r>${inline}<w:r><w:t> end</w:t></w:r></w:p><w:p>${display}</w:p>`), schema);

    const paragraph = imported.document.child(0);
    expect(paragraph.content.map(node => node.type.name)).toEqual(['text', 'inline_math', 'text']);
    expect(paragraph.child(1).attrs.latex).toBe('{\\mathrm{x}}_{\\mathrm{i}}^{\\mathrm{2}}');
    expect(paragraph.child(1).attrs.expression).toEqual({ type: 'script', base: { ...text('x'), style: 'plain' }, sub: { ...text('i'), style: 'plain' }, sup: { ...text('2'), style: 'plain' } });
    expect(imported.document.child(1).type.name).toBe('math_block');
    expect(imported.document.child(1).attrs.latex).toBe('\\frac{\\mathrm{ln 2}}{\\mathrm{k}}');
    expect(imported.document.child(1).attrs.expression).toEqual({ type: 'fraction', numerator: { ...text('ln 2'), style: 'plain' }, denominator: { ...text('k'), style: 'plain' } });
    expect(imported.report.issues.filter(issue => issue.code === 'office-math-imported-experimental')).toHaveLength(2);
    expect(imported.document.textContent).not.toContain('Word equation:');
  });

  it('re-exports imported semantics directly without a TeX resolver or text fallback', () => {
    const equation = { type: 'fraction', numerator: text('ln 2'), denominator: text('k') } as const;
    const imported = importDOCX(document(`<w:p>${serializeDOCXMath(equation, true)}</w:p>`), schema);
    const exported = exportDOCX(imported.document);
    const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']);

    expect(xml).toContain('<m:f>');
    expect(xml).not.toContain('\\frac');
    expect(exported.report.issues).not.toContainEqual(expect.objectContaining({ code: 'block-fallback' }));
    const reopened = importDOCX(exported.bytes, schema).document.child(0);
    expect(reopened.attrs.latex).toBe('\\frac{\\mathrm{ln 2}}{\\mathrm{k}}');
    expect(reopened.attrs.expression).toEqual({ type: 'fraction', numerator: { ...text('ln 2'), style: 'plain' }, denominator: { ...text('k'), style: 'plain' } });
  });

  it('converts the scientific fixture structures without flattening scripts or fractions', () => {
    const first = '<m:oMathPara><m:oMath><m:r><m:t>T(t) = </m:t></m:r><m:sSub><m:e><m:r><m:t>T</m:t></m:r></m:e><m:sub><m:r><m:t>a</m:t></m:r></m:sub></m:sSub><m:r><m:t> + (</m:t></m:r><m:sSup><m:e><m:r><m:t>e</m:t></m:r></m:e><m:sup><m:r><m:t>−kt</m:t></m:r></m:sup></m:sSup></m:oMath></m:oMathPara>';
    const second = '<m:oMathPara><m:oMath><m:sSub><m:e><m:r><m:t>t</m:t></m:r></m:e><m:sub><m:r><m:t>1/2</m:t></m:r></m:sub></m:sSub><m:r><m:t> = </m:t></m:r><m:f><m:num><m:r><m:t>ln 2</m:t></m:r></m:num><m:den><m:r><m:t>k</m:t></m:r></m:den></m:f></m:oMath></m:oMathPara>';
    const imported = importDOCX(document(`<w:p>${first}</w:p><w:p>${second}</w:p>`), schema);

    expect(imported.document.content.map(node => node.type.name)).toEqual(['math_block', 'math_block']);
    expect(imported.document.child(0).attrs.latex).toBe('T(t) = {T}_{a} + ({e}^{−kt}');
    expect(imported.document.child(1).attrs.latex).toBe('{t}_{1/2} = \\frac{ln 2}{k}');
  });

  it('imports function application, upper/lower limits, and equation arrays as typed math', () => {
    const functionOMML = '<m:oMath><m:func><m:fName><m:r><m:t>sin</m:t></m:r></m:fName><m:e><m:r><m:t>x</m:t></m:r></m:e></m:func></m:oMath>';
    const lowerLimit = '<m:oMath><m:limLow><m:e><m:r><m:t>lim</m:t></m:r></m:e><m:lim><m:r><m:t>n→∞</m:t></m:r></m:lim></m:limLow></m:oMath>';
    const upperLimit = '<m:oMath><m:limUpp><m:e><m:r><m:t>x</m:t></m:r></m:e><m:lim><m:r><m:t>2</m:t></m:r></m:lim></m:limUpp></m:oMath>';
    const equations = '<m:oMathPara><m:oMath><m:eqArr><m:e><m:r><m:t>x=1</m:t></m:r></m:e><m:e><m:r><m:t>y=2</m:t></m:r></m:e></m:eqArr></m:oMath></m:oMathPara>';
    const imported = importDOCX(document(
      `<w:p>${functionOMML}</w:p><w:p>${lowerLimit}</w:p><w:p>${upperLimit}</w:p><w:p>${equations}</w:p>`,
    ), schema);

    expect(imported.document.content.map(node => node.type.name)).toEqual(['paragraph', 'paragraph', 'paragraph', 'math_block']);
    const expressions = imported.document.content.map(node => node.type.name === 'paragraph' ? node.child(0).attrs.expression : node.attrs.expression);
    expect(expressions).toEqual([
      { type: 'function', name: text('sin'), argument: text('x') },
      { type: 'limit', base: text('lim'), limit: text('n→∞'), position: 'lower' },
      { type: 'limit', base: text('x'), limit: text('2'), position: 'upper' },
      { type: 'equation_array', rows: [text('x=1'), text('y=2')] },
    ]);
    const latex = imported.document.content.map(node => node.type.name === 'paragraph' ? node.child(0).attrs.latex : node.attrs.latex);
    expect(latex).toEqual(['\\operatorname{sin}x', '\\underset{n→∞}{lim}', '\\overset{2}{x}', '\\begin{aligned}x=1 \\\\ y=2\\end{aligned}']);

    const exported = exportDOCX(imported.document);
    const xml = strFromU8(unzipSync(exported.bytes)['word/document.xml']);
    for (const tag of ['func', 'limLow', 'limUpp', 'eqArr']) expect(xml).toContain(`<m:${tag}>`);
    const reopened = importDOCX(exported.bytes, schema).document;
    const reopenedExpressions = reopened.content.map(node => node.type.name === 'paragraph' ? node.child(0).attrs.expression : node.attrs.expression);
    expect(reopenedExpressions).toEqual([
      { type: 'function', name: { ...text('sin'), style: 'plain' }, argument: { ...text('x'), style: 'plain' } },
      { type: 'limit', base: { ...text('lim'), style: 'plain' }, limit: { ...text('n→∞'), style: 'plain' }, position: 'lower' },
      { type: 'limit', base: { ...text('x'), style: 'plain' }, limit: { ...text('2'), style: 'plain' }, position: 'upper' },
      { type: 'equation_array', rows: [{ ...text('x=1'), style: 'plain' }, { ...text('y=2'), style: 'plain' }] },
    ]);
  });

  it('fails closed on unsupported OMML rather than concatenating misleading runs', () => {
    const unsupported = '<m:oMath><m:borderBox><m:e><m:r><m:t>x</m:t></m:r></m:e></m:borderBox></m:oMath>';
    const imported = importDOCX(document(`<w:p>${unsupported}</w:p>`), schema);

    expect(imported.document.textContent).toBe('[Word equation: unsupported structure]');
    expect(imported.document.textContent).not.toContain('x');
    expect(imported.report.issues).toContainEqual(expect.objectContaining({ code: 'unsupported-office-math', path: [0] }));
  });

  it.each([
    '<m:oMath><m:func><m:fName><m:r><m:t>sin</m:t></m:r></m:fName></m:func></m:oMath>',
    '<m:oMath><m:limLow><m:e><m:r><m:t>x</m:t></m:r></m:e><m:lim><m:r><m:t>0</m:t></m:r></m:lim><m:r><m:t>extra</m:t></m:r></m:limLow></m:oMath>',
    '<m:oMath><m:eqArr/></m:oMath>',
  ])('fails closed on malformed supported OMML: %s', malformed => {
    const imported = importDOCX(document(`<w:p>${malformed}</w:p>`), schema);
    expect(imported.document.textContent).toBe('[Word equation: unsupported structure]');
    expect(imported.report.issues).toContainEqual(expect.objectContaining({ code: 'unsupported-office-math' }));
  });

  it('uses an explicit fallback when the host schema omits the math extension', () => {
    const equation = serializeDOCXMath(text('x'), true);
    const imported = importDOCX(document(`<w:p>${equation}</w:p>`), plainSchema);

    expect(imported.document.textContent).toBe('[Word equation: math extension unavailable]');
    expect(imported.report.issues).toContainEqual(expect.objectContaining({ code: 'missing-math-node', path: [0] }));
  });
});
