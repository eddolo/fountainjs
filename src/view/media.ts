import {
  createImageNode,
  getActiveImage,
  insertInlineImage,
  nodeRangeAtPath,
  Selection,
  SelectionBookmark,
  setImageAttributes,
  topLevelPosition,
  type Editor,
  type ImageAttributes,
  type Node,
  type Transaction,
} from '../core';
import {
  createMediaNode,
  getActiveMedia,
  setMediaAttributes,
  type AudioAttributes,
  type FileAttachmentAttributes,
  type MediaAttributes,
  type MediaNodeName,
  type VideoAttributes,
} from '../extensions/media';

export interface ImageUploadContext {
  editor: Editor;
  signal: AbortSignal;
  /** Reports a normalized upload fraction from 0 through 1. */
  reportProgress(progress: number): void;
}

export type ImageUploadResult = string | ImageAttributes;
export type ImageUploadHandler = (file: File, context: ImageUploadContext) => Promise<ImageUploadResult>;
export type ImageUploadStatus = 'uploading' | 'succeeded' | 'failed' | 'cancelled';
export type ImageUploadPlacement = 'block' | 'inline';

export interface ImageUploadSnapshot {
  readonly id: string;
  readonly fileName: string;
  readonly status: ImageUploadStatus;
  readonly progress: number;
  readonly attempt: number;
  readonly error?: unknown;
}

export interface InsertImageFileOptions {
  upload?: ImageUploadHandler;
  maxInlineBytes?: number;
  alt?: string;
  title?: string;
  caption?: string;
  width?: string;
  height?: string;
  align?: 'left' | 'center' | 'right';
  srcset?: string;
  sizes?: string;
  loading?: 'eager' | 'lazy';
  decoding?: 'auto' | 'sync' | 'async';
  placement?: ImageUploadPlacement;
  /** Replaces a live block or inline image instead of inserting another node. */
  replacePath?: readonly number[];
  signal?: AbortSignal;
  onStatusChange?: (snapshot: ImageUploadSnapshot, task: ImageUploadTask) => void;
}

type UploadTarget =
  | { kind: 'block'; position: number }
  | { kind: 'inline'; bookmark: SelectionBookmark }
  | { kind: 'replace'; from: number; to: number; nodeType: 'image_super' | 'inline_image' };

let nextUploadId = 1;

function abortError(): DOMException {
  return new DOMException('Image insertion was cancelled.', 'AbortError');
}

export function imageFileToDataURL(file: File, maxBytes = 8 * 1024 * 1024, signal?: AbortSignal): Promise<string> {
  if (!file.type.startsWith('image/')) return Promise.reject(new TypeError(`${file.name || 'The selected file'} is not an image.`));
  if (!Number.isInteger(maxBytes) || maxBytes < 1) return Promise.reject(new RangeError('The embedded image byte limit must be a positive integer.'));
  const limit = maxBytes >= 1024 * 1024
    ? `${Math.round(maxBytes / 1024 / 1024)} MB`
    : maxBytes >= 1024 ? `${Math.round(maxBytes / 1024)} KB` : `${maxBytes} bytes`;
  if (file.size > maxBytes) return Promise.reject(new RangeError(`Image files embedded in the document must be ${limit} or smaller. Supply an upload handler for larger files.`));
  if (signal?.aborted) return Promise.reject(abortError());
  if (typeof FileReader === 'undefined') return Promise.reject(new Error('Reading local image files requires a browser FileReader implementation.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cancel = () => reader.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const cleanup = () => signal?.removeEventListener('abort', cancel);
    reader.onerror = () => { cleanup(); reject(reader.error ?? new Error('The image file could not be read.')); };
    reader.onabort = () => { cleanup(); reject(abortError()); };
    reader.onload = () => {
      cleanup();
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('The image file did not produce a data URL.'));
    };
    reader.readAsDataURL(file);
  });
}

function captureTarget(editor: Editor, options: InsertImageFileOptions): UploadTarget {
  if (options.replacePath) {
    const active = getActiveImage(editor, options.replacePath);
    if (!active) throw new Error('The replacement target is not an image.');
    const range = nodeRangeAtPath(editor.state.doc, active.path);
    return { kind: 'replace', ...range, nodeType: active.node.type.name as 'image_super' | 'inline_image' };
  }
  if (options.placement === 'inline') {
    if (!(editor.state.selection instanceof Selection) || !editor.state.selection.isSingleText) {
      throw new Error('Inline image uploads require a selection inside one text fragment.');
    }
    return { kind: 'inline', bookmark: SelectionBookmark.fromSelection(editor.state.doc, editor.state.selection) };
  }
  const index = Math.max(0, Math.min(
    editor.state.doc.childCount,
    (editor.state.selection.endPath[0] ?? editor.state.doc.childCount - 1) + 1,
  ));
  return { kind: 'block', position: topLevelPosition(editor.state.doc, index) };
}

function mapTarget(target: UploadTarget, transaction: Transaction): UploadTarget {
  if (target.kind === 'block') return { ...target, position: transaction.mapping.map(target.position, 1) };
  if (target.kind === 'inline') return { ...target, bookmark: target.bookmark.map(transaction.mapping) };
  return {
    ...target,
    from: transaction.mapping.map(target.from, 1),
    to: transaction.mapping.map(target.to, -1),
  };
}

function topLevelIndexAtPosition(doc: Node, position: number): number {
  let offset = 0;
  for (let index = 0; index < doc.childCount; index += 1) {
    if (position <= offset) return index;
    offset += doc.child(index).nodeSize;
  }
  return doc.childCount;
}

function findImageAtRange(doc: Node, target: Extract<UploadTarget, { kind: 'replace' }>): readonly number[] | null {
  let result: readonly number[] | null = null;
  doc.descendants((node, path) => {
    if (result || node.type.name !== target.nodeType) return !result;
    const range = nodeRangeAtPath(doc, path);
    if (range.from === target.from && range.to === target.to) {
      result = Object.freeze([...path]);
      return false;
    }
    return true;
  });
  return result;
}

function insertAtTarget(editor: Editor, target: UploadTarget, attrs: ImageAttributes): boolean {
  if (target.kind === 'inline') return insertInlineImage(editor, attrs, target.bookmark.resolve(editor.state.doc), false);
  if (target.kind === 'replace') {
    const path = findImageAtRange(editor.state.doc, target);
    if (!path) throw new Error('The image being replaced no longer exists.');
    return setImageAttributes(editor, attrs, path, false);
  }
  const image = createImageNode(editor, attrs);
  if (!image) return false;
  const index = topLevelIndexAtPosition(editor.state.doc, target.position);
  const transaction = editor.state.createTransaction().replace(index, index, [image]);
  editor.state.schema.validate(transaction.doc);
  editor.dispatch(transaction);
  return true;
}

function uploadAttributes(
  file: File,
  options: InsertImageFileOptions,
  result: ImageUploadResult,
  base: Partial<ImageAttributes> = {},
): ImageAttributes {
  const uploaded = typeof result === 'string' ? { src: result } : result;
  return {
    ...base,
    alt: options.alt ?? base.alt ?? file.name.replace(/\.[^.]+$/, ''),
    title: options.title ?? base.title ?? '',
    caption: options.caption ?? base.caption ?? '',
    width: options.width ?? base.width ?? (options.placement === 'inline' ? 'auto' : '100%'),
    height: options.height ?? base.height ?? (options.placement === 'inline' ? '1em' : 'auto'),
    align: options.align ?? base.align ?? 'center',
    srcset: options.srcset ?? base.srcset ?? '',
    sizes: options.sizes ?? base.sizes ?? '',
    loading: options.loading ?? base.loading ?? 'lazy',
    decoding: options.decoding ?? base.decoding ?? 'async',
    ...uploaded,
  };
}

/** A cancellable, observable upload whose insertion point maps through concurrent local edits. */
export class ImageUploadTask {
  readonly id = `image-upload-${nextUploadId++}`;
  private readonly listeners = new Set<(snapshot: ImageUploadSnapshot) => void>();
  private target: UploadTarget;
  private unsubscribe: () => void;
  private controller?: AbortController;
  private currentRun: Promise<boolean>;
  private state: ImageUploadSnapshot;
  private readonly baseAttributes: Partial<ImageAttributes>;

  constructor(private readonly editor: Editor, private readonly file: File, private readonly options: InsertImageFileOptions = {}) {
    this.baseAttributes = options.replacePath
      ? { ...(getActiveImage(editor, options.replacePath)?.node.attrs ?? {}) } as Partial<ImageAttributes>
      : {};
    this.target = captureTarget(editor, options);
    this.state = Object.freeze({ id: this.id, fileName: file.name, status: 'uploading', progress: 0, attempt: 1 });
    this.unsubscribe = editor.subscribe((_state, transaction) => { this.target = mapTarget(this.target, transaction); });
    try { options.onStatusChange?.(this.state, this); }
    catch { /* A host observer cannot corrupt upload state. */ }
    this.currentRun = this.execute();
  }

  get completion(): Promise<boolean> { return this.currentRun; }
  get snapshot(): ImageUploadSnapshot { return this.state; }

  subscribe(listener: (snapshot: ImageUploadSnapshot) => void): () => void {
    listener(this.state);
    if (this.state.status === 'succeeded' || this.state.status === 'cancelled') return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  cancel(): void {
    if (this.state.status !== 'uploading' && this.state.status !== 'failed') return;
    const wasFailed = this.state.status === 'failed';
    if (!wasFailed) this.controller?.abort();
    this.update({ status: 'cancelled', error: wasFailed ? this.state.error : abortError() });
    this.cleanup();
  }

  retry(): Promise<boolean> {
    if (this.state.status !== 'failed') return this.currentRun;
    this.update({ status: 'uploading', progress: 0, attempt: this.state.attempt + 1, error: undefined });
    this.currentRun = this.execute();
    return this.currentRun;
  }

  private update(change: Partial<ImageUploadSnapshot>): void {
    this.state = Object.freeze({ ...this.state, ...change });
    this.listeners.forEach((listener) => listener(this.state));
    try { this.options.onStatusChange?.(this.state, this); }
    catch { /* A host observer cannot corrupt upload state. */ }
  }

  private async execute(): Promise<boolean> {
    this.controller = new AbortController();
    const forwardAbort = () => this.cancel();
    this.options.signal?.addEventListener('abort', forwardAbort, { once: true });
    if (this.options.signal?.aborted) this.controller.abort();
    const reportProgress = (progress: number): void => {
      if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
        throw new RangeError('Image upload progress must be between 0 and 1.');
      }
      if (this.state.status === 'uploading') this.update({ progress });
    };
    try {
      if (this.controller.signal.aborted) throw abortError();
      const result = this.options.upload
        ? await this.options.upload(this.file, { editor: this.editor, signal: this.controller.signal, reportProgress })
        : await imageFileToDataURL(this.file, this.options.maxInlineBytes, this.controller.signal);
      if (this.controller.signal.aborted) throw abortError();
      reportProgress(1);
      if (!insertAtTarget(this.editor, this.target, uploadAttributes(this.file, this.options, result, this.baseAttributes))) {
        throw new Error('The uploaded image could not be inserted into this document.');
      }
      this.update({ status: 'succeeded', progress: 1, error: undefined });
      this.cleanup();
      return true;
    } catch (error) {
      if (this.state.status !== 'cancelled') this.update({
        status: this.controller.signal.aborted ? 'cancelled' : 'failed',
        error,
      });
      if (this.state.status === 'cancelled') this.cleanup();
      throw error;
    } finally {
      this.options.signal?.removeEventListener('abort', forwardAbort);
    }
  }

  private cleanup(): void {
    this.unsubscribe();
    this.listeners.clear();
  }
}

export function startImageUpload(editor: Editor, file: File, options: InsertImageFileOptions = {}): ImageUploadTask {
  return new ImageUploadTask(editor, file, options);
}

/** Uploads or embeds a local image, then inserts a portable image node. */
export async function insertImageFile(editor: Editor, file: File, options: InsertImageFileOptions = {}): Promise<boolean> {
  return startImageUpload(editor, file, options).completion;
}

export type AssetUploadKind = 'audio' | 'video' | 'file';

export interface AssetUploadContext {
  readonly editor: Editor;
  readonly signal: AbortSignal;
  readonly kind: AssetUploadKind;
  /** Reports a normalized upload fraction from 0 through 1. */
  reportProgress(progress: number): void;
}

export type AssetUploadResult = string | Partial<AudioAttributes | VideoAttributes | FileAttachmentAttributes>;
export type AssetUploadHandler = (file: File, context: AssetUploadContext) => Promise<AssetUploadResult>;
export type AssetUploadStatus = ImageUploadStatus;

export interface AssetUploadSnapshot {
  readonly id: string;
  readonly fileName: string;
  readonly kind: AssetUploadKind;
  readonly status: AssetUploadStatus;
  readonly progress: number;
  readonly attempt: number;
  readonly error?: unknown;
}

export interface InsertAssetFileOptions {
  /** Defaults from the MIME type: audio, video, or a downloadable file. */
  kind?: AssetUploadKind;
  upload: AssetUploadHandler;
  attributes?: Partial<AudioAttributes | VideoAttributes | FileAttachmentAttributes>;
  /** Replaces a live audio, video, or file node instead of inserting another one. */
  replacePath?: readonly number[];
  signal?: AbortSignal;
  onStatusChange?: (snapshot: AssetUploadSnapshot, task: AssetUploadTask) => void;
}

type AssetUploadTarget =
  | { kind: 'block'; position: number }
  | { kind: 'replace'; from: number; to: number; nodeType: Exclude<MediaNodeName, 'embed'> };

let nextAssetUploadId = 1;

function assetAbortError(): DOMException {
  return new DOMException('Asset insertion was cancelled.', 'AbortError');
}

export function assetKindForFile(file: Pick<File, 'type'>): AssetUploadKind {
  if (file.type.toLowerCase().startsWith('audio/')) return 'audio';
  if (file.type.toLowerCase().startsWith('video/')) return 'video';
  return 'file';
}

function assetNodeName(kind: AssetUploadKind): Exclude<MediaNodeName, 'embed'> {
  return kind === 'file' ? 'file_attachment' : kind;
}

function captureAssetTarget(editor: Editor, options: InsertAssetFileOptions, kind: AssetUploadKind): AssetUploadTarget {
  if (options.replacePath) {
    const active = getActiveMedia(editor, options.replacePath);
    if (!active || active.kind === 'embed') throw new Error('The replacement target is not an uploaded asset.');
    if (active.kind !== assetNodeName(kind)) throw new Error(`A ${kind} upload cannot replace ${active.kind}.`);
    const range = nodeRangeAtPath(editor.state.doc, active.path);
    return { kind: 'replace', ...range, nodeType: active.kind };
  }
  const index = Math.max(0, Math.min(
    editor.state.doc.childCount,
    (editor.state.selection.endPath[0] ?? editor.state.doc.childCount - 1) + 1,
  ));
  return { kind: 'block', position: topLevelPosition(editor.state.doc, index) };
}

function mapAssetTarget(target: AssetUploadTarget, transaction: Transaction): AssetUploadTarget {
  if (target.kind === 'block') return { ...target, position: transaction.mapping.map(target.position, 1) };
  return {
    ...target,
    from: transaction.mapping.map(target.from, 1),
    to: transaction.mapping.map(target.to, -1),
  };
}

function findAssetAtRange(doc: Node, target: Extract<AssetUploadTarget, { kind: 'replace' }>): readonly number[] | null {
  let result: readonly number[] | null = null;
  doc.descendants((node, path) => {
    if (result || node.type.name !== target.nodeType) return !result;
    const range = nodeRangeAtPath(doc, path);
    if (range.from === target.from && range.to === target.to) {
      result = Object.freeze([...path]);
      return false;
    }
    return true;
  });
  return result;
}

function assetAttributes(
  file: File,
  kind: AssetUploadKind,
  options: InsertAssetFileOptions,
  result: AssetUploadResult,
  base: Partial<MediaAttributes>,
): MediaAttributes {
  const uploaded = typeof result === 'string' ? { src: result } : result;
  const supplied = options.attributes ?? {};
  if (kind === 'file') return {
    ...base,
    name: file.name || 'Download file',
    mimeType: file.type,
    size: file.size,
    description: '',
    downloadName: file.name,
    ...supplied,
    ...uploaded,
  } as FileAttachmentAttributes;
  return {
    ...base,
    title: file.name.replace(/\.[^.]+$/, ''),
    caption: '',
    controls: true,
    autoplay: false,
    loop: false,
    muted: false,
    preload: 'metadata',
    controlsList: '',
    crossOrigin: '',
    disableRemotePlayback: false,
    tracks: [],
    ...(kind === 'video' ? { poster: '', width: '100%', height: 'auto', align: 'center', playsInline: true } : {}),
    ...supplied,
    ...uploaded,
  } as AudioAttributes | VideoAttributes;
}

function insertAssetAtTarget(
  editor: Editor,
  target: AssetUploadTarget,
  kind: AssetUploadKind,
  attrs: MediaAttributes,
): boolean {
  if (target.kind === 'replace') {
    const path = findAssetAtRange(editor.state.doc, target);
    if (!path) throw new Error('The asset being replaced no longer exists.');
    return setMediaAttributes(editor, attrs, path, false);
  }
  const media = createMediaNode(editor, assetNodeName(kind), attrs);
  if (!media) return false;
  const index = topLevelIndexAtPosition(editor.state.doc, target.position);
  const transaction = editor.state.createTransaction().replace(index, index, [media]);
  editor.state.schema.validate(transaction.doc);
  editor.dispatch(transaction);
  return true;
}

/** A cancellable asset upload whose insertion or replacement maps through concurrent edits. */
export class AssetUploadTask {
  readonly id = `asset-upload-${nextAssetUploadId++}`;
  readonly kind: AssetUploadKind;
  private readonly listeners = new Set<(snapshot: AssetUploadSnapshot) => void>();
  private target: AssetUploadTarget;
  private unsubscribe: () => void;
  private controller?: AbortController;
  private currentRun: Promise<boolean>;
  private state: AssetUploadSnapshot;
  private readonly baseAttributes: Partial<MediaAttributes>;

  constructor(private readonly editor: Editor, private readonly file: File, private readonly options: InsertAssetFileOptions) {
    if (typeof options.upload !== 'function') throw new TypeError('Asset uploads require a host upload handler.');
    this.kind = options.kind ?? assetKindForFile(file);
    if (!['audio', 'video', 'file'].includes(this.kind)) {
      throw new TypeError('Asset upload kind must be audio, video, or file.');
    }
    const active = options.replacePath ? getActiveMedia(editor, options.replacePath) : null;
    this.baseAttributes = active ? { ...active.node.attrs } as Partial<MediaAttributes> : {};
    this.target = captureAssetTarget(editor, options, this.kind);
    this.state = Object.freeze({ id: this.id, fileName: file.name, kind: this.kind, status: 'uploading', progress: 0, attempt: 1 });
    this.unsubscribe = editor.subscribe((_state, transaction) => { this.target = mapAssetTarget(this.target, transaction); });
    try { options.onStatusChange?.(this.state, this); }
    catch { /* A host observer cannot corrupt upload state. */ }
    this.currentRun = this.execute();
  }

  get completion(): Promise<boolean> { return this.currentRun; }
  get snapshot(): AssetUploadSnapshot { return this.state; }

  subscribe(listener: (snapshot: AssetUploadSnapshot) => void): () => void {
    listener(this.state);
    if (this.state.status === 'succeeded' || this.state.status === 'cancelled') return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  cancel(): void {
    if (this.state.status !== 'uploading' && this.state.status !== 'failed') return;
    const wasFailed = this.state.status === 'failed';
    if (!wasFailed) this.controller?.abort();
    this.update({ status: 'cancelled', error: wasFailed ? this.state.error : assetAbortError() });
    this.cleanup();
  }

  retry(): Promise<boolean> {
    if (this.state.status !== 'failed') return this.currentRun;
    this.update({ status: 'uploading', progress: 0, attempt: this.state.attempt + 1, error: undefined });
    this.currentRun = this.execute();
    return this.currentRun;
  }

  private update(change: Partial<AssetUploadSnapshot>): void {
    this.state = Object.freeze({ ...this.state, ...change });
    this.listeners.forEach((listener) => listener(this.state));
    try { this.options.onStatusChange?.(this.state, this); }
    catch { /* A host observer cannot corrupt upload state. */ }
  }

  private async execute(): Promise<boolean> {
    this.controller = new AbortController();
    const forwardAbort = () => this.cancel();
    this.options.signal?.addEventListener('abort', forwardAbort, { once: true });
    if (this.options.signal?.aborted) this.controller.abort();
    const reportProgress = (progress: number): void => {
      if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
        throw new RangeError('Asset upload progress must be between 0 and 1.');
      }
      if (this.state.status === 'uploading') this.update({ progress });
    };
    try {
      if (this.controller.signal.aborted) throw assetAbortError();
      const result = await this.options.upload(this.file, {
        editor: this.editor,
        signal: this.controller.signal,
        kind: this.kind,
        reportProgress,
      });
      if (this.controller.signal.aborted) throw assetAbortError();
      reportProgress(1);
      if (!insertAssetAtTarget(
        this.editor,
        this.target,
        this.kind,
        assetAttributes(this.file, this.kind, this.options, result, this.baseAttributes),
      )) throw new Error('The uploaded asset could not be inserted into this document.');
      this.update({ status: 'succeeded', progress: 1, error: undefined });
      this.cleanup();
      return true;
    } catch (error) {
      if (this.state.status !== 'cancelled') this.update({
        status: this.controller.signal.aborted ? 'cancelled' : 'failed',
        error,
      });
      if (this.state.status === 'cancelled') this.cleanup();
      throw error;
    } finally {
      this.options.signal?.removeEventListener('abort', forwardAbort);
    }
  }

  private cleanup(): void {
    this.unsubscribe();
    this.listeners.clear();
  }
}

export function startAssetUpload(editor: Editor, file: File, options: InsertAssetFileOptions): AssetUploadTask {
  return new AssetUploadTask(editor, file, options);
}

/** Uploads a local audio, video, or arbitrary file through a caller-owned adapter. */
export async function insertAssetFile(editor: Editor, file: File, options: InsertAssetFileOptions): Promise<boolean> {
  return startAssetUpload(editor, file, options).completion;
}
