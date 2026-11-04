import { test } from '@playwright/test';
import { runMarkdownNestedSourceJourney } from '../browser/markdown-nested-source-journey';

test('a writer edits list and quote source through native typing downloads and undo', async ({ page }, info) => {
  await runMarkdownNestedSourceJourney(page, info);
});
