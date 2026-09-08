import { test } from '@playwright/test';
import { htmlContainerJourney } from '../browser/html-container-journey';
test('preserves optional section containers through real editing and reader output', async ({ page }, info) => {
  await htmlContainerJourney(page, info);
});
