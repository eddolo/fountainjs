import { test } from '@playwright/test';
import { vueRunbookJourney } from '../browser/vue-runbook-journey';

test('records a real Vue runbook editing and lifecycle journey', async ({ page }, info) => {
  await vueRunbookJourney(page, info);
});
