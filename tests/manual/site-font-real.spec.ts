import { test } from '@playwright/test';
import { runSiteFontJourney } from '../browser/site-font-journey';

test('can write an issue while optional site fonts are pending', async ({ page }, info) => {
  await runSiteFontJourney(page, info);
});
