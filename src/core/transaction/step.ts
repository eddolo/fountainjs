import type { Node } from '../schema';
import { StepMap } from './mapping';

export abstract class Step {
  abstract apply(doc: Node): Node;

  getMap(_doc: Node): StepMap {
    return StepMap.empty;
  }
}
