import { describe, expect, it, vi } from 'vitest';
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { compileTeXForDOCX } from '../examples/react-app/src/mathjax-docx';
import { serializeDOCXMath } from '../src/docx/math';
import { Schema, StarterKit, composeExtensions, createMathExtension } from '../src';
import { exportDOCX } from '../src/docx';
import { strFromU8, unzipSync } from 'fflate';

const omml = (source: string, display = true) => serializeDOCXMath(compileTeXForDOCX(source, display), display);

describe('optional real TeX to DOCX host projection', () => {
  it.each([
    [String.raw`\frac{a^3+b}{\sqrt{c}}`, ['<m:f>', '<m:sSup>', '<m:rad>']],
    ['a_j^7', ['<m:sSubSup>']],
    [String.raw`\sqrt[5]{1+x}`, ['<m:deg>', '<m:degHide m:val="0"/>']],
    [String.raw`\left(\frac{a}{b}\right)`, ['<m:d>', '<m:f>']],
    [String.raw`\begin{bmatrix}1&x\\y&2\end{bmatrix}`, ['<m:d>', '<m:m>', '<m:mr>']],
    [String.raw`\hat{y}`, ['<m:acc>', '\u0302']],
    [String.raw`{a \atop b}`, ['<m:type m:val="noBar"/>']],
    [String.raw`\sum_{j=1}^{m} y_j`, ['<m:nary>', '<m:limLoc m:val="undOvr"/>']],
    [String.raw`\sum\nolimits_{j=1}^{m} y_j`, ['<m:nary>', '<m:limLoc m:val="subSup"/>']],
    [String.raw`\sum_{j=1}^{m}{y_j+z_j}`, ['<m:nary>', '<m:sub>', '<m:sup>']],
  ])('converts parsed notation rather than looking up a source fixture: %s', (source, tags) => {
    const result = omml(source);
    for (const tag of tags) expect(result).toContain(tag);
  });

  it('distinguishes variables, digits and explicit text styles', () => {
    const result = omml(String.raw`x+2+\mathbf{y}+\mathrm{kg}`);
    expect(result).toContain('<m:sty m:val="i"/></m:rPr><m:t xml:space="preserve">x');
    expect(result).toContain('<m:sty m:val="p"/></m:rPr><m:t xml:space="preserve">2');
    expect(result).toContain('<m:sty m:val="b"/></m:rPr><m:t xml:space="preserve">y');
    expect(result).toContain('<m:sty m:val="p"/></m:rPr><m:t xml:space="preserve">kg');
  });

  it('uses inline operator placement and exports unknown source with precise loss reporting', () => {
    expect(omml(String.raw`\sum_{j=1}^{m} y_j`, false)).toContain('<m:limLoc m:val="subSup"/>');
    const schema = new Schema(composeExtensions([...StarterKit.extensions, createMathExtension()]).schema);
    const sources = [String.raw`\frac{a^3+b}{\sqrt{c}}`, String.raw`z\quad 1`];
    const doc = schema.node('doc', {}, sources.map(latex => schema.node('math_block', { latex })));
    const original = doc.toJSON();
    const result = exportDOCX(doc, { resolveMath: node => compileTeXForDOCX(String(node.attrs.latex)) });
    const parts = unzipSync(result.bytes);
    const xml = strFromU8(parts['word/document.xml']);
    expect(xml).toContain('<m:f>');
    expect(xml).toContain(sources[1]);
    expect(result.report.issues.map(issue => issue.code)).toEqual(['native-math-experimental', 'math-projection-failed', 'block-fallback']);
    expect(result.report.issues[1]).toMatchObject({ path: [1], message: expect.stringContaining('mspace') });
    expect(doc.toJSON()).toEqual(original);
    expect(strFromU8(parts['customXml/fountainMath.xml'])).toContain('\\\\frac');
  });

  it.each([
    String.raw`\frac{1}`, String.raw`\href{https://example.org}{x}`, String.raw`\require{html}`,
    String.raw`\input{secret}`, String.raw`x\quad y`, String.raw`\phantom{x}`,
    String.raw`\mathbb{R}`, String.raw`\overbrace{x+y}`, String.raw`\overset{a}{b}`,
    String.raw`\begin{equation}\label{eq:x}x=1\end{equation}`, String.raw`\eqref{eq:x}`,
    String.raw`x\label{eq:x}`, String.raw`\boldsymbol{\sum_{i=0}^n x_i}`,
    String.raw`\sum_{i=0}^n x_i+y_i`,
  ])('rejects unsupported constructs instead of dropping their semantics: %s', source => {
    expect(() => compileTeXForDOCX(source)).toThrow();
  });

  it('runs without browser globals, font loading or persistent macro definitions', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    const loader = vi.fn(); const before = mathjax.asyncLoad;
    mathjax.asyncLoad = loader;
    try {
      expect(() => compileTeXForDOCX(String.raw`\def\local{x^2}\local`)).toThrow();
      expect(() => compileTeXForDOCX(String.raw`\local`)).toThrow();
      expect(omml('x^2')).toBe(omml('x^2'));
      expect(() => compileTeXForDOCX('x'.repeat(20_001))).toThrow(/limit/);
      expect(loader).not.toHaveBeenCalled();
    } finally { mathjax.asyncLoad = before; }
  });

  it('bounds the complete parsed tree, including matrix wrappers and nested fractions', () => {
    const cells = Array.from({ length: 51 }, () => '1').join('&');
    const matrix = String.raw`\begin{matrix}` + Array.from({ length: 51 }, () => cells).join(String.raw`\\`) + String.raw`\end{matrix}`;
    expect(matrix.length).toBeLessThan(20_000);
    expect(() => compileTeXForDOCX(matrix)).toThrow(/node\/depth limit/);
    const nested = String.raw`\frac{1}{`.repeat(80) + 'x' + '}'.repeat(80);
    expect(() => compileTeXForDOCX(nested)).toThrow(/node\/depth limit/);
  });
});
