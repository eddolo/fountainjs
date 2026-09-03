import { Node, type NodeJSON, type Schema } from '../schema';
import type { EditorState } from '../state';

export class JSONExporter {
  export(stateOrNode: EditorState | Node, space: number | string = 2): string {
    const node = 'doc' in stateOrNode ? stateOrNode.doc : stateOrNode;
    return JSON.stringify(node.toJSON(), null, space);
  }

  static export(stateOrNode: EditorState | Node, space?: number | string): string {
    return new JSONExporter().export(stateOrNode, space);
  }

  static import(json: string | NodeJSON, schema: Schema): Node {
    const value = typeof json === 'string' ? JSON.parse(json) as NodeJSON : json;
    return Node.fromJSON(schema, value);
  }
}
