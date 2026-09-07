import { test } from '@playwright/test';
import { textlessReplacementJourney } from '../browser/textless-replacement-journey';

test('textless document replacement followed by native typing, lines and history', async ({ page }, info) => {
  await textlessReplacementJourney(page, info);
});
