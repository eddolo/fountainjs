import { test } from '@playwright/test';
import { angularBriefFormJourney, angularCampaignJourney } from '../browser/angular-campaign-journey';

test('records real Angular editing, attachment controls, image bytes and session resets', async ({ page }, info) => {
  await angularCampaignJourney(page, info);
});

test('records Angular brief validation, saving, disabling and reset', async ({ page }, info) => {
  await angularBriefFormJourney(page, info);
});
