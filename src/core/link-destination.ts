import { isSafeURL } from './url';
import { importedHTMLLinkURL } from './importers/html-link-url';

/** Bounded inert source spelling, not permission to bypass the URL gate. */
export function validHTMLLinkSource(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 2_048 && /[\t\n\r\\]/u.test(value)
    && importedHTMLLinkURL(value) !== null;
}

export function boundHTMLLinkSource(value: string, source: unknown): source is string {
  return validHTMLLinkSource(source) && importedHTMLLinkURL(source) === value;
}

/** Browsers remove ASCII TAB/LF/CR before URL parsing, but not encoded bytes. */
export function HTMLNavigationDestination(source: string): string {
  return source.replace(/[\t\n\r]/gu, '');
}

/** A backslash in model link data is literal data, not a browser path separator. */
export function renderedLinkDestination(value: string, htmlSource?: unknown): string {
  if (boundHTMLLinkSource(value, htmlSource)) return HTMLNavigationDestination(htmlSource);
  // Never move an authority separator into encoded user-info/hostname data.
  // Ambiguous HTTP authorities retain the browser's original parsing contract.
  if (/^https?:\/\/[^/?#]*\\/iu.test(value)) return value;
  return value.replace(/\\/gu, '%5C');
}

export function literalLinkAttributes(value: string, htmlSource?: unknown): Record<string, string> {
  if (boundHTMLLinkSource(value, htmlSource)) return {
    href: HTMLNavigationDestination(htmlSource), 'data-fountain-html-href': htmlSource,
  };
  const href = renderedLinkDestination(value);
  return href === value ? { href } : { href, 'data-fountain-link-href': value };
}

/** An imported source carrier must exactly reproduce the visible navigation href. */
export function restoredHTMLLinkSource(href: string, source: string | null): string | null {
  return validHTMLLinkSource(source) && HTMLNavigationDestination(source) === href
    && isSafeURL(href, { allowEmpty: true }) ? source : null;
}

export function needsHTMLLinkSource(source: string): boolean {
  if (!validHTMLLinkSource(source)) return false;
  const stored = importedHTMLLinkURL(source)!;
  return stored !== source || renderedLinkDestination(stored) !== HTMLNavigationDestination(source);
}

/** Restore only a bounded safe carrier exactly bound to the visible destination. */
export function restoredLinkDestination(href: string, source: string | null): string | null {
  return source !== null && source.length <= 2_048 && source.includes('\\')
    && isSafeURL(source, { allowEmpty: true }) && isSafeURL(href, { allowEmpty: true })
    && renderedLinkDestination(source) === href ? source : null;
}
