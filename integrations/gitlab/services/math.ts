import { MAX_MATH_SOURCE_LENGTH, MathExtension, type Node, type NodeSpec, type SchemaSpec } from 'fountainjs-editor';
import type { DefaultTreeAdapterMap } from 'parse5';
import type { GitLabMarkdownIssue } from './markdown_codec';

type Element = DefaultTreeAdapterMap['element'];
type RawNode = DefaultTreeAdapterMap['node'];
const attr = (element: Element, name: string) => element.attrs.find(item => item.name === name)?.value;
const classes = (element: Element) => (attr(element, 'class') ?? '').split(/\s+/u);

export function gitlabMathNodes(base: SchemaSpec): Record<string, NodeSpec> {
  return Object.fromEntries(['inline_math', 'math_block'].map(name => {
    const spec = base.nodes[name] ?? MathExtension.nodes![name]!;
    if (!spec.attrs?.latex) throw new TypeError('The GitLab math adapter requires native TeX source attributes.');
    const block = name === 'math_block';
    return [name, { ...spec, attrs: { ...spec.attrs, gitlabMathSyntax: {
      default: block ? 'fenced' : 'dollar', validate: (value: unknown) => typeof value === 'string'
        && (block ? ['fenced'] : ['dollar', 'legacy', 'display']).includes(value),
    } }, parseHTML: [{ tag: `[data-fountain-gitlab-math="${block ? 'block' : 'inline'}"]`, priority: 300,
      getAttrs: element => ({ latex: element.getAttribute('data-latex') ?? '',
        ariaLabel: element.getAttribute('data-math-aria-label') ?? '',
        gitlabMathSyntax: element.getAttribute('data-gitlab-math-syntax') }) }, ...(spec.parseHTML ?? [])] } satisfies NodeSpec];
  }));
}

/** Replace renderer-owned glyph/chrome trees with explicit, bounded TeX carriers. */
export function normalizeGitLabMath(elements: readonly Element[]): { handled: Set<Element>; issues: GitLabMarkdownIssue[] } {
  const handled = new Set<Element>(), issues: GitLabMarkdownIssue[] = [];
  for (const element of elements) {
    if (handled.has(element)) continue;
    const names = classes(element), style = attr(element, 'data-math-style');
    const renderedRoot = names.includes('katex') || names.includes('katex-display');
    if (style === undefined && !renderedRoot && !names.includes('js-render-math') && !names.includes('katex-error')) continue;
    const block = element.tagName === 'pre' && style === 'display' && attr(element, 'data-canonical-lang') === 'math';
    const raw = (element.tagName === 'span' && ['inline', 'display'].includes(style ?? ''))
      || element.tagName === 'code' && style === 'inline'
      || element.tagName === 'div' && style === 'inline' && names.includes('math-content-inline') || block;
    const descendants: RawNode[] = [], stack: RawNode[] = [element];
    while (stack.length) {
      const node = stack.pop()!; descendants.push(node);
      if ('childNodes' in node) for (let index = node.childNodes.length - 1; index >= 0; index--) stack.push(node.childNodes[index]!);
    }
    const annotations = descendants.filter((node): node is Element => 'tagName' in node && node.tagName === 'annotation'
      && attr(node, 'encoding') === 'application/x-tex');
    const rendered = renderedRoot || annotations.length > 0 || descendants.some(node => 'tagName' in node && classes(node).includes('katex'));
    const textOf = (root: RawNode): string => {
      let text = ''; const pending = [root];
      while (pending.length) {
        const node = pending.pop()!;
        if ('value' in node) text += node.value;
        if ('childNodes' in node) for (let index = node.childNodes.length - 1; index >= 0; index--) pending.push(node.childNodes[index]!);
      }
      return text;
    };
    const latex = textOf(rendered && annotations.length === 1 ? annotations[0]! : element);
    const valid = (rendered ? (raw || renderedRoot && element.tagName === 'span') && annotations.length === 1 : raw)
      && latex.trim().length > 0 && latex.length <= MAX_MATH_SOURCE_LENGTH && !latex.includes('\0');
    if (!valid || !rendered && attr(element, 'style')) {
      issues.push({ stage: 'import', code: 'math-source', message: 'Math requires an unambiguous bounded TeX source and a supported GitLab math carrier.' });
      for (const node of descendants) if ('tagName' in node) handled.add(node);
      continue;
    }
    if (block) {
      const wrapper = element.parentNode;
      if (wrapper && 'tagName' in wrapper && classes(wrapper).includes('js-markdown-code')) {
        const owned = wrapper.childNodes.every(child => child === element || 'value' in child && !child.value.trim()
          || 'tagName' in child && ['copy-code', 'insert-code-snippet'].includes(child.tagName));
        if (!owned || !wrapper.parentNode) {
          issues.push({ stage: 'import', code: 'math-source', message: 'A math code wrapper contains additional unmapped content.' }); continue;
        }
        const parent = wrapper.parentNode;
        parent.childNodes = parent.childNodes.map(child => child === wrapper ? element : child);
        element.parentNode = parent;
        handled.add(wrapper);
      }
    }
    const ariaLabel = attr(element, 'aria-label') ?? '';
    const syntax = block ? 'fenced' : element.tagName === 'code' ? 'legacy'
      : style === 'display' || names.includes('katex-display') ? 'display' : style === 'inline' ? 'dollar' : rendered ? 'legacy' : 'dollar';
    for (const node of descendants) if ('tagName' in node) handled.add(node);
    element.tagName = element.nodeName = block ? 'div' : 'span';
    element.attrs = [
      { name: 'data-fountain-gitlab-math', value: block ? 'block' : 'inline' },
      { name: 'data-latex', value: latex }, { name: 'data-gitlab-math-syntax', value: syntax },
      { name: 'data-math-aria-label', value: ariaLabel },
    ];
    element.childNodes = [];
  }
  return { handled, issues };
}

function hasUnescapedDelimiter(source: string, delimiter: string): boolean {
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\\') { index++; continue; }
    if (source.startsWith(delimiter, index)) return true;
  }
  return false;
}

export function serializeGitLabMath(node: Node, next: Node | undefined, path: number[], issues: GitLabMarkdownIssue[]): string {
  const latex = String(node.attrs.latex ?? '');
  if (node.attrs.ariaLabel || node.attrs.expression || node.attrs.layout) issues.push({ stage: 'export', code: 'math-metadata', path,
    message: 'Additional math accessibility/semantic/layout metadata needs a retained GitLab representation.' });
  if (node.type.name === 'math_block') {
    const runs = latex.match(/`+/gu) ?? [];
    const fence = '`'.repeat(Math.max(3, ...runs.map(run => run.length + 1)));
    return `${fence}math\n${latex}${latex.endsWith('\n') ? '' : '\n'}${fence}`;
  }
  const syntax = node.attrs.gitlabMathSyntax;
  // GitLab's own serializer uses legacy delimiters before an immediately following digit.
  const legacy = syntax === 'legacy' || syntax === 'dollar' && /^\d/u.test(next?.text ?? '');
  const closing = legacy ? '`$' : syntax === 'display' ? '$$' : '$';
  if (legacy ? latex.includes(closing) : hasUnescapedDelimiter(latex, closing)) {
    issues.push({ stage: 'export', code: 'math-delimiter', path, message: 'The edited TeX collides with its GitLab math delimiters; retain the document and choose another source form.' });
  }
  return legacy ? `$\`${latex}\`$` : syntax === 'display' ? `$$${latex}$$` : `$${latex}$`;
}
