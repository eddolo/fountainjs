import type { GlobalConstructorInstance } from '../core/platform';

export type BitmapFormat = 'png' | 'jpeg' | 'webp';

/** Encode a decoded image at intrinsic resolution. JPEG needs an opaque background. */
export function encodeBitmap(image: GlobalConstructorInstance<'HTMLImageElement', never>, format: BitmapFormat): Promise<GlobalConstructorInstance<'Blob'>> {
  if (format !== 'png' && format !== 'jpeg' && format !== 'webp') throw new Error('Unknown image format.');
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!width || !height || Math.max(width, height) > 16384 || width * height > 16_777_216) {
    throw new Error('This image is outside the supported bitmap dimensions. Choose SVG.');
  }
  const canvas = image.ownerDocument.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not create a drawing surface.');
  if (format === 'jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(image, 0, 0);
  const mime = 'image/' + format;
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob?.type === mime) resolve(blob);
    else reject(new Error(`This browser cannot export ${format.toUpperCase()}. Choose PNG or SVG.`));
  }, mime));
}
