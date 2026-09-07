import { test } from '@playwright/test';
import { markdownAutolinkJourney } from '../browser/markdown-autolink-journey';

test('contact directory: choose literal addresses, export and reopen Word draft', async ({ page }, info) => {
  await markdownAutolinkJourney(page, info);
});
