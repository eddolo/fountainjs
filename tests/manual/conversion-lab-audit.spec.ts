import { test } from '@playwright/test';
import { conversionLabJourney } from '../browser/conversion-lab-journey';
test('conversion lab file edit report and export journey', async ({ page }, info) => {
  await conversionLabJourney(page, info);
});
test('conversion lab phone file journey', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await conversionLabJourney(page, info);
});
