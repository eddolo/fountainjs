import { test } from '@playwright/test';
import { vueDocumentFieldJourney, vueRunbookJourney } from '../browser/vue-runbook-journey';

test('records a real Vue runbook editing and lifecycle journey', async ({ page }, info) => {
  await vueRunbookJourney(page, info);
});

test('records a Vue review form through typing, submission, disable and reset', async ({ page }, info) => {
  await vueDocumentFieldJourney(page, info);
});
