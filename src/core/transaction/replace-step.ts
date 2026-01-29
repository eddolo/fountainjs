import { Node } from '../schema/node';
import { Step } from './step';
export class ReplaceStep extends Step {
  constructor( public readonly from: number, public readonly to: number, public readonly content: Node[], ) { super(); }
  apply(doc: Node): Node { if (this.from > this.to || this.from > doc.content.length || this.to > doc.content.length) { throw new Error('ReplaceStep apply error: Invalid range'); } const newContent = [ ...doc.content.slice(0, this.from), ...this.content, ...doc.content.slice(this.to), ]; return new Node(doc.type, doc.attrs, newContent); }
}