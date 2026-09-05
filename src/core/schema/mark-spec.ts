import type { Mark } from './mark';
import type { AttributeSpec, DOMOutputSpec, DOMParseRule, HTMLParseRule } from './node-spec';

export interface MarkSpec {
  attrs?: Record<string, AttributeSpec>;
  /** Safe HTML-import rules owned by this mark extension. */
  parseDOM?: readonly DOMParseRule[];
  /** HTML-import rules usable by both browser and server parsers. */
  parseHTML?: readonly HTMLParseRule[];
  toDOM?: (mark: Mark) => DOMOutputSpec;
}
