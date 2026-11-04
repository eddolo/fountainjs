import { Schema, CoreSchemaSpec, HTMLExporter } from '../dist/index.js';
import { ServerHTMLImporter } from '../dist/html-server.js';
import { importDOCX, exportDOCX } from '../dist/docx.js';
import { strFromU8, unzipSync } from 'fflate';
export default { async fetch(request) {
  const schema = new Schema(CoreSchemaSpec);
  const document = importDOCX(await request.arrayBuffer(), schema).document;
  const images = document.content.filter(node => node.type.name === 'image_super');
  const exported = exportDOCX(document);
  const reopened = importDOCX(exported.bytes, schema).document;
  const reopenedImages = reopened.content.filter(node => node.type.name === 'image_super');
  return Response.json({ noDOM: typeof globalThis.document === 'undefined',
    dimensions: images.map(node => [node.attrs.width, node.attrs.height]),
    imageGaps: images.map(node => node.attrs.imageLayout.spacingAfter),
    htmlEqual: ServerHTMLImporter.parse(HTMLExporter.export(document), schema).eq(document),
    nativeLayoutEqual: JSON.stringify(images.map(node => node.attrs.imageLayout)) === JSON.stringify(reopenedImages.map(node => node.attrs.imageLayout)),
    assetsEqual: images.every((node, index) => node.attrs.src === reopenedImages[index].attrs.src),
    nativeExtent: strFromU8(unzipSync(exported.bytes)['word/document.xml']).includes('<wp:extent cx="5394960" cy="1726387"/>') });
} };
