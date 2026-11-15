import type { HTMLParseElement, NodeSpec } from 'fountainjs-editor';
import { footnoteReferenceNode, footnoteDefinitionNode } from 'fountainjs-editor/pages';

/** Authored labels stay separate from the engine's safe, opaque note IDs. */
export const validGitLabFootnoteLabel = (value: unknown): value is string => typeof value === 'string'
  && /^[^\[\]\u0000-\u0020\u007f]{1,4096}$/u.test(value);

export function gitLabFootnoteNodes(): Record<string, NodeSpec> {
  return Object.fromEntries([
    ['footnote_reference', footnoteReferenceNode, 'sup', 'data-fountain-footnote-reference'],
    ['footnote_definition', footnoteDefinitionNode, 'section', 'data-fountain-footnote-definition'],
  ].map(([name, node, tag, attribute]) => {
    const base = node as NodeSpec, attr = attribute as string;
    const rule = { tag: `${tag}[${attr}][data-gitlab-footnote-label]`, priority: 300, getAttrs: (element: Pick<HTMLParseElement, 'getAttribute'>) => {
      const label = element.getAttribute('data-gitlab-footnote-label');
      return validGitLabFootnoteLabel(label) ? { id: element.getAttribute(attr), gitlabFootnoteLabel: label } : false;
    } };
    return [name, { ...base, attrs: { ...base.attrs, gitlabFootnoteLabel: { default: undefined,
      validate: value => value === undefined || validGitLabFootnoteLabel(value) } },
    parseHTML: [rule, ...(base.parseHTML ?? []).map(original => ({ ...original, getAttrs: (element: HTMLParseElement) =>
      element.getAttribute('data-gitlab-footnote-label') !== null ? false : original.getAttrs?.(element) ?? null }))],
    parseDOM: [rule, ...(base.parseDOM ?? []).map(original => ({ ...original, getAttrs: (element: HTMLElement) =>
      element.getAttribute('data-gitlab-footnote-label') !== null ? false : original.getAttrs?.(element) ?? null }))],
    toDOM: (node, context) => {
      const output = base.toDOM!(node, context);
      if (!Array.isArray(output) || !output[1] || typeof output[1] !== 'object' || Array.isArray(output[1]))
        throw new Error('GITLAB_FOOTNOTE_NODE_RENDERER');
      return [output[0], { ...output[1], ...(node.attrs.gitlabFootnoteLabel === undefined ? {}
        : { 'data-gitlab-footnote-label': node.attrs.gitlabFootnoteLabel }) }, ...output.slice(2)] as typeof output;
    } } satisfies NodeSpec];
  }));
}
