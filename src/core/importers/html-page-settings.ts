import { isDocumentPageSettings, type DocumentPageSettings } from '../page-settings';

/** Only the HTML document body owns this metadata. It is not a block style or
 * a clipboard-fragment setting, and must never become executable CSS. */
export function readHTMLDocumentPageSettings(body: { getAttribute(name: string): string | null } | undefined): {
  readonly pageSettings?: DocumentPageSettings;
  readonly invalid: boolean;
} {
  const source = body?.getAttribute('data-fountain-page-settings');
  if (source === undefined || source === null) return { invalid: false };
  if (source.length > 2048) return { invalid: true };
  try {
    const value: unknown = JSON.parse(source);
    return isDocumentPageSettings(value) ? { pageSettings: value, invalid: false } : { invalid: true };
  } catch { return { invalid: true }; }
}
