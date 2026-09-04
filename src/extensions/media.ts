import {
  Node,
  NodeSelection,
  deleteSelection,
  insertNode,
  isSafeURL,
  type Attributes,
  type Editor,
  type NodeSpec,
  type NodeViewLike,
} from '../core';
import { getNodeAtPath } from '../core/transaction/path';
import { defineExtension, type FountainExtension } from './extension';

export type MediaNodeName = 'audio' | 'video' | 'file_attachment' | 'embed';
export type MediaAlignment = 'left' | 'center' | 'right';
export type MediaPreload = 'none' | 'metadata' | 'auto';
export type MediaCrossOrigin = '' | 'anonymous' | 'use-credentials';

export interface MediaTrack {
  readonly src: string;
  readonly kind: 'subtitles' | 'captions' | 'descriptions' | 'chapters' | 'metadata';
  readonly srclang?: string;
  readonly label?: string;
  readonly default?: boolean;
}

export interface AudioAttributes extends Attributes {
  src: string;
  title?: string;
  caption?: string;
  controls?: boolean;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  preload?: MediaPreload;
  controlsList?: string;
  crossOrigin?: MediaCrossOrigin;
  disableRemotePlayback?: boolean;
  tracks?: readonly MediaTrack[];
}

export interface VideoAttributes extends AudioAttributes {
  poster?: string;
  width?: string;
  height?: string;
  align?: MediaAlignment;
  playsInline?: boolean;
}

export interface FileAttachmentAttributes extends Attributes {
  src: string;
  name: string;
  mimeType?: string;
  size?: number;
  description?: string;
  downloadName?: string;
}

export interface EmbedAttributes extends Attributes {
  /** A provider-approved, canonical iframe URL. */
  src: string;
  provider?: string;
  title: string;
  caption?: string;
  width?: string;
  height?: string;
  align?: MediaAlignment;
  allow?: string;
  sandbox?: string;
  allowFullscreen?: boolean;
}

export interface EmbedInsertOptions {
  title: string;
  caption?: string;
  width?: string;
  height?: string;
  align?: MediaAlignment;
  allow?: string;
  sandbox?: string;
  allowFullscreen?: boolean;
}

export type MediaAttributes = AudioAttributes | VideoAttributes | FileAttachmentAttributes | EmbedAttributes;

export interface ActiveMedia {
  readonly path: readonly number[];
  readonly node: Node;
  readonly kind: MediaNodeName;
}

export interface EmbedProvider {
  /** Stable identifier persisted with the embed, for example `youtube`. */
  readonly name: string;
  /** Converts a public or already-embedded URL into a canonical iframe URL. */
  resolve(source: URL): string | null;
  /** Permissions applied when this provider is inserted. */
  readonly allow?: string;
  /** Iframe sandbox tokens. An empty string means the strictest sandbox. */
  readonly sandbox?: string;
  readonly allowFullscreen?: boolean;
}

export interface MediaExtensionOptions {
  /** Replaces the default privacy-enhanced YouTube and Vimeo providers. */
  readonly embedProviders?: readonly EmbedProvider[];
}

const MEDIA_NAMES = new Set<MediaNodeName>(['audio', 'video', 'file_attachment', 'embed']);
const MAX_TEXT = 20_000;
const MAX_TRACKS = 32;
const CSS_SIZE = /^(?:auto|\d+(?:\.\d+)?(?:px|%|rem|em|vw|vh))$/;
const SAFE_CONTROLS_LIST = new Set(['nodownload', 'nofullscreen', 'noremoteplayback']);
const SAFE_SANDBOX = new Set([
  'allow-downloads', 'allow-forms', 'allow-modals', 'allow-orientation-lock', 'allow-pointer-lock',
  'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-presentation', 'allow-same-origin',
  'allow-scripts', 'allow-storage-access-by-user-activation', 'allow-top-navigation-by-user-activation',
]);
const SAFE_ALLOW = new Set([
  'accelerometer', 'autoplay', 'clipboard-write', 'encrypted-media', 'fullscreen', 'gyroscope',
  'picture-in-picture', 'web-share',
]);

function boundedText(value: unknown, max = MAX_TEXT): value is string {
  return typeof value === 'string' && value.length <= max && !value.includes('\0');
}

function mediaSize(value: unknown): boolean {
  return typeof value === 'string' && value.length <= 40 && CSS_SIZE.test(value);
}

function tokenList(value: unknown, allowed: ReadonlySet<string>, delimiter: RegExp): boolean {
  if (typeof value !== 'string' || value.length > 1_000) return false;
  return value.split(delimiter).map((token) => token.trim()).filter(Boolean).every((token) => allowed.has(token));
}

function tokenSubset(value: unknown, ceiling: unknown, delimiter: RegExp): boolean {
  if (typeof value !== 'string' || typeof ceiling !== 'string') return false;
  const allowed = new Set(ceiling.split(delimiter).map((token) => token.trim()).filter(Boolean));
  return value.split(delimiter).map((token) => token.trim()).filter(Boolean).every((token) => allowed.has(token));
}

function validTrack(value: unknown): value is MediaTrack {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const track = value as Partial<MediaTrack>;
  return isSafeURL(track.src)
    && ['subtitles', 'captions', 'descriptions', 'chapters', 'metadata'].includes(String(track.kind))
    && (track.srclang === undefined || (boundedText(track.srclang, 35) && /^[a-z0-9-]*$/i.test(track.srclang)))
    && (track.label === undefined || boundedText(track.label, 300))
    && (track.default === undefined || typeof track.default === 'boolean');
}

function validTracks(value: unknown): value is readonly MediaTrack[] {
  return Array.isArray(value)
    && value.length <= MAX_TRACKS
    && value.every(validTrack)
    && value.filter((track) => track.default).length <= 1;
}

function copyTracks(value: unknown): readonly MediaTrack[] {
  if (!validTracks(value)) return [];
  return Object.freeze(value.map((track) => Object.freeze({ ...track })));
}

function safeWebURL(value: unknown): value is string {
  return isSafeURL(value) && !/^mailto:|^tel:|^#/i.test(value.trim());
}

function canonicalURL(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url : null;
  } catch { return null; }
}

const YOUTUBE_ID = /^[\w-]{6,15}$/;

export const YouTubeEmbedProvider: EmbedProvider = Object.freeze({
  name: 'youtube',
  allow: 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen',
  sandbox: 'allow-scripts allow-same-origin allow-presentation',
  allowFullscreen: true,
  resolve(source: URL) {
    const host = source.hostname.toLowerCase().replace(/^www\./, '');
    let id = '';
    if (host === 'youtu.be') id = source.pathname.split('/').filter(Boolean)[0] ?? '';
    else if (host === 'youtube.com' || host === 'm.youtube.com') {
      id = source.pathname.startsWith('/embed/') || source.pathname.startsWith('/shorts/')
        ? source.pathname.split('/')[2] ?? ''
        : source.searchParams.get('v') ?? '';
    } else if (host === 'youtube-nocookie.com' && source.pathname.startsWith('/embed/')) {
      id = source.pathname.split('/')[2] ?? '';
    }
    if (!YOUTUBE_ID.test(id)) return null;
    const destination = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
    const start = Number(source.searchParams.get('start') ?? source.searchParams.get('t'));
    if (Number.isInteger(start) && start > 0 && start <= 86_400) destination.searchParams.set('start', String(start));
    return destination.href;
  },
});

export const VimeoEmbedProvider: EmbedProvider = Object.freeze({
  name: 'vimeo',
  allow: 'autoplay; fullscreen; picture-in-picture',
  sandbox: 'allow-scripts allow-same-origin allow-presentation',
  allowFullscreen: true,
  resolve(source: URL) {
    const host = source.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null;
    const parts = source.pathname.split('/').filter(Boolean);
    const id = host === 'player.vimeo.com' && parts[0] === 'video' ? parts[1] : parts[0];
    return id && /^\d{5,15}$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  },
});

export const DefaultEmbedProviders = Object.freeze([YouTubeEmbedProvider, VimeoEmbedProvider]);

function normalizeProviders(providers: readonly EmbedProvider[]): readonly EmbedProvider[] {
  if (!providers.length) return Object.freeze([]);
  const names = new Set<string>();
  return Object.freeze(providers.map((provider) => {
    if (!provider || !/^[a-z][a-z0-9_-]{0,49}$/i.test(provider.name) || names.has(provider.name)) {
      throw new TypeError('Embed providers require unique, stable names containing only letters, numbers, underscores, or hyphens.');
    }
    if (typeof provider.resolve !== 'function') throw new TypeError(`Embed provider ${provider.name} requires a resolve function.`);
    if (!tokenList(provider.allow ?? '', SAFE_ALLOW, /[;]+/)) throw new TypeError(`Embed provider ${provider.name} declares an unsafe allow permission.`);
    if (!tokenList(provider.sandbox ?? '', SAFE_SANDBOX, /\s+/)) throw new TypeError(`Embed provider ${provider.name} declares an unsafe sandbox token.`);
    names.add(provider.name);
    return Object.freeze({ ...provider });
  }));
}

function resolveWithProvider(
  value: string,
  providers: readonly EmbedProvider[],
): { provider: EmbedProvider; src: string } | null {
  const source = canonicalURL(value.trim());
  if (!source) return null;
  for (const provider of providers) {
    let resolved: string | null = null;
    try { resolved = provider.resolve(source); }
    catch { resolved = null; }
    if (!resolved) continue;
    const canonical = canonicalURL(resolved);
    if (!canonical) continue;
    return { provider, src: canonical.href };
  }
  return null;
}

function boolAttr(value: unknown): boolean { return value === true; }

const playbackAttributes = {
  src: { default: '', validate: safeWebURL },
  title: { default: '', validate: (value: unknown) => boundedText(value, 1_000) },
  caption: { default: '', validate: boundedText },
  controls: { default: true, validate: (value: unknown) => typeof value === 'boolean' },
  autoplay: { default: false, validate: (value: unknown) => typeof value === 'boolean' },
  loop: { default: false, validate: (value: unknown) => typeof value === 'boolean' },
  muted: { default: false, validate: (value: unknown) => typeof value === 'boolean' },
  preload: { default: 'metadata', validate: (value: unknown) => ['none', 'metadata', 'auto'].includes(String(value)) },
  controlsList: { default: '', validate: (value: unknown) => tokenList(value, SAFE_CONTROLS_LIST, /\s+/) },
  crossOrigin: { default: '', validate: (value: unknown) => ['', 'anonymous', 'use-credentials'].includes(String(value)) },
  disableRemotePlayback: { default: false, validate: (value: unknown) => typeof value === 'boolean' },
  tracks: { default: Object.freeze([]), validate: validTracks },
} as const;

function trackSpecs(tracks: unknown): [string, ...any[]][] {
  return copyTracks(tracks).map((track) => ['track', {
    src: track.src,
    kind: track.kind,
    srclang: track.srclang || undefined,
    label: track.label || undefined,
    default: track.default === true,
  }]);
}

function playbackDOM(node: Node, kind: 'audio' | 'video'): [string, ...any[]] {
  const attrs = node.attrs;
  return [kind, {
    src: attrs.src,
    title: attrs.title || undefined,
    controls: boolAttr(attrs.controls),
    autoplay: boolAttr(attrs.autoplay),
    loop: boolAttr(attrs.loop),
    muted: boolAttr(attrs.muted),
    preload: attrs.preload,
    controlslist: attrs.controlsList || undefined,
    crossorigin: attrs.crossOrigin || undefined,
    disableremoteplayback: boolAttr(attrs.disableRemotePlayback),
    ...(kind === 'video' ? {
      poster: attrs.poster || undefined,
      playsinline: boolAttr(attrs.playsInline),
      style: `width:100%;height:${String(attrs.height)}`,
    } : {}),
  }, ...trackSpecs(attrs.tracks)];
}

function mediaText(node: Node): string {
  const name = String(node.attrs.title || node.attrs.name || node.attrs.caption || '').trim();
  const label = node.type.name === 'file_attachment' ? 'File'
    : node.type.name === 'embed' ? 'Embed'
      : node.type.name === 'video' ? 'Video' : 'Audio';
  return name ? `[${label}: ${name}]` : `[${label}]`;
}

interface MediaEditorView { readonly editor: Editor }

/** Framework-neutral native media/file/embed NodeView with safe, accessible controls. */
class MediaNodeView implements NodeViewLike {
  readonly dom = document.createElement('figure');
  private current: Node;
  private interactive?: HTMLElement;
  private readonly caption = document.createElement('figcaption');
  private readonly error = document.createElement('div');
  private readonly retry = document.createElement('button');

  constructor(node: Node, private readonly view: unknown) {
    this.current = node;
    this.dom.className = `fountain-media fountain-media--${node.type.name.replace('_attachment', '')}`;
    this.dom.tabIndex = -1;
    this.dom.setAttribute('role', 'group');
    this.caption.className = 'fountain-media__caption';
    this.error.className = 'fountain-media__error';
    this.error.contentEditable = 'false';
    this.error.setAttribute('role', 'status');
    this.error.textContent = 'This media could not be loaded. ';
    this.retry.type = 'button';
    this.retry.textContent = 'Retry';
    this.retry.addEventListener('click', this.retryMedia);
    this.error.append(this.retry);
    this.render();
  }

  update(node: Node): boolean {
    if (node.type !== this.current.type) return false;
    this.current = node;
    this.render();
    return true;
  }

  selectNode(): void { this.dom.dataset.fountainMediaSelected = 'true'; }
  deselectNode(): void { delete this.dom.dataset.fountainMediaSelected; }

  stopEvent(event: Event): boolean {
    const target = event.target as globalThis.Node | null;
    return Boolean(target && (this.interactive?.contains(target) || this.error.contains(target)));
  }

  ignoreMutation(mutation: MutationRecord): boolean {
    if (this.error.contains(mutation.target)) return true;
    return mutation.target === this.dom
      && ['data-fountain-media-selected', 'data-fountain-media-error'].includes(mutation.attributeName ?? '');
  }

  destroy(): void {
    this.detachMediaListeners();
    this.retry.removeEventListener('click', this.retryMedia);
  }

  private get editable(): boolean { return (this.view as Partial<MediaEditorView> | null)?.editor?.editable === true; }

  private render(): void {
    this.detachMediaListeners();
    const { attrs } = this.current;
    this.dom.dataset.align = String(attrs.align || 'center');
    this.dom.style.width = String(attrs.width || '100%');
    this.dom.style.maxWidth = '100%';
    this.dom.setAttribute('aria-label', mediaText(this.current));
    this.error.hidden = true;
    delete this.dom.dataset.fountainMediaError;
    const content = this.createInteractive();
    this.interactive = content;
    this.caption.textContent = String(attrs.caption || attrs.description || '');
    this.caption.hidden = !this.caption.textContent;
    this.retry.hidden = !this.editable;
    this.dom.replaceChildren(content, this.caption, this.error);
    this.attachMediaListeners();
  }

  private createInteractive(): HTMLElement {
    const { attrs } = this.current;
    if (this.current.type.name === 'file_attachment') {
      const card = document.createElement('a');
      card.className = 'fountain-file';
      card.href = String(attrs.src);
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      if (attrs.downloadName) card.download = String(attrs.downloadName);
      const name = document.createElement('strong');
      name.textContent = String(attrs.name || 'Download file');
      const meta = document.createElement('span');
      const bytes = Number(attrs.size || 0);
      meta.textContent = [String(attrs.mimeType || ''), bytes > 0 ? formatBytes(bytes) : ''].filter(Boolean).join(' · ');
      card.append(name, meta);
      return card;
    }
    if (this.current.type.name === 'embed') {
      const frame = document.createElement('iframe');
      frame.className = 'fountain-embed';
      frame.src = String(attrs.src);
      frame.title = String(attrs.title);
      frame.loading = 'lazy';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.setAttribute('sandbox', String(attrs.sandbox || ''));
      if (attrs.allow) frame.setAttribute('allow', String(attrs.allow));
      if (attrs.allowFullscreen) frame.setAttribute('allowfullscreen', '');
      frame.style.width = '100%';
      frame.style.height = String(attrs.height || '360px');
      return frame;
    }
    const element = document.createElement(this.current.type.name) as HTMLMediaElement;
    element.className = 'fountain-media__native';
    element.src = String(attrs.src);
    element.title = String(attrs.title || '');
    element.controls = attrs.controls !== false;
    element.autoplay = attrs.autoplay === true;
    element.loop = attrs.loop === true;
    element.muted = attrs.muted === true;
    element.preload = (['none', 'metadata', 'auto'].includes(String(attrs.preload)) ? String(attrs.preload) : 'metadata') as MediaPreload;
    if (attrs.controlsList) element.setAttribute('controlslist', String(attrs.controlsList));
    if (attrs.crossOrigin) element.crossOrigin = String(attrs.crossOrigin);
    if (attrs.disableRemotePlayback) element.setAttribute('disableremoteplayback', '');
    if (element instanceof HTMLVideoElement) {
      element.poster = String(attrs.poster || '');
      element.playsInline = attrs.playsInline !== false;
      element.style.width = '100%';
      element.style.height = String(attrs.height || 'auto');
    }
    copyTracks(attrs.tracks).forEach((track) => {
      const child = document.createElement('track');
      child.src = track.src;
      child.kind = track.kind;
      child.srclang = track.srclang ?? '';
      child.label = track.label ?? '';
      child.default = track.default === true;
      element.append(child);
    });
    return element;
  }

  private attachMediaListeners(): void {
    if (!(this.interactive instanceof HTMLMediaElement)) return;
    this.interactive.addEventListener('loadedmetadata', this.onLoad);
    this.interactive.addEventListener('error', this.onError);
  }

  private detachMediaListeners(): void {
    if (!(this.interactive instanceof HTMLMediaElement)) return;
    this.interactive.removeEventListener('loadedmetadata', this.onLoad);
    this.interactive.removeEventListener('error', this.onError);
  }

  private onLoad = (): void => {
    delete this.dom.dataset.fountainMediaError;
    this.error.hidden = true;
  };

  private onError = (): void => {
    this.dom.dataset.fountainMediaError = 'true';
    this.error.hidden = false;
  };

  private retryMedia = (): void => {
    if (!(this.interactive instanceof HTMLMediaElement)) return;
    this.error.hidden = true;
    this.interactive.load();
  };
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const power = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** power).toFixed(power ? 1 : 0)} ${units[power]}`;
}

function mediaNodeSpecs(providers: readonly EmbedProvider[]): Record<MediaNodeName, NodeSpec> {
  const validEmbed = (value: unknown): value is string => typeof value === 'string'
    && resolveWithProvider(value, providers)?.src === canonicalURL(value.trim())?.href;
  return {
    audio: {
      group: 'block', atom: true,
      attrs: playbackAttributes,
      toText: mediaText,
      toDOM: (node) => ['figure', { class: 'fountain-media fountain-media--audio' }, playbackDOM(node, 'audio'), ['figcaption', String(node.attrs.caption ?? '')]],
      nodeView: MediaNodeView,
    },
    video: {
      group: 'block', atom: true,
      attrs: {
        ...playbackAttributes,
        poster: { default: '', validate: (value: unknown) => value === '' || isSafeURL(value, { allowDataImage: true }) },
        width: { default: '100%', validate: mediaSize },
        height: { default: 'auto', validate: mediaSize },
        align: { default: 'center', validate: (value: unknown) => ['left', 'center', 'right'].includes(String(value)) },
        playsInline: { default: true, validate: (value: unknown) => typeof value === 'boolean' },
      },
      toText: mediaText,
      toDOM: (node) => ['figure', {
        class: 'fountain-media fountain-media--video',
        'data-align': node.attrs.align,
        style: `width:${String(node.attrs.width)};max-width:100%`,
      }, playbackDOM(node, 'video'), ['figcaption', String(node.attrs.caption ?? '')]],
      nodeView: MediaNodeView,
    },
    file_attachment: {
      group: 'block', atom: true,
      attrs: {
        src: { default: '', validate: safeWebURL },
        name: { default: 'Download file', validate: (value: unknown) => boundedText(value, 1_000) && value.trim().length > 0 },
        mimeType: { default: '', validate: (value: unknown) => boundedText(value, 255) && !/[<>]/.test(value) },
        size: { default: 0, validate: (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 },
        description: { default: '', validate: boundedText },
        downloadName: { default: '', validate: (value: unknown) => boundedText(value, 1_000) && !/[\\/]/.test(value) },
      },
      toText: mediaText,
      toDOM: (node) => ['figure', { class: 'fountain-media fountain-media--file' },
        ['a', {
          class: 'fountain-file', href: node.attrs.src, target: '_blank', rel: 'noopener noreferrer',
          download: node.attrs.downloadName || undefined,
        }, ['strong', String(node.attrs.name)], ['span', [String(node.attrs.mimeType || ''), Number(node.attrs.size) > 0 ? formatBytes(Number(node.attrs.size)) : ''].filter(Boolean).join(' · ')]],
        ['figcaption', String(node.attrs.description ?? '')]],
      nodeView: MediaNodeView,
    },
    embed: {
      group: 'block', atom: true,
      attrs: {
        src: { default: '', validate: validEmbed },
        provider: { default: '', validate: (value: unknown) => boundedText(value, 50) && /^[a-z0-9_-]*$/i.test(value) },
        title: { default: 'Embedded content', validate: (value: unknown) => boundedText(value, 1_000) && value.trim().length > 0 },
        caption: { default: '', validate: boundedText },
        width: { default: '100%', validate: mediaSize },
        height: { default: '360px', validate: mediaSize },
        align: { default: 'center', validate: (value: unknown) => ['left', 'center', 'right'].includes(String(value)) },
        allow: { default: '', validate: (value: unknown) => tokenList(value, SAFE_ALLOW, /[;]+/) },
        sandbox: { default: '', validate: (value: unknown) => tokenList(value, SAFE_SANDBOX, /\s+/) },
        allowFullscreen: { default: false, validate: (value: unknown) => typeof value === 'boolean' },
      },
      validate: (node) => {
        const resolved = resolveWithProvider(String(node.attrs.src), providers);
        return Boolean(
          resolved
          && resolved.provider.name === node.attrs.provider
          && resolved.src === node.attrs.src
          && tokenSubset(node.attrs.allow, resolved.provider.allow ?? '', /[;]+/)
          && tokenSubset(node.attrs.sandbox, resolved.provider.sandbox ?? '', /\s+/)
          && (node.attrs.allowFullscreen !== true || resolved.provider.allowFullscreen === true)
        );
      },
      toText: mediaText,
      toDOM: (node) => ['figure', {
        class: 'fountain-media fountain-media--embed',
        'data-align': node.attrs.align,
        style: `width:${String(node.attrs.width)};max-width:100%`,
      }, ['iframe', {
        class: 'fountain-embed', src: node.attrs.src, title: node.attrs.title,
        loading: 'lazy', referrerpolicy: 'strict-origin-when-cross-origin',
        sandbox: node.attrs.sandbox, allow: node.attrs.allow || undefined,
        allowfullscreen: boolAttr(node.attrs.allowFullscreen),
        style: `width:100%;height:${String(node.attrs.height)}`,
      }], ['figcaption', String(node.attrs.caption ?? '')]],
      nodeView: MediaNodeView,
    },
  };
}

function normalizedMediaAttrs(kind: MediaNodeName, attrs: MediaAttributes): MediaAttributes {
  if (kind === 'audio' || kind === 'video') return { ...attrs, src: String(attrs.src ?? '').trim(), tracks: copyTracks(attrs.tracks) };
  return { ...attrs, src: String(attrs.src ?? '').trim() };
}

/** Creates a schema-owned media node without dispatching it. */
export function createMediaNode(editor: Editor, kind: MediaNodeName, attrs: MediaAttributes): Node | null {
  const type = editor.state.schema.nodes[kind];
  if (!type) return null;
  try { return type.create(normalizedMediaAttrs(kind, attrs)); }
  catch { return null; }
}

export function getActiveMedia(editor: Editor, path?: readonly number[]): ActiveMedia | null {
  const targetPath = path ?? (editor.state.selection instanceof NodeSelection ? editor.state.selection.nodePath : null);
  if (!targetPath) return null;
  try {
    const node = getNodeAtPath(editor.state.doc, targetPath);
    if (!MEDIA_NAMES.has(node.type.name as MediaNodeName)) return null;
    return { path: Object.freeze([...targetPath]), node, kind: node.type.name as MediaNodeName };
  } catch { return null; }
}

function insertMedia(editor: Editor, kind: MediaNodeName, attrs: MediaAttributes): boolean {
  const node = createMediaNode(editor, kind, attrs);
  return node ? insertNode(editor, node) : false;
}

export function insertAudio(editor: Editor, attrs: AudioAttributes): boolean { return insertMedia(editor, 'audio', attrs); }
export function insertVideo(editor: Editor, attrs: VideoAttributes): boolean { return insertMedia(editor, 'video', attrs); }
export function insertFileAttachment(editor: Editor, attrs: FileAttachmentAttributes): boolean { return insertMedia(editor, 'file_attachment', attrs); }

export function insertEmbed(
  editor: Editor,
  source: string,
  attrs: EmbedInsertOptions,
  providers: readonly EmbedProvider[] = DefaultEmbedProviders,
): boolean {
  const resolved = resolveWithProvider(source, normalizeProviders(providers));
  if (!resolved) return false;
  return insertMedia(editor, 'embed', {
    src: resolved.src,
    provider: resolved.provider.name,
    title: attrs.title,
    caption: attrs.caption ?? '',
    width: attrs.width ?? '100%',
    height: attrs.height ?? '360px',
    align: attrs.align ?? 'center',
    allow: attrs.allow ?? resolved.provider.allow ?? '',
    sandbox: attrs.sandbox ?? resolved.provider.sandbox ?? '',
    allowFullscreen: attrs.allowFullscreen ?? resolved.provider.allowFullscreen ?? false,
  });
}

export function setEmbed(
  editor: Editor,
  source: string,
  attrs: EmbedInsertOptions,
  path?: readonly number[],
  providers: readonly EmbedProvider[] = DefaultEmbedProviders,
): boolean {
  const active = getActiveMedia(editor, path);
  if (!active || active.kind !== 'embed') return false;
  const normalizedProviders = normalizeProviders(providers);
  const resolved = resolveWithProvider(source, normalizedProviders);
  if (!resolved) return false;
  return setMediaAttributes(editor, {
    src: resolved.src,
    provider: resolved.provider.name,
    title: attrs.title,
    caption: attrs.caption ?? '',
    width: attrs.width ?? active.node.attrs.width,
    height: attrs.height ?? active.node.attrs.height,
    align: attrs.align ?? active.node.attrs.align,
    allow: attrs.allow ?? resolved.provider.allow ?? '',
    sandbox: attrs.sandbox ?? resolved.provider.sandbox ?? '',
    allowFullscreen: attrs.allowFullscreen ?? resolved.provider.allowFullscreen ?? false,
  }, active.path);
}

/** Validates and updates the selected media, file, or embed node. */
export function setMediaAttributes(
  editor: Editor,
  attrs: Partial<MediaAttributes>,
  path?: readonly number[],
  selectUpdated = true,
): boolean {
  if (!editor.editable) return false;
  const active = getActiveMedia(editor, path);
  if (!active) return false;
  const next = normalizedMediaAttrs(active.kind, { ...active.node.attrs, ...attrs } as MediaAttributes);
  try {
    const replacement = active.node.type.create(next);
    const transaction = editor.state.createTransaction().replaceNode(active.path, [replacement]);
    if (selectUpdated) transaction.setSelection(new NodeSelection(transaction.doc, active.path));
    editor.dispatch(transaction);
    return true;
  } catch { return false; }
}

export function deleteMedia(editor: Editor, path?: readonly number[]): boolean {
  const active = getActiveMedia(editor, path);
  if (!active || !editor.editable) return false;
  if (!path && editor.state.selection instanceof NodeSelection) return deleteSelection(editor);
  try {
    editor.dispatch(editor.state.createTransaction().setSelection(new NodeSelection(editor.state.doc, active.path)));
    return deleteSelection(editor);
  } catch { return false; }
}

/** Creates the opt-in media module with a caller-owned embed allowlist. */
export function createMediaExtension(options: MediaExtensionOptions = {}): FountainExtension {
  const providers = normalizeProviders(options.embedProviders ?? DefaultEmbedProviders);
  return defineExtension({
    name: 'media',
    nodes: mediaNodeSpecs(providers),
    commands: {
      insertAudio,
      insertVideo,
      insertFileAttachment,
      insertEmbed: (editor, source: string, attrs: EmbedInsertOptions) => (
        insertEmbed(editor, source, attrs, providers)
      ),
      setEmbed: (editor, source: string, attrs: EmbedInsertOptions, path?: readonly number[]) => (
        setEmbed(editor, source, attrs, path, providers)
      ),
      setMediaAttributes,
      deleteMedia,
    },
    services: { embedProviders: providers },
  });
}

export const MediaExtension = createMediaExtension();
