import { expandedXMLName as expanded } from './xml-names';
import type { XMLElement } from './xml-types';

const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';


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

/** Resolve the declared theme language, not the script of each text character.
 * Intl supplies BCP-47 likely subtags without a host-default locale or network.
 * Unknown/invalid languages stay unresolved. This is not a font loader.
 */
export function readWordThemeFonts(document: XMLElement, settings?: XMLElement) {
  const theme = one(document, DRAWING_NS, 'theme');
  if (!theme || document.children.filter(item => typeof item !== 'string').length !== 1) throw new Error('Invalid Word theme root.');
  const scheme = one(one(theme, DRAWING_NS, 'themeElements'), DRAWING_NS, 'fontScheme');
  const language = one(one(settings, WORD_NS, 'settings'), WORD_NS, 'themeFontLang');
  const languages = { latin: wordAttribute(language, 'val'), ea: wordAttribute(language, 'eastAsia'), cs: wordAttribute(language, 'bidi') };
  const scripts: Record<string, string | undefined> = {};
  for (const [region, tag] of Object.entries(languages)) {
    if (tag === undefined || tag.length > 128) continue;
    try {
      const locale = new Intl.Locale(tag);
      if ((!locale.language || locale.language === 'und') && !locale.script) continue;
      const script = locale.maximize().script;
      // DrawingML uses Hang for Korean's composite Kore script.
      scripts[region] = script === 'Kore' ? 'Hang' : script;
    } catch { /* Invalid tags or unavailable Intl must not abort an import. */ }
  }
  const groups = new Map<string, Readonly<Record<string, string | undefined>>>();
  for (const kind of ['major', 'minor']) {
    const group = one(scheme, DRAWING_NS, `${kind}Font`);
    const values: Record<string, string | undefined> = Object.create(null);
    for (const region of ['latin', 'ea', 'cs']) {
      const element = one(group, DRAWING_NS, region);
      // DrawingML typeface is unqualified. A foreign x:typeface is not a face.
      values[region] = element && Object.hasOwn(element.attrs, 'typeface') ? element.attrs.typeface : undefined;
    }
    for (const element of group?.children ?? []) {
      if (typeof element === 'string' || expanded(element) !== `${DRAWING_NS}|font`) continue;
      const script = Object.hasOwn(element.attrs, 'script') ? element.attrs.script : undefined;
      if (!script || !/^[A-Z][a-z]{3}$/.test(script)) continue;
      if (Object.hasOwn(values, script)) throw new Error(`Ambiguous Word theme script ${script}.`);
      values[script] = Object.hasOwn(element.attrs, 'typeface') ? element.attrs.typeface : undefined;
    }
    groups.set(kind, Object.freeze(values));
  }
  return Object.freeze({
    resolve(token: string): ThemeFontResult {
      const match = /^(major|minor)(Ascii|HAnsi|EastAsia|Bidi)$/.exec(token);
      if (!match) return Object.freeze({ reason: 'unknown-theme-font' });
      const region = match[2] === 'EastAsia' ? 'ea' : match[2] === 'Bidi' ? 'cs' : 'latin';
      const script = scripts[region];
      if (languages[region] !== undefined && !script) return Object.freeze({ reason: 'language-dependent-theme-font' });
      const fonts = groups.get(match[1]!)!;
      const name = script && Object.hasOwn(fonts, script) ? fonts[script] : fonts[region];
      return name ? Object.freeze({ name }) : Object.freeze({ reason: 'missing-theme-font' });
    },
  });
}
