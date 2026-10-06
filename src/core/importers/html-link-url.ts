import { isSafeURL } from '../url';

/** HTML-only literal-data projection; never relax the persisted URL gate. */
export function importedHTMLLinkURL(value: string): string | null {
  if (!/[\t\n\r]/u.test(value)) return isSafeURL(value, { allowEmpty: true }) ? value : null;
  // Browsers remove these characters before parsing a scheme. Check that
  // interpretation first so encoding cannot hide an unsafe scheme/network path.
  const compact = value.replace(/[\t\n\r]/gu, '');
  if (!isSafeURL(compact, { allowEmpty: true })) return null;
  // Only ordinary relative/fragment and literal HTTP(S) destinations use this
  // data projection, not mail headers, custom schemes or repaired protocols.
  // An absolute destination must retain its literal protocol and authority.
  // Encoding an authority backslash could otherwise change which host wins.
  if (/^[a-z][a-z\d+.-]*:/iu.test(compact.trim())
    && !/^https?:\/\/[^/?#\\\t\n\r]+(?=[/?#]|$)/iu.test(value)) return null;
  const encoded = value.replace(/[\t\n\r\\]/gu, character =>
    `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
  return isSafeURL(encoded, { allowEmpty: true }) ? encoded : null;
}
