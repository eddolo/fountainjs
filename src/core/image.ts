import type { Editor } from './editor';
import { NodeSelection } from './selection';
import { Node, type Attributes } from './schema';
import { getNodeAtPath } from './transaction/path';
import { isSafeURL } from './url';

export interface ImageAttributes extends Attributes {
  src: string;
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
}

export interface ActiveImage {
  readonly path: readonly number[];
  readonly node: Node;
  readonly inline: boolean;
}

/** Creates a validated schema-owned block or inline image without dispatching it. */
export function createImageNode(editor: Editor, attrs: ImageAttributes, inline = false): Node | null {
  const source = attrs.src.trim();
  const type = editor.state.schema.nodes[inline ? 'inline_image' : 'image_super'];
  if (!type || !isSafeURL(source, { allowDataImage: true })) return null;
  try {
    return type.create({
      src: source,
      alt: attrs.alt ?? '',
      title: attrs.title ?? '',
      ...(inline ? {} : { caption: attrs.caption ?? '' }),
      width: attrs.width ?? (inline ? 'auto' : '100%'),
      height: attrs.height ?? (inline ? '1em' : 'auto'),
      align: attrs.align ?? 'center',
      srcset: attrs.srcset ?? '',
      sizes: attrs.sizes ?? '',
      loading: attrs.loading ?? 'lazy',
      decoding: attrs.decoding ?? 'async',
    });
  } catch { return null; }
}

/** Returns the selected block or inline image, optionally at an explicit path. */
export function getActiveImage(editor: Editor, path?: readonly number[]): ActiveImage | null {
  const targetPath = path ?? (editor.state.selection instanceof NodeSelection ? editor.state.selection.nodePath : null);
  if (!targetPath) return null;
  try {
    const node = getNodeAtPath(editor.state.doc, targetPath);
    if (!['image_super', 'inline_image'].includes(node.type.name)) return null;
    return { path: Object.freeze([...targetPath]), node, inline: node.type.name === 'inline_image' };
  } catch { return null; }
}
