import { insertImage, type Editor, type ImageAttributes } from '../core';

export interface ImageUploadContext {
  editor: Editor;
  signal: AbortSignal;
}

export type ImageUploadResult = string | ImageAttributes;
export type ImageUploadHandler = (file: File, context: ImageUploadContext) => Promise<ImageUploadResult>;

export interface InsertImageFileOptions {
  upload?: ImageUploadHandler;
  maxInlineBytes?: number;
  alt?: string;
  caption?: string;
  width?: string;
  signal?: AbortSignal;
}

export function imageFileToDataURL(file: File, maxBytes = 8 * 1024 * 1024): Promise<string> {
  if (!file.type.startsWith('image/')) return Promise.reject(new TypeError(`${file.name || 'The selected file'} is not an image.`));
  if (file.size > maxBytes) return Promise.reject(new RangeError(`Image files embedded in the document must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller. Supply an upload handler for larger files.`));
  if (typeof FileReader === 'undefined') return Promise.reject(new Error('Reading local image files requires a browser FileReader implementation.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('The image file could not be read.'));
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('The image file did not produce a data URL.'));
    reader.readAsDataURL(file);
  });
}

/** Uploads or embeds a local image, then inserts a portable image node. */
export async function insertImageFile(editor: Editor, file: File, options: InsertImageFileOptions = {}): Promise<boolean> {
  const controller = new AbortController();
  const signal = options.signal ?? controller.signal;
  if (signal.aborted) throw new DOMException('Image insertion was cancelled.', 'AbortError');
  const result = options.upload
    ? await options.upload(file, { editor, signal })
    : await imageFileToDataURL(file, options.maxInlineBytes);
  if (signal.aborted) throw new DOMException('Image insertion was cancelled.', 'AbortError');
  const attrs = typeof result === 'string' ? { src: result } : result;
  return insertImage(editor, {
    alt: options.alt ?? file.name.replace(/\.[^.]+$/, ''),
    caption: options.caption ?? '',
    width: options.width ?? '100%',
    ...attrs,
  });
}
