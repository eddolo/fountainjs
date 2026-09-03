import { Mark, MarkType, Node } from '../schema';
import { AddMarkStep } from './add-mark-step';
import { getTextRangeSegments } from './path';
import { RemoveMarkStep } from './remove-mark-step';
import { Step } from './step';

function samePath(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function transformRange(
  doc: Node,
  startPath: readonly number[],
  from: number,
  endPath: readonly number[],
  to: number,
  transform: (node: Node) => Node,
): Node {
  const segments = getTextRangeSegments(doc, startPath, from, endPath, to);
  const byPath = new Map(segments.map((segment) => [segment.path.join('.'), segment]));

  const rewrite = (node: Node, path: readonly number[]): readonly Node[] => {
    if (node.isText) {
      const segment = byPath.get(path.join('.'));
      if (!segment || segment.from === segment.to) return [node];
      const value = node.text ?? '';
      return [
        ...(segment.from ? [node.withText(value.slice(0, segment.from))] : []),
        transform(node.withText(value.slice(segment.from, segment.to))),
        ...(segment.to < value.length ? [node.withText(value.slice(segment.to))] : []),
      ];
    }
    return [node.copy(node.content.flatMap((child, index) => rewrite(child, [...path, index])))];
  };

  return rewrite(doc, [])[0] as Node;
}

export interface MappedTextSelection {
  readonly startPath: readonly number[];
  readonly endPath: readonly number[];
  readonly endOffset: number;
}

/** Maps a selected text range through the fragment splits made by a mark step. */
export function mapMarkRangeSelection(
  doc: Node,
  startPath: readonly number[],
  from: number,
  endPath: readonly number[],
  to: number,
): MappedTextSelection | null {
  const segments = getTextRangeSegments(doc, startPath, from, endPath, to);
  const shifts = new Map<string, number>();
  let selectedStart: readonly number[] | undefined;
  let selectedEnd: readonly number[] | undefined;
  let selectedEndOffset = 0;

  for (const segment of segments) {
    const length = segment.node.text?.length ?? 0;
    const parentPath = segment.path.slice(0, -1);
    const key = parentPath.join('.');
    const shift = shifts.get(key) ?? 0;
    const index = segment.path.at(-1) as number;
    if (segment.to <= segment.from) continue;
    const mapped = Object.freeze([...parentPath, index + shift + (segment.from > 0 ? 1 : 0)]);
    selectedStart ??= mapped;
    selectedEnd = mapped;
    selectedEndOffset = segment.to - segment.from;
    const fragmentCount = (segment.from > 0 ? 1 : 0) + 1 + (segment.to < length ? 1 : 0);
    shifts.set(key, shift + fragmentCount - 1);
  }

  return selectedStart && selectedEnd
    ? { startPath: selectedStart, endPath: selectedEnd, endOffset: selectedEndOffset }
    : null;
}

export class AddMarkRangeStep extends Step {
  constructor(
    public readonly startPath: readonly number[],
    public readonly from: number,
    public readonly endPath: readonly number[],
    public readonly to: number,
    public readonly mark: Mark,
  ) { super(); }

  apply(doc: Node): Node {
    if (samePath(this.startPath, this.endPath)) {
      return new AddMarkStep(this.startPath, this.from, this.to, this.mark).apply(doc);
    }
    return transformRange(doc, this.startPath, this.from, this.endPath, this.to, (node) => node.withMarks([
      ...node.marks.filter((existing) => existing.type !== this.mark.type),
      this.mark,
    ]));
  }
}

export class RemoveMarkRangeStep extends Step {
  constructor(
    public readonly startPath: readonly number[],
    public readonly from: number,
    public readonly endPath: readonly number[],
    public readonly to: number,
    public readonly markType: MarkType,
  ) { super(); }

  apply(doc: Node): Node {
    if (samePath(this.startPath, this.endPath)) {
      return new RemoveMarkStep(this.startPath, this.from, this.to, this.markType).apply(doc);
    }
    return transformRange(doc, this.startPath, this.from, this.endPath, this.to, (node) => node.withMarks(
      node.marks.filter((existing) => existing.type !== this.markType),
    ));
  }
}
