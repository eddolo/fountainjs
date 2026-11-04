import { test } from '@playwright/test';
import { runMarkdownSourceBoundariesJourney } from '../browser/markdown-source-boundaries-journey';

test('a writer preserves untouched Markdown through real editing downloads and undo', async ({ page }, info) => {
  await runMarkdownSourceBoundariesJourney(page, info);
});
