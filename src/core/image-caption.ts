import type { Attributes } from './schema';
import { paragraphLayoutAttribute, paragraphLayoutDOMAttributes, readParagraphLayout } from './paragraph-layout';

export const imageCaptionAttributes = {
  captionAlign: { default: undefined, validate: (value: unknown) => value === undefined || ['left', 'center', 'right', 'justify'].includes(String(value)) },
  captionLayout: paragraphLayoutAttribute,
};

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
