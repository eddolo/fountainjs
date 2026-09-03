import type { Node } from '../core';

export interface NodeView {
  dom: HTMLElement;
  contentDOM?: HTMLElement;
  update?(node: Node): boolean;
  destroy?(): void;
}
