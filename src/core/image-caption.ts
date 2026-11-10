import type { Attributes } from './schema';
import { paragraphLayoutAttribute, paragraphLayoutDOMAttributes, readParagraphLayout } from './paragraph-layout';

/** The image body and its optional caption are separate paragraph contexts. */
export const imageParagraphAttributes = { imageLayout: paragraphLayoutAttribute };

export function imageParagraphDOMAttributes(attrs: Record<string, unknown>): Attributes {
  return paragraphLayoutDOMAttributes(attrs.imageLayout);
}

export function readImageParagraphAttributes(element: { getAttribute(name: string): string | null }) {
  const { layout } = readParagraphLayout(element);
  return layout === undefined ? {} : { imageLayout: layout };
}

export const imageCaptionAttributes = {
  captionAlign: { default: undefined, validate: (value: unknown) => value === undefined || ['left', 'center', 'right', 'justify'].includes(String(value)) },
  captionLayout: paragraphLayoutAttribute,
};

export function imageMediaFrameStyle(align: unknown, width: string): string {
  const left = align === 'left' ? '0' : 'auto';
  const right = align === 'right' ? '0' : 'auto';
  return `width:${width};max-width:100%;margin-left:${left};margin-right:${right}`;
}

/** A caption with its own paragraph layout flows in the surrounding column. */
export function imageFigureStyles(attrs: Attributes, width: string) {
  return attrs.captionLayout === undefined
    ? { figure: `width:${width};max-width:100%`, image: 'width:100%' }
    : { figure: 'margin-inline:0', image: `display:block;${imageMediaFrameStyle(attrs.align, width)}` };
}

export function imageCaptionDOMAttributes(attrs: Record<string, unknown>): Attributes {
  const layout = paragraphLayoutDOMAttributes(attrs.captionLayout);
  return { ...layout,
    ...(attrs.captionAlign === undefined ? {} : { 'data-fountain-caption-align': attrs.captionAlign }),
    style: [layout.style, attrs.captionAlign === undefined ? '' : `text-align:${attrs.captionAlign}`].filter(Boolean).join(';'),
  };
}

export function readImageCaptionAttributes(element: { getAttribute(name: string): string | null } | null) {
  if (!element) return {};
  const align = element.getAttribute('data-fountain-caption-align');
  const { layout } = readParagraphLayout(element);
  return { ...(align && ['left', 'center', 'right', 'justify'].includes(align) ? { captionAlign: align } : {}),
    ...(layout === undefined ? {} : { captionLayout: layout }) };
}
