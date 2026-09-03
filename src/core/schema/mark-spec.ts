import type { Mark } from './mark';
import type { AttributeSpec, DOMOutputSpec } from './node-spec';

export interface MarkSpec {
  attrs?: Record<string, AttributeSpec>;
  toDOM?: (mark: Mark) => DOMOutputSpec;
}
