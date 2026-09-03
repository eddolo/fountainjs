import type { EditorState } from '../state';
import type { Node } from '../schema';

export class TextExporter {
  export(stateOrNode: EditorState | Node, separator = '\n'): string {
    const node = 'doc' in stateOrNode ? stateOrNode.doc : stateOrNode;
    return node.content.map((child) => child.textContent).join(separator);
  }

  static export(stateOrNode: EditorState | Node, separator?: string): string {
    return new TextExporter().export(stateOrNode, separator);
  }
}
