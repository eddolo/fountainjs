/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import type { MmlNode } from '@mathjax/src/js/core/MmlTree/MmlNode.js';
import {
  EditorView, StarterKit, composeExtensions, createEditor, createMathExtension,
  moveNode, setMathSource, undo, redo, NodeSelection, Selection,
  type MathDocumentRenderContext, type Node,
} from '../src';
import { mathReferenceSamples } from '../examples/react-app/src/math-reference-samples';

RegisterHTMLHandler(liteAdaptor());
const views: EditorView[] = [];
afterEach(() => { views.splice(0).forEach(view => view.destroy()); document.body.replaceChildren(); });
const text = (node: MmlNode): string => node.kind === 'text'
  ? (node as MmlNode & { getText(): string }).getText() : node.childNodes.map(text).join('');

/** Real reference compilation, deliberately NOT a typesetting/visual-fidelity test. */
function semanticRenderer() {
  const snapshots = new WeakMap<object, { document: Node; values: Map<Node, string>; error?: unknown }>();
  const compile = vi.fn((documentNode: Node) => {
    const nodes: Node[] = [];
    const visit = (node: Node) => {
      if (['inline_math', 'math_block'].includes(node.type.name)) nodes.push(node);
      node.content.forEach(visit);
    };
    visit(documentNode);
    const tex = new TeX({ packages: ['base', 'ams'], tags: 'ams', maxBuffer: 20_000, maxMacros: 1000,
      formatError(_jax: unknown, error: Error) { throw new Error(error.message); } });
    const compiled = mathjax.document('', { InputJax: tex,
      compileError(_document: unknown, _math: unknown, error: unknown) { throw error; } });
    nodes.forEach(node => compiled.math.push(new compiled.options.MathItem(String(node.attrs.latex), tex, node.type.name === 'math_block')));
    compiled.compile();
    return new Map([...compiled.math].map((item, index) => {
      const parts: string[] = [];
      item.root.walkTree(node => {
        if (node.kind === 'mlabeledtr') parts.push(`tag:${text(node.childNodes[0])}`);
        if (node.attributes?.get('class') === 'MathJax_ref') parts.push(`ref:${text(node)}`);
      });
      return [nodes[index], parts.join(' ')];
    }));
  });
  const renderer = vi.fn((source: string, context: MathDocumentRenderContext) => {
    let snapshot = snapshots.get(context.scope);
    if (snapshot?.document !== context.modelDocument) {
      snapshot = { document: context.modelDocument, values: new Map() };
      snapshots.set(context.scope, snapshot);
      try { snapshot.values = compile(context.modelDocument); }
      catch (error) { snapshot.error = error; }
    }
    if (snapshot.error) throw snapshot.error;
    expect(Object.isFrozen(context.path)).toBe(true);
    expect(context.path.reduce((node, index) => node.child(index), context.modelDocument)).toBe(context.node);
    expect(source).toBe(context.node.attrs.latex);
    const dom = context.document.createElement('span');
    dom.dataset.referenceSemantics = '';
    dom.textContent = snapshot.values.get(context.node) ?? '';
    return dom;
  });
  return { renderer, compile };
}

function setup(renderer = semanticRenderer(), onRenderError = vi.fn()) {
  const kit = composeExtensions([...StarterKit.extensions, createMathExtension({ documentRenderer: renderer.renderer, onRenderError })]);
  const editor = createEditor({ schema: kit.schema, plugins: kit.plugins, content: {
    type: 'doc', content: [
      { type: 'paragraph', content: [
        { type: 'inline_math', attrs: { latex: String.raw`\eqref{eq:dNFE}` } },
        { type: 'text', text: ' and ' },
        { type: 'inline_math', attrs: { latex: String.raw`\eqref{eq:dSNFE}` } },
      ] },
      ...mathReferenceSamples.slice(1).map(sample => ({ type: 'math_block', attrs: { latex: sample.source } })),
    ],
  } });
  const mount = document.createElement('div');
  document.body.append(mount);
  const view = new EditorView(mount, editor);
  views.push(view);
  return { ...renderer, editor, view, onRenderError };
}

const semantics = (view: EditorView) => [...view.dom.querySelectorAll('[data-reference-semantics]')].map(element => element.textContent);

describe('document-aware math view context', () => {
  it('compiles unchanged published source and forward references once per snapshot, including reorder/undo/redo', () => {
    const { editor, view, compile, onRenderError } = setup();
    expect(semantics(view)).toEqual(['ref:(1)', 'ref:(2)', 'tag:(1)', 'tag:(2)']);
    expect(compile).toHaveBeenCalledTimes(1);
    const referenceDOM = view.dom.querySelector('[data-fountain-math="inline"]');
    const original = editor.state.doc.toJSON();
    expect(moveNode(editor, { fromPath: [2], toParentPath: [], toIndex: 1 })).toBe(true);
    expect(view.dom.querySelector('[data-fountain-math="inline"]')).toBe(referenceDOM);
    expect(semantics(view)).toEqual(['ref:(2)', 'ref:(1)', 'tag:(1)', 'tag:(2)']);
    expect(compile).toHaveBeenCalledTimes(2);
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.toJSON()).toEqual(original);
    expect(semantics(view)).toEqual(['ref:(1)', 'ref:(2)', 'tag:(1)', 'tag:(2)']);
    expect(redo(editor)).toBe(true);
    expect(semantics(view)).toEqual(['ref:(2)', 'ref:(1)', 'tag:(1)', 'tag:(2)']);
    expect(compile).toHaveBeenCalledTimes(4);
    expect(onRenderError).not.toHaveBeenCalled();
  });

  it('refreshes references after deletion, restores them on undo, and does not compile for selection-only changes', () => {
    const { editor, view, compile } = setup();
    editor.dispatch(editor.state.createTransaction().setSelection(new NodeSelection(editor.state.doc, [1])));
    editor.dispatch(editor.state.createTransaction().setSelection(Selection.cursor([0, 1], 2)));
    expect(compile).toHaveBeenCalledTimes(1);
    editor.dispatch(editor.state.createTransaction().replaceNode([1]));
    expect(semantics(view)).toEqual(['ref:(???)', 'ref:(1)', 'tag:(1)']);
    expect(undo(editor)).toBe(true);
    expect(semantics(view)).toEqual(['ref:(1)', 'ref:(2)', 'tag:(1)', 'tag:(2)']);
  });

  it('isolates cache/label scopes across editors using the same renderer', () => {
    const shared = semanticRenderer();
    const first = setup(shared);
    const second = setup(shared);
    expect(shared.compile).toHaveBeenCalledTimes(2);
    const scopes = new Set(shared.renderer.mock.calls.map(([, context]) => context.scope));
    expect(scopes.size).toBe(2);
    first.editor.dispatch(first.editor.state.createTransaction().replaceNode([1]));
    expect(semantics(second.view)).toEqual(['ref:(1)', 'ref:(2)', 'tag:(1)', 'tag:(2)']);
    expect(semantics(first.view)).toEqual(['ref:(???)', 'ref:(1)', 'tag:(1)']);
  });

  it('keeps source editable through renderer errors and restores every dependent view on correction', () => {
    const { editor, view, compile, onRenderError } = setup();
    const original = String(editor.state.doc.child(1).attrs.latex);
    setMathSource(editor, String.raw`\input{private-file}`, '', [1]);
    expect(onRenderError).toHaveBeenCalled();
    expect(view.dom.querySelectorAll('[data-fountain-math-error="true"]')).toHaveLength(4);
    expect(view.dom.querySelectorAll('[data-fountain-math="block"]')[0].textContent).toContain(String.raw`\input{private-file}`);
    expect(compile).toHaveBeenCalledTimes(2);
    setMathSource(editor, original, '', [1]);
    expect(view.dom.querySelector('[data-fountain-math-error]')).toBeNull();
    expect(semantics(view)).toEqual(['ref:(1)', 'ref:(2)', 'tag:(1)', 'tag:(2)']);
    expect(compile).toHaveBeenCalledTimes(3);
  });

  it('preserves the active multiline source control and caret when another equation changes', () => {
    const { editor, view } = setup();
    editor.dispatch(editor.state.createTransaction().setSelection(new NodeSelection(editor.state.doc, [2])));
    const control = view.dom.querySelectorAll<HTMLTextAreaElement>('textarea')[3];
    control.focus();
    control.setSelectionRange(16, 24, 'backward');
    const value = control.value;
    setMathSource(editor, String.raw`\begin{equation}\label{eq:dNFE}a=b\end{equation}`, '', [1]);
    expect(document.activeElement).toBe(control);
    expect(control.value).toBe(value);
    expect([control.selectionStart, control.selectionEnd, control.selectionDirection]).toEqual([16, 24, 'backward']);
  });

  it('rejects ambiguous renderer configuration without silently choosing one', () => {
    expect(() => createMathExtension({ renderer: () => document.createElement('span'), documentRenderer: semanticRenderer().renderer })).toThrow('not both');
  });
});
