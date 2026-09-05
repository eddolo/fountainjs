export interface SafeURLOptions {
  readonly allowDataImage?: boolean;
}

const DATA_IMAGE = /^data:image\/(?:png|gif|jpe?g|webp);base64,[a-z\d+/=\s]+$/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const EXPLICIT_SCHEME = /^[A-Za-z][A-Za-z\d+.-]*:/u;

/** Shared URL gate for persisted content, DOM rendering, and format boundaries. */
export function isSafeURL(value: unknown, options: SafeURLOptions = {}): value is string {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!url || CONTROL_CHARACTER.test(url)) return false;
  if (options.allowDataImage && DATA_IMAGE.test(url)) return true;
  if (url.startsWith('#')) return true;
  if (url.startsWith('/')) return !url.startsWith('//') && !url.startsWith('/\\');
  if (url.startsWith('./') || url.startsWith('../')) return true;
  if (/^mailto:/i.test(url)) return /^mailto:[^\s]+$/i.test(url);
  if (/^tel:/i.test(url)) return /^tel:[+\d][\d().\- ]*$/i.test(url);
  if (!EXPLICIT_SCHEME.test(url)) return !url.startsWith('\\');
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const URLConstructor = (globalThis as unknown as {
      URL?: new (value: string) => { protocol: string; hostname: string };
    }).URL;
    if (!URLConstructor) return false;
    const parsed = new URLConstructor(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}
