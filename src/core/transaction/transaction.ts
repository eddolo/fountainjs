import { Mark, Node } from '../schema';
import { Selection } from '../selection';
import { Transform } from './transform';

export class Transaction extends Transform {
  selection: Selection;
  selectionSet = false;
  storedMarks: readonly Mark[];
  storedMarksSet = false;
  private readonly metadata = new Map<string, unknown>();

  constructor(doc: Node, selection: Selection = Selection.cursor([], 0), storedMarks: readonly Mark[] = []) {
    super(doc);
    this.selection = selection;
    this.storedMarks = Object.freeze([...storedMarks]);
  }

  setSelection(selection: Selection): this {
    this.selection = selection;
    this.selectionSet = true;
    return this;
  }

  setStoredMarks(marks: readonly Mark[]): this {
    this.storedMarks = Object.freeze([...marks]);
    this.storedMarksSet = true;
    return this;
  }

  setMeta(key: string, value: unknown): this {
    this.metadata.set(key, value);
    return this;
  }

  getMeta<T = unknown>(key: string): T | undefined {
    return this.metadata.get(key) as T | undefined;
  }
}
