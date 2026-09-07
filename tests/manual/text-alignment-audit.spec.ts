import { test } from '@playwright/test';
import { textAlignmentJourney } from '../browser/text-alignment-journey';

test('aligns a real meeting report using backward selection, toolbar, history and HTML export', async ({ page }, info) => {
  await textAlignmentJourney(page, info);
});
