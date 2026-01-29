import { Transform } from './transform';
import { Node } from '../schema/node';
import { Selection } from '../selection';
export class Transaction extends Transform {
  public selection: Selection; public selectionSet = false;
  constructor(doc: Node) { super(doc); this.selection = Selection.createCursor([], 0); }
  setSelection(selection: Selection): this { this.selection = selection; this.selectionSet = true; return this; }
}