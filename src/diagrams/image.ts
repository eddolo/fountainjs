import type { GlobalConstructorInstance } from '../core/platform';
import { encodeBitmap, type BitmapFormat } from '../view/encode-bitmap';

export type DiagramImageFormat = 'svg' | BitmapFormat;

/** Export the current rendered preview, including its intrinsic dimensions and accessible title. */
export async function exportMermaidImage(image: GlobalConstructorInstance<'HTMLImageElement', never>, format: DiagramImageFormat): Promise<GlobalConstructorInstance<'Blob'>> {
  await image.decode();
  if (format !== 'svg') return encodeBitmap(image, format);
  if (!image.src.startsWith('data:image/svg+xml;charset=utf-8,')) throw new Error('Expected an embedded Mermaid preview.');
  // Keep renderer output in SVG image context when a recipient opens the standalone file.
  const svg = image.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(image.naturalWidth));
  svg.setAttribute('height', String(image.naturalHeight));
  svg.setAttribute('viewBox', `0 0 ${image.naturalWidth} ${image.naturalHeight}`);
  const title = image.ownerDocument.createElementNS(svg.namespaceURI, 'title');
  title.textContent = image.alt;
  const drawing = image.ownerDocument.createElementNS(svg.namespaceURI, 'image');
  drawing.setAttribute('href', image.src);
  drawing.setAttribute('width', '100%');
  drawing.setAttribute('height', '100%');
  svg.append(title, drawing);
  return new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
}
