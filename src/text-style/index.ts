import { defineExtension } from '../extensions/extension';
import { fontFamily } from '../extensions/marks/font-family';
import { fontSize } from '../extensions/marks/font-size';
import { highlight } from '../extensions/marks/highlight';
import { lineHeight } from '../extensions/marks/line-height';
import { textColor } from '../extensions/marks/text-color';
import {
  setBackgroundColor,
  setFontFamily,
  setFontSize,
  setLineHeight,
  setTextColor,
  unsetBackgroundColor,
  unsetFontFamily,
  unsetFontSize,
  unsetLineHeight,
  unsetTextColor,
} from './commands';

export * from './commands';
export * from './values';
export { fontFamily, fontSize, highlight, lineHeight, textColor };

/**
 * Complete text-style schema and command module for custom FountainJS kits.
 * `CoreExtension` and `StarterKit` already include these contributions.
 */
export const TextStyleExtension = defineExtension({
  name: 'text-style',
  marks: {
    text_color: textColor,
    highlight,
    font_family: fontFamily,
    font_size: fontSize,
    line_height: lineHeight,
  },
  commands: {
    setTextColor,
    unsetTextColor,
    setBackgroundColor,
    unsetBackgroundColor,
    setFontFamily,
    unsetFontFamily,
    setFontSize,
    unsetFontSize,
    setLineHeight,
    unsetLineHeight,
  },
});
