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
      return validGitLabFootnoteLabel(label) ? { id: element.getAttribute(attr), gitlabFootnoteLabel: label,
        ...(name === 'footnote_reference' ? { gitlabFootnoteOriginalLabel: element.getAttribute('data-gitlab-footnote-original-label') ?? label,
          gitlabFootnoteTargetLabel: element.getAttribute('data-gitlab-footnote-target-label') ?? label } : {}) } : false;
    } };
    return [name, { ...base, attrs: { ...base.attrs, ...Object.fromEntries(
      (name === 'footnote_reference' ? ['gitlabFootnoteLabel', 'gitlabFootnoteOriginalLabel', 'gitlabFootnoteTargetLabel'] : ['gitlabFootnoteLabel'])
        .map(key => [key, { default: undefined, validate: (value: unknown) => value === undefined || validGitLabFootnoteLabel(value) }])) },
    parseHTML: [rule, ...(base.parseHTML ?? []).map(original => ({ ...original, getAttrs: (element: HTMLParseElement) =>
      element.getAttribute('data-gitlab-footnote-label') !== null ? false : original.getAttrs?.(element) ?? null }))],
    parseDOM: [rule, ...(base.parseDOM ?? []).map(original => ({ ...original, getAttrs: (element: HTMLElement) =>
      element.getAttribute('data-gitlab-footnote-label') !== null ? false : original.getAttrs?.(element) ?? null }))],
    toDOM: (node, context) => {
      const output = base.toDOM!(node, context);
      if (!Array.isArray(output) || !output[1] || typeof output[1] !== 'object' || Array.isArray(output[1]))
        throw new Error('GITLAB_FOOTNOTE_NODE_RENDERER');
      const attrs: Record<string, unknown> = { ...output[1], ...(node.attrs.gitlabFootnoteLabel === undefined ? {}
        : { 'data-gitlab-footnote-label': node.attrs.gitlabFootnoteLabel }),
      ...(node.attrs.gitlabFootnoteOriginalLabel === undefined ? {} : { 'data-gitlab-footnote-original-label': node.attrs.gitlabFootnoteOriginalLabel }),
      ...(node.attrs.gitlabFootnoteTargetLabel === undefined ? {} : { 'data-gitlab-footnote-target-label': node.attrs.gitlabFootnoteTargetLabel }) };
      if (name === 'footnote_definition' && attrs['data-fountain-footnote-number'] === node.attrs.id && node.attrs.gitlabFootnoteLabel) {
        attrs['data-fountain-footnote-number'] = node.attrs.gitlabFootnoteLabel;
        attrs['aria-label'] = `Footnote ${String(node.attrs.gitlabFootnoteLabel)}`;
        attrs['data-gitlab-footnote-unreferenced'] = 'true';
      }
      return [output[0], attrs, ...output.slice(2)] as typeof output;
    } } satisfies NodeSpec];
  }));
}
