import { Node, Mark, MarkType } from '../schema';
import { Step } from './step';
import { ReplaceStep } from './replace-step';
import { ReplaceTextStep } from './replace-text-step'; // <-- Import new step
import { AddMarkStep } from './add-mark-step';
import { RemoveMarkStep } from './remove-mark-step';
import { SetNodeAttrsStep } from './set-node-attrs-step';

export class Transform {
  public readonly originalDoc: Node; public doc: Node; public steps: Step[];
  constructor(doc: Node) { this.originalDoc = doc; this.doc = doc; this.steps = []; }
  step(step: Step): this { const newDoc = step.apply(this.doc); if (newDoc) { this.doc = newDoc; this.steps.push(step); } return this; }
  replace(from: number, to: number, content: Node[] = []): this { return this.step(new ReplaceStep(from, to, content)); }
  
  // --- REPLACE `insertText` WITH THIS NEW METHOD ---
  replaceText(path: number[], from: number, to: number, text: string): this {
    return this.step(new ReplaceTextStep(path, from, to, text));
  }

  addMark(path: number[], mark: Mark): this { return this.step(new AddMarkStep(path, mark)); }
  removeMark(from: number, to: number, markType: MarkType): this { return this.step(new RemoveMarkStep(from, to, markType)); }
  setNodeAttrs(path: number[], attrs: { [key: string]: any }): this { return this.step(new SetNodeAttrsStep(path, attrs)); }
}