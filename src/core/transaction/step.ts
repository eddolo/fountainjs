import { Node } from '../schema/node';
export abstract class Step { abstract apply(doc: Node): Node; }