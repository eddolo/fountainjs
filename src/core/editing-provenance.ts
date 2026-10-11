import type { Node } from './schema';

// Import-local provenance, not document data. An authored/JSON-reopened empty
// paragraph must never be mistaken for the editor's automatic caret repair.
// Do not retain an entire pre-edit document through its surviving caret node.
const automaticTrailingParagraphs = new WeakSet<Node>();

/** Internal boundary used only by the default trailing-editable-block repair. */
export function markAutomaticTrailingParagraph(node: Node): void {
  automaticTrailingParagraphs.add(node);
}

/** Exact authored document equality with one known, still-empty root repair. */
export function matchesWithoutAutomaticTrailingParagraph(original: Node, current: Node): boolean {
  if (current.childCount !== original.childCount + 1) return false;
  const tail = current.content.at(-1)!;
  if (!automaticTrailingParagraphs.has(tail) || tail.type.name !== 'paragraph'
    || tail.marks.length || tail.childCount !== 1 || !tail.child(0).isText
    || tail.child(0).text !== '' || tail.child(0).marks.length) return false;
  // Keep all root attributes and preceding content in the comparison.
  // No generic empty-block normalization or copied/JSON-node recognition.
  return original.eq(current.copy(current.content.slice(0, -1)));
}
