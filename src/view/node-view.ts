import { Node } from '../core/schema/node';
import { EditorView } from './view';

export interface NodeView {
  dom: HTMLElement;
  contentDOM?: HTMLElement;
  update?(node: Node): boolean;
  destroy?(): void;
}