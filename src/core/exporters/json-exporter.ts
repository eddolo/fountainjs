import { Node, type NodeJSON, type Schema } from '../schema';
import type { EditorState } from '../state';
import { isAutomaticTrailingParagraph } from '../editing-provenance';

export interface JSONExportOptions {
  /** Omit only the known, still-empty root caret repair before persisting.
   * Authored, copied and JSON-reopened blank paragraphs remain document data. */
  omitTrailingCaret?: boolean;
}

export class JSONExporter {
  export(stateOrNode: EditorState | Node, space: number | string = 2, options: JSONExportOptions = {}): string {
    let node = 'doc' in stateOrNode ? stateOrNode.doc : stateOrNode;
    if (options.omitTrailingCaret && node.type === node.type.schema.topNodeType
      && isAutomaticTrailingParagraph(node.content.at(-1))) node = node.copy(node.content.slice(0, -1));
    return JSON.stringify(node.toJSON(), null, space);
  }

  static export(stateOrNode: EditorState | Node, space?: number | string, options?: JSONExportOptions): string {
    return new JSONExporter().export(stateOrNode, space, options);
  }

  static import(json: string | NodeJSON, schema: Schema): Node {
    const value = typeof json === 'string' ? JSON.parse(json) as NodeJSON : json;
    return Node.fromJSON(schema, value);
  }
}
