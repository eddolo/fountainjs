import { readImageCaptionAttributes, readImageParagraphAttributes } from '../image-caption';
import type { Attributes, Mark, Node, Schema } from '../schema';
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

interface FigureElement extends MediaElement {
  readonly tagName: string;
  readonly children: ArrayLike<unknown>;
  matches(selector: string): boolean;
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

function htmlImageDimensions(image: MediaElement, block: boolean, container?: MediaElement) {
  return {
    width: mediaSize(container?.style.width || container?.style.maxWidth || image.style.width || image.getAttribute('width') || '', block ? '100%' : 'auto'),
    height: mediaSize(image.style.height || image.getAttribute('height') || '', block ? 'auto' : '1em'),
  };
}

function htmlImageAttributes(image: MediaElement, container?: MediaElement): Attributes {
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

export function projectImage<E extends FigureElement>(
  image: E, schema: Schema, type: 'image_super' | 'inline_image',
  inlineCaption: (caption: E) => Node[], container?: E, marks: readonly Mark[] = [], rejectURL?: () => void,
): Node | null {
  const src = image.getAttribute('src') ?? '';
  if (!isSafeURL(src, { allowDataImage: true })) {
    rejectURL?.();
    return null;
  }
  if (!schema.nodes[type]) return null;
  const block = type === 'image_super';
  const dimensions = htmlImageDimensions(image, block, container);
  const caption = block ? container?.querySelector(':scope > figcaption') as E | null | undefined : null;
  const rich = caption && (container?.getAttribute('data-fountain-rich-caption') === 'true' || caption.children.length > 0);
  const content = rich ? inlineCaption(caption) : [];
  try {
    return schema.node(type, {
      src,
      ...htmlImageAttributes(image, container),
      ...dimensions,
      ...(block ? { caption: rich ? '' : caption?.textContent ?? '', ...readImageCaptionAttributes(caption ?? null), ...readImageParagraphAttributes(image) } : {}),
    }, content, undefined, marks);
  } catch { return null; }
}

export function projectMediaFigure<E extends FigureElement>(
  figure: E, children: readonly E[], hasExtraText: boolean, schema: Schema, image: (element: E) => Node | null,
): Node | null {
  if (hasExtraText) return null;
  const kind = figure.getAttribute('data-fountain-media');
  const playback = kind === 'audio' || kind === 'video';
  const imageFigure = !playback && kind !== 'file' && kind !== 'embed';
  const selector = playback ? kind : kind === 'file' ? 'a[data-fountain-file]' : kind === 'embed' ? 'iframe' : 'img';
  const media = children.filter(child => child.matches(selector));
  if (media.length !== 1) return null;
  const element = media[0];
  const captions = children.filter(child => child.tagName.toLowerCase() === 'figcaption');
  if (captions.length > 1 || !imageFigure && captions[0]?.children.length) return null;
  const previews = kind === 'file' ? children.filter(child => child.matches('img.fountain-file__preview')
    && child.getAttribute('src') === element.getAttribute('href')
    && child.getAttribute('alt') === `Preview of ${element.getAttribute('data-name')}`) : [];
  if (previews.length > 1 || children.some(child => child !== element && child !== captions[0] && child !== previews[0])) return null;
  if (playback) return playbackNode(element, schema, kind, figure);
  if (kind === 'file') return fileNode(element, schema, figure);
  if (kind === 'embed') return embedNode(element, schema, figure);
  return image(element);
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
