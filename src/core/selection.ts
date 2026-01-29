export class Selection {
  // A selection is defined by a single path and a start/end offset within that path's node.
  constructor(
    public readonly path: number[],
    public readonly from: number,
    public readonly to: number,
  ) {}

  // A collapsed selection (cursor)
  static createCursor(path: number[], offset: number): Selection {
    return new Selection(path, offset, offset);
  }

  get isCollapsed(): boolean {
    return this.from === this.to;
  }
}