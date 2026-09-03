import { Node } from '../schema';
import { Selection } from '../selection';
import { Transform } from './transform';

export class Transaction extends Transform {
  selection: Selection;
  selectionSet = false;
  private readonly metadata = new Map<string, unknown>();

  constructor(doc: Node, selection: Selection = Selection.cursor([], 0)) {
    super(doc);
    this.selection = selection;
  }

  setSelection(selection: Selection): this {
    this.selection = selection;
    this.selectionSet = true;
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
