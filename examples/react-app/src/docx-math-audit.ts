// Test-only workflow with real bounded TeX conversion. Never use docx-preview's
// rendering as a Word conformance oracle.
import { createEditor, EditorView, StarterKit, composeExtensions, createMathExtension, undo } from 'fountainjs-editor';
import { exportDOCX, importDOCX } from 'fountainjs-editor/docx';
import { renderAsync } from 'docx-preview';
import { createDocumentMathJaxRenderer } from './mathjax-document-renderer';
import { compileTeXForDOCX } from './mathjax-docx';

export const docxMathSamples: readonly { name: string; source: string }[] = [
  { name: 'Fraction and square root', source: String.raw`\frac{x^2}{\sqrt{y}}` },
  { name: 'Subscript and superscript', source: 'x_i^2' },
  { name: 'Cube root', source: String.raw`\sqrt[3]{x}` },
  { name: 'Matrix', source: String.raw`\begin{bmatrix}a&b\\c&d\end{bmatrix}` },
  { name: 'Large operator with limits', source: String.raw`\sum_{i=0}^{n} x_i` },
  { name: 'Accent', source: String.raw`\hat{x}` },
  { name: 'Fraction without a bar', source: String.raw`{n \atop k}` },
  { name: 'Large operator with side limits', source: String.raw`\sum\nolimits_{i=0}^{n} x_i` },
];

let dispose: (() => void) | undefined;
export function mountDOCXMathAudit() {
  dispose?.();
  const root = document.createElement('section');
  root.id = 'docx-math-audit';
  root.innerHTML = `<h1>Equation export comparison</h1>
    <p>Left: editable Fountain source rendered by MathJax. Right: actual exported DOCX rendered by docx-preview. The host adapter parses supported TeX expressions; unsupported constructs retain source with a warning. This is not Word or a page-layout certification.</p>
    <button type="button" data-export>Export and inspect current DOCX</button>
    <button type="button" data-undo>Undo equation edit</button>
    <p><label>Reopen DOCX with matching TeX metadata <input type="file" data-open accept=".docx"></label></p>
    <p>This opt-in diagnostic reads untrusted source metadata locally. Changed or ambiguous equations are not restored.</p>
    <p data-import-status aria-live="polite"></p>
    <ul data-import-issues aria-label="Reopen warnings"></ul>
    <p role="status">Not exported</p>
    <ul data-conversion-issues aria-label="Conversion warnings"></ul>
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
      root.querySelector('[data-conversion-issues]')!.replaceChildren();
      root.querySelector('[data-import-status]')!.textContent = '';
      root.querySelector('[data-import-issues]')!.replaceChildren();
      status.textContent = 'Source changed. Export again; the previous viewer was cleared.';
    }
  });
  button.addEventListener('click', async () => {
    button.disabled = true;
    const request = revision;
    try {
      const result = exportDOCX(editor.state.doc, { page: 'letter', resolveMath: node => compileTeXForDOCX(String(node.attrs.latex), node.type.name === 'math_block') });
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
      root.querySelector('[data-conversion-issues]')!.replaceChildren(...result.report.issues
        .filter(issue => issue.code !== 'native-math-experimental')
        .map(issue => {
          const warning = document.createElement('li');
          warning.textContent = `${issue.code} at document path ${issue.path?.join('.') ?? 'root'}: ${issue.message}`;
          return warning;
        }));
      const native = result.report.issues.filter(issue => issue.code === 'native-math-experimental').length;
      const projected = result.report.issues.filter(issue => issue.code === 'native-math-experimental').map(issue => {
        const node = (issue.path ?? []).reduce((node, index) => node.child(index), editor.state.doc);
        return { name: docxMathSamples.find(sample => sample.source === node.attrs.latex)?.name ?? 'Edited equation' };
      });
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
  const fileInput = root.querySelector<HTMLInputElement>('[data-open]')!;
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const request = revision;
    fileInput.disabled = true;
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('DOCX exceeds the 25 MiB file limit.');
      const bytes = await file.arrayBuffer();
      if (request !== revision || !root.isConnected) throw new Error('Editor changed while reading the file; reopen it again.');
      const result = importDOCX(bytes, editor.state.schema, { restoreMathSource: true });
      if (!editor.dispatch(editor.state.createTransaction().replaceDocument(result.document))) throw new Error('Document replacement was rejected.');
      const count = result.report.issues.filter(issue => issue.code === 'math-source-restored-experimental').length;
      root.querySelector('[data-import-status]')!.textContent = `${count} equations restored from matching package metadata. This is not general Word equation import or Word fidelity approval.`;
      const warnings = new Map<string, number>();
      for (const issue of result.report.issues) {
        const text = `${issue.code}: ${issue.message}`;
        warnings.set(text, (warnings.get(text) ?? 0) + 1);
      }
      root.querySelector('[data-import-issues]')!.replaceChildren(...[...warnings].map(([text, count]) => {
        const item = document.createElement('li'); item.textContent = count > 1 ? `${text} (${count} equations)` : text; return item;
      }));
    } catch (error) {
      if (root.isConnected) root.querySelector('[data-import-status]')!.textContent = `Reopen failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally { fileInput.disabled = false; fileInput.value = ''; }
  });
  root.querySelector('[data-undo]')!.addEventListener('click', () => undo(editor));
  dispose = () => { revision++; unsubscribe(); view.destroy(); editor.destroy(); root.remove(); };
  root.scrollIntoView();
  return { samples: docxMathSamples.map(({ name, source }) => ({ name, source })) };
}
