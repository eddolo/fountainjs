import { test } from '@playwright/test';
import { runIssueInputJourney } from '../browser/issue-input-journey';

test('keeps full Markdown export out of real large-issue typing', async ({ page }, info) => {
  await runIssueInputJourney(page, info);
});
