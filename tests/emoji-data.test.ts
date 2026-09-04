/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { CoreExtension, composeExtensions, createEditor, insertText } from '../src';
import { UnicodeEmojiExtension, unicodeEmojis } from '../src/emoji-data';
import type { EmojiService } from '../src/document-utilities';

describe('optional complete Unicode emoji data', () => {
  it('ships the complete RGI base catalogue as an isolated extension entry', () => {
    expect(unicodeEmojis.length).toBeGreaterThanOrEqual(1_900);
    expect(new Set(unicodeEmojis.map((item) => item.id)).size).toBe(unicodeEmojis.length);
    expect(unicodeEmojis.find((item) => item.emoji === '👩‍🚀')).toMatchObject({
      id: 'woman_astronaut',
      label: 'woman astronaut',
      group: 'People & Body',
    });
  });

  it('searches and inserts an item through the same headless suggestion controller', async () => {
    const kit = composeExtensions([CoreExtension, UnicodeEmojiExtension]);
    const editor = createEditor({ schema: kit.schema, plugins: kit.plugins });
    const controller = (kit.services.emoji as EmojiService).getController(editor);

    expect(insertText(editor, ':woman_astronaut')).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.getSnapshot().items.some((item) => item.id === 'woman_astronaut')).toBe(true);
    const index = controller.getSnapshot().items.findIndex((item) => item.id === 'woman_astronaut');
    expect(controller.accept(index)).toBe(true);
    expect(editor.getText()).toBe('👩‍🚀 ');
  });
});
