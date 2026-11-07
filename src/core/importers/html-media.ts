import type { Attributes, Node, Schema } from '../schema';
import { isSafeURL } from '../url';

interface MediaChild {
  readonly textContent: string | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
}

interface MediaElement extends MediaChild {
  readonly style: { readonly width?: string; readonly height?: string; readonly maxWidth?: string }
    | Readonly<Record<string, string | undefined>>;
  readonly dataset: Readonly<Record<string, string | undefined>>;
  querySelector(selector: string): MediaChild | null;
  querySelectorAll(selector: string): ArrayLike<MediaChild>;
}

function mediaSize(value: string, fallback: string): string {
  const normalized = value.trim();
  if (/^(?:auto|\d+(?:\.\d+)?(?:px|%|rem|em|vw|vh))$/.test(normalized)) return normalized;
  if (/^\d+(?:\.\d+)?$/.test(normalized) && Number(normalized) > 0) return `${normalized}px`;
  return fallback;
}

function mediaAlignment(container?: MediaElement): string {
  const align = container?.dataset.align ?? '';
  return ['left', 'center', 'right'].includes(align) ? align : 'center';
}

export function htmlImageDimensions(image: MediaElement, block: boolean, container?: MediaElement) {
  return {
    width: mediaSize(container?.style.width || container?.style.maxWidth || image.style.width || image.getAttribute('width') || '', block ? '100%' : 'auto'),
    height: mediaSize(image.style.height || image.getAttribute('height') || '', block ? 'auto' : '1em'),
  };
}

export function htmlImageAttributes(image: MediaElement, container?: MediaElement): Attributes {
  const decoding = image.getAttribute('decoding') ?? '';
  return {
    alt: image.getAttribute('alt') ?? '',
    title: image.getAttribute('title') ?? '',
    align: mediaAlignment(container),
    srcset: image.getAttribute('srcset') ?? '',
    sizes: image.getAttribute('sizes') ?? '',
    loading: image.getAttribute('loading') === 'eager' ? 'eager' : 'lazy',
    decoding: ['auto', 'sync', 'async'].includes(decoding) ? decoding : 'async',
  };
}

function mediaTracks(element: MediaElement): readonly Record<string, unknown>[] {
  return Array.from(element.querySelectorAll(':scope > track')).flatMap((track) => {
    const src = track.getAttribute('src') ?? '';
    const kind = track.getAttribute('kind') ?? '';
    if (!isSafeURL(src) || !['subtitles', 'captions', 'descriptions', 'chapters', 'metadata'].includes(kind)) return [];
    return [{
      src,
      kind,
      srclang: track.getAttribute('srclang') ?? '',
      label: track.getAttribute('label') ?? '',
      default: track.hasAttribute('default'),
    }];
  });
}

function mediaWidth(element: MediaElement): string {
  return mediaSize(element.style.width || element.getAttribute('width') || '', '100%');
}

export function playbackNode(element: MediaElement, schema: Schema, kind: 'audio' | 'video', container?: MediaElement): Node | null {
  const type = schema.nodes[kind];
  const src = element.getAttribute('src') ?? element.querySelector('source')?.getAttribute('src') ?? '';
  if (!type || !isSafeURL(src)) return null;
  const crossOrigin = element.getAttribute('crossorigin') ?? '';
  const preload = element.getAttribute('preload') ?? '';
  const common = {
    src,
    title: element.getAttribute('title') ?? '',
    caption: container?.querySelector(':scope > figcaption')?.textContent ?? '',
    controls: element.hasAttribute('controls'),
    autoplay: element.hasAttribute('autoplay'),
    loop: element.hasAttribute('loop'),
    muted: element.hasAttribute('muted'),
    preload: ['none', 'metadata', 'auto'].includes(preload) ? preload : 'metadata',
    controlsList: element.getAttribute('controlslist') ?? '',
    crossOrigin: ['', 'anonymous', 'use-credentials'].includes(crossOrigin) ? crossOrigin : '',
    disableRemotePlayback: element.hasAttribute('disableremoteplayback'),
    tracks: mediaTracks(element),
  };
  try {
    return type.create(kind === 'video' ? {
      ...common,
      poster: element.getAttribute('poster') ?? '',
      width: mediaWidth(container ?? element),
      height: mediaSize(element.style.height || element.getAttribute('height') || '', 'auto'),
      align: mediaAlignment(container),
      playsInline: element.hasAttribute('playsinline'),
    } : common);
  } catch { return null; }
}

export function fileNode(element: MediaElement, schema: Schema, container?: MediaElement): Node | null {
  const src = element.getAttribute('href') ?? '';
  if (!schema.nodes.file_attachment || !isSafeURL(src)) return null;
  try {
    return schema.node('file_attachment', {
      src,
      name: element.dataset.name || element.textContent?.trim() || 'Download file',
      mimeType: element.dataset.mimeType ?? '',
      size: Math.max(0, Number(element.dataset.size) || 0),
      description: container?.querySelector(':scope > figcaption')?.textContent ?? '',
      downloadName: element.getAttribute('download') ?? '',
    });
  } catch { return null; }
}

export function embedNode(element: MediaElement, schema: Schema, container?: MediaElement): Node | null {
  const src = element.getAttribute('src') ?? '';
  if (!schema.nodes.embed || !isSafeURL(src)) return null;
  try {
    return schema.node('embed', {
      src,
      provider: container?.dataset.provider ?? '',
      title: element.getAttribute('title')?.trim() || 'Embedded content',
      caption: container?.querySelector(':scope > figcaption')?.textContent ?? '',
      width: mediaWidth(container ?? element),
      height: mediaSize(element.style.height || element.getAttribute('height') || '', '360px'),
      align: mediaAlignment(container),
      allow: element.getAttribute('allow') ?? '',
      sandbox: element.getAttribute('sandbox') ?? '',
      allowFullscreen: element.hasAttribute('allowfullscreen'),
    });
  } catch { return null; }
}
