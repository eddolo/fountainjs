import { test } from '@playwright/test';
import { runMarkdownInactiveAutolinksJourney } from '../browser/markdown-inactive-autolinks-journey';
import { runMarkdownSourceReviewJourney } from '../browser/markdown-source-review-journey';

test('edits and exports inactive Markdown autolinks from the conversion lab', async ({ page }, info) => {
  await runMarkdownInactiveAutolinksJourney(page, info);
});

test('reviews CommonMark source and downloads an offline HTML reader', async ({ page }, info) => {
  await runMarkdownSourceReviewJourney(page, info);
});
