import { test } from '@playwright/test';
import { markdownLiteralJourney } from '../browser/markdown-literal-journey';

test('literal issue: visual edit, history, Markdown draft and reader retain text', async ({ page }, info) => {
  await markdownLiteralJourney(page, info);
});
