import type { Mark, Node } from '../schema';
import { resolveDocumentPoint } from './document-point';
import { textPointToPosition, type StepMap } from './mapping';
import { replaceStructuralRange, type StructuralRangeReplacement } from './nested-range-replacement';
import { ReplaceTextRangeStep } from './replace-text-range-step';
import { Step } from './step';

/** Replaces a document-position range, including text/atom/gap endpoints. */
export class ReplaceRangeStep extends Step {
  private readonly results = new WeakMap<Node, StructuralRangeReplacement>();
  readonly boundaryMarks: readonly Mark[];

  constructor(public readonly from: number, public readonly to: number, public readonly text = '', boundaryMarks: readonly Mark[] = []) {
    super();
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from) throw new RangeError('Invalid document range.');
    this.boundaryMarks = Object.freeze([...boundaryMarks]);
    Object.freeze(this);
  }

  private result(doc: Node): StructuralRangeReplacement {
    const cached = this.results.get(doc);
    if (cached) return cached;
    const from = resolveDocumentPoint(doc, this.from, 1);
    const to = this.from === this.to ? from : resolveDocumentPoint(doc, this.to, -1);
    let result: StructuralRangeReplacement;
    if (from.kind === 'text' && to.kind === 'text') {
      const step = new ReplaceTextRangeStep(from.path, from.offset, to.path, to.offset, this.text);
      const document = step.apply(doc);
      doc.type.schema.validate(document);
      result = { document, map: step.getMap(doc), insertionPosition: textPointToPosition(document, from.path, from.offset + this.text.length) };
    } else result = replaceStructuralRange(doc, from, to, this.text, this.boundaryMarks);
    this.results.set(doc, result);
    return result;
  }

  apply(doc: Node): Node { return this.result(doc).document; }
  override getMap(doc: Node): StepMap { return this.result(doc).map; }
  getInsertionPosition(doc: Node): number { return this.result(doc).insertionPosition; }
}
