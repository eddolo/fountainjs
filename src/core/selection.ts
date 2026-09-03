function comparePaths(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return (left[index] as number) - (right[index] as number);
  }
  return left.length - right.length;
}

export class Selection {
  readonly path: readonly number[];
  readonly endPath: readonly number[];
  readonly from: number;
  readonly to: number;

  constructor(path: readonly number[], from: number, to: number = from, endPath: readonly number[] = path) {
    if (!path.every((part) => Number.isInteger(part) && part >= 0)) throw new RangeError('Selection paths must contain non-negative integers.');
    if (!endPath.every((part) => Number.isInteger(part) && part >= 0)) throw new RangeError('Selection paths must contain non-negative integers.');
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0) throw new RangeError('Invalid selection range.');
    const order = comparePaths(path, endPath);
    if (order > 0 || (order === 0 && to < from)) throw new RangeError('Selection ranges must be ordered from start to end.');
    this.path = Object.freeze([...path]);
    this.endPath = Object.freeze([...endPath]);
    this.from = from;
    this.to = to;
  }

  static cursor(path: readonly number[], offset: number): Selection {
    return new Selection(path, offset, offset);
  }

  static createCursor(path: readonly number[], offset: number): Selection {
    return Selection.cursor(path, offset);
  }

  static range(startPath: readonly number[], from: number, endPath: readonly number[], to: number): Selection {
    return new Selection(startPath, from, to, endPath);
  }

  get isSingleText(): boolean {
    return this.path.length === this.endPath.length
      && this.path.every((part, index) => part === this.endPath[index]);
  }

  get isCollapsed(): boolean { return this.isSingleText && this.from === this.to; }

  eq(other: Selection): boolean {
    return this.from === other.from && this.to === other.to
      && this.path.length === other.path.length
      && this.path.every((part, index) => part === other.path[index])
      && this.endPath.length === other.endPath.length
      && this.endPath.every((part, index) => part === other.endPath[index]);
  }
}
