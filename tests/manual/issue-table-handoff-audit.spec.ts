import { test } from '@playwright/test';
import { issueTableHandoffJourney } from '../browser/issue-table-handoff-journey';

test('preserves headerless and mixed tables through source and file handoff', async ({ page }, info) => {
  await issueTableHandoffJourney(page, info);
});
