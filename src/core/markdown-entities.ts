import { decodeHTMLStrict } from 'entities/decode';

const CHARACTER_REFERENCE = /&(?:#[0-9]{1,7}|#[xX][0-9A-Fa-f]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/gu;
const MARKDOWN_ESCAPE_OR_CHARACTER_REFERENCE = /\\[\s\S]|&(?:#[0-9]{1,7}|#[xX][0-9A-Fa-f]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/gu;

function isAsciiPunctuation(value: string): boolean {
  const code = value.charCodeAt(0);
  return (code >= 0x21 && code <= 0x2f)
    || (code >= 0x3a && code <= 0x40)
    || (code >= 0x5b && code <= 0x60)
    || (code >= 0x7b && code <= 0x7e);
}

/** CommonMark recognizes only semicolon-terminated HTML5 character references. */
export function decodeMarkdownEntities(value: string): string {
  return value.replace(CHARACTER_REFERENCE, (candidate) => decodeHTMLStrict(candidate));
}

/** Decode references and escapes together so an escaped ampersand stays literal. */
export function decodeMarkdownText(value: string): string {
  return value.replace(MARKDOWN_ESCAPE_OR_CHARACTER_REFERENCE, (candidate) => {
    if (candidate[0] !== '\\') return decodeHTMLStrict(candidate);
    return isAsciiPunctuation(candidate[1]) ? candidate[1] : candidate;
  });
}

/** Protect literal entity-shaped text before canonical Markdown serialization. */
export function escapeMarkdownEntityOpeners(value: string): string {
  return value.replace(CHARACTER_REFERENCE, (candidate) => (
    decodeHTMLStrict(candidate) === candidate ? candidate : `\\${candidate}`
  ));
}
