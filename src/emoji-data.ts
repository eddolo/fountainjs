import emojiData from 'unicode-emoji-json/data-by-emoji.json';
import {
  createEmojiExtension,
  type EmojiItem,
} from './extensions/emoji';

interface UnicodeEmojiRecord {
  readonly name: string;
  readonly slug: string;
  readonly group: string;
}

/**
 * The complete RGI Unicode emoji catalogue supplied by unicode-emoji-json.
 * It lives in its own package entry so applications only download the data
 * when they deliberately opt in to full-name and shortcode search.
 */
export const unicodeEmojis: readonly EmojiItem[] = Object.freeze(
  Object.entries(emojiData as Readonly<Record<string, UnicodeEmojiRecord>>).map(([emoji, metadata]) => Object.freeze({
    id: metadata.slug,
    label: metadata.name,
    emoji,
    shortcodes: Object.freeze([metadata.slug]),
    tags: Object.freeze(metadata.name.split(/[\s-]+/u).filter(Boolean)),
    group: metadata.group,
  })),
);

/** Ready-to-compose emoji extension backed by the complete RGI catalogue. */
export const UnicodeEmojiExtension = createEmojiExtension({ emojis: unicodeEmojis });

