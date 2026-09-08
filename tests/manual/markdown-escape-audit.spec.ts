import { test } from '@playwright/test';
import { markdownEscapeJourney } from '../browser/markdown-escape-journey';

test('regex review: code pipes and literal strikethrough survive draft handoff', async ({ page }, info) => {
  await markdownEscapeJourney(page, info);
});
