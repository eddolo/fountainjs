import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { Schema, StarterKit, composeExtensions, createMathExtension } from '../src';
import { exportDOCX, importDOCX, type DOCXMathExpression } from '../src/docx';
import { serializeDOCXMath } from '../src/docx/math';

const text = (value: string): DOCXMathExpression => ({ type: 'text', value });
const schema = new Schema(composeExtensions([...StarterKit.extensions, createMathExtension()]).schema);
const source = String.raw`\frac{x^2}{\sqrt{y}}` + '\r\n\u200b';
const expression: DOCXMathExpression = {
  type: 'fraction', numerator: { type: 'script', base: { type: 'text', value: 'x', style: 'italic' }, sup: text('2') },
  denominator: { type: 'radical', body: { type: 'text', value: 'y', style: 'italic' } },
};
const fixture = () => schema.nodeFromJSON({ type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Inline ' }, { type: 'inline_math', attrs: { latex: source } }] },
  { type: 'math_block', attrs: { latex: source } },
] });

describe('experimental DOCX semantic math boundary', () => {
  it('preserves equations and original paths inside quotes, list items and table cells', () => {
    const p = () => schema.node('paragraph', {}, [schema.text('Context')]);
    const math = () => schema.node('math_block', { latex: source });
    const doc = schema.node('doc', {}, [
      schema.node('blockquote', {}, [p(), math()]),
      schema.node('bullet_list', {}, [schema.node('list_item', {}, [p(), math(),
        schema.node('blockquote', {}, [p(), math()]),
        schema.node('table', {}, [schema.node('table_row', {}, [schema.node('table_cell', {}, [p(), math()])])]),
      ])]),
    ]);
    const paths: number[][] = [];
    const result = exportDOCX(doc, { resolveMath: (_node, path) => { paths.push([...path]); return expression; } });
    expect(paths).toEqual([[0, 1], [1, 0, 1], [1, 0, 2, 1], [1, 0, 3, 0, 0, 1]]);
    const xml = strFromU8(unzipSync(result.bytes)['word/document.xml']);
    expect(xml.match(/<m:oMath[ >]/g)).toHaveLength(4);
    expect(xml.match(/<w:tbl>/g)).toHaveLength(1);
    expect(xml.match(/<w:numPr>/g)).toHaveLength(1);
    expect(result.report.issues.every(issue => issue.code === 'native-math-experimental')).toBe(true);
    for (const paragraph of xml.matchAll(/<w:p>(.*?)<\/w:p>/gs)) {
      expect((paragraph[1].match(/<w:pPr>/g) ?? []).length).toBeLessThanOrEqual(1);
    }
  });

  it('keeps alignment and quote style in one paragraph property element', () => {
    const doc = schema.node('doc', {}, [schema.node('blockquote', {}, [
      schema.node('paragraph', { align: 'center' }, [schema.text('Quoted')]),
      schema.node('heading', { level: 2 }, [schema.text('Heading')]),
    ])]);
    const xml = strFromU8(unzipSync(exportDOCX(doc).bytes)['word/document.xml']);
    expect(xml).toContain('<w:pStyle w:val="Quote"/><w:jc w:val="center"/>');
    expect(xml).toContain('<w:pStyle w:val="Heading2"/>');
    expect(xml).not.toContain('</w:pPr><w:pPr>');
  });

  it('emits native inline/display OMML and packages exact original sources without rewriting the model', () => {
    const doc = fixture();
    const before = doc.toJSON();
    const paths: number[][] = [];
    const result = exportDOCX(doc, { resolveMath: (node, path) => {
      expect(node.attrs.latex).toBe(source);
      expect(Object.isFrozen(path)).toBe(true);
      paths.push([...path]);
      return expression;
    } });
    expect(paths).toEqual([[0, 1], [1]]);
    const parts = unzipSync(result.bytes);
    const xml = strFromU8(parts['word/document.xml']);
    expect(xml.match(/<m:oMath[ >]/g)).toHaveLength(2);
    expect(xml.match(/<m:oMathPara xmlns/g)).toHaveLength(1);
    expect(xml.match(/<m:f>/g)).toHaveLength(2);
    expect(xml.match(/<m:sSup>/g)).toHaveLength(2);
    expect(xml.match(/<m:rad>/g)).toHaveLength(2);
    expect(xml).not.toContain('\\frac');
    expect(Object.keys(parts).some(name => name.startsWith('word/media/'))).toBe(false);
    const metadata = strFromU8(parts['customXml/fountainMath.xml']);
    // Inspect JSON through an independent XML parser in the artifact audit;
    // this unit check verifies escaped source and both emitted projections.
    expect(metadata).toContain(JSON.stringify(source).slice(1, -1));
    expect(metadata).toContain('&lt;m:oMath');
    expect(strFromU8(parts['word/_rels/document.xml.rels'])).toContain('Target="../customXml/fountainMath.xml"');
    expect(result.report.fidelity).toBe('lossy');
    expect(result.report.issues.map(issue => issue.code)).toEqual(['native-math-experimental', 'native-math-experimental']);
    expect(doc.toJSON()).toEqual(before);
    const reopened = importDOCX(result.bytes, schema);
    expect(reopened.report.issues.filter(issue => issue.code === 'unsupported-office-math')).toHaveLength(2);
    expect(reopened.document.textContent).toContain('[Word equation: import not yet supported]');
    expect(reopened.document.textContent).not.toContain('x2y');
  });

  it('supports editable structures without flattening their arguments', () => {
    const values: DOCXMathExpression[] = [
      { type: 'script', base: text('x'), sub: text('i'), sup: text('2') },
      { type: 'radical', degree: text('3'), body: text('x') },
      { type: 'delimiter', open: '[', close: ']', body: { type: 'matrix', rows: [[text('a'), text('b')], [text('c'), text('d')]] } },
      { type: 'nary', symbol: '∑', sub: text('i=0'), sup: text('n'), body: text('x'), limits: 'above-below' },
      { type: 'accent', character: '\u0302', body: text('x') },
      { type: 'fraction', numerator: text('n'), denominator: text('k'), bar: false },
    ];
    const xml = serializeDOCXMath({ type: 'row', content: values }, true);
    for (const tag of ['sSubSup', 'rad', 'd', 'm', 'nary', 'acc', 'f']) expect(xml).toContain(`<m:${tag}>`);
    expect(xml).toContain('<m:limLoc m:val="undOvr"/>');
    expect(xml).toContain('<m:degHide m:val="0"/>');
    expect(xml).toContain('<m:type m:val="noBar"/>');
    expect(xml.match(/<m:mr>/g)).toHaveLength(2);
    expect(xml).toContain('<m:count m:val="2"/>');
  });

  it.each([
    null, { type: 'rawXML', xml: '<w:r/>' }, { type: 'text', value: '<x>', href: 'https://example.org' },
    { type: 'fraction', numerator: text('x') }, { type: 'script', base: text('x') },
    { type: 'radical', body: null }, { type: 'delimiter', open: 'long', close: ')', body: text('x') },
    { type: 'text', value: '\u0000' }, { type: 'text', value: '\ud800' },
    { type: 'matrix', rows: [[text('a')], [text('b'), text('c')]] },
    { type: 'row', content: new Array(2) }, { type: 'accent', character: '^', body: text('x') },
  ])('rejects unsupported or lossy host math and retains the TeX fallback: %j', invalid => {
    const result = exportDOCX(fixture(), { resolveMath: () => invalid as DOCXMathExpression });
    const parts = unzipSync(result.bytes);
    const xml = strFromU8(parts['word/document.xml']);
    expect(xml).not.toContain('<m:oMath');
    expect(xml).toContain('\\frac');
    expect(parts['customXml/fountainMath.xml']).toBeUndefined();
    expect(result.report.issues.filter(issue => issue.code === 'math-projection-failed')).toHaveLength(2);
  });

  it('bounds cycles, excessive depth, node counts and text before packaging', () => {
    const cycle: { type: 'row'; content: DOCXMathExpression[] } = { type: 'row', content: [] };
    cycle.content.push(cycle);
    for (const value of [cycle, { type: 'row', content: Array.from({ length: 10_001 }, () => text('x')) }, text('x'.repeat(100_001))]) {
      expect(() => serializeDOCXMath(value as DOCXMathExpression, false)).toThrow();
    }
  });

  it('retains source when the adapter throws or declines, and reports omitted outer marks', () => {
    for (const resolveMath of [() => undefined, () => { throw new Error('No supported math'); }]) {
      const result = exportDOCX(fixture(), { resolveMath });
      expect(strFromU8(unzipSync(result.bytes)['word/document.xml'])).toContain('\\frac');
      expect(result.report.fidelity).toBe('lossy');
    }
    const doc = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'inline_math', attrs: { latex: 'x' }, marks: [{ type: 'strong' }] }] }] });
    const result = exportDOCX(doc, { resolveMath: () => text('x') });
    expect(result.report.issues.some(issue => issue.code === 'native-math-marks-omitted')).toBe(true);
  });

  it('bounds native-equation metadata without losing the remaining source text', () => {
    const doc = schema.node('doc', {}, Array.from({ length: 129 }, (_, i) =>
      schema.node('math_block', { latex: `source-${i}` })
    ));
    const result = exportDOCX(doc, { resolveMath: () => text('x') });
    const xml = strFromU8(unzipSync(result.bytes)['word/document.xml']);
    expect(xml.match(/<m:oMath>/g)).toHaveLength(128);
    expect(xml).toContain('source-128');
    expect(result.report.issues.filter(issue => issue.code === 'math-projection-failed').map(issue => issue.path)).toEqual([[128]]);
    expect(result.report.issues.filter(issue => issue.code === 'native-math-experimental')).toHaveLength(128);

    // The stock extension has a tighter source limit. Hosts may define their
    // own math schema, so the export boundary must independently enforce its cap.
    const wideSchema = new Schema({ ...StarterKit.schema, nodes: {
      ...StarterKit.schema.nodes,
      math_block: { ...schema.nodes.math_block.spec, attrs: { ...schema.nodes.math_block.spec.attrs, latex: { default: '' } } },
    } });
    const long = wideSchema.node('doc', {}, [wideSchema.node('math_block', { latex: 's'.repeat(100_001) })]);
    const rejected = exportDOCX(long, { resolveMath: () => text('x') });
    expect(unzipSync(rejected.bytes)['customXml/fountainMath.xml']).toBeUndefined();
    expect(rejected.report.issues.some(issue => issue.code === 'math-projection-failed')).toBe(true);
    const accumulated = wideSchema.node('doc', {}, Array.from({ length: 12 }, () =>
      wideSchema.node('math_block', { latex: 's'.repeat(90_000) })
    ));
    const bounded = exportDOCX(accumulated, { resolveMath: () => text('x'.repeat(90_000)) });
    expect(bounded.report.issues.filter(issue => issue.code === 'native-math-experimental')).toHaveLength(5);
    expect(bounded.report.issues.filter(issue => issue.code === 'math-projection-failed')).toHaveLength(7);
  });

  it('escapes valid Unicode text and cannot inject XML or relationships', () => {
    const xml = serializeDOCXMath(text('α < β & "value" 😀'), false);
    expect(xml).toContain('α &lt; β &amp; &quot;value&quot; 😀');
    expect(xml).not.toContain('Target=');
  });
});
