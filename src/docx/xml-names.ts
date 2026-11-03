import type { XMLElement } from './xml-types';

/** Expanded names distinguish foreign lookalikes and unqualified attributes.
 * The strict readers reject unbound prefixes instead of treating them as local.
 */
export function expandedXMLName(element: XMLElement, name = element.name, attribute = false): string {
  const split = name.indexOf(':');
  const prefix = split < 0 ? '' : name.slice(0, split);
  const namespace = attribute && split < 0 ? '' : element.namespaces[prefix];
  if (split >= 0 && !namespace) throw new Error('Unbound XML namespace.');
  return `${namespace ?? ''}|${name.slice(split + 1)}`;
}

/** Physical Word attributes are qualified; default namespaces do not apply. */
export function qualifiedWordAttribute(element: XMLElement, local: string): string | undefined {
  const matches = Object.entries(element.attrs).filter(([name]) => {
    const colon = name.indexOf(':');
    return colon > 0 && name.slice(colon + 1) === local
      && element.namespaces[name.slice(0, colon)] === 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  });
  if (matches.length > 1) throw new Error(`Ambiguous Word attribute ${local}.`);
  return matches[0]?.[1];
}
