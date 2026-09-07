// Optional host adapter. MathJax stays outside Fountain's npm runtime graph.
import { TeX } from '@mathjax/src/js/input/tex.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { HTMLHandler } from '@mathjax/src/js/handlers/html/HTMLHandler.js';
import type { MmlNode } from '@mathjax/src/js/core/MmlTree/MmlNode.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import type { DOCXMathExpression } from 'fountainjs-editor/docx';

const variants = { normal: 'plain', italic: 'italic', bold: 'bold', 'bold-italic': 'bold-italic' } as const;
const accents: Record<string, string> = { '^': '\u0302', '~': '\u0303', '˙': '\u0307', '¨': '\u0308', '´': '\u0301', '`': '\u0300', 'ˇ': '\u030c', '˘': '\u0306', '→': '\u20d7' };
const operators = new Set(['∑', '∏', '∐', '∫', '∬', '∭', '∮', '⋃', '⋂']);
const textOf = (node: MmlNode): string => node.kind === 'text'
  ? (node as MmlNode & { getText(): string }).getText() : node.childNodes.map(textOf).join('');

/**
 * Parses one independent formula with base/AMS TeX, then projects a strict
 * subset to native Word math. Throws on unsupported constructs; exportDOCX's
 * resolveMath boundary reports that failure and retains the original TeX.
 * This is not a document compiler, source restorer or Word fidelity certificate.
 */
export function compileTeXForDOCX(source: string, display = true): DOCXMathExpression {
  if (typeof source !== 'string' || source.length > 20_000) throw new Error('DOCX TeX source exceeds the 20,000 character limit.');
  const tex = new TeX({ packages: ['base', 'ams'], tags: 'ams', maxBuffer: 20_000, maxMacros: 1000,
    formatError(_jax: unknown, error: Error) { throw new Error(error.message); } });
  // Private handler and fresh parser. MathJax's own lightweight tree adaptor
  // requires no browser globals/jsdom, font loader or shared macro/label state.
  const document = new HTMLHandler(liteAdaptor()).create('', {
    InputJax: tex, compileError(_doc: unknown, _math: unknown, error: unknown) { throw error; },
  });
  const item = new document.options.MathItem(source, tex, display);
  document.math.push(item);
  document.compile();
  if (Object.keys(tex.parseOptions.tags.allLabels).length || Object.keys(tex.parseOptions.tags.allIds).length) {
    throw new Error('DOCX equation labels and numbering require a document-level reference adapter.');
  }
  // Check the entire presentation tree, including wrappers/tokens that the
  // projection consumes directly (matrix cells, delimiters, operator limits).
  // Do this iteratively before recursive projection or text collection.
  const pending = [{ node: item.root as MmlNode, depth: 0 }];
  let visited = 0;
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (++visited > 10_000 || depth > 64) throw new Error('DOCX parsed math exceeds its node/depth limit.');
    for (const child of node.childNodes) pending.push({ node: child, depth: depth + 1 });
  }
  const fail = (node: MmlNode, reason: string): never => { throw new Error(`Unsupported DOCX math ${node.kind}: ${reason}`); };
  const check = (node: MmlNode, extra: readonly string[] = []) => {
    for (const key of node.attributes?.getExplicitNames() ?? []) {
      if (key !== 'data-latex' && key !== 'mathvariant' && !extra.includes(key)) fail(node, `attribute ${key}`);
    }
    const variant = String(node.attributes?.get('mathvariant') ?? 'normal');
    if (!Object.hasOwn(variants, variant)) fail(node, `math variant ${variant}`);
  };
  const visit = (node: MmlNode, depth = 0): DOCXMathExpression => {
    const children = node.childNodes;
    const child = (index: number) => visit(children[index], depth + 1);
    const arity = (length: number) => { if (children.length !== length) fail(node, 'unexpected argument count'); };
    const row = (nodes: readonly MmlNode[]): DOCXMathExpression => {
      const content: DOCXMathExpression[] = [];
      for (let i = 0; i < nodes.length; i++) {
        const candidate = nodes[i];
        const base = candidate.childNodes[0];
        if (['msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover'].includes(candidate.kind) && base?.kind === 'mo' && operators.has(textOf(base))) {
          // TeX has a presentation tree, not an unambiguous semantic scope for
          // every operator. Accept one following parsed atom/group only; do not
          // guess how a longer ungrouped sum/integral body should be associated.
          if (i !== nodes.length - 2) fail(candidate, 'large operator requires one following atom or braced group');
          check(candidate); check(base, ['movablelimits']);
          if (base.attributes.get('mathvariant') !== 'normal') fail(base, 'styled large operator');
          const both = ['msubsup', 'munderover'].includes(candidate.kind);
          const onlyUpper = ['msup', 'mover'].includes(candidate.kind);
          if (candidate.childNodes.length !== (both ? 3 : 2)) fail(candidate, 'unexpected limit arguments');
          const above = ['munder', 'mover', 'munderover'].includes(candidate.kind)
            && (display || !base.attributes.get('movablelimits'));
          content.push({ type: 'nary', symbol: textOf(base), body: visit(nodes[++i], depth + 1),
            ...(!onlyUpper ? { sub: visit(candidate.childNodes[1], depth + 1) } : {}),
            ...(both || onlyUpper ? { sup: visit(candidate.childNodes[both ? 2 : 1], depth + 1) } : {}),
            limits: above ? 'above-below' : 'beside' });
        } else content.push(visit(candidate, depth + 1));
      }
      return { type: 'row', content };
    };
    switch (node.kind) {
      case 'math': check(node, ['display']); return row(children);
      case 'inferredMrow': case 'TeXAtom':
        check(node);
        if (node.kind === 'TeXAtom' && node.getProperty('texClass') !== 0) fail(node, 'custom atom class');
        return row(children);
      case 'mrow': {
        check(node);
        const open = node.getProperty('open'); const close = node.getProperty('close');
        if (open !== undefined || close !== undefined) {
          if (typeof open !== 'string' || typeof close !== 'string' || children.length < 2 || textOf(children[0]) !== open || textOf(children.at(-1)!) !== close) fail(node, 'ambiguous delimiters');
          check(children[0]); check(children.at(-1)!);
          if (children[0].attributes.get('mathvariant') !== 'normal' || children.at(-1)!.attributes.get('mathvariant') !== 'normal') fail(node, 'styled delimiters');
          return { type: 'delimiter', open: open as string, close: close as string, body: row(children.slice(1, -1)) };
        }
        return row(children);
      }
      case 'mi': case 'mn': case 'mo': case 'mtext':
        check(node);
        if (children.some(child => child.kind !== 'text')) fail(node, 'non-text token content');
        if (node.kind === 'mo' && operators.has(textOf(node))) fail(node, 'ungrouped large operator');
        return { type: 'text', value: textOf(node), style: variants[String(node.attributes.get('mathvariant') ?? 'normal') as keyof typeof variants] };
      case 'mfrac': {
        check(node, ['linethickness']); arity(2);
        const thickness = node.attributes.getExplicit('linethickness');
        if (thickness !== undefined && thickness !== 0 && thickness !== '0') fail(node, 'custom fraction thickness');
        return { type: 'fraction', numerator: child(0), denominator: child(1), ...(thickness !== undefined ? { bar: false } : {}) };
      }
      case 'msqrt': check(node); return { type: 'radical', body: row(children) };
      case 'mroot': check(node); arity(2); return { type: 'radical', body: child(0), degree: child(1) };
      case 'msub': case 'msup': case 'msubsup':
        check(node); arity(node.kind === 'msubsup' ? 3 : 2);
        return { type: 'script', base: child(0), ...(node.kind !== 'msup' ? { sub: child(1) } : {}), ...(node.kind !== 'msub' ? { sup: child(node.kind === 'msubsup' ? 2 : 1) } : {}) };
      case 'mover': {
        check(node); arity(2);
        const accent = children[1];
        check(accent, ['stretchy']);
        const character = accents[textOf(accent)];
        if (!accent.getProperty('mathaccent') || !character || accent.attributes.get('stretchy') !== false) fail(node, 'unsupported over-script or stretching accent');
        return { type: 'accent', body: child(0), character };
      }
      case 'mtable': {
        check(node, ['columnspacing', 'rowspacing']);
        if (node.attributes.getExplicit('columnspacing') !== '1em' || node.attributes.getExplicit('rowspacing') !== '4pt') fail(node, 'custom table layout');
        if (!children.length || children.length > 100) fail(node, 'matrix row limit');
        const rows = children.map(tr => {
          check(tr);
          if (tr.kind !== 'mtr' || !tr.childNodes.length || tr.childNodes.length > 100) fail(tr, 'unsupported matrix row');
          return tr.childNodes.map(td => { check(td); if (td.kind !== 'mtd') fail(td, 'unsupported matrix cell'); return row(td.childNodes); });
        });
        if (rows.some(cells => cells.length !== rows[0].length)) fail(node, 'nonrectangular matrix');
        return { type: 'matrix', rows };
      }
      default: return fail(node, 'no lossless projection is implemented');
    }
  };
  return visit(item.root);
}
