import { test } from '@playwright/test';
import { documentRangeFormattingJourney } from '../browser/document-range-formatting-journey';

test('formats directed text-to-image selections through the toolbar with exact history and reader export', async ({ page }, info) => {
  await documentRangeFormattingJourney(page, info);
});
