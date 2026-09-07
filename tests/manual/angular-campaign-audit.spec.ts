import { test } from '@playwright/test';
import { angularCampaignJourney } from '../browser/angular-campaign-journey';

test('records real Angular editing, attachment controls, image bytes and session resets', async ({ page }, info) => {
  await angularCampaignJourney(page, info);
});
