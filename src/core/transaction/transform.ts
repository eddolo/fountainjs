import { Mark, MarkType, Node, type Attributes } from '../schema';
import { AddMarkStep } from './add-mark-step';
import { AddMarkRangeStep, RemoveMarkRangeStep } from './mark-range-step';
import { InsertTextStep } from './insert-text-step';
import { RemoveMarkStep } from './remove-mark-step';
import { ReplaceStep } from './replace-step';
import { ReplaceTextStep } from './replace-text-step';
import { ReplaceTextRangeStep } from './replace-text-range-step';
import { SetNodeAttrsStep } from './set-node-attrs-step';
import { Step } from './step';

export class Transform {
  readonly originalDoc: Node;
  doc: Node;
  readonly steps: Step[] = [];

  constructor(doc: Node) {
    this.originalDoc = doc;
    this.doc = doc;
  }

  get docChanged(): boolean { return this.steps.length > 0 && !this.doc.eq(this.originalDoc); }

  step(step: Step): this {
    const next = step.apply(this.doc);
    if (!next.eq(this.doc)) {
      this.doc = next;
      this.steps.push(step);
    }
    return this;
  }

  replace(from: number, to: number, content: readonly Node[] = []): this {
    return this.step(new ReplaceStep(from, to, content));
  }

  insertText(path: readonly number[], offset: number, text: string): this {
    return this.step(new InsertTextStep(path, offset, text));
  }

  replaceText(path: readonly number[], from: number, to: number, text: string): this {
    return this.step(new ReplaceTextStep(path, from, to, text));
  }

  replaceTextRange(
    startPath: readonly number[],
    from: number,
    endPath: readonly number[],
    to: number,
    text: string,
  ): this {
    return this.step(new ReplaceTextRangeStep(startPath, from, endPath, to, text));
  }

  addMark(path: readonly number[], from: number, to: number, mark: Mark): this {
    return this.step(new AddMarkStep(path, from, to, mark));
  }

  addMarkRange(startPath: readonly number[], from: number, endPath: readonly number[], to: number, mark: Mark): this {
    return this.step(new AddMarkRangeStep(startPath, from, endPath, to, mark));
  }

  removeMark(path: readonly number[], from: number, to: number, markType: MarkType): this {
    return this.step(new RemoveMarkStep(path, from, to, markType));
  }

  removeMarkRange(startPath: readonly number[], from: number, endPath: readonly number[], to: number, markType: MarkType): this {
    return this.step(new RemoveMarkRangeStep(startPath, from, endPath, to, markType));
  }

  setNodeAttrs(path: readonly number[], attrs: Attributes): this {
    return this.step(new SetNodeAttrsStep(path, attrs));
  }
}
