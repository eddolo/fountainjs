import { EditorState } from '../../core/state';
import { Node } from '../../core/schema/node';

/**
 * Export editor content to JSON format
 * Preserves full structure for reimporting
 */
export class JSONExporter {
  private nodeToJSON(node: Node): any {
    const json: any = {
      type: node.type.name,
    };

    if (node.attrs && Object.keys(node.attrs).length > 0) {
      json.attrs = node.attrs;
    }

    if (node.text) {
      json.text = node.text;
    }

    if (node.marks && node.marks.length > 0) {
      json.marks = node.marks.map((m) => ({
        type: m.type,
        attrs: m.attrs,
      }));
    }

    if (node.content && node.content.length > 0) {
      json.content = node.content.map((child) => this.nodeToJSON(child));
    }

    return json;
  }

  export(state: EditorState): string {
    const json = this.nodeToJSON(state.doc);
    return JSON.stringify(json, null, 2);
  }

  /**
   * Import from JSON (for round-trip serialization)
   */
  static import(json: string): any {
    return JSON.parse(json);
  }
}
