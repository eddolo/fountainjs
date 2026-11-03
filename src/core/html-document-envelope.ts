/** Source DATA only. Ordinary reader HTML keeps its own safe HTML5 envelope. */
export interface HTMLDocumentEnvelope {
  readonly version: 1;
  readonly doctype: string | null;
  readonly mode: 'no-quirks' | 'quirks' | 'limited-quirks';
}
export const HTML_ENVELOPE_ATTRIBUTE = 'data-fountain-html-source-envelope';
export function isHTMLDocumentEnvelope(value: unknown): value is HTMLDocumentEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return Object.keys(data).length === 3 && data.version === 1
    && typeof data.mode === 'string' && ['no-quirks', 'quirks', 'limited-quirks'].includes(data.mode)
    && (data.doctype === null || typeof data.doctype === 'string' && data.doctype.length <= 2048
      && /^<!doctype\s[\s\S]*>$/iu.test(data.doctype)
      && !/\0|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(data.doctype));
}
export function readHTMLDocumentEnvelope(body: { getAttribute(name: string): string | null } | undefined): HTMLDocumentEnvelope | undefined {
  const encoded = body?.getAttribute(HTML_ENVELOPE_ATTRIBUTE);
  if (!encoded || encoded.length > 16_384) return undefined;
  try { const value: unknown = JSON.parse(encoded); return isHTMLDocumentEnvelope(value) ? value : undefined; }
  catch { return undefined; }
}
