// Optional host integration. MathJax never enters Fountain's runtime dependency graph.
import { TeX } from '@mathjax/src/js/input/tex.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import type { SvgFontData } from '@mathjax/src/js/output/svg/FontData.js';
import { HTMLAdaptor } from '@mathjax/src/js/adaptors/HTMLAdaptor.js';
import type { browserAdaptor } from '@mathjax/src/js/adaptors/browserAdaptor.js';
import { HTMLHandler } from '@mathjax/src/js/handlers/html/HTMLHandler.js';
import type { MmlNode } from '@mathjax/src/js/core/MmlTree/MmlNode.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import { localMathFont } from './mathjax-local-font';
import type { MathDocumentRenderer, MathDocumentRenderContext, Node } from 'fountainjs-editor';

export interface EquationDiagnostic {
  readonly path: readonly number[];
  readonly kind: 'unresolved-reference' | 'compilation-error' | 'font-fallback';
  readonly message: string;
}
export interface EquationSnapshot {
  readonly equationCount: number;
  readonly diagnostics: readonly EquationDiagnostic[];
}

let nextScope = 0;
class EquationRenderError extends Error {
  constructor(message: string, readonly path: readonly number[]) { super(message); }
}
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const plainText = (node: MmlNode): string => node.kind === 'text'
  ? (node as MmlNode & { getText(): string }).getText() : node.childNodes.map(plainText).join('');

/**
 * Bounded synchronous SVG adapter for this capability lab, not a TeX document
 * compiler. Uses a private handler and locally preloaded SVG glyphs; no global
 * MathJax loader, HTML injection, package autoloading, or code execution.
 */
export function createDocumentMathJaxRenderer(
  onSnapshot: (snapshot: EquationSnapshot) => void = () => {},
  font: SvgFontData = localMathFont(),
): MathDocumentRenderer {
  const scopes = new WeakMap<object, { prefix: string; document?: Node; outputs: Map<string, HTMLElement>; error?: Error }>();
  return (_source, context) => {
    let scope = scopes.get(context.scope);
    if (!scope) {
      scope = { prefix: `fountain-mjx-${++nextScope}-`, outputs: new Map() };
      scopes.set(context.scope, scope);
    }
    if (scope.document !== context.modelDocument) {
      scope.document = context.modelDocument;
      scope.outputs = new Map();
      scope.error = undefined;
      try {
        const result = compileSnapshot(context, scope.prefix, font);
        scope.outputs = result.outputs;
        onSnapshot(result.snapshot);
      } catch (error) {
        // Never keep a successful previous snapshot behind a broken new source.
        scope.error = error instanceof Error ? error : new Error(String(error));
        onSnapshot({ equationCount: 0, diagnostics: [{ path: error instanceof EquationRenderError ? error.path : context.path, kind: 'compilation-error', message: scope.error.message }] });
      }
    }
    if (scope.error) throw scope.error;
    const output = scope.outputs.get(context.path.join('.'));
    if (!output) throw new Error('Math node is missing from the compiled snapshot.');
    return output.cloneNode(true);
  };
}

function compileSnapshot(context: MathDocumentRenderContext, prefix: string, font: SvgFontData) {
  const owner = context.document;
  if (!owner.defaultView) throw new Error('MathJax SVG rendering requires a browser document.');
  const entries: { node: Node; path: readonly number[] }[] = [];
  let sourceLength = 0;
  context.modelDocument.descendants((node, path) => {
    if (!['math_block', 'inline_math'].includes(node.type.name)) return true;
    entries.push({ node, path: [...path] });
    sourceLength += String(node.attrs.latex).length;
    if (entries.length > 128 || sourceLength > 128_000) throw new Error('This lab supports at most 128 formulas and 128,000 TeX source characters per snapshot.');
    return false;
  });
  // MathJax's minimal DOM declarations omit native DOM nullability; use its
  // own browserAdaptor return contract while selecting the correct window.
  const BrowserDOMAdaptor = HTMLAdaptor as unknown as { new(window: Window): ReturnType<typeof browserAdaptor> };
  const adaptor = new BrowserDOMAdaptor(owner.defaultView);
  const tex = new TeX({ packages: ['base', 'ams'], tags: 'ams', maxBuffer: 20_000, maxMacros: 1000,
    formatError(_jax: unknown, error: Error) { throw new Error(error.message); } });
  const svg = new SVG<HTMLElement, Text, Document>({ fontCache: 'none', fontData: font });
  const paths = new Map<unknown, readonly number[]>();
  const document = new HTMLHandler<HTMLElement, Text, Document>(adaptor).create('', {
    InputJax: tex, OutputJax: svg,
    compileError(_document: unknown, math: unknown, error: unknown) { throw new EquationRenderError(errorMessage(error), paths.get(math) ?? []); },
    typesetError(_document: unknown, math: unknown, error: unknown) { throw new EquationRenderError(errorMessage(error), paths.get(math) ?? []); },
  });
  for (const { node, path } of entries) {
    const item = new document.options.MathItem(String(node.attrs.latex), tex, node.type.name === 'math_block');
    // Fixed lab measure, matching its content width. Long formulas scroll on
    // narrower surfaces; this is not paper/page-layout measurement.
    item.setMetrics(16, 8, 960, 1);
    paths.set(item, path);
    document.math.push(item);
  }
  document.compile(); // Includes the forward-reference second pass.
  const diagnostics: EquationDiagnostic[] = [];
  const items = [...document.math];
  items.forEach((item, index) => item.root.walkTree(node => {
    if (node.kind === 'merror') throw new Error('MathJax reported a formula error.');
    if (node.attributes?.get('class') === 'MathJax_ref' && node.attributes.get('href') === '#') {
      diagnostics.push({ path: entries[index].path, kind: 'unresolved-reference', message: `Unresolved equation reference: ${String(entries[index].node.attrs.latex)}` });
    }
  }));
  document.typeset();
  const stylesheet = svg.styleSheet(document);
  stylesheet.removeAttribute('id');
  const outputs = new Map<string, HTMLElement>();
  items.forEach((item, index) => {
    const result = owner.createElement(entries[index].node.type.name === 'math_block' ? 'div' : 'span');
    result.dataset.documentMathjax = '';
    const rendered = item.typesetRoot;
    if (rendered.querySelector('[data-mjx-error], .mjx-output-error')) throw new Error('MathJax reported a typesetting error.');
    const fallbackText = [...rendered.querySelectorAll('text')].map(node => node.textContent).join('');
    if (fallbackText) diagnostics.push({
      path: entries[index].path, kind: 'font-fallback',
      message: `System-font glyph fallback ${JSON.stringify(fallbackText.slice(0, 80))}; font metrics and export appearance are not verified.`,
    });
    // Source labels remain exact. Only derived DOM anchors get a per-view namespace.
    rendered.querySelectorAll<HTMLElement>('[id]').forEach(element => { element.id = prefix + element.id; });
    rendered.querySelectorAll<SVGAElement>('a').forEach(anchor => {
      const href = anchor.getAttribute('href') ?? anchor.getAttribute('xlink:href');
      if (!href || href === '#') {
        anchor.removeAttribute('href');
        anchor.removeAttribute('xlink:href');
        anchor.setAttribute('aria-label', 'Unresolved equation reference');
      } else if (href.startsWith('#')) {
        const target = decodeURIComponent(href.slice(1));
        anchor.setAttribute('href', `#${encodeURIComponent(prefix + target)}`);
        anchor.removeAttribute('xlink:href');
      } else throw new Error('External math links are not permitted by this renderer.');
    });
    result.append(stylesheet.cloneNode(true), rendered);
    // Tags/reference text aid diagnostics and accessibility; visible math is SVG.
    const tags: string[] = [];
    const refs: string[] = [];
    item.root.walkTree(node => {
      if (node.kind === 'mlabeledtr') tags.push(plainText(node.childNodes[0]));
      if (node.attributes?.get('class') === 'MathJax_ref') refs.push(plainText(node));
    });
    result.dataset.equationTags = tags.join(',');
    result.dataset.equationReferences = refs.join(',');
    // Immutable nodes can legitimately occur at multiple positions; numbering
    // belongs to an occurrence, not JavaScript object identity.
    outputs.set(entries[index].path.join('.'), result);
  });
  return { outputs, snapshot: { equationCount: entries.length, diagnostics } };
}
