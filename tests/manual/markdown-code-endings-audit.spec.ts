import { test } from '@playwright/test';
import { markdownCodeEndingsJourney } from '../browser/markdown-code-endings-journey';

test('preserves code endings through source recovery and reader handoff', async ({ page }, info) => {
  await markdownCodeEndingsJourney(page, info);
});
