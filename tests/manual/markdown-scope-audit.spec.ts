import { test } from '@playwright/test';
import { markdownScopeJourney } from '../browser/markdown-scope-journey';

test('reads separate retired paragraphs after Markdown HTML scope conversion and handoff', async ({ page }, info) => {
  await markdownScopeJourney(page, info);
});
