import { Node } from '../schema';
import { assertTextRange, getNodeAtPath, replaceNodeAtPath } from './path';
import { StepMap, textPointToPosition } from './mapping';
import { Step } from './step';

export class ReplaceTextStep extends Step {
  constructor(
    public readonly path: readonly number[],
    public readonly from: number,
    public readonly to: number,
    public readonly text: string,
  ) { super(); }

  apply(doc: Node): Node {
    const node = getNodeAtPath(doc, this.path);
    assertTextRange(node, this.from, this.to);
    const oldText = node.text ?? '';
    return replaceNodeAtPath(doc, this.path, node.withText(oldText.slice(0, this.from) + this.text + oldText.slice(this.to)));
  }

  override getMap(doc: Node): StepMap {
    return new StepMap([textPointToPosition(doc, this.path, this.from), this.to - this.from, this.text.length]);
  }
}
