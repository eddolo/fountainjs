import { test } from '@playwright/test';
import { markdownCodeLabelsJourney } from '../browser/markdown-code-labels-journey';

test('edits opaque code labels and reopens them safely in a reader', async ({ page }, info) => {
  await markdownCodeLabelsJourney(page, info);
});
