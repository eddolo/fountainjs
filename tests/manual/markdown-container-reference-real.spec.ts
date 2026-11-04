import { test } from '@playwright/test';
import { runMarkdownContainerReferenceJourney } from '../browser/markdown-container-reference-journey';
test('preserves container definitions through real editing quote removal undo and downloads', async ({ page }, info) => {
  await runMarkdownContainerReferenceJourney(page, info);
});
