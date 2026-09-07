/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { composeExtensions, StarterKit, createMathExtension, createEditor, EditorView, moveNode, setMathSource, undo } from 'fountainjs-editor';
import { createDocumentMathJaxRenderer } from '../examples/react-app/src/mathjax-document-renderer';
import { mathReferenceSamples } from '../examples/react-app/src/math-reference-samples';

const views: EditorView[] = [];
afterEach(() => { views.splice(0).forEach(view => view.destroy()); document.body.replaceChildren(); });
const equations = mathReferenceSamples.slice(1).map(sample => ({ type: 'math_block', attrs: { latex: sample.source } }));
const refs = { type: 'paragraph', content: [
  { type: 'inline_math', attrs: { latex: String.raw`\eqref{eq:dNFE}` } },
  { type: 'text', text: ' and ' },
  { type: 'inline_math', attrs: { latex: String.raw`\eqref{eq:dSNFE}` } },
] };

function setup(content = [refs, ...equations], render = createDocumentMathJaxRenderer()) {
  const errors = vi.fn();
  const kit = composeExtensions([...StarterKit.extensions, createMathExtension({ documentRenderer: render, onRenderError: errors })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: { type: 'doc', content } });
  const mount = document.createElement('div');
  document.body.append(mount);
  const view = new EditorView(mount, editor);
  views.push(view);
  return { editor, view, errors };
}
const attributes = (root: HTMLElement, name: string) => [...root.querySelectorAll('[data-document-mathjax]')].map(node => node.getAttribute(name));

describe('optional host MathJax SVG integration', () => {
  it('typesets exact published equations and resolves namespaced forward links to actual SVG anchors', () => {
    const snapshots = vi.fn();
    const { editor, view, errors } = setup(undefined, createDocumentMathJaxRenderer(snapshots));
    expect(errors).not.toHaveBeenCalled();
    expect(view.dom.querySelectorAll('mjx-container > svg')).toHaveLength(4);
    expect(view.dom.querySelectorAll('svg path').length).toBeGreaterThan(50);
    expect(attributes(view.dom, 'data-equation-tags')).toEqual(['', '', '(1)', '(2)']);
    expect(attributes(view.dom, 'data-equation-references')).toEqual(['(1)', '(2)', '', '']);
    const links = [...view.dom.querySelectorAll('a')];
    expect(links).toHaveLength(2);
    links.forEach(link => {
      const target = document.getElementById(decodeURIComponent(link.getAttribute('href')!.slice(1)));
      expect(target).not.toBeNull();
      expect(view.dom.contains(target)).toBe(true);
    });
    const ids = [...view.dom.querySelectorAll('[id]')].map(node => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(snapshots).toHaveBeenCalledTimes(1);
    expect(snapshots).toHaveBeenLastCalledWith({ equationCount: 4, diagnostics: [] });
    expect(editor.state.doc.content.filter(node => node.type.name === 'math_block').map(node => node.attrs.latex)).toEqual(mathReferenceSamples.slice(1).map(sample => sample.source));
  });

  it('refreshes real SVG labels/references after moving/deleting equations and restores them on undo', () => {
    const snapshots = vi.fn();
    const { editor, view, errors } = setup(undefined, createDocumentMathJaxRenderer(snapshots));
    moveNode(editor, { fromPath: [2], toParentPath: [], toIndex: 1 });
    expect(attributes(view.dom, 'data-equation-references')).toEqual(['(2)', '(1)', '', '']);
    editor.dispatch(editor.state.createTransaction().replaceNode([2]));
    expect(attributes(view.dom, 'data-equation-references')).toEqual(['(???)', '(1)', '']);
    expect(view.dom.querySelector('a:not([href])')?.getAttribute('aria-label')).toBe('Unresolved equation reference');
    expect(snapshots.mock.lastCall?.[0].diagnostics).toEqual([expect.objectContaining({ kind: 'unresolved-reference', path: [0, 0] })]);
    undo(editor);
    expect(attributes(view.dom, 'data-equation-references')).toEqual(['(2)', '(1)', '', '']);
    expect(snapshots.mock.lastCall?.[0].diagnostics).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
  });

  it('namespaces independent views even when they share the same renderer', () => {
    const shared = createDocumentMathJaxRenderer();
    const first = setup(undefined, shared);
    const second = setup(undefined, shared);
    const allIDs = [...document.querySelectorAll('[id]')].map(node => node.id);
    expect(new Set(allIDs).size).toBe(allIDs.length);
    for (const view of [first.view, second.view]) for (const link of view.dom.querySelectorAll('a')) {
      expect(view.dom.contains(document.getElementById(decodeURIComponent(link.getAttribute('href')!.slice(1))))).toBe(true);
    }
  });

  it('reports duplicate labels, replaces stale SVG with source, and recovers after correction', () => {
    const snapshots = vi.fn();
    const { editor, view, errors } = setup(undefined, createDocumentMathJaxRenderer(snapshots));
    setMathSource(editor, mathReferenceSamples[1].source, '', [2]);
    expect(errors).toHaveBeenCalled();
    expect(view.dom.querySelectorAll('svg')).toHaveLength(0);
    expect(view.dom.querySelectorAll('[data-fountain-math-error]')).toHaveLength(4);
    expect(snapshots.mock.lastCall?.[0].diagnostics[0]).toMatchObject({ kind: 'compilation-error', path: [2], message: expect.stringMatching(/multiply defined|duplicate/i) });
    setMathSource(editor, mathReferenceSamples[2].source, '', [2]);
    expect(view.dom.querySelectorAll('mjx-container > svg')).toHaveLength(4);
    expect(view.dom.querySelector('[data-fountain-math-error]')).toBeNull();
  });

  it.each([String.raw`\input{secret}`, String.raw`\require{html}`, String.raw`\href{https://example.invalid}{x}`, String.raw`\frac{1}`])('rejects unsupported source without loading packages: %s', source => {
    const loader = vi.fn();
    const previous = mathjax.asyncLoad;
    mathjax.asyncLoad = loader;
    try {
      const { view, errors } = setup([{ type: 'math_block', attrs: { latex: source } }]);
      expect(errors).toHaveBeenCalled();
      expect(view.dom.querySelector('svg')).toBeNull();
      expect(loader).not.toHaveBeenCalled();
    } finally { mathjax.asyncLoad = previous; }
  });

  it('uses locally bundled math glyph families without touching a global loader', () => {
    const loader = vi.fn();
    const previous = mathjax.asyncLoad;
    mathjax.asyncLoad = loader;
    try {
      const { view, errors } = setup([{ type: 'math_block', attrs: { latex: String.raw`\mathcal{ABC}+\mathfrak{XYZ}+\mathbb{R}` } }]);
      expect(errors).not.toHaveBeenCalled();
      expect(view.dom.querySelectorAll('svg path').length).toBeGreaterThan(5);
      expect(loader).not.toHaveBeenCalled();
    } finally { mathjax.asyncLoad = previous; }
  });

  it('enforces a snapshot resource bound before typesetting', () => {
    const { view, errors } = setup(Array.from({ length: 129 }, () => ({ type: 'math_block', attrs: { latex: 'x' } })));
    expect(errors.mock.calls[0][0].message).toContain('at most 128');
    expect(view.dom.querySelector('svg')).toBeNull();
  });

  it('numbers distinct occurrences of the same immutable node independently', () => {
    const { editor, view, errors } = setup();
    const repeated = editor.state.schema.node('math_block', { latex: String.raw`\begin{equation}a=b\end{equation}` });
    editor.dispatch(editor.state.createTransaction().replace(0, editor.state.doc.childCount, [repeated, repeated]));
    expect(attributes(view.dom, 'data-equation-tags')).toEqual(['(1)', '(2)']);
    const ids = [...view.dom.querySelectorAll('[id]')].map(node => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(errors).not.toHaveBeenCalled();
  });

  it('discloses system-font fallback instead of asserting glyph/export fidelity', () => {
    const snapshots = vi.fn();
    const { errors } = setup([{ type: 'math_block', attrs: { latex: String.raw`\text{😀}` } }], createDocumentMathJaxRenderer(snapshots));
    expect(errors).not.toHaveBeenCalled();
    expect(snapshots.mock.lastCall?.[0].diagnostics).toEqual([expect.objectContaining({ kind: 'font-fallback', path: [0] })]);
  });
});
