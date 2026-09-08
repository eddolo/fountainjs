import { test } from '@playwright/test';
import { htmlContainerJourney, htmlContainerAuthoringJourney } from '../browser/html-container-journey';
test('authors sections with properties, empty content, undo and reader preview', async ({ page }, info) => {
  await htmlContainerAuthoringJourney(page, info);
});
test('preserves optional section containers through real editing and reader output', async ({ page }, info) => {
  await htmlContainerJourney(page, info);
});
