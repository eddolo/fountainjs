import { test } from '@playwright/test';
import { runMarkdownCaretHTMLJourney } from '../browser/markdown-caret-html-journey';

test('downloads reader HTML and keeps the caret available for native editing', async ({ page }, info) => {
  await runMarkdownCaretHTMLJourney(page, info);
});
