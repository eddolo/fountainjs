import { test } from '@playwright/test';
import { runMarkdownFrontmatterJourney } from '../browser/markdown-frontmatter-journey';

test('opens, edits and downloads Markdown under a saved file policy', async ({ page }, info) => {
  await runMarkdownFrontmatterJourney(page, info);
});
