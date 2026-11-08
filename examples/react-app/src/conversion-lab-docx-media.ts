import { unzipSync } from 'fflate';
import type { DOCXPackagePart } from 'fountainjs-editor/docx';
import { rasterType } from '../../../src/docx/raster-type';

const labDOCXFileLimit = 4 * 1024 * 1024;

/** Read only the selected media part from the original, already inventoried file. */
export function recoverLabDOCXImage(archive: Uint8Array, part: DOCXPackagePart) {
  const segments = part.path.split('/');
  const name = segments.at(-1);
  if (!name || part.handling !== 'unrepresented-media' || part.path === '__proto__' || /[\\\u0000-\u001f\u007f]/u.test(part.path)
    || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('Select an unrepresented media file from the Word archive.');
  }
  if (archive.length > labDOCXFileLimit || !Number.isSafeInteger(part.declaredBytes)
    || part.declaredBytes < 1 || part.declaredBytes > labDOCXFileLimit) {
    throw new Error('Image recovery supports DOCX files and individual images up to 4 MiB.');
  }
  let found = false;
  const entries = unzipSync(archive, { filter: entry => {
    if (entry.name !== part.path) return false;
    if (found || entry.originalSize !== part.declaredBytes) throw new Error('The image does not match the original package inventory.');
    found = true;
    return true;
  } });
  const bytes = entries[part.path];
  if (!found || bytes?.length !== part.declaredBytes) throw new Error('The selected image bytes could not be recovered.');
  const type = rasterType(bytes);
  if (!type) throw new Error('This part is not a supported PNG, JPEG, GIF or WebP image.');
  const stem = name.replace(/\.[^.]+$/u, '').replace(/^\.+/u, '') || 'recovered-image';
  return { bytes, type, fileName: `${stem}.${type.slice('image/'.length)}` };
}
