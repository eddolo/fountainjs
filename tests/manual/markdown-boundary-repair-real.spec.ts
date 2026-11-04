import { test } from '@playwright/test';
import { runMarkdownBoundaryRepairJourney } from '../browser/markdown-boundary-repair-journey';

test('repairs source after native nested heading-to-paragraph changes', async ({ page }, info) => {
  await runMarkdownBoundaryRepairJourney(page, info);
});
