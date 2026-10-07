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

export function readTextAlignment(element: DirectionElement, styleAlign: string | undefined, direction?: Readonly<Attributes>): string {
  const align = styleAlign || element.getAttribute('align');
  return align && textAlignmentAttribute.validate(align) ? align : (direction ?? readTextDirection(element)).dir ? 'start' : 'left';
}

export function readTextAlignmentAttributes(element: DirectionElement, styleAlign: string | undefined, direction: Readonly<Attributes>): Attributes {
  const align = readTextAlignment(element, styleAlign, direction);
  const explicit = element.getAttribute('data-fountain-align-explicit') === 'true'
    || (!direction.dir && align === 'left' && (styleAlign || element.getAttribute('align')) === 'left');
  return { align, ...(explicit ? { alignExplicit: true } : {}) };
}
