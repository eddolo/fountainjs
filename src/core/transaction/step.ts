import type { Node } from '../schema';

export abstract class Step {
  abstract apply(doc: Node): Node;
}
