import { Node } from '../schema';
import { Step } from './step';

export class ReplaceStep extends Step {
  constructor(
    public readonly from: number,
    public readonly to: number,
    public readonly content: readonly Node[],
  ) { super(); }

  apply(doc: Node): Node {
    if (!Number.isInteger(this.from) || !Number.isInteger(this.to) || this.from < 0 || this.from > this.to || this.to > doc.childCount) {
      throw new RangeError(`Invalid child range ${this.from}..${this.to}.`);
    }
    return doc.copy([...doc.content.slice(0, this.from), ...this.content, ...doc.content.slice(this.to)]);
  }
}
