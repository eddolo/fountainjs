import type { Node } from 'fountainjs-editor';

/** A conservative namespace for newly inserted numeric labels, never an alias resolver. */
const occupiedKey = (value: unknown) => String(value).normalize('NFKC').toUpperCase()
  .replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}]/gu, '');

export function namespaceGitLabFootnotes(document: Node, current: Node, context?: { readonly reusedDefinitionIds: ReadonlySet<string> }): Node {
  const labels = new Set<string>(), ids = new Set<string>(), assigned = new Map<string, string>();
  current.descendants(node => {
    if (node.type.name.startsWith('footnote_')) ids.add(String(node.attrs.id));
    if (node.type.name === 'footnote_definition') labels.add(occupiedKey(node.attrs.gitlabFootnoteLabel ?? node.attrs.id));
  });
  let next = 1;
  document.descendants(node => {
    if (node.type.name !== 'footnote_definition') return;
    const id = String(node.attrs.id);
    if (ids.has(id) || assigned.has(id)) throw new Error('GITLAB_FOOTNOTE_INSERTION_ID_COLLISION');
    while (labels.has(String(next))) next++;
    assigned.set(id, String(next)); labels.add(String(next++));
  });
  if (!assigned.size) return document;
  const project = (node: Node): Node => {
    const label = node.type.name.startsWith('footnote_') ? assigned.get(String(node.attrs.id)) : undefined;
    if (node.type.name === 'footnote_reference' && label === undefined && !context?.reusedDefinitionIds.has(String(node.attrs.id))) throw new Error('GITLAB_FOOTNOTE_INSERTION_TARGET');
    const children = node.content.map(project);
    const attrs = label === undefined ? node.attrs : { ...node.attrs, gitlabFootnoteLabel: label,
      ...(node.type.name === 'footnote_reference' ? { gitlabFootnoteOriginalLabel: label, gitlabFootnoteTargetLabel: label } : {}) };
    return attrs === node.attrs && children.every((child, index) => child === node.child(index)) ? node
      : node.type.create(attrs, children, node.text, node.marks);
  };
  return project(document);
}
