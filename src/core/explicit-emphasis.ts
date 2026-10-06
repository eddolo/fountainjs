import type { Attributes } from './schema';
import { paragraphLayoutDOMAttributes } from './paragraph-layout';

/** In explicit mode, strong/em marks alone determine text emphasis. This lets
 * imported normal-weight headings and non-italic quotations remain editable,
 * without introducing negative marks that conflict with toolbar commands.
 */
export const explicitEmphasisAttribute = {
  default: undefined,
  validate: (value: unknown) => value === undefined || value === 'explicit',
};

export function textBlockDOMAttributes(attrs: Readonly<Attributes>): Attributes {
  const layout = paragraphLayoutDOMAttributes(attrs.layout);
  const styles: string[] = layout.style ? [String(layout.style)] : [];
  if (['center', 'right', 'justify'].includes(String(attrs.align))) styles.push(`text-align:${attrs.align}`);
  if (attrs.emphasis === 'explicit') styles.push('font-weight:normal', 'font-style:normal');
  return {
    ...layout,
    ...(attrs.emphasis === 'explicit' ? { 'data-fountain-emphasis': 'explicit' } : {}),
    ...(styles.length ? { style: styles.join(';') } : {}),
  };
}

export function readExplicitEmphasis(element: { getAttribute(name: string): string | null }): Attributes {
  return element.getAttribute('data-fountain-emphasis') === 'explicit' ? { emphasis: 'explicit' } : {};
}

/** A source-owned quote uses its children's paragraph geometry. The semantic
 * container must not add a second border, indentation or spacing around it. */
export const explicitQuoteAppearanceAttribute = explicitEmphasisAttribute;

export function quoteDOMAttributes(attrs: Readonly<Attributes>): Attributes {
  return attrs.appearance === 'explicit' ? {
    'data-fountain-quote-appearance': 'explicit',
    style: 'margin:0;padding:0;border:0;color:inherit',
  } : {};
}

export function readExplicitQuoteAppearance(element: { getAttribute(name: string): string | null }): Attributes {
  return element.getAttribute('data-fountain-quote-appearance') === 'explicit' ? { appearance: 'explicit' } : {};
}
