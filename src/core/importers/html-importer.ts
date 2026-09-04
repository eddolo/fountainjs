import { Mark, Node as FountainNode, type Schema } from '../schema';
import { isSafeURL } from '../url';

const HAS_EMOJI = /\p{Extended_Pictographic}/u;

function unicodeEmojiName(value: string): string {
  return `unicode-${Array.from(value).map((character) => character.codePointAt(0)?.toString(16)).join('-')}`;
}

function textNodes(value: string, schema: Schema, marks: readonly Mark[]): FountainNode[] {
  if (!value || !schema.nodes.emoji || !HAS_EMOJI.test(value)) return value ? [schema.text(value, marks)] : [];
  const segments = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value), (part) => part.segment)
    : Array.from(value);
  const result: FountainNode[] = [];
  let pending = '';
  const flush = () => {
    if (pending) result.push(schema.text(pending, marks));
    pending = '';
  };
  segments.forEach((segment) => {
    if (!HAS_EMOJI.test(segment)) { pending += segment; return; }
    flush();
    try { result.push(schema.node('emoji', { name: unicodeEmojiName(segment), emoji: segment })); }
    catch { result.push(schema.text(segment, marks)); }
  });
  flush();
  return result;
}

function inlineChildren(parent: globalThis.Node, schema: Schema, marks: readonly Mark[] = []): FountainNode[] {
  const result: FountainNode[] = [];
  parent.childNodes.forEach((child) => {
    if (child.nodeType === globalThis.Node.TEXT_NODE) {
      if (child.textContent) result.push(...textNodes(child.textContent, schema, marks));
      return;
    }
    if (!(child instanceof HTMLElement)) return;
    const tag = child.tagName.toLowerCase();
    if (tag === 'br' && schema.nodes.hard_break) { result.push(schema.node('hard_break')); return; }
    if (tag === 'img' && schema.nodes.inline_image) {
      const image = imageNode(child as HTMLImageElement, schema, 'inline_image');
      if (image) result.push(image);
      return;
    }
    if (child.getAttribute('data-fountain-math') === 'inline' && schema.nodes.inline_math) {
      const latex = child.getAttribute('data-latex') ?? child.textContent ?? '';
      const ariaLabel = child.getAttribute('data-math-aria-label') ?? '';
      try { result.push(schema.node('inline_math', { latex, ariaLabel })); }
      catch { if (latex) result.push(schema.text(latex, marks)); }
      return;
    }
    if (child.hasAttribute('data-fountain-mention') && schema.nodes.mention) {
      const id = child.getAttribute('data-id') ?? '';
      const href = child.getAttribute('href') ?? '';
      try {
        result.push(schema.node('mention', {
          id,
          label: child.getAttribute('data-label') ?? '',
          trigger: child.getAttribute('data-trigger') ?? '@',
          kind: child.getAttribute('data-kind') ?? 'mention',
          href: href && isSafeURL(href) ? href : '',
        }));
      } catch { result.push(...textNodes(child.textContent ?? '', schema, marks)); }
      return;
    }
    if (child.hasAttribute('data-fountain-emoji') && schema.nodes.emoji) {
      const emoji = child.getAttribute('data-emoji') ?? '';
      const fallback = child.getAttribute('data-fallback-image')
        ?? child.querySelector('img')?.getAttribute('src')
        ?? '';
      try {
        result.push(schema.node('emoji', {
          name: child.getAttribute('data-name') ?? unicodeEmojiName(emoji),
          emoji,
          fallbackImage: fallback && isSafeURL(fallback, { allowDataImage: true }) ? fallback : '',
        }));
      } catch { result.push(...textNodes(emoji || child.textContent || '', schema, marks)); }
      return;
    }
    let nextMarks = [...marks];
    const markName = ({ strong: 'strong', b: 'strong', em: 'em', i: 'em', u: 'underline', s: 'strike', del: 'strike', code: 'code', mark: 'highlight', sub: 'subscript', sup: 'superscript' } as Record<string, string>)[tag];
    if (markName && schema.marks[markName]) nextMarks.push(schema.mark(markName));
    const color = /(?:^|;)\s*color\s*:\s*(#[\da-f]{6})(?:\s*;|$)/i.exec(child.getAttribute('style') ?? '')?.[1];
    if (color && schema.marks.text_color && /^#[\da-f]{6}$/i.test(color)) nextMarks.push(schema.mark('text_color', { color }));
    if (tag === 'a' && schema.marks.link) {
      const href = child.getAttribute('href') ?? '';
      const anchor = child as HTMLAnchorElement;
      if (isSafeURL(href)) nextMarks.push(schema.mark('link', { href, title: anchor.title, target: anchor.target === '_self' ? '_self' : '_blank' }));
    }
    result.push(...inlineChildren(child, schema, nextMarks));
  });
  return result;
}

function imageSize(value: string, fallback: string): string {
  const normalized = value.trim();
  if (/^(?:auto|\d+(?:\.\d+)?(?:px|%|rem|em|vw|vh))$/.test(normalized)) return normalized;
  if (/^\d+(?:\.\d+)?$/.test(normalized) && Number(normalized) > 0) return `${normalized}px`;
  return fallback;
}

function imageNode(
  image: HTMLImageElement,
  schema: Schema,
  type: 'image_super' | 'inline_image',
  container?: HTMLElement,
): FountainNode | null {
  const src = image.getAttribute('src') ?? '';
  if (!isSafeURL(src, { allowDataImage: true }) || !schema.nodes[type]) return null;
  const block = type === 'image_super';
  const width = imageSize(
    container?.style.width || container?.style.maxWidth || image.style.width || image.getAttribute('width') || '',
    block ? '100%' : 'auto',
  );
  const height = imageSize(image.style.height || image.getAttribute('height') || '', block ? 'auto' : '1em');
  try {
    return schema.node(type, {
      src,
      alt: image.alt,
      title: image.title,
      width,
      height,
      align: ['left', 'center', 'right'].includes(container?.dataset.align ?? '') ? container?.dataset.align : 'center',
      srcset: image.getAttribute('srcset') ?? '',
      sizes: image.getAttribute('sizes') ?? '',
      loading: image.getAttribute('loading') === 'eager' ? 'eager' : 'lazy',
      decoding: ['auto', 'sync', 'async'].includes(image.getAttribute('decoding') ?? '') ? image.getAttribute('decoding') : 'async',
      ...(block ? { caption: container?.querySelector(':scope > figcaption')?.textContent ?? '' } : {}),
    });
  } catch { return null; }
}

function mediaTracks(element: HTMLMediaElement): readonly Record<string, unknown>[] {
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

function mediaSizeFromElement(element: HTMLElement, fallback: string): string {
  return imageSize(element.style.width || element.getAttribute('width') || '', fallback);
}

function playbackNode(
  element: HTMLMediaElement,
  schema: Schema,
  kind: 'audio' | 'video',
  container?: HTMLElement,
): FountainNode | null {
  const type = schema.nodes[kind];
  const src = element.getAttribute('src') ?? element.querySelector('source')?.getAttribute('src') ?? '';
  if (!type || !isSafeURL(src)) return null;
  const crossOrigin = element.getAttribute('crossorigin') ?? '';
  const common = {
    src,
    title: element.getAttribute('title') ?? '',
    caption: container?.querySelector(':scope > figcaption')?.textContent ?? '',
    controls: element.hasAttribute('controls'),
    autoplay: element.hasAttribute('autoplay'),
    loop: element.hasAttribute('loop'),
    muted: element.hasAttribute('muted'),
    preload: ['none', 'metadata', 'auto'].includes(element.getAttribute('preload') ?? '') ? element.getAttribute('preload') : 'metadata',
    controlsList: element.getAttribute('controlslist') ?? '',
    crossOrigin: ['', 'anonymous', 'use-credentials'].includes(crossOrigin) ? crossOrigin : '',
    disableRemotePlayback: element.hasAttribute('disableremoteplayback'),
    tracks: mediaTracks(element),
  };
  try {
    return type.create(kind === 'video' ? {
      ...common,
      poster: element.getAttribute('poster') ?? '',
      width: mediaSizeFromElement(container ?? element, '100%'),
      height: imageSize(element.style.height || element.getAttribute('height') || '', 'auto'),
      align: ['left', 'center', 'right'].includes(container?.dataset.align ?? '') ? container?.dataset.align : 'center',
      playsInline: element.hasAttribute('playsinline'),
    } : common);
  } catch { return null; }
}

function fileNode(element: HTMLAnchorElement, schema: Schema, container?: HTMLElement): FountainNode | null {
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

function embedNode(element: HTMLIFrameElement, schema: Schema, container?: HTMLElement): FountainNode | null {
  const src = element.getAttribute('src') ?? '';
  if (!schema.nodes.embed || !isSafeURL(src)) return null;
  try {
    return schema.node('embed', {
      src,
      provider: container?.dataset.provider ?? '',
      title: element.getAttribute('title')?.trim() || 'Embedded content',
      caption: container?.querySelector(':scope > figcaption')?.textContent ?? '',
      width: mediaSizeFromElement(container ?? element, '100%'),
      height: imageSize(element.style.height || element.getAttribute('height') || '', '360px'),
      align: ['left', 'center', 'right'].includes(container?.dataset.align ?? '') ? container?.dataset.align : 'center',
      allow: element.getAttribute('allow') ?? '',
      sandbox: element.getAttribute('sandbox') ?? '',
      allowFullscreen: element.hasAttribute('allowfullscreen'),
    });
  } catch { return null; }
}

function alignment(element: Element): 'left' | 'center' | 'right' | 'justify' {
  const value = (element as HTMLElement).style.textAlign || element.getAttribute('align') || 'left';
  return ['left', 'center', 'right', 'justify'].includes(value) ? value as 'left' | 'center' | 'right' | 'justify' : 'left';
}

function paragraph(element: Element, schema: Schema): FountainNode {
  const content = inlineChildren(element, schema);
  return schema.node('paragraph', { align: alignment(element) }, content.length ? content : [schema.text('')]);
}

function tableCellWidths(cell: Element, colspan: number): number[] | null {
  const declared = (cell.getAttribute('data-colwidth') ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number);
  if (declared.length === colspan && declared.every((width) => Number.isInteger(width) && width >= 40 && width <= 2_000)) {
    return declared;
  }
  const styleWidth = Math.round(Number.parseFloat((cell as HTMLElement).style.width));
  if (colspan === 1 && Number.isInteger(styleWidth) && styleWidth >= 40 && styleWidth <= 2_000) return [styleWidth];
  return null;
}

const LIST_BLOCK_TAGS = new Set(['p', 'div', 'blockquote', 'pre', 'ul', 'ol', 'table', 'figure', 'img', 'audio', 'video', 'iframe', 'hr']);

function listItemContent(element: Element, schema: Schema): FountainNode[] {
  const result: FountainNode[] = [];
  let inlineFragment = element.ownerDocument.createDocumentFragment();
  const flushInline = () => {
    const content = inlineChildren(inlineFragment, schema);
    if (content.length) result.push(schema.node('paragraph', {}, content));
    inlineFragment = element.ownerDocument.createDocumentFragment();
  };
  element.childNodes.forEach((child) => {
    if (child instanceof HTMLInputElement && child.type === 'checkbox') return;
    if (child instanceof HTMLElement && LIST_BLOCK_TAGS.has(child.tagName.toLowerCase())) {
      flushInline();
      result.push(...block(child, schema));
      return;
    }
    inlineFragment.appendChild(child.cloneNode(true));
  });
  flushInline();
  if (!result.length || result[0]?.type.name !== 'paragraph') {
    result.unshift(schema.node('paragraph', {}, [schema.text('')]));
  }
  return result;
}

function block(element: Element, schema: Schema): FountainNode[] {
  const tag = element.tagName.toLowerCase();
  if (element.getAttribute('data-fountain-math') === 'block' && schema.nodes.math_block) {
    const latex = element.getAttribute('data-latex') ?? element.textContent ?? '';
    const ariaLabel = element.getAttribute('data-math-aria-label') ?? '';
    try { return [schema.node('math_block', { latex, ariaLabel })]; }
    catch { return latex ? [schema.node('paragraph', {}, [schema.text(latex)])] : []; }
  }
  if (/^h[1-6]$/.test(tag)) return [schema.node('heading', { level: Number(tag[1]), align: alignment(element) }, inlineChildren(element, schema))];
  if (tag === 'p') return [paragraph(element, schema)];
  if (tag === 'blockquote') {
    const children = Array.from(element.children).flatMap((child) => block(child, schema));
    return [schema.node('blockquote', {}, children.length ? children : [paragraph(element, schema)])];
  }
  if (tag === 'pre') return [schema.node('code_block', {
    language: element.getAttribute('data-language') || element.querySelector('code')?.className.match(/language-([\w-]+)/)?.[1] || 'text',
    lineNumbers: true,
  }, [schema.text(element.textContent ?? '')])];
  if (tag === 'hr') return [schema.node('horizontal_rule')];
  if (tag === 'ul' || tag === 'ol') {
    const isTask = element.getAttribute('data-type') === 'task-list';
    const itemType = isTask ? 'task_item' : 'list_item';
    const items = Array.from(element.children).filter((child) => child.tagName.toLowerCase() === 'li').map((item) => {
      return schema.node(
        itemType,
        isTask ? { checked: item.getAttribute('data-checked') === 'true' || item.querySelector('input')?.checked === true } : {},
        listItemContent(item, schema),
      );
    });
    const listType = isTask ? 'task_list' : tag === 'ol' ? 'ordered_list' : 'bullet_list';
    return [schema.node(listType, tag === 'ol' ? { start: Number(element.getAttribute('start')) || 1 } : {}, items)];
  }
  if (tag === 'figure') {
    const mediaType = element.getAttribute('data-fountain-media');
    if (mediaType === 'audio') {
      const media = element.querySelector<HTMLAudioElement>(':scope > audio');
      const node = media ? playbackNode(media, schema, 'audio', element as HTMLElement) : null;
      return node ? [node] : [];
    }
    if (mediaType === 'video') {
      const media = element.querySelector<HTMLVideoElement>(':scope > video');
      const node = media ? playbackNode(media, schema, 'video', element as HTMLElement) : null;
      return node ? [node] : [];
    }
    if (mediaType === 'file') {
      const link = element.querySelector<HTMLAnchorElement>(':scope > a[data-fountain-file]');
      const node = link ? fileNode(link, schema, element as HTMLElement) : null;
      return node ? [node] : [];
    }
    if (mediaType === 'embed') {
      const frame = element.querySelector<HTMLIFrameElement>(':scope > iframe');
      const node = frame ? embedNode(frame, schema, element as HTMLElement) : null;
      return node ? [node] : [];
    }
    const images = Array.from(element.querySelectorAll(':scope > img'));
    if (images.length !== 1) {
      return Array.from(element.querySelectorAll('img'))
        .map((candidate) => imageNode(candidate as HTMLImageElement, schema, 'image_super'))
        .filter((candidate): candidate is FountainNode => Boolean(candidate));
    }
    const image = imageNode(images[0] as HTMLImageElement, schema, 'image_super', element as HTMLElement);
    return image ? [image] : [];
  }
  if (tag === 'table') {
    const rows = Array.from(element.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr')).map((row) => schema.node('table_row', {},
      Array.from(row.children).filter((cell) => /^(td|th)$/i.test(cell.tagName)).map((cell) => {
        const colspan = Math.max(1, Math.min(100, Number(cell.getAttribute('colspan')) || 1));
        const rowspan = Math.max(1, Math.min(100, Number(cell.getAttribute('rowspan')) || 1));
        return schema.node(
          cell.tagName.toLowerCase() === 'th' ? 'table_header' : 'table_cell',
          {
            colspan,
            rowspan,
            colwidth: tableCellWidths(cell, colspan),
            ...(cell.tagName.toLowerCase() === 'th' ? { scope: cell.getAttribute('scope') || 'col' } : {}),
          },
          [paragraph(cell, schema)],
        );
      }),
    ));
    return rows.length ? [schema.node('table', {}, rows)] : [];
  }
  if (tag === 'img') {
    const image = imageNode(element as HTMLImageElement, schema, 'image_super');
    return image ? [image] : [];
  }
  if (tag === 'audio' || tag === 'video') {
    const media = playbackNode(element as HTMLMediaElement, schema, tag);
    return media ? [media] : [];
  }
  if (tag === 'a' && element.hasAttribute('data-fountain-file')) {
    const file = fileNode(element as HTMLAnchorElement, schema);
    return file ? [file] : [];
  }
  if (tag === 'iframe' && element.hasAttribute('data-fountain-embed')) {
    const embed = embedNode(element as HTMLIFrameElement, schema);
    return embed ? [embed] : [];
  }
  const nested = Array.from(element.children).flatMap((child) => block(child, schema));
  return nested.length ? nested : [paragraph(element, schema)];
}

export class HTMLImporter {
  parse(html: string, schema: Schema): FountainNode {
    if (typeof DOMParser === 'undefined') throw new Error('HTMLImporter requires a browser DOMParser (or a DOM shim in Node.js).');
    const body = new DOMParser().parseFromString(html, 'text/html').body;
    const blocks = Array.from(body.children).flatMap((element) => block(element, schema));
    if (!blocks.length && body.textContent) blocks.push(schema.node('paragraph', {}, [schema.text(body.textContent)]));
    return schema.topNodeType.create({}, blocks.length ? blocks : [schema.node('paragraph', {}, [schema.text('')])]);
  }

  static parse(html: string, schema: Schema): FountainNode { return new HTMLImporter().parse(html, schema); }
}
