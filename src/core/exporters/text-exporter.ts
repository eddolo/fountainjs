import type { EditorState } from '../state';
import type { Node } from '../schema';

function blockText(node: Node, separator: string): string {
  if (node.type.isInline || node.type.spec.toText || !node.childCount) return node.textContent;
  return node.content.map(child => blockText(child, separator))
    .join(node.content.every(child => child.type.isInline) ? '' : separator);
}

export class TextExporter {
  export(stateOrNode: EditorState | Node, separator = '\n'): string {
    const node = 'doc' in stateOrNode ? stateOrNode.doc : stateOrNode;
    return blockText(node, separator);
  }

  static export(stateOrNode: EditorState | Node, separator?: string): string {
    return new TextExporter().export(stateOrNode, separator);
  }
}
