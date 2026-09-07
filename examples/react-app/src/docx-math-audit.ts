// Test-only workflow. The exact source/expression pairs are fixtures, not a TeX
// converter. Never use docx-preview's rendering as a Word conformance oracle.
import { createEditor, EditorView, StarterKit, composeExtensions, createMathExtension, undo } from 'fountainjs-editor';
import { exportDOCX, type DOCXMathExpression } from 'fountainjs-editor/docx';
import { renderAsync } from 'docx-preview';
import { createDocumentMathJaxRenderer } from './mathjax-document-renderer';

const t = (value: string): DOCXMathExpression => ({ type: 'text', value, style: /^[a-z]$/.test(value) ? 'italic' : 'plain' });
export const docxMathSamples: readonly { name: string; source: string; expression: DOCXMathExpression }[] = [
  { name: 'Fraction and square root', source: String.raw`\frac{x^2}{\sqrt{y}}`, expression: { type: 'fraction', numerator: { type: 'script', base: t('x'), sup: t('2') }, denominator: { type: 'radical', body: t('y') } } },
  { name: 'Subscript and superscript', source: 'x_i^2', expression: { type: 'script', base: t('x'), sub: t('i'), sup: t('2') } },
  { name: 'Cube root', source: String.raw`\sqrt[3]{x}`, expression: { type: 'radical', degree: t('3'), body: t('x') } },
  { name: 'Matrix', source: String.raw`\begin{bmatrix}a&b\\c&d\end{bmatrix}`, expression: { type: 'delimiter', open: '[', close: ']', body: { type: 'matrix', rows: [[t('a'), t('b')], [t('c'), t('d')]] } } },
  { name: 'Large operator with limits', source: String.raw`\sum_{i=0}^{n} x_i`, expression: { type: 'nary', symbol: '∑', sub: t('i=0'), sup: t('n'), limits: 'above-below', body: { type: 'script', base: t('x'), sub: t('i') } } },
  { name: 'Accent', source: String.raw`\hat{x}`, expression: { type: 'accent', character: '\u0302', body: t('x') } },
  { name: 'Fraction without a bar', source: String.raw`{n \atop k}`, expression: { type: 'fraction', bar: false, numerator: t('n'), denominator: t('k') } },
  { name: 'Large operator with side limits', source: String.raw`\sum\nolimits_{i=0}^{n} x_i`, expression: { type: 'nary', symbol: '∑', sub: t('i=0'), sup: t('n'), limits: 'beside', body: { type: 'script', base: t('x'), sub: t('i') } } },
];

let dispose: (() => void) | undefined;
export function mountDOCXMathAudit() {
  dispose?.();
  const root = document.createElement('section');
  root.id = 'docx-math-audit';
  root.innerHTML = `<h1>Equation export comparison</h1>
    <p>Left: editable Fountain source rendered by MathJax. Right: actual exported DOCX rendered by docx-preview. This is not Word or a page-layout certification. The fixture adapter only recognizes the eight exact sample sources.</p>
    <button type="button" data-export>Export and inspect current DOCX</button>
    <button type="button" data-undo>Undo equation edit</button>
    <p role="status">Not exported</p>
    <p data-viewer-issues role="alert"></p>
    <div class="math-audit-grid"><article><h2>Fountain editor</h2><div data-source></div></article><article><h2>Independent DOCX viewer</h2><div data-word-styles></div><div data-word></div></article></div>`;
  const style = document.createElement('style');
  style.textContent = `#docx-math-audit{position:relative;padding:24px;background:white;color:#171426;font:16px/1.5 Arial,sans-serif}#docx-math-audit button{padding:10px;margin:8px}#docx-math-audit .math-audit-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}#docx-math-audit .math-audit-grid>article{min-width:0;border:1px solid #ddd;padding:20px}#docx-math-audit [data-source]{padding:0;min-height:600px}#docx-math-audit .docx-wrapper{padding:0;background:white}#docx-math-audit section.docx{width:100%!important;padding:0!important;box-shadow:none;margin:0}#docx-math-audit h1,#docx-math-audit h2{color:black}#docx-math-audit [data-word]{overflow:auto}#docx-math-audit [data-source] [data-fountain-math]{background:transparent}`;
  root.prepend(style);
  document.body.append(root);
  const kit = composeExtensions([...StarterKit.extensions, createMathExtension({ documentRenderer: createDocumentMathJaxRenderer() })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content: docxMathSamples.flatMap(sample => [
    { type: 'paragraph', content: [{ type: 'text', text: sample.name }] },
    { type: 'math_block', attrs: { latex: sample.source } },
  ]) } });
  const view = new EditorView(root.querySelector<HTMLElement>('[data-source]')!, editor, { ariaLabel: 'DOCX equation source' });
  const status = root.querySelector<HTMLElement>('[role=status]')!;
  const button = root.querySelector<HTMLButtonElement>('[data-export]')!;
  let revision = 0;
  const unsubscribe = editor.subscribe((_state, transaction) => {
    if (transaction.docChanged) {
      revision++;
      root.querySelector('[data-word]')!.replaceChildren();
      root.querySelector('[data-viewer-issues]')!.textContent = '';
      status.textContent = 'Source changed. Export again; the previous viewer was cleared.';
    }
  });
  button.addEventListener('click', async () => {
    button.disabled = true;
    const request = revision;
    try {
      const result = exportDOCX(editor.state.doc, { page: 'letter', resolveMath: node => docxMathSamples.find(sample => sample.source === node.attrs.latex)?.expression });
      const url = URL.createObjectURL(new Blob([Uint8Array.from(result.bytes)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'experimental-equations.docx'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const content = document.createElement('div');
      const styles = document.createElement('div');
      await renderAsync(result.bytes, content, styles, { inWrapper: true, ignoreWidth: true, ignoreHeight: true, breakPages: false, renderAltChunks: false, useBase64URL: true });
      if (request !== revision || !root.isConnected) return;
      root.querySelector('[data-word]')!.replaceChildren(...content.childNodes);
      root.querySelector('[data-word-styles]')!.replaceChildren(...styles.childNodes);
      const native = result.report.issues.filter(issue => issue.code === 'native-math-experimental').length;
      const projected = editor.state.doc.content.filter(node => node.type.name === 'math_block')
        .map(node => docxMathSamples.find(sample => sample.source === node.attrs.latex)).filter(sample => sample !== undefined);
      const equations = [...root.querySelectorAll('[data-word] math')];
      const disagreements: string[] = [];
      projected.forEach((sample, index) => {
        const math = equations[index];
        if (!math?.textContent?.trim()) disagreements.push(`${sample.name}: missing equation content`);
        if (sample.name === 'Fraction without a bar' && math?.querySelector('mfrac')?.getAttribute('linethickness') !== '0') disagreements.push(`${sample.name}: bar suppression is not represented`);
        if (sample.name === 'Large operator with side limits' && !math?.querySelector('msubsup')) disagreements.push(`${sample.name}: side-limit structure is not represented`);
      });
      if (equations.some(math => math.getAttribute('display') !== 'block')) disagreements.push('Display equations are rendered as inline MathML');
      const issues = root.querySelector<HTMLElement>('[data-viewer-issues]')!;
      issues.textContent = disagreements.length ? `Viewer disagreements — not a passing fidelity check: ${disagreements.join('; ')}.` : 'No checked viewer disagreement detected; visual review and Word verification are still required.';
      status.textContent = `${native} experimental equations exported; ${result.report.issues.length - native} other conversion warnings. Browser preview only; Word fidelity remains unverified.`;
    } catch (error) {
      if (request === revision) status.textContent = `Export failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally { button.disabled = false; }
  });
  root.querySelector('[data-undo]')!.addEventListener('click', () => undo(editor));
  dispose = () => { revision++; unsubscribe(); view.destroy(); editor.destroy(); root.remove(); };
  root.scrollIntoView();
  return { samples: docxMathSamples.map(({ name, source }) => ({ name, source })) };
}
