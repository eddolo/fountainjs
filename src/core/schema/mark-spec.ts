import { DOMOutputSpec } from './node-spec';
export interface MarkSpec {
  attrs?: { [name: string]: any };
  toDOM?: (mark: any) => DOMOutputSpec;
}