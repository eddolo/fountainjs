import type { Attributes } from './schema';

export const textAlignmentAttribute = {
  default: 'left',
  validate: (value: unknown) => ['left', 'center', 'right', 'justify', 'start', 'end'].includes(String(value)),
};

export const textDirectionAttribute = {
  default: undefined,
  validate: (value: unknown) => value === undefined || value === 'ltr' || value === 'rtl' || value === 'auto',
};

// Legacy left is the ordinary inherited/default presentation unless the block
// already owns direction. This marker records an authored physical override.
export const explicitTextAlignmentAttribute = {
  default: undefined,
  validate: (value: unknown) => value === undefined || value === true,
};

interface DirectionElement {
  getAttribute(name: string): string | null;
  readonly parentElement?: DirectionElement | null;
  readonly style?: { readonly textAlign?: string };
}

/** Materialize fixed inherited direction when an HTML wrapper is flattened.
 * Inherited auto depends on the ancestor's first strong character, not this
 * paragraph's text; leave that to a retained container rather than guessing.
 */
export function readTextDirection(element: DirectionElement): Attributes {
  for (let current: DirectionElement | null | undefined = element; current; current = current.parentElement) {
    const dir = current.getAttribute('dir')?.toLowerCase();
    if (dir === 'ltr' || dir === 'rtl' || (dir === 'auto' && current === element)) return { dir };
    if (dir === 'auto') break;
  }
  return {};
}

/** Resolve only supported inline declarations, not stylesheets or computed CSS.
 * text-align is inherited even across wrappers that an importer must flatten.
 * Materialize its value on each text block without inventing reading direction.
 */
function alignmentDeclaration(element: DirectionElement, styleAlign: string | undefined): string | undefined {
  for (let current: DirectionElement | null | undefined = element; current; current = current.parentElement) {
    const own = current === element;
    const style = (own ? styleAlign : current.style?.textAlign)?.trim().toLowerCase();
    if (style === 'initial') return 'start';
    if (textAlignmentAttribute.validate(style)) return style;
    // Explicit inheritance overrides the element's legacy presentational hint.
    if (own && style !== 'inherit' && style !== 'unset') {
      const hint = current.getAttribute('align')?.trim().toLowerCase();
      if (hint && textAlignmentAttribute.validate(hint)) return hint;
    }
  }
  return undefined;
}

export function readTextAlignment(element: DirectionElement, styleAlign: string | undefined, direction?: Readonly<Attributes>): string {
  return alignmentDeclaration(element, styleAlign) ?? ((direction ?? readTextDirection(element)).dir ? 'start' : 'left');
}

export function readTextAlignmentAttributes(element: DirectionElement, styleAlign: string | undefined, direction: Readonly<Attributes>): Attributes {
  const declaration = alignmentDeclaration(element, styleAlign);
  const align = declaration ?? (direction.dir ? 'start' : 'left');
  const explicit = element.getAttribute('data-fountain-align-explicit') === 'true'
    || (!direction.dir && declaration === 'left');
  return { align, ...(explicit ? { alignExplicit: true } : {}) };
}
