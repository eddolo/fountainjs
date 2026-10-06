import type { XMLElement } from './xml-types';

const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function expanded(element: XMLElement, name = element.name, attribute = false) {
  const split = name.indexOf(':');
  const prefix = split < 0 ? '' : name.slice(0, split);
  const namespace = attribute && split < 0 ? '' : element.namespaces[prefix];
  if (split >= 0 && !namespace) throw new Error('Unbound XML namespace in Word theme.');
  return `${namespace ?? ''}|${split < 0 ? name : name.slice(split + 1)}`;
}
function one(parent: XMLElement | undefined, namespace: string, name: string): XMLElement | undefined {
  const matches = parent?.children.filter((item): item is XMLElement => typeof item !== 'string' && expanded(item) === `${namespace}|${name}`) ?? [];
  if (matches.length > 1) throw new Error(`Ambiguous Word theme element ${name}.`);
  return matches[0];
}
function wordAttribute(element: XMLElement | undefined, name: string): string | undefined {
  if (!element) return undefined;
  const matches = Object.entries(element.attrs).filter(([key]) => key !== 'xmlns' && !key.startsWith('xmlns:') && expanded(element, key, true) === `${WORD_NS}|${name}`);
  if (matches.length > 1) throw new Error(`Ambiguous Word theme language attribute ${name}.`);
  return matches[0]?.[1];
}

export type ThemeFontResult = { readonly name: string } | { readonly reason: 'unknown-theme-font' | 'missing-theme-font' | 'language-dependent-theme-font' };

/** Resolve embedded regional defaults only. This is not a script classifier or
 * a font loader. Language-specific supplemental theme fonts remain unresolved
 * until their selection rules have independent evidence.
 */
export function readWordThemeFonts(document: XMLElement, settings?: XMLElement) {
  const theme = one(document, DRAWING_NS, 'theme');
  if (!theme || document.children.filter(item => typeof item !== 'string').length !== 1) throw new Error('Invalid Word theme root.');
  const scheme = one(one(theme, DRAWING_NS, 'themeElements'), DRAWING_NS, 'fontScheme');
  const language = one(one(settings, WORD_NS, 'settings'), WORD_NS, 'themeFontLang');
  const languages = { latin: wordAttribute(language, 'val'), ea: wordAttribute(language, 'eastAsia'), cs: wordAttribute(language, 'bidi') };
  const groups = new Map<string, Readonly<Record<string, string | undefined>>>();
  for (const kind of ['major', 'minor']) {
    const group = one(scheme, DRAWING_NS, `${kind}Font`);
    const values: Record<string, string | undefined> = {};
    for (const region of ['latin', 'ea', 'cs']) {
      const element = one(group, DRAWING_NS, region);
      // DrawingML typeface is unqualified. A foreign x:typeface is not a face.
      values[region] = element && Object.hasOwn(element.attrs, 'typeface') ? element.attrs.typeface : undefined;
    }
    groups.set(kind, Object.freeze(values));
  }
  return Object.freeze({
    resolve(token: string): ThemeFontResult {
      const match = /^(major|minor)(Ascii|HAnsi|EastAsia|Bidi)$/.exec(token);
      if (!match) return Object.freeze({ reason: 'unknown-theme-font' });
      const region = match[2] === 'EastAsia' ? 'ea' : match[2] === 'Bidi' ? 'cs' : 'latin';
      if (languages[region]) return Object.freeze({ reason: 'language-dependent-theme-font' });
      const name = groups.get(match[1]!)?.[region];
      return name ? Object.freeze({ name }) : Object.freeze({ reason: 'missing-theme-font' });
    },
  });
}
