import { test } from '@playwright/test';
import { runIssueHTMLSourceJourney } from '../browser/issue-html-source-journey';

test('an issue author preserves reference bindings and code through real draft downloads', async ({ page }, info) => {
  await runIssueHTMLSourceJourney(page, info);
});
