import { test } from '@playwright/test';
import { runMarkdownNestedReferenceJourney } from '../browser/markdown-nested-reference-journey';
test('preserves referenced list quote and task source through actual editing and downloads', async ({ page }, info) => {
  await runMarkdownNestedReferenceJourney(page, info);
});
