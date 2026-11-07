import { test } from '@playwright/test';
import { runMarkdownInactiveAutolinksJourney } from '../browser/markdown-inactive-autolinks-journey';

test('edits and exports inactive Markdown autolinks from the conversion lab', async ({ page }, info) => {
  await runMarkdownInactiveAutolinksJourney(page, info);
});
