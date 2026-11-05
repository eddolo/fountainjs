import { Node } from '../schema';
import { inheritBlockLineage } from '../schema/block-lineage';
import { getNodeAtPath, replaceNodeAtPath } from './path';
import { Step } from './step';

/** Internal metadata/type operation: descendants and all positions survive.
 * Arbitrary node replacement deliberately keeps ReplaceNodeStep semantics. */
export class SetBlockTypeStep extends Step {
  readonly path: readonly number[];

  constructor(path: readonly number[], readonly node: Node) {
    super();
    this.path = Object.freeze([...path]);
  }

  apply(doc: Node): Node {
    if (!this.path.length) throw new Error('Block conversion cannot replace the document root.');
    const before = getNodeAtPath(doc, this.path);
    if (!before.type.isBlock || !this.node.type.isBlock || before.type.schema !== this.node.type.schema
      || before.content.length !== this.node.content.length
      || before.content.some((child, index) => !child.eq(this.node.content[index]!))) {
      throw new Error('Block conversion must preserve schema-owned content.');
    }
    // Command batches replay preceding text steps, creating equal children
    // with new object identities. Keep those actual current descendants.
    const converted = before.content.every((child, index) => child === this.node.content[index])
      ? this.node : this.node.copy(before.content);
    const result = replaceNodeAtPath(doc, this.path, converted);
    // The command validates the complete batch. A parent may allow only
    // paragraph+ or heading+, making intermediate mixed versions invalid.
    inheritBlockLineage(before, converted);
    return result;
  }
}
