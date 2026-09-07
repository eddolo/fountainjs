import { test } from '@playwright/test';
import { svelteReportJourney } from '../browser/svelte-report-journey';
test('records a real Svelte report and editor lifecycle journey', async ({ page }, info) => {
  await svelteReportJourney(page, info);
});
