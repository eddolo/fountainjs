import type { Mark } from './mark';
import type { AttributeSpec, DOMOutputSpec, DOMParseRule } from './node-spec';

export interface MarkSpec {
  attrs?: Record<string, AttributeSpec>;
  /** Safe HTML-import rules owned by this mark extension. */
  parseDOM?: readonly DOMParseRule[];
  toDOM?: (mark: Mark) => DOMOutputSpec;
}
