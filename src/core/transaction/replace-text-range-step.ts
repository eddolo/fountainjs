import { Node } from '../schema';
import { assertTextRange, getNodeAtPath, replaceNodeAtPath } from './path';
import { ReplaceTextStep } from './replace-text-step';
import { Step } from './step';

function samePath(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

/** Replaces a range that may cross adjacent text fragments inside one parent. */
export class ReplaceTextRangeStep extends Step {
  constructor(
    public readonly startPath: readonly number[],
    public readonly from: number,
    public readonly endPath: readonly number[],
    public readonly to: number,
    public readonly text: string,
  ) { super(); }

  apply(doc: Node): Node {
    if (samePath(this.startPath, this.endPath)) {
      return new ReplaceTextStep(this.startPath, this.from, this.to, this.text).apply(doc);
    }
    if (!this.startPath.length || this.startPath.length !== this.endPath.length) {
      throw new Error('Cross-fragment text ranges must share one parent.');
    }
    const startParentPath = this.startPath.slice(0, -1);
    const endParentPath = this.endPath.slice(0, -1);
    if (!samePath(startParentPath, endParentPath)) {
      throw new Error('Cross-fragment text ranges must share one parent.');
    }

    const startIndex = this.startPath.at(-1) as number;
    const endIndex = this.endPath.at(-1) as number;
    if (startIndex >= endIndex) throw new Error('Cross-fragment ranges must be ordered from start to end.');

    const start = getNodeAtPath(doc, this.startPath);
    const end = getNodeAtPath(doc, this.endPath);
    assertTextRange(start, this.from, start.text?.length ?? 0);
    assertTextRange(end, 0, this.to);
    const parent = getNodeAtPath(doc, startParentPath);
    const prefixAndReplacement = start.withText((start.text ?? '').slice(0, this.from) + this.text);
    const suffix = (end.text ?? '').slice(this.to);
    const content = [
      ...parent.content.slice(0, startIndex),
      prefixAndReplacement,
      ...(suffix ? [end.withText(suffix)] : []),
      ...parent.content.slice(endIndex + 1),
    ];
    return replaceNodeAtPath(doc, startParentPath, parent.copy(content));
  }
}
