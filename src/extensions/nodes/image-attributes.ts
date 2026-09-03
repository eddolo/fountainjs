import { isSafeURL, type Attributes } from '../../core';

export type ImageAlignment = 'left' | 'center' | 'right';
export type ImageLoading = 'eager' | 'lazy';
export type ImageDecoding = 'auto' | 'sync' | 'async';

const CSS_SIZE = /^(?:auto|\d+(?:\.\d+)?(?:px|%|rem|em|vw|vh))$/;
const SRCSET_DESCRIPTOR = /^(?:\d+w|\d+(?:\.\d+)?x)$/;

export function isImageSize(value: unknown): boolean {
  return typeof value === 'string' && CSS_SIZE.test(value) && value.length <= 40;
}

export function isImageSrcset(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 20_000) return false;
  if (!value.trim()) return true;
  return value.split(',').every((candidate) => {
    const parts = candidate.trim().split(/\s+/);
    if (parts.length < 1 || parts.length > 2 || !isSafeURL(parts[0] ?? '')) return false;
    return parts.length === 1 || SRCSET_DESCRIPTOR.test(parts[1] ?? '');
  });
}

export function isImageSizes(value: unknown): boolean {
  return typeof value === 'string' && value.length <= 2_000 && !/[<>"']/.test(value);
}

export const imageAttributes = {
  src: { default: '', validate: (value: unknown) => isSafeURL(value, { allowDataImage: true }) },
  alt: { default: '', validate: (value: unknown) => typeof value === 'string' && value.length <= 10_000 },
  title: { default: '', validate: (value: unknown) => typeof value === 'string' && value.length <= 10_000 },
  width: { default: '100%', validate: isImageSize },
  height: { default: 'auto', validate: isImageSize },
  align: { default: 'center', validate: (value: unknown) => ['left', 'center', 'right'].includes(String(value)) },
  srcset: { default: '', validate: isImageSrcset },
  sizes: { default: '', validate: isImageSizes },
  loading: { default: 'lazy', validate: (value: unknown) => ['eager', 'lazy'].includes(String(value)) },
  decoding: { default: 'async', validate: (value: unknown) => ['auto', 'sync', 'async'].includes(String(value)) },
} as const;

export function imageDOMAttributes(attrs: Attributes): Attributes {
  return {
    src: attrs.src,
    alt: attrs.alt,
    title: attrs.title || undefined,
    srcset: attrs.srcset || undefined,
    sizes: attrs.sizes || undefined,
    loading: attrs.loading,
    decoding: attrs.decoding,
  };
}

export function imageText(attrs: Attributes): string {
  const description = String(attrs.alt || attrs.caption || attrs.title || '').trim();
  return description ? `[Image: ${description}]` : '[Image]';
}
