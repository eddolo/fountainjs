import type { Node } from '../schema';
import { StepMap } from './mapping';

export abstract class Step {
  abstract apply(doc: Node): Node;

  getMap(_doc: Node): StepMap {
    return StepMap.empty;
  }

  /** Optional exact map sequence for an indivisible operation such as history
   * restoration. Undefined keeps the ordinary single getMap() behavior. */
  getMaps?(_doc: Node): readonly StepMap[] | undefined { return undefined; }
}
