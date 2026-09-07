import { Node } from '../schema';
import { StepMap } from './mapping';
import { Step } from './step';

/** Replaces the complete document, including root attributes, in one step. */
export class ReplaceDocumentStep extends Step {
  constructor(public readonly document: Node) { super(); }

  apply(before: Node): Node {
    if (this.document.type !== before.type || before.type !== before.type.schema.topNodeType) {
      throw new TypeError('Document replacement requires the same schema and root node type.');
    }
    before.type.schema.validate(this.document);
    return this.document;
  }

  override getMap(before: Node): StepMap {
    if (before.childCount === this.document.childCount
      && before.content.every((node, index) => node.eq(this.document.child(index)))) return StepMap.empty;
    return new StepMap([0, before.nodeSize - 2, this.document.nodeSize - 2]);
  }
}
