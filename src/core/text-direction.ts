import type { Attributes, Schema } from './schema';

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
  readonly tagName?: string;
  readonly parentElement?: DirectionElement | null;
  readonly style?: { readonly textAlign?: string };
}

export function textDirectionDOMAttributes(attrs: Readonly<Attributes>): Attributes {
  return attrs.dir !== undefined && textDirectionAttribute.validate(attrs.dir) ? { dir: attrs.dir } : {};
}

const directionContainers: Record<string, string> = { blockquote: 'blockquote', ul: 'bullet_list', ol: 'ordered_list', li: 'list_item',
  table: 'table', tr: 'table_row', td: 'table_cell', th: 'table_header', dl: 'definition_list', dt: 'definition_term', dd: 'definition_description' };

function retainedDirectionContainer(element: DirectionElement, schema: Schema): boolean {
  const tag = element.tagName?.toLowerCase();
  const name = tag === 'ul' && element.getAttribute('data-type') === 'task-list' ? 'task_list'
    : tag === 'li' && element.parentElement?.getAttribute('data-type') === 'task-list' ? 'task_item' : tag && directionContainers[tag];
  return Boolean(name && schema.nodes[name]?.spec.attrs?.dir);
}

export function readContainerDirection(element: DirectionElement, schema: Schema): Attributes {
  return retainedDirectionContainer(element, schema) ? readTextDirection(element, schema) : {};
}

/** Materialize fixed direction only across wrappers the supplied schema flattens.
 * childContext is for an anonymous paragraph inside this element, not the
 * retained element itself. Shared auto contexts must never be guessed per child.
 */
export function readTextDirection(element: DirectionElement, schema?: Schema, childContext = false): Attributes {
  for (let current: DirectionElement | null | undefined = element; current; current = current.parentElement) {
    // A retained structure owns its shared context. Materializing that value
    // on each child would freeze inheritance when an author changes the parent.
    if ((current !== element || childContext) && schema && retainedDirectionContainer(current, schema)) break;
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
