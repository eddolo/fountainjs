import { test } from '@playwright/test';
import { markdownCustomWrapperJourney } from '../browser/markdown-custom-wrapper-journey';

test('edits registered HTML wrappers after Markdown source recovery', async ({ page }, info) => {
  await markdownCustomWrapperJourney(page, info);
});
