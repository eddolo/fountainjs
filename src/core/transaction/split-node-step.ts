import { Node } from '../schema';
import { StepMap, textPointToPosition } from './mapping';
import { assertTextRange, getNodeAtPath, replaceNodeWithNodes } from './path';
import { Step } from './step';

/** Splits a text leaf and its ancestors without deleting any source units.
 * New closing/opening tokens are inserted at the explicit text boundary.
 * Generic node replacement retains its ordinary deletion semantics. */
export class SplitNodeStep extends Step {
  readonly path: readonly number[];
  readonly splitPath: readonly number[];
  readonly rightShapes: readonly Node[];

  constructor(path: readonly number[], readonly before: Node, splitPath: readonly number[],
    readonly offset: number, rightShapes: readonly Node[]) {
    super();
    if (!path.length || !splitPath.length || rightShapes.length !== splitPath.length + 1) {
      throw new Error('A node split needs a non-root ancestor path and right-hand shapes.');
    }
    this.path = Object.freeze([...path]);
    this.splitPath = Object.freeze([...splitPath]);
    this.rightShapes = Object.freeze([...rightShapes]);
  }

  apply(doc: Node): Node {
    const source = getNodeAtPath(doc, this.path);
    if (!source.eq(this.before)) throw new Error('Node split source content changed.');
    const split = (current: Node, depth: number): readonly [Node, Node] => {
      const shape = this.rightShapes[depth]!;
      if (shape.type.schema !== current.type.schema || shape.isText !== current.isText) {
        throw new Error('Node split shapes must belong to the source schema.');
      }
      if (depth === this.splitPath.length) {
        assertTextRange(current, this.offset, this.offset);
        return [current.withText(current.text!.slice(0, this.offset)),
          current.withText(current.text!.slice(this.offset)).withMarks(shape.marks)];
      }
      if (current.isText) throw new Error('Node split path must end at a text leaf.');
      const index = this.splitPath[depth]!;
      const [left, right] = split(current.child(index), depth + 1);
      return [current.copy([...current.content.slice(0, index), left]),
        shape.type.create(shape.attrs, [right, ...current.content.slice(index + 1)], undefined, shape.marks)];
    };
    // Replay may recreate equal children during an earlier batched text edit.
    // Split the actual current descendants, preserving untouched node objects.
    return replaceNodeWithNodes(doc, this.path, split(source, 0));
  }

  override getMap(doc: Node): StepMap {
    const textPath = [...this.path, ...this.splitPath];
    assertTextRange(getNodeAtPath(doc, textPath), this.offset, this.offset);
    return new StepMap([textPointToPosition(doc, textPath, this.offset), 0, this.splitPath.length * 2]);
  }

  /** Internal, structural split intent for shared-storage adapters. No model
   * objects or constructor identity are required to consume this descriptor. */
  getRetainedSplit(): { readonly textPath: readonly number[]; readonly rightTextPath: readonly number[]; readonly offset: number } {
    return { textPath: [...this.path, ...this.splitPath],
      rightTextPath: [...this.path.slice(0, -1), this.path.at(-1)! + 1, ...this.splitPath.map(() => 0)], offset: this.offset };
  }
}
