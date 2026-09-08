import { test } from '@playwright/test';
import { htmlBlockFormatJourney } from '../browser/html-block-format-journey';
test('preserves formatting from a styled release brief through editor and file handoff', async ({ page }, info) => {
  await htmlBlockFormatJourney(page, info);
});
