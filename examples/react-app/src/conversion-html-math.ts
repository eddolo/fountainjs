import katex from 'katex';
import { parse, parseFragment, type DefaultTreeAdapterTypes as Tree } from 'parse5';
import type { Node } from 'fountainjs-editor';
import type { LabIssue } from './conversion-lab';

// Host-side reader projection. The library's portable HTML/source contract and
// its dependency graph remain unchanged. Patch only generated math interiors;
// serializing the whole HTML tree would rewrite unrelated source and metadata.
export function renderLabHTMLMath(html: string, document: Node): { html: string; issues: LabIssue[] } {
  const sources = new Map<string, Array<readonly number[]>>();
  document.descendants((node, path) => {
    const kind = node.type.name === 'math_block' ? 'block' : node.type.name === 'inline_math' ? 'inline' : undefined;
    if (!kind) return;
    const key = `${kind}\0${String(node.attrs.latex)}`;
    sources.set(key, [...(sources.get(key) ?? []), [...path]]);
  });
  if (!sources.size) return { html, issues: [] };
  const edits: Array<{ start: number; end: number; output: string }> = [];
  const issues: LabIssue[] = [];
  let count = 0, characters = 0;
  function visit(node: Tree.Node) {
    if ('tagName' in node) {
      const kind = node.attrs.find(attr => attr.name === 'data-fountain-math')?.value;
      const latex = node.attrs.find(attr => attr.name === 'data-latex')?.value;
      const paths = sources.get(`${kind}\0${latex}`);
      const path = paths?.shift();
      if (path && latex !== undefined) {
        count++; characters += latex.length;
        try {
          // Same bounded document-scale host policy as the equation lab.
          if (count > 128 || characters > 128_000) throw new Error('This export exceeds the lab’s 128-equation/128,000-source-character rendering limit.');
          let blocked = false;
          const output = katex.renderToString(latex, {
            output: 'mathml', displayMode: kind === 'block', throwOnError: true,
            strict: 'error', maxExpand: 1000, maxSize: 20, macros: {},
            trust: () => { blocked = true; return false; },
          });
          if (blocked) throw new Error('This equation requests an external resource, link or HTML command.');
          // Keep the generated projection inert even if a renderer changes.
          function inspect(part: Tree.Node) {
            if ('tagName' in part) {
              if (part.namespaceURI !== 'http://www.w3.org/1998/Math/MathML' && part.tagName !== 'span') throw new Error('Unexpected renderer markup.');
              if (part.attrs.some(attr => /^(?:on|href$|src$|style$)/i.test(attr.name))) throw new Error('Unexpected renderer attribute.');
            }
            if ('childNodes' in part) part.childNodes.forEach(inspect);
          }
          inspect(parseFragment(output));
          const location = node.sourceCodeLocation;
          if (!location?.startTag || !location.endTag) throw new Error('The equation’s export boundary is unavailable.');
          edits.push({ start: location.startTag.endOffset, end: location.endTag.startOffset, output });
        } catch (error) {
          issues.push({ code: 'html-math-source-fallback', path,
            message: `The equation remains as its original TeX source in HTML. ${error instanceof Error ? error.message : String(error)}` });
        }
      }
    }
    if ('childNodes' in node) node.childNodes.forEach(visit);
  }
  visit(parse(html, { sourceCodeLocationInfo: true }));
  for (const edit of edits.sort((a, b) => b.start - a.start)) html = html.slice(0, edit.start) + edit.output + html.slice(edit.end);
  if (edits.length) issues.unshift({ code: 'html-math-native-rendering',
    message: `${edits.length} equation(s) use offline native MathML. Original TeX is retained; browser typesetting can differ from the editor.` });
  return { html, issues };
}
